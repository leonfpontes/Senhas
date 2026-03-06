"""
T031: TicketRepository - CRUD for Ticket emission records
Handles creation, retrieval, and filtering of emitted tickets
"""

from datetime import datetime
from typing import Optional, List
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.tickets import Ticket
from src.repositories.base import BaseRepository


class TicketRepository(BaseRepository[Ticket]):
    """Multi-tenant repository for ticket management
    
    Public ticket emission uses this to save newly emitted senhas.
    Supports filtering by gira, email, and other criteria.
    """

    async def create_ticket(
        self,
        session: AsyncSession,
        tenant_id: int,
        gira_id: int,
        consulente_id: int,
        ticket_number: str,
        status: str = "EMITTED",
    ) -> Ticket:
        """Create and save a new ticket
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID
            gira_id: Which gira is being emitted
            consulente_id: Who requested the ticket
            ticket_number: Formatted number (e.g., "0042")
            status: Ticket status (default: EMITTED)
            
        Returns:
            Created Ticket instance
        """
        ticket = Ticket(
            tenant_id=tenant_id,
            gira_id=gira_id,
            consulente_id=consulente_id,
            ticket_number=ticket_number,
            status=status,
            emitted_at=datetime.utcnow(),
        )
        session.add(ticket)
        await session.flush()
        return ticket

    async def get_by_number_and_gira(
        self,
        session: AsyncSession,
        tenant_id: int,
        gira_id: int,
        ticket_number: str,
    ) -> Optional[Ticket]:
        """Fetch ticket by number for a specific gira
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID
            gira_id: Gira ID
            ticket_number: Ticket number to search
            
        Returns:
            Ticket or None
        """
        query = select(Ticket).where(
            and_(
                Ticket.tenant_id == tenant_id,
                Ticket.gira_id == gira_id,
                Ticket.ticket_number == ticket_number,
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
            .order_by(Ticket.emitted_at.desc())
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
        """Fetch tickets by consulente email (for resend email functionality)
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID
            email: Consulente email (normalized)
            limit: Max results
            
        Returns:
            List of Tickets
        """
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
            .order_by(Ticket.emitted_at.desc())
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
    ) -> bool:
        """Check if consulente already has ticket in this gira (prevent duplicates)
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID
            gira_id: Gira ID
            consulente_id: Consulente ID
            
        Returns:
            True if duplicate exists, False otherwise
        """
        query = select(Ticket).where(
            and_(
                Ticket.tenant_id == tenant_id,
                Ticket.gira_id == gira_id,
                Ticket.consulente_id == consulente_id,
                Ticket.status != "CANCELLED",
            )
        )
        result = await session.execute(query)
        return result.scalar_one_or_none() is not None

    async def update_status(
        self,
        session: AsyncSession,
        tenant_id: int,
        ticket_id: int,
        new_status: str,
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
