"""
T039: Resend Ticket Email Endpoint
POST /api/v1/public/resend-ticket-email - Resend email for a ticket

Usado no formulário público de emissão quando a pessoa recebe "você já tem
senha para esta gira" e não achou o e-mail. Reenvia o MESMO e-mail da emissão
(número com o prefixo P do associado, horário escolhido, acompanhantes,
link do bilhete e de cancelamento) — só das senhas ativas (emitida ou na fila
de espera), e só da gira informada quando o formulário manda `gira_id`.
"""

import logging
import uuid
from datetime import datetime

import sentry_sdk
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.database import get_db
from src.core.limiter import limiter
from src.core.public_links import public_tenant_logo_url
from src.core.tz import APP_TZ
from src.models.giras import Gira
from src.models.tenant_config import TenantConfig
from src.models.tenants import Tenant
from src.models.tickets import Ticket, TicketStatus
from src.repositories.consulente_repo import ConsulenteRepository
from src.repositories.ticket_repo import TicketRepository
from src.services import waitlist_service
from src.services.email.base import EmailMessage
from src.services.email.email_queue import email_queue, EmailQueueItem
from src.services.email.templates.waitlist import (
    generate_waitlist_entry_html,
    generate_waitlist_entry_text,
)

router = APIRouter(prefix="/api/v1/public", tags=["public"])
logger = logging.getLogger(__name__)

# Só senha ativa recebe reenvio: cancelada/atendida/expirada não tem o que
# "reenviar" (e reenviar o e-mail de emissão de uma senha cancelada confunde).
RESENDABLE_STATUSES = (TicketStatus.EMITTED, TicketStatus.WAITLISTED)


class ResendTicketEmailRequest(BaseModel):
    """Request to resend ticket email.

    `gira_id` (opcional, mas o formulário sempre manda) restringe o reenvio à
    gira da tela; sem ele, vão as senhas ativas de giras de hoje em diante.
    """

    email: EmailStr
    gira_id: uuid.UUID | None = None


class ResendTicketEmailResponse(BaseModel):
    """Response after resending email

    Fields:
        tickets_count: Number of tickets found and email resent for
        email_sent: Whether email was queued
        message: Human-readable message
    """

    tickets_count: int
    email_sent: bool
    message: str


async def _enqueue_waitlist_entry_email(session: AsyncSession, tenant: Tenant, ticket: Ticket, gira: Gira) -> None:
    """Reenvia o e-mail "você está na fila de espera" com a posição atual."""
    position = await waitlist_service.compute_queue_position(
        session=session,
        tenant_id=tenant.id,
        gira_id=gira.id,
        is_sponsor=ticket.is_sponsor,
        ticket=ticket,
    )
    tc_result = await session.execute(select(TenantConfig).where(TenantConfig.tenant_id == tenant.id))
    tenant_config = tc_result.scalar_one_or_none()
    primary_color = (tenant_config.primary_color or "#2E7D32") if tenant_config else "#2E7D32"
    secondary_color = (tenant_config.secondary_color or primary_color) if tenant_config else primary_color
    gira_date_str = gira.data_inicio.astimezone(APP_TZ).strftime("%d/%m/%Y às %H:%M") if gira.data_inicio else ""
    consulente_name = ticket.consulente.nome if ticket.consulente else ""

    html_body = generate_waitlist_entry_html(
        consulente_name=consulente_name,
        gira_name=gira.nome,
        gira_date=gira_date_str,
        position=position or 1,
        tenant_name=tenant.name,
        tenant_logo_url=public_tenant_logo_url(settings.FRONTEND_URL, tenant_config) or "",
        primary_color=primary_color,
        secondary_color=secondary_color,
    )
    text_body = generate_waitlist_entry_text(
        consulente_name=consulente_name,
        gira_name=gira.nome,
        gira_date=gira_date_str,
        position=position or 1,
        tenant_name=tenant.name,
    )
    email_queue.enqueue(
        EmailQueueItem(
            message=EmailMessage(
                to_email=ticket.consulente.email,
                subject=f"Você está na fila de espera - {gira.nome} - {tenant.name}",
                html_body=html_body,
                text_body=text_body,
            ),
            ticket_id=str(ticket.id),
        )
    )


async def _enqueue_original_email(session: AsyncSession, tenant: Tenant, ticket: Ticket) -> None:
    """Reenvia o e-mail que a pessoa recebeu para esta senha, conforme o status:
    emitida → e-mail de emissão; na fila e promovida → "a vaga é sua" (com o
    link de confirmação); na fila sem promoção → "você está na fila"."""
    status = ticket.status if isinstance(ticket.status, TicketStatus) else TicketStatus(ticket.status)
    if status == TicketStatus.EMITTED:
        await waitlist_service.send_confirmed_ticket_email(session, ticket)
        return

    gira_result = await session.execute(
        select(Gira).where(Gira.id == ticket.gira_id, Gira.tenant_id == ticket.tenant_id)
    )
    gira = gira_result.scalar_one_or_none()
    if gira is None:
        return
    if ticket.promoted_at is not None:
        # Mesmo e-mail da promoção (admin / cancelamento público).
        from src.api.v1.admin.tickets_list import _send_waitlist_promotion_email

        await _send_waitlist_promotion_email(session, tenant.id, ticket, gira)
        return
    await _enqueue_waitlist_entry_email(session, tenant, ticket, gira)


@router.post("/resend-ticket-email", response_model=ResendTicketEmailResponse)
@limiter.limit("15/hour")
async def resend_ticket_email(
    request: Request,
    tenant_slug: str,
    payload: ResendTicketEmailRequest,
    session: AsyncSession = Depends(get_db),
):
    """Resend the ticket email for the consulente's active tickets.

    Rate-limited per client IP (15/hour) — public endpoint that triggers
    outbound e-mail; without a limit it can be abused to bomb a victim's
    inbox. The e-mail always goes to the address stored on the ticket (the
    one that received it originally), never to an arbitrary address.

    Body:
        {"email": "joao@example.com", "gira_id": "<uuid da gira>"}

    Status Codes:
        200 OK: Email(s) queued
        404 Not Found: Tenant not found or no active ticket for this e-mail
        400 Bad Request: Invalid email format
    """

    try:
        # === STEP 1: Get Tenant ===
        tenant_query = select(Tenant).where(Tenant.slug == tenant_slug.lower().strip())
        tenant_result = await session.execute(tenant_query)
        tenant = tenant_result.scalar_one_or_none()

        if not tenant:
            raise HTTPException(status_code=404, detail="Terreiro não encontrado")

        # === STEP 2: Normalize Email ===
        try:
            normalized_email = ConsulenteRepository.normalize_email(payload.email)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        # === STEP 3: Find active tickets (this gira, or upcoming giras) ===
        upcoming_from = None
        if payload.gira_id is None:
            upcoming_from = datetime.now(APP_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
        ticket_repo = TicketRepository(session, Ticket)
        tickets = await ticket_repo.list_by_consulente_email(
            session=session,
            tenant_id=tenant.id,
            email=normalized_email,
            limit=10,
            statuses=RESENDABLE_STATUSES,
            gira_id=payload.gira_id,
            gira_from=upcoming_from,
        )

        if not tickets:
            raise HTTPException(
                status_code=404,
                detail=(
                    "Não encontramos senha ativa para este e-mail"
                    + (" nesta gira." if payload.gira_id else ".")
                ),
            )

        # === STEP 4: Queue the original e-mails ===
        for ticket in tickets:
            await _enqueue_original_email(session, tenant, ticket)

        # === STEP 5: Return Response ===
        ticket_count = len(tickets)
        return ResendTicketEmailResponse(
            tickets_count=ticket_count,
            email_sent=True,
            message=(
                f"Reenviamos {'o e-mail da sua senha' if ticket_count == 1 else f'os e-mails das suas {ticket_count} senhas'}."
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in resend_ticket_email: {e}", exc_info=True)
        sentry_sdk.capture_exception(e)
        raise HTTPException(
            status_code=500,
            detail="Internal server error",
        )
