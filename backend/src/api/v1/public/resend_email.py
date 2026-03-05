"""
T039: Resend Ticket Email Endpoint
POST /api/v1/public/resend-ticket-email - Resend email for a ticket

Handles scenarios where:
- Original email was lost/spam filtered
- User provides another email address
- Resend all recent tickets for a consulente
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr

from backend.src.core.database import get_db
from backend.src.repositories.ticket_repo import TicketRepository
from backend.src.repositories.consulente_repo import ConsulenteRepository
from backend.src.services.email.base import EmailMessage
from backend.src.services.email.brevo_provider import BrevoEmailService
from backend.src.services.email.resend_fallback import ResendEmailService
from backend.src.services.email.templates.ticket_emission import (
    generate_ticket_emission_html,
    generate_plain_text_fallback,
)
from backend.src.models.tenants import Tenant
from sqlalchemy import select

import logging

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
async def resend_ticket_email(
    tenant_slug: str,
    request: ResendTicketEmailRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
):
    """Resend ticket emission email

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
            consulente_repo = ConsulenteRepository()
            normalized_email = consulente_repo.normalize_email(request.email)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        # === STEP 3: Find Recent Tickets ===
        ticket_repo = TicketRepository()
        tickets = await ticket_repo.list_by_consulente_email(
            session=session,
            tenant_id=tenant.id,
            email=request.email,
            limit=10,  # Last 10 tickets
        )

        if not tickets:
            raise HTTPException(
                status_code=404,
                detail=f"No tickets found for email '{request.email}' in this tenant",
            )

        # === STEP 4: Queue Email Resends ===
        for ticket in tickets:
            background_tasks.add_task(
                _resend_ticket_email_task,
                ticket_id=ticket.id,
                consulente_name=ticket.consulente.name,
                consulente_email=request.email,  # Use requested email
                gira_name=ticket.gira.name,
                gira_date=ticket.gira.release_start_at.strftime("%d/%m/%Y às %H:%M"),
                gira_location=ticket.gira.location,
                ticket_number=ticket.ticket_number,
                tenant_name=tenant.name,
                tenant_logo_url=tenant.logo_url,
                tenant_color=tenant.brand_color,
                tenant_slug=tenant.slug,
            )

        # === STEP 5: Return Response ===
        ticket_count = len(tickets)
        return ResendTicketEmailResponse(
            tickets_count=ticket_count,
            email_sent=True,  # Will be true if at least one sent
            message=f"Email resent to {request.email} ({ticket_count} ticket{'s' if ticket_count > 1 else ''})",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in resend_ticket_email: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Internal server error",
        )


async def _resend_ticket_email_task(
    ticket_id: int,
    consulente_name: str,
    consulente_email: str,
    gira_name: str,
    gira_date: str,
    gira_location: str,
    ticket_number: str,
    tenant_name: str,
    tenant_logo_url: str,
    tenant_color: str,
    tenant_slug: str,
):
    """Background task to resend ticket email

    Args:
        ticket_id: ID of ticket being resent
        consulente_name: Original consulente name
        consulente_email: Email to send to
        gira_name: Event name
        gira_date: Event date formatted
        gira_location: Event location
        ticket_number: Formatted ticket number
        tenant_name: Organization name
        tenant_logo_url: Logo URL
        tenant_color: Brand color hex
        tenant_slug: Tenant slug for rescue link
    """
    try:
        rescue_link = (
            f"https://app.example.com/public/{tenant_slug}/ticket/{ticket_id}"
        )
        qr_code_url = (
            f"https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={rescue_link}"
        )

        # Generate email
        html_body = generate_ticket_emission_html(
            ticket_number=ticket_number,
            consulente_name=consulente_name,
            gira_name=gira_name,
            gira_date=gira_date,
            gira_location=gira_location,
            rescue_link=rescue_link,
            qr_code_url=qr_code_url,
            tenant_name=tenant_name,
            tenant_logo_url=tenant_logo_url,
            tenant_color=tenant_color,
        )

        text_body = generate_plain_text_fallback(
            ticket_number=ticket_number,
            consulente_name=consulente_name,
            gira_name=gira_name,
            gira_date=gira_date,
            gira_location=gira_location,
            rescue_link=rescue_link,
        )

        message = EmailMessage(
            to_email=consulente_email,
            subject=f"[REENVIADO] Sua Senha #{ticket_number} - {tenant_name}",
            html_body=html_body,
            text_body=text_body,
        )

        # Try Brevo
        try:
            brevo_service = BrevoEmailService()
            if await brevo_service.is_healthy():
                success = await brevo_service.send_async(message)
                if success:
                    logger.info(
                        f"Resent ticket {ticket_number} via Brevo to {consulente_email}"
                    )
                    return
        except Exception as e:
            logger.warning(f"Brevo resend failed, trying Resend fallback: {e}")

        # Fallback to Resend
        try:
            resend_service = ResendEmailService()
            if await resend_service.is_healthy():
                success = await resend_service.send_async(message)
                if success:
                    logger.info(
                        f"Resent ticket {ticket_number} via Resend to {consulente_email}"
                    )
                    return
        except Exception as e:
            logger.error(f"Resend fallback also failed: {e}")

        logger.error(
            f"Failed to resend ticket {ticket_number} to {consulente_email}"
        )

    except Exception as e:
        logger.error(f"Error in _resend_ticket_email_task: {e}", exc_info=True)
