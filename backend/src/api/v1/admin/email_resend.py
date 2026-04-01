"""Admin Email Resend + Status endpoints.

GET  /api/v1/admin/tickets/{id}/email-status  — fetch Resend delivery status
POST /api/v1/admin/tickets/{id}/resend-email  — re-queue email via email_queue
"""
from fastapi import APIRouter, Depends, Path, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime
import logging

from src.core.database import get_db
from src.models import User, Ticket, Consulente
from src.services.email.base import EmailMessage
from src.services.email.email_queue import email_queue, EmailQueueItem
from src.services.email.resend_fallback import ResendEmailService
from src.services.email.templates.ticket_emission import (
    generate_ticket_emission_html,
    generate_plain_text_fallback,
)
from src.api.dependencies import get_current_user
from src.core.errors import InsufficientPermissionsError, NotFoundError

router = APIRouter(prefix="/api/v1/admin", tags=["admin-email"])
logger = logging.getLogger(__name__)


class ResendEmailResponse(BaseModel):
    """Email resend response."""
    success: bool
    message: str
    email_sent_to: Optional[str] = None


class EmailStatusResponse(BaseModel):
    """Email tracking status for a specific ticket."""
    ticket_id: UUID
    ticket_numero: int
    consulente_nome: Optional[str] = None
    consulente_email: Optional[str] = None
    ticket_status: str
    email_sent_at: Optional[datetime] = None
    email_provider: Optional[str] = None
    resend_id: Optional[str] = None
    resend_status: Optional[str] = None
    resend_html: Optional[str] = None
    resend_subject: Optional[str] = None
    resend_created_at: Optional[str] = None


@router.get("/tickets/{ticket_id}/email-status", response_model=EmailStatusResponse)
async def get_ticket_email_status(
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EmailStatusResponse:
    """Get email tracking status for a ticket.

    If sent via Resend and has a resend_email_id, calls Resend GET /emails/{id}
    to retrieve the latest delivery status and HTML content.

    Requires admin role.
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    stmt = select(Ticket).where(
        and_(
            Ticket.id == ticket_id,
            Ticket.tenant_id == current_user.tenant_id,
        )
    )
    result = await db.execute(stmt)
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise NotFoundError("Ticket não encontrado")

    await db.refresh(ticket, ["consulente"])
    consulente = ticket.consulente

    resend_status: Optional[str] = None
    resend_html: Optional[str] = None
    resend_subject: Optional[str] = None
    resend_created_at: Optional[str] = None

    if ticket.resend_email_id:
        try:
            resend_service = ResendEmailService()
            data = await resend_service.get_email_status(ticket.resend_email_id)
            if data:
                resend_status = data.get("last_event")
                resend_html = data.get("html")
                resend_subject = data.get("subject")
                resend_created_at = data.get("created_at")
        except ValueError:
            logger.warning("Resend not configured, skipping status fetch.")
        except Exception as exc:
            logger.warning(
                f"Could not fetch Resend status for {ticket.resend_email_id}: {exc}"
            )

    return EmailStatusResponse(
        ticket_id=ticket.id,
        ticket_numero=ticket.numero,
        consulente_nome=consulente.nome if consulente else None,
        consulente_email=consulente.email if consulente else None,
        ticket_status=(
            ticket.status.value if hasattr(ticket.status, "value") else ticket.status
        ),
        email_sent_at=ticket.email_sent_at,
        email_provider=ticket.email_provider,
        resend_id=ticket.resend_email_id,
        resend_status=resend_status,
        resend_html=resend_html,
        resend_subject=resend_subject,
        resend_created_at=resend_created_at,
    )


@router.post("/tickets/{ticket_id}/resend-email", response_model=ResendEmailResponse)
async def resend_ticket_email(
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ResendEmailResponse:
    """Re-queue ticket confirmation email for delivery.

    Enqueues the email via email_queue (rate-limited, Resend→Brevo fallback).
    Requires admin role.
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    stmt = select(Ticket).where(
        and_(
            Ticket.id == ticket_id,
            Ticket.tenant_id == current_user.tenant_id,
        )
    )
    result = await db.execute(stmt)
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise NotFoundError("Ticket não encontrado")

    stmt_consulente = select(Consulente).where(
        and_(
            Consulente.id == ticket.consulente_id,
            Consulente.tenant_id == current_user.tenant_id,
        )
    )
    result_consulente = await db.execute(stmt_consulente)
    consulente = result_consulente.scalar_one_or_none()

    if not consulente or not consulente.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Consulente sem email cadastrado",
        )

    ticket_numero_str = str(ticket.numero).zfill(4)
    html_body = generate_ticket_emission_html(
        ticket_number=ticket_numero_str,
        consulente_name=consulente.nome,
        gira_name="",
        gira_date="",
        gira_location="",
        rescue_link="",
        tenant_name="",
        tenant_logo_url="",
        tenant_color="#2E7D32",
        is_sponsor=ticket.is_sponsor,
        tenant_address="",
        primary_color="#2E7D32",
        secondary_color="#2E7D32",
        consulente_email=consulente.email,
        consulente_phone="",
    )
    text_body = generate_plain_text_fallback(
        ticket_number=ticket_numero_str,
        consulente_name=consulente.nome,
        gira_name="",
        gira_date="",
        gira_location="",
        rescue_link="",
        is_sponsor=ticket.is_sponsor,
        tenant_address="",
        tenant_name="",
        consulente_email=consulente.email,
        consulente_phone="",
    )
    subject_prefix = "✦ Associado — " if ticket.is_sponsor else ""
    message = EmailMessage(
        to_email=consulente.email,
        subject=f"{subject_prefix}Reenvio — Sua Senha #{ticket_numero_str}",
        html_body=html_body,
        text_body=text_body,
    )
    email_queue.enqueue(EmailQueueItem(message=message, ticket_id=str(ticket.id)))

    return ResendEmailResponse(
        success=True,
        message="Email será reenviado em breve",
        email_sent_to=consulente.email,
    )

