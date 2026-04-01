"""
T038: Public Emit Ticket Endpoint - CORE MVP FUNCTIONALITY
POST /api/v1/public/emit-ticket - Issue a new senha/ticket

This is the heart of the product. Handles atomic ticket emission with:
- Consulente lookup/creation
- Atomic ticket counter increment (no race conditions)
- Email sending (Brevo + Resend fallback)
- Comprehensive error handling
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, and_
from datetime import datetime, timezone
import json
import logging
import hashlib
import uuid

from src.core.config import settings
from src.core.database import get_db
from src.core.errors import APIException
from src.models.tenants import Tenant
from src.models.giras import Gira
from src.models.tenant_config import TenantConfig
from src.repositories.consulente_repo import ConsulenteRepository
from src.repositories.senha_control_repo import SenhaControlRepository
from src.models.tickets import TicketStatus
from src.repositories.ticket_repo import TicketRepository
from src.services.email.base import EmailMessage
from src.services.email.email_queue import email_queue, EmailQueueItem
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
    preferencial: bool = False

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
    session: AsyncSession = Depends(get_db),
    tipo: str = "comum",
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
        is_sponsor = tipo in ("patrocinador", "associado")

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
        now = datetime.now(timezone.utc)

        if is_sponsor:
            # Sponsor: use sponsor emission window
            gira_query = (
                select(Gira)
                .where(
                    and_(
                        Gira.tenant_id == tenant.id,
                        Gira.is_active == True,
                        Gira.sponsor_release_start_at <= now,
                        Gira.sponsor_release_end_at >= now,
                        Gira.sponsor_max_tickets.isnot(None),
                    )
                )
                .order_by(Gira.sponsor_release_start_at.asc())
                .limit(1)
            )
        else:
            # Regular: use normal emission window
            gira_query = (
                select(Gira)
                .where(
                    and_(
                        Gira.tenant_id == tenant.id,
                        Gira.is_active == True,
                        Gira.release_start_at <= now,  # Has started
                        Gira.release_end_at >= now,  # Not ended
                    )
                )
                .order_by(Gira.release_start_at.asc())
                .limit(1)
            )
        gira_result = await session.execute(gira_query)
        gira = gira_result.scalar_one_or_none()

        if not gira:
            msg = "No active gira available for sponsor ticket emission" if is_sponsor else "No active gira available for ticket emission"
            raise HTTPException(
                status_code=404,
                detail=msg,
            )

        # === STEP 2b: Validate Associado Email (if enabled) ===
        if is_sponsor:
            tc_check = select(TenantConfig).where(TenantConfig.tenant_id == tenant.id)
            tc_check_result = await session.execute(tc_check)
            tc = tc_check_result.scalar_one_or_none()
            if tc and tc.validate_associado_on_emit:
                from src.repositories.associado_repo import AssociadoRepository
                assoc_repo = AssociadoRepository(session)
                if not await assoc_repo.email_exists(tenant.id, request.email):
                    raise HTTPException(
                        status_code=422,
                        detail="E-mail de associado não encontrado. Revise as informações digitadas e tente novamente.",
                    )

        # === STEP 3: Initialize Repositories ===
        from src.models.consulentes import Consulente
        from src.models.senha_controls import SenhaControl
        from src.models.tickets import Ticket
        consulente_repo = ConsulenteRepository(session, Consulente)
        senha_control_repo = SenhaControlRepository(session, SenhaControl)
        ticket_repo = TicketRepository(session, Ticket)

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
            is_sponsor=is_sponsor,
        )

        if has_duplicate:
            msg = "This email already has a sponsor ticket for this gira" if is_sponsor else "This email already has a ticket for this gira"
            raise HTTPException(
                status_code=409,
                detail=msg,
            )

        # === STEP 6: Get or Create SenhaControl (for atomic counting) ===
        await senha_control_repo.get_or_create_for_gira(
            session=session,
            tenant_id=tenant.id,
            gira_id=gira.id,
            initial_number=0,
            is_sponsor=is_sponsor,
        )

        # === STEP 7: Atomically Increment Counter ===
        try:
            ticket_number_int = await senha_control_repo.increment_atomic(
                session=session,
                tenant_id=tenant.id,
                gira_id=gira.id,
                is_sponsor=is_sponsor,
            )
        except ValueError:
            raise HTTPException(
                status_code=500,
                detail="Failed to allocate ticket number",
            )

        # Check capacity
        max_cap = gira.sponsor_max_tickets if is_sponsor else gira.max_tickets
        if ticket_number_int > max_cap:
            await session.rollback()
            raise HTTPException(
                status_code=429,
                detail="All sponsor tickets for this gira have been emitted" if is_sponsor else "All tickets for this gira have been emitted",
            )

        # === STEP 8: Create Ticket Record ===
        ticket_number_formatted = f"P{ticket_number_int:03d}" if is_sponsor else f"{ticket_number_int:04d}"
        obs_payload: dict = {}
        if is_sponsor:
            obs_payload["patrocinador"] = True
        if request.preferencial:
            obs_payload["preferencial"] = True
        observacoes = json.dumps(obs_payload) if obs_payload else None
        ticket = await ticket_repo.create_ticket(
            session=session,
            tenant_id=tenant.id,
            gira_id=gira.id,
            consulente_id=consulente.id,
            numero=ticket_number_int,
            status=TicketStatus.EMITTED,
            observacoes=observacoes,
            is_sponsor=is_sponsor,
        )

        # Commit transaction
        await session.commit()

        logger.info(
            f"Ticket {ticket_number_formatted} emitted for {consulente.email} "
            f"(tenant={tenant.slug}, gira={gira.id})"
        )

        # === STEP 9: Send Email in Background ===
        rescue_link = (
            f"{settings.FRONTEND_URL.rstrip('/')}/public/{tenant.slug}/ticket/{ticket.id}"
        )

        gira_date_str = gira.data_inicio.strftime("%d/%m/%Y às %H:%M") if gira.data_inicio else ""

        # Fetch tenant config for address + colors
        tc_query = select(TenantConfig).where(TenantConfig.tenant_id == tenant.id)
        tc_result = await session.execute(tc_query)
        tenant_config = tc_result.scalar_one_or_none()

        tenant_address = (tenant_config.endereco or "") if tenant_config else ""
        primary_color = (tenant_config.primary_color or "#2E7D32") if tenant_config else "#2E7D32"
        secondary_color = (tenant_config.secondary_color or primary_color) if tenant_config else primary_color

        # Build logo URL
        tenant_logo_url = ""
        if tenant_config and tenant_config.logo_data:
            tenant_logo_url = f"{settings.FRONTEND_URL.rstrip('/')}/api/v1/public/tenant/{tenant.id}/logo"
        elif tenant_config and tenant_config.logo_url:
            tenant_logo_url = tenant_config.logo_url

        subject_prefix = "✦ Associado — " if is_sponsor else ""
        html_body = generate_ticket_emission_html(
            ticket_number=ticket_number_formatted,
            consulente_name=consulente.nome,
            gira_name=gira.nome,
            gira_date=gira_date_str,
            gira_location=gira.local or "",
            rescue_link=rescue_link,
            tenant_name=tenant.name,
            tenant_logo_url=tenant_logo_url,
            tenant_color=primary_color,
            is_sponsor=is_sponsor,
            tenant_address=tenant_address,
            primary_color=primary_color,
            secondary_color=secondary_color,
            consulente_email=consulente.email,
            consulente_phone=consulente.telefone or "",
        )
        text_body = generate_plain_text_fallback(
            ticket_number=ticket_number_formatted,
            consulente_name=consulente.nome,
            gira_name=gira.nome,
            gira_date=gira_date_str,
            gira_location=gira.local or "",
            rescue_link=rescue_link,
            is_sponsor=is_sponsor,
            tenant_address=tenant_address,
            tenant_name=tenant.name,
            consulente_email=consulente.email,
            consulente_phone=consulente.telefone or "",
        )
        message = EmailMessage(
            to_email=consulente.email,
            subject=f"{subject_prefix}Sua Senha #{ticket_number_formatted} - {tenant.name}",
            html_body=html_body,
            text_body=text_body,
        )
        email_queue.enqueue(EmailQueueItem(message=message, ticket_id=str(ticket.id)))

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
