"""T061: Admin Email Resend - POST /api/v1/admin/tickets/{id}/resend-email"""
from fastapi import APIRouter, Depends, Path, HTTPException, BackgroundTasks, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
import logging

from src.core.database import get_db
from src.models import User, Ticket, Consulente
from src.services.email.brevo_provider import BrevoEmailService
from src.services.email.resend_fallback import ResendEmailService
from src.services.email.templates.ticket_emission import generate_ticket_emission_html
from src.api.dependencies import get_current_user
from src.core.errors import InsufficientPermissionsError, NotFoundError

router = APIRouter(prefix="/api/v1/admin", tags=["admin-email"])
logger = logging.getLogger(__name__)


class ResendEmailResponse(BaseModel):
    """Email resend response."""
    success: bool
    message: str
    email_sent_to: Optional[str] = None


async def send_resend_email(
    ticket_id: UUID,
    consulente_email: str,
    ticket_numero: int,
):
    """Background task to resend email."""
    try:
        # Try Brevo first
        brevo_service = BrevoEmailService()
        html_content = generate_ticket_emission_html(
            ticket_numero=ticket_numero,
            tenant_name="Seu Terreiro",
            tenant_logo_url=None,
        )
        
        await brevo_service.send(
            to_email=consulente_email,
            subject="Seu Ticket foi Reenviado",
            html_content=html_content,
        )
        
        logger.info(f"Resent ticket {ticket_id} email to {consulente_email}")
    except Exception as e:
        logger.warning(f"Brevo failed for ticket {ticket_id}, trying Resend fallback: {e}")
        
        try:
            resend_service = ResendEmailService()
            html_content = generate_ticket_emission_html(
                ticket_numero=ticket_numero,
                tenant_name="Seu Terreiro",
                tenant_logo_url=None,
            )
            
            await resend_service.send(
                to_email=consulente_email,
                subject="Seu Ticket foi Reenviado",
                html_content=html_content,
            )
            
            logger.info(f"Resend fallback succeeded for ticket {ticket_id}")
        except Exception as e2:
            logger.error(f"Both email services failed for ticket {ticket_id}: {e2}")


@router.post("/tickets/{ticket_id}/resend-email", response_model=ResendEmailResponse)
async def resend_ticket_email(
    ticket_id: UUID = Path(...),
    background_tasks: BackgroundTasks = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ResendEmailResponse:
    """Resend ticket confirmation email.
    
    Requires admin role.
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")
    
    # Get ticket
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
    
    # Get consulente
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
            detail="Consulente sem email",
        )
    
    # Queue background task
    if background_tasks:
        background_tasks.add_task(
            send_resend_email,
            ticket_id=ticket_id,
            consulente_email=consulente.email,
            ticket_numero=ticket.numero,
        )
    
    return ResendEmailResponse(
        success=True,
        message="Email será reenviado em breve",
        email_sent_to=consulente.email,
    )
