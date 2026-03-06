"""T059: Admin Tickets List - GET /api/v1/admin/giras/{gira_id}/tickets (pagination)"""
from fastapi import APIRouter, HTTPException, Depends, status, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from src.core.database import get_db
from src.models import User, Ticket, TicketStatus
from src.api.dependencies import get_current_user
from src.core.errors import (
    InsufficientPermissionsError,
    NotFoundError,
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin-tickets"])
logger = logging.getLogger(__name__)


class TicketResponse(BaseModel):
    """Ticket response model."""
    id: UUID
    numero: int
    status: str
    email: Optional[str] = None
    name: Optional[str] = None
    chamado_em: Optional[datetime] = None
    finalizado_em: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


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
    if not current_user.is_admin:
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
    
    # Fetch paginated results
    stmt = select(Ticket).where(where_clause).offset(skip).limit(limit).order_by(Ticket.numero)
    result = await db.execute(stmt)
    tickets = result.scalars().all()
    
    return TicketListResponse(
        total=total,
        skip=skip,
        limit=limit,
        items=[TicketResponse.from_orm(t) for t in tickets],
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
    
    return TicketResponse.from_orm(ticket)
