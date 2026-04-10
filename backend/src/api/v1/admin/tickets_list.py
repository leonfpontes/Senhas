"""T059: Admin Tickets List - GET /api/v1/admin/giras/{gira_id}/tickets (pagination)"""
from fastapi import APIRouter, HTTPException, Depends, status, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field
from typing import List, Optional
from uuid import UUID
from datetime import datetime
import json
import logging

from src.core.database import get_db
from src.models import User, Ticket, TicketStatus, Consulente
from src.api.dependencies import get_current_user
from src.core.errors import (
    InsufficientPermissionsError,
    NotFoundError,
)
from src.services.audit_service import AuditService

router = APIRouter(prefix="/api/v1/admin", tags=["admin-tickets"])
logger = logging.getLogger(__name__)


class TicketResponse(BaseModel):
    """Ticket response model."""
    id: UUID
    numero: int
    status: str
    consulente_nome: Optional[str] = None
    consulente_email: Optional[str] = None
    consulente_telefone: Optional[str] = None
    preferencial: bool = False
    is_sponsor: bool = False
    is_walk_in: bool = False
    observacoes: Optional[str] = None
    chamado_em: Optional[datetime] = None
    finalizado_em: Optional[datetime] = None
    medium_nome: Optional[str] = None
    cambone_nome: Optional[str] = None
    atendimento_descricao: Optional[str] = None
    created_at: datetime
    resend_email_id: Optional[str] = None
    email_sent_at: Optional[datetime] = None
    email_provider: Optional[str] = None

    class Config:
        from_attributes = True


class UpdateAttendInfoRequest(BaseModel):
    """Request body for editing attendance info."""
    medium_nome: Optional[str] = Field(None, max_length=255)
    cambone_nome: Optional[str] = Field(None, max_length=255)
    atendimento_descricao: Optional[str] = None


class TicketListResponse(BaseModel):
    """Paginated ticket list response."""
    total: int
    skip: int
    limit: int
    items: List[TicketResponse]


@router.get("/giras/{gira_id}/tickets", response_model=TicketListResponse)
async def list_gira_tickets(
    gira_id: UUID = Path(...),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    status_filter: Optional[TicketStatus] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TicketListResponse:
    """List tickets for a gira with pagination.
    
    Requires admin role.
    
    Query parameters:
    - skip: Offset for pagination
    - limit: Max results (1-500)
    - status_filter: Filter by ticket status (optional)
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")
    
    # Build query
    where_clause = and_(
        Ticket.tenant_id == current_user.tenant_id,
        Ticket.gira_id == gira_id,
    )
    
    if status_filter:
        where_clause = and_(where_clause, Ticket.status == status_filter)
    
    # Count total
    count_stmt = select(Ticket).where(where_clause)
    count_result = await db.execute(count_stmt)
    total = len(count_result.scalars().all())
    
    # Fetch paginated results with consulente data
    stmt = (
        select(Ticket)
        .options(selectinload(Ticket.consulente))
        .where(where_clause)
        .offset(skip)
        .limit(limit)
        .order_by(Ticket.numero)
    )
    result = await db.execute(stmt)
    tickets = result.scalars().all()
    
    items = []
    for t in tickets:
        preferencial = False
        if t.observacoes:
            try:
                obs = json.loads(t.observacoes)
                preferencial = obs.get("preferencial", False)
            except (json.JSONDecodeError, TypeError):
                pass
        items.append(TicketResponse(
            id=t.id,
            numero=t.numero,
            status=t.status.value if hasattr(t.status, 'value') else t.status,
            consulente_nome=t.consulente.nome if t.consulente else None,
            consulente_email=t.consulente.email if t.consulente else None,
            consulente_telefone=t.consulente.telefone if t.consulente else None,
            preferencial=preferencial,
            is_sponsor=t.is_sponsor,
            is_walk_in=t.is_walk_in,
            observacoes=t.observacoes if t.observacoes and not preferencial else None,
            chamado_em=t.chamado_em,
            finalizado_em=t.finalizado_em,
            medium_nome=t.medium_nome,
            cambone_nome=t.cambone_nome,
            atendimento_descricao=t.atendimento_descricao,
            created_at=t.created_at,
            resend_email_id=t.resend_email_id,
            email_sent_at=t.email_sent_at,
            email_provider=t.email_provider,
        ))
    
    return TicketListResponse(
        total=total,
        skip=skip,
        limit=limit,
        items=items,
    )


@router.get("/tickets/{ticket_id}", response_model=TicketResponse)
async def get_ticket(
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TicketResponse:
    """Get specific ticket.
    
    Requires admin role.
    """
    if not current_user.is_operator_or_admin:
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
    
    # Load consulente
    await db.refresh(ticket, ["consulente"])
    
    preferencial = False
    if ticket.observacoes:
        try:
            obs = json.loads(ticket.observacoes)
            preferencial = obs.get("preferencial", False)
        except (json.JSONDecodeError, TypeError):
            pass
    
    return TicketResponse(
        id=ticket.id,
        numero=ticket.numero,
        status=ticket.status.value if hasattr(ticket.status, 'value') else ticket.status,
        consulente_nome=ticket.consulente.nome if ticket.consulente else None,
        consulente_email=ticket.consulente.email if ticket.consulente else None,
        consulente_telefone=ticket.consulente.telefone if ticket.consulente else None,
        preferencial=preferencial,
        is_sponsor=ticket.is_sponsor,
        is_walk_in=ticket.is_walk_in,
        observacoes=ticket.observacoes if ticket.observacoes and not preferencial else None,
        chamado_em=ticket.chamado_em,
        finalizado_em=ticket.finalizado_em,
        medium_nome=ticket.medium_nome,
        cambone_nome=ticket.cambone_nome,
        atendimento_descricao=ticket.atendimento_descricao,
        created_at=ticket.created_at,
        resend_email_id=ticket.resend_email_id,
        email_sent_at=ticket.email_sent_at,
        email_provider=ticket.email_provider,
    )


@router.patch("/tickets/{ticket_id}/attend-info", response_model=TicketResponse)
async def update_attend_info(
    body: UpdateAttendInfoRequest,
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TicketResponse:
    """Edit attendance info (medium, cambone, description) on a ticket.

    Requires admin role. Enforces multi-tenant isolation.
    """
    if not current_user.is_operator_or_admin:
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

    ticket.medium_nome = body.medium_nome
    ticket.cambone_nome = body.cambone_nome
    ticket.atendimento_descricao = body.atendimento_descricao

    audit = AuditService(db)
    await audit.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="Ticket",
        resource_id=ticket.id,
        new_state={
            "medium_nome": body.medium_nome,
            "cambone_nome": body.cambone_nome,
            "atendimento_descricao": body.atendimento_descricao,
        },
    )

    await db.commit()
    await db.refresh(ticket, ["consulente"])

    preferencial = False
    if ticket.observacoes:
        try:
            obs = json.loads(ticket.observacoes)
            preferencial = obs.get("preferencial", False)
        except (json.JSONDecodeError, TypeError):
            pass

    return TicketResponse(
        id=ticket.id,
        numero=ticket.numero,
        status=ticket.status.value if hasattr(ticket.status, 'value') else ticket.status,
        consulente_nome=ticket.consulente.nome if ticket.consulente else None,
        consulente_email=ticket.consulente.email if ticket.consulente else None,
        consulente_telefone=ticket.consulente.telefone if ticket.consulente else None,
        preferencial=preferencial,
        is_sponsor=ticket.is_sponsor,
        is_walk_in=ticket.is_walk_in,
        observacoes=ticket.observacoes if ticket.observacoes and not preferencial else None,
        chamado_em=ticket.chamado_em,
        finalizado_em=ticket.finalizado_em,
        medium_nome=ticket.medium_nome,
        cambone_nome=ticket.cambone_nome,
        atendimento_descricao=ticket.atendimento_descricao,
        created_at=ticket.created_at,
    )
