"""
T038: Public Emit Ticket Endpoint - CORE MVP FUNCTIONALITY
POST /api/v1/public/emit-ticket - Issue a new senha/ticket

This is the heart of the product. Handles atomic ticket emission with:
- Consulente lookup/creation
- Atomic ticket counter increment (no race conditions)
- Email sending (Brevo + Resend fallback)
- Comprehensive error handling
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, and_
from datetime import datetime
import logging
import hashlib
import uuid

from src.core.database import get_db
from src.core.errors import APIException
from src.models.tenants import Tenant
from src.models.giras import Gira
from src.repositories.consulente_repo import ConsulenteRepository
from src.repositories.senha_control_repo import SenhaControlRepository
from src.repositories.ticket_repo import TicketRepository
from src.services.email.base import EmailMessage
from src.services.email.brevo_provider import BrevoEmailService
from src.services.email.resend_fallback import ResendEmailService
from src.services.email.templates.ticket_emission import (
    generate_ticket_emission_html,
    generate_plain_text_fallback,
)

router = APIRouter(prefix="/api/v1/public", tags=["public"])
logger = logging.getLogger(__name__)


class EmitTicketRequest(BaseModel):
    """Request body for ticket emission
    
    Fields:
        name: Consulente name (required)
        email: Consulente email (required, validated)
        phone: Phone number (optional, for contact)
    """

    name: str
    email: EmailStr
    phone: str | None = None

    class Config:
        json_schema_extra = {
            "example": {
                "name": "João da Silva",
                "email": "joao@example.com",
                "phone": "+5511987654321",
            }
        }


class EmitTicketResponse(BaseModel):
    """Response after ticket emission
    
    Fields:
        ticket_number: Formatted ticket number (e.g., "0042")
        email_sent: Whether email was sent successfully
        rescue_link: URL to redeem ticket (frontend will fill tenant)
        message: Human-readable confirmation message
    """

    ticket_number: str
    email_sent: bool
    rescue_link: str
    message: str


@router.post("/emit-ticket", response_model=EmitTicketResponse)
async def emit_ticket(
    tenant_slug: str,
    request: EmitTicketRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
):
    """Emit a new ticket for public consultee

    This endpoint handles the complete ticket emission flow:
    1. Validate tenant exists
    2. Validate gira is active and has capacity
    3. Lookup or create consulente (with email normalization)
    4. Check for duplicates in same gira (prevent dual emission)
    5. Atomically increment ticket number
    6. Create ticket record
    7. Send email via Brevo (with Resend fallback)
    
    Public endpoint: No authentication required!

    Path Parameters:
        tenant_slug: Tenant identifier (e.g., "espiritismo-sp")

    Body:
        {
            "name": "João da Silva",
            "email": "joao@example.com",
            "phone": "+5511987654321"
        }

    Response:
        {
            "ticket_number": "0042",
            "email_sent": true,
            "rescue_link": "https://app.example.com/public/espiritismo-sp/ticket/0042",
            "message": "Ticket emitted successfully! Check your email."
        }

    Status Codes:
        200 OK: Ticket emitted successfully
        404 Not Found: Tenant or gira not found
        400 Bad Request: Invalid email, name too short, etc
        409 Conflict: Consulente already has ticket in this gira
        429 Too Many Requests: Gira capacity reached or rate limited
        500 Internal Server Error: Database/email service failure

    Error Examples:
        {
            "detail": "Tenant 'espiritismo-sp' not found"
        }
        
        {
            "detail": "No active gira available for ticket emission"
        }
        
        {
            "detail": "This email already has a ticket for this gira"
        }
        
        {
            "detail": "All tickets for this gira have been emitted"
        }
    """

    try:
        # === STEP 1: Validate Tenant ===
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

        # === STEP 2: Validate Gira Active and Has Capacity ===
        now = datetime.utcnow()
        gira_query = (
            select(Gira)
            .where(
                and_(
                    Gira.tenant_id == tenant.id,
                    Gira.release_start_at <= now,  # Has started
                    Gira.release_end_at >= now,  # Not ended
                    Gira.status == "ACTIVE",
                )
            )
            .order_by(Gira.release_start_at.asc())
            .limit(1)
        )
        gira_result = await session.execute(gira_query)
        gira = gira_result.scalar_one_or_none()

        if not gira:
            raise HTTPException(
                status_code=404,
                detail="No active gira available for ticket emission",
            )

        # === STEP 3: Initialize Repositores ===
        consulente_repo = ConsulenteRepository()
        senha_control_repo = SenhaControlRepository()
        ticket_repo = TicketRepository()

        # === STEP 4: Lookup or Create Consulente ===
        try:
            consulente, is_new = await consulente_repo.upsert_consulente(
                session=session,
                tenant_id=tenant.id,
                name=request.name,
                email=request.email,
                phone=request.phone,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        # === STEP 5: Check for Duplicate in Same Gira ===
        has_duplicate = await ticket_repo.check_duplicate_in_gira(
            session=session,
            tenant_id=tenant.id,
            gira_id=gira.id,
            consulente_id=consulente.id,
        )

        if has_duplicate:
            raise HTTPException(
                status_code=409,
                detail="This email already has a ticket for this gira",
            )

        # === STEP 6: Get or Create SenhaControl (for atomic counting) ===
        await senha_control_repo.get_or_create_for_gira(
            session=session,
            tenant_id=tenant.id,
            gira_id=gira.id,
            initial_number=0,
        )

        # === STEP 7: Atomi cally Increment Counter ===
        try:
            ticket_number_int = await senha_control_repo.increment_atomic(
                session=session,
                tenant_id=tenant.id,
                gira_id=gira.id,
            )
        except ValueError:
            raise HTTPException(
                status_code=500,
                detail="Failed to allocate ticket number",
            )

        # Check capacity
        if ticket_number_int > gira.max_tickets:
            await session.rollback()
            raise HTTPException(
                status_code=429,
                detail="All tickets for this gira have been emitted",
            )

        # === STEP 8: Create Ticket Record ===
        ticket_number_formatted = f"{ticket_number_int:04d}"
        ticket = await ticket_repo.create_ticket(
            session=session,
            tenant_id=tenant.id,
            gira_id=gira.id,
            consulente_id=consulente.id,
            ticket_number=ticket_number_formatted,
            status="EMITTED",
        )

        # Commit transaction
        await session.commit()

        logger.info(
            f"Ticket {ticket_number_formatted} emitted for {consulente.email} "
            f"(tenant={tenant.slug}, gira={gira.id})"
        )

        # === STEP 9: Send Email in Background ===
        rescue_link = (
            f"https://app.example.com/public/{tenant.slug}/ticket/{ticket.id}"
        )
        qr_code_url = f"https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={rescue_link}"

        background_tasks.add_task(
            _send_ticket_email,
            ticket_number=ticket_number_formatted,
            consulente_name=consulente.name,
            consulente_email=consulente.email,
            gira_name=gira.name,
            gira_date=gira.release_start_at.strftime("%d/%m/%Y às %H:%M"),
            gira_location=gira.location,
            rescue_link=rescue_link,
            qr_code_url=qr_code_url,
            tenant_name=tenant.name,
            tenant_logo_url=tenant.logo_url,
            tenant_color=tenant.brand_color,
        )

        # === STEP 10: Return Response ===
        return EmitTicketResponse(
            ticket_number=ticket_number_formatted,
            email_sent=True,  # Will be true if sent successfully
            rescue_link=rescue_link,
            message="Ticket emitted successfully! Check your email for confirmation.",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in emit_ticket: {e}", exc_info=True)
        await session.rollback()
        raise HTTPException(
            status_code=500,
            detail="Internal server error during ticket emission",
        )


async def _send_ticket_email(
    ticket_number: str,
    consulente_name: str,
    consulente_email: str,
    gira_name: str,
    gira_date: str,
    gira_location: str,
    rescue_link: str,
    qr_code_url: str,
    tenant_name: str,
    tenant_logo_url: str,
    tenant_color: str,
):
    """Background task to send ticket emission email

    Args:
        ticket_number: Formatted ticket number
        consulente_name: Recipient name
        consulente_email: Recipient email
        gira_name: Event name
        gira_date: Event date formatted
        gira_location: Event location
        rescue_link: Full redemption URL
        qr_code_url: QR code image URL
        tenant_name: Organization name
        tenant_logo_url: Logo URL
        tenant_color: Brand color hex
    """
    try:
        # Generate email content
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
            subject=f"Sua Senha #{ticket_number} - {tenant_name}",
            html_body=html_body,
            text_body=text_body,
        )

        # Try Brevo first
        try:
            brevo_service = BrevoEmailService()
            if await brevo_service.is_healthy():
                success = await brevo_service.send_async(message)
                if success:
                    logger.info(f"Email sent via Brevo to {consulente_email}")
                    return
        except Exception as e:
            logger.warning(f"Brevo email failed, trying Resend fallback: {e}")

        # Fallback to Resend
        try:
            resend_service = ResendEmailService()
            if await resend_service.is_healthy():
                success = await resend_service.send_async(message)
                if success:
                    logger.info(f"Email sent via Resend fallback to {consulente_email}")
                    return
        except Exception as e:
            logger.error(f"Resend fallback also failed: {e}")

        logger.error(
            f"All email services failed for ticket {ticket_number} "
            f"to {consulente_email}"
        )

    except Exception as e:
        logger.error(f"Error in _send_ticket_email: {e}", exc_info=True)
