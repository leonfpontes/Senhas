"""Public endpoints — self-service ticket cancellation by the consulente.

The emission email carries a "Cancelar minha senha" link pointing at the
frontend page /public/ticket/{ticket_id}/cancelar. That page:

1. GETs /api/v1/public/tickets/{ticket_id}/cancel-info to show what is being
   cancelled (the GET has no side effect, so email-scanner link prefetching
   can't cancel anything);
2. POSTs /api/v1/public/tickets/{ticket_id}/cancel only when the consulente
   explicitly confirms.

Trust model: the ticket UUID is the bearer secret, same as the rescue link and
the waitlist confirm link. No auth, rate-limited.

Cancelling mirrors the admin delete flow (soft CANCELLED + slot release +
waitlist cascade), with the difference that a WAITLISTED ticket that never got
promoted holds no slot — cancelling it just leaves the queue.
"""
import logging
import uuid as _uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.config import settings
from src.core.database import get_db
from src.core.limiter import limiter
from src.core.tz import APP_TZ
from src.models.giras import Gira
from src.models.senha_controls import SenhaControl
from src.models.tenant_config import TenantConfig
from src.models.tenants import Tenant
from src.models.tickets import Ticket, TicketStatus
from src.repositories.gira_time_slot_repo import GiraTimeSlotRepository
from src.repositories.senha_control_repo import SenhaControlRepository
from src.services import waitlist_service
from src.services.audit_service import AuditService
from src.services.email.base import EmailMessage
from src.services.email.email_queue import email_queue, EmailQueueItem
from src.services.email.templates.ticket_cancelled import (
    generate_ticket_cancelled_html,
    generate_ticket_cancelled_text,
)

router = APIRouter(prefix="/api/v1/public", tags=["public"])
logger = logging.getLogger(__name__)

# Statuses the consulente is allowed to cancel. CALLED is excluded on purpose:
# at that point the pessoa is being attended and the door team owns the ticket.
_CANCELLABLE_STATUSES = {TicketStatus.EMITTED, TicketStatus.WAITLISTED}


class CancelInfoResponse(BaseModel):
    ticket_number: str
    status: str
    cancellable: bool
    reason: str | None = None
    gira_name: str
    gira_date: str
    tenant_name: str
    tenant_slug: str
    consulente_name: str
    waitlisted: bool = False


class CancelTicketResponse(BaseModel):
    ticket_number: str
    message: str


def _format_numero(ticket: Ticket) -> str:
    return f"P{ticket.numero:03d}" if ticket.is_sponsor else f"{ticket.numero:04d}"


async def _load_ticket_context(
    session: AsyncSession, ticket_id: str
) -> tuple[Ticket, Gira, Tenant]:
    """Resolve ticket + gira + tenant for the public cancel endpoints (404 on
    any miss — never reveal whether the UUID exists)."""
    try:
        ticket_uuid = _uuid.UUID(ticket_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Senha não encontrada")

    result = await session.execute(
        select(Ticket)
        .options(selectinload(Ticket.consulente))
        .where(Ticket.id == ticket_uuid)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Senha não encontrada")

    gira_result = await session.execute(
        select(Gira).where(Gira.id == ticket.gira_id, Gira.tenant_id == ticket.tenant_id)
    )
    gira = gira_result.scalar_one_or_none()
    tenant_result = await session.execute(select(Tenant).where(Tenant.id == ticket.tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    if not gira or not tenant:
        raise HTTPException(status_code=404, detail="Senha não encontrada")

    return ticket, gira, tenant


def _cancellability(ticket: Ticket, gira: Gira) -> tuple[bool, str | None]:
    """(cancellable, human-readable reason when not)."""
    status = ticket.status if isinstance(ticket.status, TicketStatus) else TicketStatus(ticket.status)
    if status == TicketStatus.CANCELLED:
        return False, "Esta senha já foi cancelada."
    if status not in _CANCELLABLE_STATUSES:
        return False, "Esta senha não pode mais ser cancelada."
    now = datetime.now(timezone.utc)
    if gira.data_inicio and now >= gira.data_inicio:
        return False, (
            "A gira já começou — não é mais possível cancelar por aqui. "
            "Se precisar, procure a equipe na entrada."
        )
    return True, None


@router.get("/tickets/{ticket_id}/cancel-info", response_model=CancelInfoResponse)
@limiter.limit("60/minute")
async def get_cancel_info(
    request: Request,
    ticket_id: str,
    session: AsyncSession = Depends(get_db),
):
    """Data for the confirmation page. Read-only — the actual cancel is the POST."""
    ticket, gira, tenant = await _load_ticket_context(session, ticket_id)
    cancellable, reason = _cancellability(ticket, gira)
    status = ticket.status if isinstance(ticket.status, TicketStatus) else TicketStatus(ticket.status)

    gira_date_str = (
        gira.data_inicio.astimezone(APP_TZ).strftime("%d/%m/%Y às %H:%M")
        if gira.data_inicio else ""
    )
    return CancelInfoResponse(
        ticket_number=_format_numero(ticket),
        status=status.value,
        cancellable=cancellable,
        reason=reason,
        gira_name=gira.nome,
        gira_date=gira_date_str,
        tenant_name=tenant.name,
        tenant_slug=tenant.slug,
        consulente_name=ticket.consulente.nome if ticket.consulente else "",
        waitlisted=status == TicketStatus.WAITLISTED,
    )


@router.post("/tickets/{ticket_id}/cancel", response_model=CancelTicketResponse)
@limiter.limit("10/minute")
async def cancel_ticket(
    request: Request,
    ticket_id: str,
    session: AsyncSession = Depends(get_db),
):
    """Cancel the ticket on the consulente's request, releasing its slot."""
    ticket, gira, tenant = await _load_ticket_context(session, ticket_id)
    cancellable, reason = _cancellability(ticket, gira)
    if not cancellable:
        raise HTTPException(status_code=400, detail=reason)

    previous_status = ticket.status if isinstance(ticket.status, TicketStatus) else TicketStatus(ticket.status)
    ticket_number_formatted = _format_numero(ticket)

    ticket.status = TicketStatus.CANCELLED

    # A ticket occupies a slot when EMITTED, or when WAITLISTED with an active
    # promotion (the reservation holds the slot until confirmed/expired). A
    # plain queue entry holds nothing — cancelling it just leaves the queue.
    held_a_slot = previous_status == TicketStatus.EMITTED or (
        previous_status == TicketStatus.WAITLISTED and ticket.promoted_at is not None
    )

    if held_a_slot:
        unfilled_slots = 1
        if await waitlist_service.waitlist_enabled_for_tenant(session, ticket.tenant_id):
            promoted_tickets, unfilled_slots = await waitlist_service.reconcile_and_fill(
                session=session,
                tenant_id=ticket.tenant_id,
                gira_id=ticket.gira_id,
                is_sponsor=ticket.is_sponsor,
                gira=gira,
                extra_slots=1,
            )
            # Reuses the admin module's composer — same email, same branding.
            from src.api.v1.admin.tickets_list import _send_waitlist_promotion_email

            for promoted in promoted_tickets:
                await _send_waitlist_promotion_email(session, ticket.tenant_id, promoted, gira)

        if unfilled_slots > 0:
            senha_control_repo = SenhaControlRepository(session, SenhaControl)
            for _ in range(unfilled_slots):
                try:
                    await senha_control_repo.increment_slots_returned(
                        session=session,
                        tenant_id=ticket.tenant_id,
                        gira_id=ticket.gira_id,
                        is_sponsor=ticket.is_sponsor,
                    )
                except ValueError:
                    logger.warning(
                        "SenhaControl not found for gira=%s is_sponsor=%s during self-service "
                        "cancel (ticket=%s). Slot not returned.",
                        ticket.gira_id,
                        ticket.is_sponsor,
                        ticket.id,
                    )

        if ticket.time_slot_id is not None:
            time_slot_repo = GiraTimeSlotRepository(session)
            try:
                await time_slot_repo.increment_slots_returned(session, ticket.tenant_id, ticket.time_slot_id)
            except ValueError:
                logger.warning(
                    "GiraTimeSlot not found (slot=%s) during self-service cancel (ticket=%s). "
                    "Slot not returned.",
                    ticket.time_slot_id,
                    ticket.id,
                )

    audit = AuditService(session)
    await audit.log_delete(
        tenant_id=ticket.tenant_id,
        user_id=None,  # self-service: no admin actor
        resource_type="Ticket",
        resource_id=ticket.id,
        previous_state={
            "numero": ticket.numero,
            "status": previous_status.value,
            "consulente_email": ticket.consulente.email if ticket.consulente else None,
            "gira_id": str(ticket.gira_id),
            "is_sponsor": ticket.is_sponsor,
            "cancelled_by": "consulente",
        },
    )

    await session.commit()

    logger.info(
        "Ticket %s self-cancelled by consulente (tenant=%s, gira=%s, previous_status=%s)",
        ticket_number_formatted,
        tenant.slug,
        ticket.gira_id,
        previous_status.value,
    )

    # Confirmation email (best effort — the cancel itself is already committed)
    if ticket.consulente and ticket.consulente.email:
        tc_result = await session.execute(
            select(TenantConfig).where(TenantConfig.tenant_id == ticket.tenant_id)
        )
        tenant_config = tc_result.scalar_one_or_none()
        primary_color = (tenant_config.primary_color or "#2E7D32") if tenant_config else "#2E7D32"
        secondary_color = (tenant_config.secondary_color or primary_color) if tenant_config else primary_color
        tenant_logo_url = ""
        if tenant_config and tenant_config.logo_data:
            tenant_logo_url = f"{settings.FRONTEND_URL.rstrip('/')}/api/v1/public/tenant/{tenant.id}/logo"
        elif tenant_config and tenant_config.logo_url:
            tenant_logo_url = tenant_config.logo_url

        gira_date_str = (
            gira.data_inicio.astimezone(APP_TZ).strftime("%d/%m/%Y às %H:%M")
            if gira.data_inicio else ""
        )
        html_body = generate_ticket_cancelled_html(
            ticket_number=ticket_number_formatted,
            consulente_name=ticket.consulente.nome,
            gira_name=gira.nome,
            gira_date=gira_date_str,
            tenant_name=tenant.name,
            tenant_logo_url=tenant_logo_url,
            primary_color=primary_color,
            secondary_color=secondary_color,
        )
        text_body = generate_ticket_cancelled_text(
            ticket_number=ticket_number_formatted,
            consulente_name=ticket.consulente.nome,
            gira_name=gira.nome,
            gira_date=gira_date_str,
            tenant_name=tenant.name,
        )
        message = EmailMessage(
            to_email=ticket.consulente.email,
            subject=f"Senha #{ticket_number_formatted} cancelada - {tenant.name}",
            html_body=html_body,
            text_body=text_body,
        )
        email_queue.enqueue(EmailQueueItem(message=message, ticket_id=str(ticket.id)))

    return CancelTicketResponse(
        ticket_number=ticket_number_formatted,
        message="Senha cancelada com sucesso. Sua vaga foi liberada para outra pessoa.",
    )
