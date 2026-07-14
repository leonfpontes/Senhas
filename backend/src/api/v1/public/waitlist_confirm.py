"""Public endpoint — confirm a promoted waitlist ticket.

When a slot opens up, the promoted ticket stays `WAITLISTED` with
`promoted_at`/`confirmation_expires_at` set (see `waitlist_service`). The
consulente must hit this endpoint within the confirmation window to turn it
into a real `EMITTED` senha; otherwise it cascades to the next person in line.
"""
from datetime import datetime, timezone
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select

from src.core.database import AsyncSessionLocal
from src.core.limiter import limiter
from src.models.tickets import Ticket, TicketStatus
from src.models.giras import Gira
from src.services import waitlist_service

router = APIRouter(prefix="/api/v1/public", tags=["public"])
logger = logging.getLogger(__name__)


class WaitlistConfirmResponse(BaseModel):
    ticket_number: str
    message: str


@router.post("/waitlist/{ticket_id}/confirm", response_model=WaitlistConfirmResponse)
@limiter.limit("30/minute")
async def confirm_waitlist_ticket(request: Request, ticket_id: str):
    """Confirm a promoted waitlist ticket, turning it into a real senha."""
    async with AsyncSessionLocal() as session:
        try:
            import uuid as _uuid
            ticket_uuid = _uuid.UUID(ticket_id)
        except ValueError:
            raise HTTPException(status_code=404, detail="Senha não encontrada")

        result = await session.execute(select(Ticket).where(Ticket.id == ticket_uuid))
        ticket = result.scalar_one_or_none()
        if not ticket:
            raise HTTPException(status_code=404, detail="Senha não encontrada")

        if ticket.status != TicketStatus.WAITLISTED or ticket.promoted_at is None:
            raise HTTPException(
                status_code=400,
                detail="Esta senha não está aguardando confirmação de fila de espera",
            )

        gira_result = await session.execute(select(Gira).where(Gira.id == ticket.gira_id))
        gira_obj = gira_result.scalar_one_or_none()

        now = datetime.now(timezone.utc)
        if ticket.confirmation_expires_at and now > ticket.confirmation_expires_at:
            # Lapsed since the email was sent — expire it and cascade to the next
            # candidate now, rather than waiting for another trigger point.
            if gira_obj:
                await waitlist_service.reconcile_and_fill(
                    session=session,
                    tenant_id=ticket.tenant_id,
                    gira_id=ticket.gira_id,
                    is_sponsor=ticket.is_sponsor,
                    gira=gira_obj,
                    extra_slots=0,
                )
            await session.commit()
            raise HTTPException(
                status_code=410,
                detail="O prazo de confirmação expirou e a vaga foi repassada para o próximo da fila",
            )

        await session.refresh(ticket, ["consulente"])
        ticket.status = TicketStatus.EMITTED
        await session.flush()

        ticket_number_formatted = await waitlist_service.send_confirmed_ticket_email(session, ticket)

        await session.commit()

        logger.info(f"Waitlist ticket {ticket.id} confirmed (numero={ticket_number_formatted})")

        return WaitlistConfirmResponse(
            ticket_number=ticket_number_formatted,
            message="Senha confirmada com sucesso! Verifique seu e-mail.",
        )
