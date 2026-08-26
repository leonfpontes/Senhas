"""
T039: Resend Ticket Email Endpoint
POST /api/v1/public/resend-ticket-email - Resend email for a ticket

Handles scenarios where:
- Original email was lost/spam filtered
- User provides another email address
- Resend all recent tickets for a consulente
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr

from src.core.config import settings
from src.core.database import get_db
from src.core.limiter import limiter
from src.core.tz import APP_TZ
from src.repositories.ticket_repo import TicketRepository
from src.repositories.consulente_repo import ConsulenteRepository
from src.services.email.base import EmailMessage
from src.services.email.email_queue import email_queue, EmailQueueItem
from src.services.email.templates.ticket_emission import (
    generate_ticket_emission_html,
    generate_plain_text_fallback,
)
from src.models.tenants import Tenant
from src.models.tenant_config import TenantConfig
from src.models.tickets import Ticket

import logging
import sentry_sdk

router = APIRouter(prefix="/api/v1/public", tags=["public"])
logger = logging.getLogger(__name__)


class ResendTicketEmailRequest(BaseModel):
    """Request to resend ticket email

    Can be used to:
    - Resend to original email
    - Send to different email (for same name)
    """

    email: EmailStr
    phone: str | None = None


class ResendTicketEmailResponse(BaseModel):
    """Response after resending email

    Fields:
        tickets_count: Number of tickets found and email resent for
        email_sent: Whether email was sent successfully
        message: Human-readable message
    """

    tickets_count: int
    email_sent: bool
    message: str


@router.post("/resend-ticket-email", response_model=ResendTicketEmailResponse)
@limiter.limit("5/hour")
async def resend_ticket_email(
    request: Request,
    tenant_slug: str,
    payload: ResendTicketEmailRequest,
    session: AsyncSession = Depends(get_db),
):
    """Resend ticket emission email

    Rate-limited per client IP (5/hour) — public endpoint that triggers
    outbound e-mail; without a limit it can be abused to bomb a victim's
    inbox with up to 10 ticket e-mails per request.

    This endpoint resends the ticket confirmation email for recent tickets.
    Supports:
    - Resending to original email (typical use case)
    - Resending to different email (account recovery)

    Public endpoint: No authentication required!

    Path Parameters:
        tenant_slug: Tenant identifier

    Body:
        {
            "email": "joao@example.com",
            "phone": "+5511987654321"  # Optional, helps identify if multiple
        }

    Response:
        {
            "tickets_count": 1,
            "email_sent": true,
            "message": "Email resent to joao@example.com (1 ticket)"
        }

    Status Codes:
        200 OK: Email resent successfully
        404 Not Found: Tenant not found or no tickets found for email
        400 Bad Request: Invalid email format
        500 Internal Server Error: Email service failure
    """

    try:
        # === STEP 1: Get Tenant ===
        tenant_query = select(Tenant).where(
            Tenant.slug == tenant_slug.lower().strip()
        )
        tenant_result = await session.execute(tenant_query)
        tenant = tenant_result.scalar_one_or_none()

        if not tenant:
            raise HTTPException(
                status_code=404,
                detail=f"Tenant '{tenant_slug}' not found",
            )

        # === STEP 2: Normalize Email ===
        try:
            normalized_email = ConsulenteRepository.normalize_email(payload.email)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        # === STEP 3: Find Recent Tickets ===
        ticket_repo = TicketRepository(session, Ticket)
        tickets = await ticket_repo.list_by_consulente_email(
            session=session,
            tenant_id=tenant.id,
            email=normalized_email,
            limit=10,  # Last 10 tickets
        )

        if not tickets:
            raise HTTPException(
                status_code=404,
                detail=f"No tickets found for email '{payload.email}' in this tenant",
            )

        # === STEP 4: Load Tenant Branding ===
        tc_query = select(TenantConfig).where(TenantConfig.tenant_id == tenant.id)
        tc_result = await session.execute(tc_query)
        tenant_config = tc_result.scalar_one_or_none()

        tenant_address = (tenant_config.endereco or "") if tenant_config else ""
        primary_color = (
            (tenant_config.primary_color or "#2E7D32") if tenant_config else "#2E7D32"
        )
        secondary_color = (
            (tenant_config.secondary_color or primary_color)
            if tenant_config
            else primary_color
        )
        tenant_logo_url = ""
        if tenant_config and tenant_config.logo_data:
            tenant_logo_url = (
                f"{settings.FRONTEND_URL.rstrip('/')}/api/v1/public/tenant/{tenant.id}/logo"
            )
        elif tenant_config and tenant_config.logo_url:
            tenant_logo_url = tenant_config.logo_url

        # === STEP 5: Queue Email Resends ===
        for ticket in tickets:
            gira = ticket.gira
            consulente = ticket.consulente
            ticket_number = str(ticket.numero).zfill(4)
            gira_name = gira.nome if gira else ""
            gira_date = (
                gira.data_inicio.astimezone(APP_TZ).strftime("%d/%m/%Y às %H:%M")
                if gira and gira.data_inicio
                else ""
            )
            gira_location = (gira.local or "") if gira else ""
            consulente_name = consulente.nome if consulente else ""
            consulente_phone = (consulente.telefone or "") if consulente else ""
            rescue_link = (
                f"{settings.FRONTEND_URL.rstrip('/')}/public/{tenant.slug}/ticket/{ticket.id}"
            )

            html_body = generate_ticket_emission_html(
                ticket_number=ticket_number,
                consulente_name=consulente_name,
                gira_name=gira_name,
                gira_date=gira_date,
                gira_location=gira_location,
                rescue_link=rescue_link,
                tenant_name=tenant.name,
                tenant_logo_url=tenant_logo_url,
                tenant_color=primary_color,
                is_sponsor=ticket.is_sponsor,
                tenant_address=tenant_address,
                primary_color=primary_color,
                secondary_color=secondary_color,
                consulente_email=payload.email,
                consulente_phone=consulente_phone,
                priority_category=getattr(ticket, "priority_category", None),
                recados=gira.recados if gira else None,
            )
            text_body = generate_plain_text_fallback(
                ticket_number=ticket_number,
                consulente_name=consulente_name,
                gira_name=gira_name,
                gira_date=gira_date,
                gira_location=gira_location,
                rescue_link=rescue_link,
                is_sponsor=ticket.is_sponsor,
                tenant_address=tenant_address,
                tenant_name=tenant.name,
                consulente_email=payload.email,
                consulente_phone=consulente_phone,
                priority_category=getattr(ticket, "priority_category", None),
                recados=gira.recados if gira else None,
            )
            subject_prefix = "✦ Associado — " if ticket.is_sponsor else ""
            message = EmailMessage(
                to_email=payload.email,  # Use requested email
                subject=f"{subject_prefix}[REENVIADO] Sua Senha #{ticket_number} - {tenant.name}",
                html_body=html_body,
                text_body=text_body,
            )
            email_queue.enqueue(EmailQueueItem(message=message, ticket_id=str(ticket.id)))

        # === STEP 6: Return Response ===
        ticket_count = len(tickets)
        return ResendTicketEmailResponse(
            tickets_count=ticket_count,
            email_sent=True,
            message=f"Email resent to {payload.email} ({ticket_count} ticket{'s' if ticket_count > 1 else ''})",
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
