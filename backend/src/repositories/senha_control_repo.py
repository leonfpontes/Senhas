"""
T030: SenhaControlRepository - Atomic ticket number increment for public emission
Handles multi-tenant SenhaControl with optimistic locking (no race conditions)
"""

from typing import Optional
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
        tenant_id: int,
        gira_id: int,
        initial_number: int = 0,
    ) -> SenhaControl:
        """Get existing SenhaControl or create new one atomically
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID for multi-tenant isolation
            gira_id: Gira ID to control
            initial_number: Starting number for counter
            
        Returns:
            SenhaControl instance (new or existing)
        """
        query = select(SenhaControl).where(
            and_(
                SenhaControl.tenant_id == tenant_id,
                SenhaControl.gira_id == gira_id,
            )
        )
        result = await session.execute(query)
        senha_control = result.scalar_one_or_none()

        if not senha_control:
            senha_control = SenhaControl(
                tenant_id=tenant_id,
                gira_id=gira_id,
                current_number=initial_number,
            )
            session.add(senha_control)
            await session.flush()

        return senha_control

    async def increment_atomic(
        self,
        session: AsyncSession,
        tenant_id: int,
        gira_id: int,
    ) -> int:
        """Atomically increment counter and return new number
        
        Uses SELECT FOR UPDATE to lock row during increment.
        This prevents race conditions when multiple threads emit simultaneously.
        
        Args:
            session: Async DB session (must be in transaction)
            tenant_id: Tenant ID
            gira_id: Gira ID
            
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
        next_number = senha_control.current_number + 1
        senha_control.current_number = next_number

        await session.flush()
        return next_number

    async def get_by_gira(
        self,
        session: AsyncSession,
        tenant_id: int,
        gira_id: int,
    ) -> Optional[SenhaControl]:
        """Fetch SenhaControl for a gira
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID
            gira_id: Gira ID
            
        Returns:
            SenhaControl or None
        """
        query = select(SenhaControl).where(
            and_(
                SenhaControl.tenant_id == tenant_id,
                SenhaControl.gira_id == gira_id,
            )
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()

    async def get_current_count(
        self,
        session: AsyncSession,
        tenant_id: int,
        gira_id: int,
    ) -> int:
        """Get current ticket count for gira
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID
            gira_id: Gira ID
            
        Returns:
            Current number emitted
        """
        senha_control = await self.get_by_gira(session, tenant_id, gira_id)
        return senha_control.current_number if senha_control else 0
