"""
T031: TicketRepository - CRUD for Ticket emission records
Handles creation, retrieval, and filtering of emitted tickets
"""

from datetime import datetime
from typing import Optional, List
from uuid import UUID
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.tickets import Ticket, TicketStatus
from src.repositories.base import BaseRepository


class TicketRepository(BaseRepository[Ticket]):
    """Multi-tenant repository for ticket management
    
    Public ticket emission uses this to save newly emitted senhas.
    Supports filtering by gira, email, and other criteria.
    """

    async def create_ticket(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        gira_id: UUID,
        consulente_id: UUID,
        numero: int,
        status: TicketStatus = TicketStatus.EMITTED,
        observacoes: str | None = None,
        is_sponsor: bool = False,
        is_walk_in: bool = False,
        emitido_por_id: UUID | None = None,
        checkin_em: datetime | None = None,
        priority_category: str | None = None,
        time_slot_id: UUID | None = None,
        is_acompanhante: bool = False,
        parent_ticket_id: UUID | None = None,
    ) -> Ticket:
        """Create and save a new ticket
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID
            gira_id: Which gira is being emitted
            consulente_id: Who requested the ticket
            numero: Sequential ticket number (int)
            status: Ticket status (default: EMITTED)
            observacoes: Optional notes (e.g. preferential)
            is_sponsor: Whether this is a sponsor ticket
            is_walk_in: Whether this ticket was created via walk-in flow
            emitido_por_id: User who emitted the ticket
            checkin_em: Optional check-in timestamp
            
        Returns:
            Created Ticket instance
        """
        ticket = Ticket(
            tenant_id=tenant_id,
            gira_id=gira_id,
            consulente_id=consulente_id,
            numero=numero,
            status=status,
            observacoes=observacoes,
            is_sponsor=is_sponsor,
            is_walk_in=is_walk_in,
            emitido_por_id=emitido_por_id,
            checkin_em=checkin_em,
            priority_category=priority_category,
            time_slot_id=time_slot_id,
            is_acompanhante=is_acompanhante,
            parent_ticket_id=parent_ticket_id,
        )
        session.add(ticket)
        await session.flush()
        return ticket

    async def get_by_number_and_gira(
        self,
        session: AsyncSession,
        tenant_id: int,
        gira_id: int,
        numero: int,
    ) -> Optional[Ticket]:
        """Fetch ticket by number for a specific gira"""
        query = select(Ticket).where(
            and_(
                Ticket.tenant_id == tenant_id,
                Ticket.gira_id == gira_id,
                Ticket.numero == numero,
            )
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()

    async def get_by_id_with_relations(
        self,
        session: AsyncSession,
        tenant_id: int,
        ticket_id: int,
    ) -> Optional[Ticket]:
        """Fetch ticket with gira and consulente relations loaded
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID
            ticket_id: Ticket ID
            
        Returns:
            Ticket with relations or None
        """
        query = (
            select(Ticket)
            .where(and_(Ticket.tenant_id == tenant_id, Ticket.id == ticket_id))
            .options(
                selectinload(Ticket.gira),
                selectinload(Ticket.consulente),
            )
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()

    async def list_by_gira(
        self,
        session: AsyncSession,
        tenant_id: int,
        gira_id: int,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Ticket]:
        """Fetch all tickets for a gira
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID
            gira_id: Gira ID
            limit: Max results
            offset: Pagination offset
            
        Returns:
            List of Tickets
        """
        query = (
            select(Ticket)
            .where(
                and_(
                    Ticket.tenant_id == tenant_id,
                    Ticket.gira_id == gira_id,
                )
            )
            .options(
                selectinload(Ticket.gira),
                selectinload(Ticket.consulente),
            )
            .order_by(Ticket.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await session.execute(query)
        return result.scalars().all()

    async def list_by_consulente_email(
        self,
        session: AsyncSession,
        tenant_id: int,
        email: str,
        limit: int = 50,
    ) -> List[Ticket]:
        """Fetch tickets by consulente email (for resend email functionality)"""
        from src.models.consulentes import Consulente

        query = (
            select(Ticket)
            .join(Consulente, Ticket.consulente_id == Consulente.id)
            .where(
                and_(
                    Ticket.tenant_id == tenant_id,
                    Consulente.email_normalized == email.lower().strip(),
                )
            )
            .options(
                selectinload(Ticket.gira),
                selectinload(Ticket.consulente),
            )
            .order_by(Ticket.created_at.desc())
            .limit(limit)
        )
        result = await session.execute(query)
        return result.scalars().all()

    async def check_duplicate_in_gira(
        self,
        session: AsyncSession,
        tenant_id: int,
        gira_id: int,
        consulente_id: int,
        is_sponsor: bool = False,
    ) -> bool:
        """Check if consulente already has ticket of same type in this gira (prevent duplicates)
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID
            gira_id: Gira ID
            consulente_id: Consulente ID
            is_sponsor: Whether checking for sponsor ticket duplicate
            
        Returns:
            True if duplicate exists, False otherwise
        """
        # Senhas de acompanhante compartilham o consulente_id do titular, então
        # não contam como emissão do próprio consulente.
        query = select(Ticket).where(
            and_(
                Ticket.tenant_id == tenant_id,
                Ticket.gira_id == gira_id,
                Ticket.consulente_id == consulente_id,
                Ticket.is_sponsor == is_sponsor,
                Ticket.is_acompanhante == False,
                Ticket.status != TicketStatus.CANCELLED,
            )
        )
        result = await session.execute(query)
        return result.scalars().first() is not None

    async def get_duplicate_in_gira(
        self,
        session: AsyncSession,
        tenant_id: int,
        gira_id: int,
        consulente_id: int,
        is_sponsor: bool = False,
    ) -> Optional[Ticket]:
        """Fetch the consulente's existing non-cancelled ticket of the same type
        in this gira (the one check_duplicate_in_gira detects), with consulente
        eager-loaded for email resend."""
        query = (
            select(Ticket)
            .options(selectinload(Ticket.consulente))
            .where(
                and_(
                    Ticket.tenant_id == tenant_id,
                    Ticket.gira_id == gira_id,
                    Ticket.consulente_id == consulente_id,
                    Ticket.is_sponsor == is_sponsor,
                    Ticket.is_acompanhante == False,
                    Ticket.status != TicketStatus.CANCELLED,
                )
            )
            .limit(1)
        )
        result = await session.execute(query)
        return result.scalars().first()

    async def list_active_acompanhantes(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        parent_ticket_id: UUID,
    ) -> List[Ticket]:
        """Fetch the non-cancelled acompanhante tickets linked to a titular
        ticket, ordered by numero (for emails and cancel cascades)."""
        query = (
            select(Ticket)
            .where(
                and_(
                    Ticket.tenant_id == tenant_id,
                    Ticket.parent_ticket_id == parent_ticket_id,
                    Ticket.status != TicketStatus.CANCELLED,
                )
            )
            .order_by(Ticket.numero)
        )
        result = await session.execute(query)
        return list(result.scalars().all())

    async def update_status(
        self,
        session: AsyncSession,
        tenant_id: int,
        ticket_id: int,
        new_status: TicketStatus,
    ) -> Optional[Ticket]:
        """Update ticket status
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID
            ticket_id: Ticket ID
            new_status: New status value
            
        Returns:
            Updated Ticket or None
        """
        ticket = await self.get_by_id_with_relations(session, tenant_id, ticket_id)
        if not ticket:
            return None

        ticket.status = new_status
        await session.flush()
        return ticket
