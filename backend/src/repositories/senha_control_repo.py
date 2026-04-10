"""
T030: SenhaControlRepository - Atomic ticket number increment for public emission
Handles multi-tenant SenhaControl with optimistic locking (no race conditions)
"""

from typing import Optional
from uuid import UUID
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.senha_controls import SenhaControl
from src.models.tenants import Tenant
from src.repositories.base import BaseRepository


class SenhaControlRepository(BaseRepository[SenhaControl]):
    """Multi-tenant repository for atomic ticket number management
    
    Uses SQLAlchemy FOR UPDATE to prevent race conditions during emission.
    """

    async def get_or_create_for_gira(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        gira_id: UUID,
        initial_number: int = 0,
        is_sponsor: bool = False,
    ) -> SenhaControl:
        """Get existing SenhaControl or create new one atomically
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID for multi-tenant isolation
            gira_id: Gira ID to control
            initial_number: Starting number for counter
            is_sponsor: Whether this is for sponsor tickets
            
        Returns:
            SenhaControl instance (new or existing)
        """
        query = select(SenhaControl).where(
            and_(
                SenhaControl.tenant_id == tenant_id,
                SenhaControl.gira_id == gira_id,
                SenhaControl.is_sponsor == is_sponsor,
            )
        )
        result = await session.execute(query)
        senha_control = result.scalar_one_or_none()

        if not senha_control:
            senha_control = SenhaControl(
                tenant_id=tenant_id,
                gira_id=gira_id,
                is_sponsor=is_sponsor,
                proximo_numero=initial_number,
            )
            session.add(senha_control)
            await session.flush()

        return senha_control

    async def increment_atomic(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        gira_id: UUID,
        is_sponsor: bool = False,
    ) -> int:
        """Atomically increment counter and return new number
        
        Uses SELECT FOR UPDATE to lock row during increment.
        This prevents race conditions when multiple threads emit simultaneously.
        
        Args:
            session: Async DB session (must be in transaction)
            tenant_id: Tenant ID
            gira_id: Gira ID
            is_sponsor: Whether this is for sponsor tickets
            
        Returns:
            Next ticket number (e.g., 42)
            
        Raises:
            ValueError: If SenhaControl not found
        """
        # Lock row for update
        query = (
            select(SenhaControl)
            .where(
                and_(
                    SenhaControl.tenant_id == tenant_id,
                    SenhaControl.gira_id == gira_id,
                    SenhaControl.is_sponsor == is_sponsor,
                )
            )
            .with_for_update()
        )
        result = await session.execute(query)
        senha_control = result.scalar_one_or_none()

        if not senha_control:
            raise ValueError(
                f"SenhaControl not found for tenant={tenant_id}, gira={gira_id}"
            )

        # Increment counter
        next_number = senha_control.proximo_numero + 1
        senha_control.proximo_numero = next_number
        senha_control.total_emitido = next_number

        await session.flush()
        return next_number

    async def get_by_gira(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        gira_id: UUID,
        is_sponsor: bool = False,
    ) -> Optional[SenhaControl]:
        """Fetch SenhaControl for a gira
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID
            gira_id: Gira ID
            is_sponsor: Whether to get sponsor control
            
        Returns:
            SenhaControl or None
        """
        query = select(SenhaControl).where(
            and_(
                SenhaControl.tenant_id == tenant_id,
                SenhaControl.gira_id == gira_id,
                SenhaControl.is_sponsor == is_sponsor,
            )
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()

    async def get_current_count(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        gira_id: UUID,
        is_sponsor: bool = False,
    ) -> int:
        """Get current ticket count for gira
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID
            gira_id: Gira ID
            is_sponsor: Whether to get sponsor count
            
        Returns:
            Current number emitted
        """
        senha_control = await self.get_by_gira(session, tenant_id, gira_id, is_sponsor)
        return senha_control.total_emitido if senha_control else 0

    async def increment_slots_returned(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        gira_id: UUID,
        is_sponsor: bool = False,
    ) -> int:
        """Atomically increment slots_returned, freeing one capacity slot.

        Called when an admin cancels/deletes a ticket so that the emission
        capacity check in emit_ticket allows one more ticket to be issued.

        Uses SELECT FOR UPDATE on the same row as increment_atomic to avoid
        race conditions.

        Returns:
            Updated slots_returned value.

        Raises:
            ValueError: If SenhaControl not found.
        """
        query = (
            select(SenhaControl)
            .where(
                and_(
                    SenhaControl.tenant_id == tenant_id,
                    SenhaControl.gira_id == gira_id,
                    SenhaControl.is_sponsor == is_sponsor,
                )
            )
            .with_for_update()
        )
        result = await session.execute(query)
        senha_control = result.scalar_one_or_none()

        if not senha_control:
            raise ValueError(
                f"SenhaControl not found for tenant={tenant_id}, gira={gira_id}"
            )

        senha_control.slots_returned += 1
        await session.flush()
        return senha_control.slots_returned
