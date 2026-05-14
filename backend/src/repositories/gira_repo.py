"""T050: GiraRepository - CRUD + filtering for Gira events."""
from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_

from ..models import Gira
from .base import BaseRepository


class GiraRepository(BaseRepository[Gira]):
    """Repository for Gira (event) management.
    
    Provides:
    - CRUD operations
    - Filtering by status, date range
    - Ticket counter/progress tracking
    - Active gira lookup
    """
    
    def __init__(self, db: AsyncSession):
        super().__init__(db, Gira)
    
    async def create(self, tenant_id: UUID, **kwargs) -> Gira:
        """Create new gira.
        
        Args:
            tenant_id: Tenant ID
            **kwargs: Gira fields (nome, data_inicio, etc.)
            
        Returns:
            Created Gira object
        """
        gira = Gira(tenant_id=tenant_id, **kwargs)
        self.db.add(gira)
        await self.db.flush()
        await self.db.refresh(gira)
        return gira
    
    async def get_active_giras(self, tenant_id: UUID, limit: int = 10) -> List[Gira]:
        """Get active giras for a tenant.
        
        Args:
            tenant_id: Tenant ID
            limit: Max results
            
        Returns:
            List of active Gira objects
        """
        stmt = select(Gira).where(
            and_(
                Gira.tenant_id == tenant_id,
                Gira.is_active == True,
                Gira.deleted_at.is_(None),
            )
        ).order_by(Gira.data_inicio.desc()).limit(limit)
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def get_upcoming_giras(self, tenant_id: UUID, limit: int = 5) -> List[Gira]:
        """Get upcoming giras.
        
        Args:
            tenant_id: Tenant ID
            limit: Max results
            
        Returns:
            List of upcoming Gira objects sorted by date
        """
        from datetime import datetime, timezone
        
        stmt = select(Gira).where(
            and_(
                Gira.tenant_id == tenant_id,
                Gira.data_inicio >= datetime.now(timezone.utc),
                Gira.is_active == True,
                Gira.deleted_at.is_(None),
            )
        ).order_by(Gira.data_inicio).limit(limit)
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def get_ticket_count(self, gira_id: UUID, tenant_id: UUID) -> int:
        """Get count of tickets emitted for a gira.
        
        Args:
            gira_id: Gira ID
            tenant_id: Tenant ID
            
        Returns:
            Count of tickets
        """
        stmt = select(func.count(Gira.id)).where(
            and_(
                Gira.id == gira_id,
                Gira.tenant_id == tenant_id,
            )
        )
        
        result = await self.db.execute(stmt)
        return result.scalar_one() or 0
    
    async def filter_by_date_range(
        self,
        tenant_id: UUID,
        start_date,
        end_date,
        skip: int = 0,
        limit: int = 50,
    ) -> List[Gira]:
        """Filter giras by date range.
        
        Args:
            tenant_id: Tenant ID
            start_date: Start date
            end_date: End date
            skip: Pagination offset
            limit: Pagination limit
            
        Returns:
            List of filtered Gira objects
        """
        stmt = select(Gira).where(
            and_(
                Gira.tenant_id == tenant_id,
                Gira.data_inicio >= start_date,
                Gira.data_inicio <= end_date,
                Gira.deleted_at.is_(None),
            )
        ).order_by(Gira.data_inicio.desc()).offset(skip).limit(limit)
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def update(
        self,
        gira_id: UUID,
        tenant_id: UUID,
        **kwargs
    ) -> Optional[Gira]:
        """Update a gira.
        
        Args:
            gira_id: Gira ID
            tenant_id: Tenant ID
            **kwargs: Fields to update
            
        Returns:
            Updated Gira or None
        """
        gira = await self.get_by_id(gira_id, tenant_id)
        if not gira:
            return None
        
        for key, value in kwargs.items():
            if hasattr(gira, key):
                setattr(gira, key, value)
        
        self.db.add(gira)
        await self.db.flush()
        await self.db.refresh(gira)
        return gira
    
    async def delete_soft(self, gira_id: UUID, tenant_id: UUID) -> bool:
        """Soft delete a gira.
        
        Args:
            gira_id: Gira ID
            tenant_id: Tenant ID
            
        Returns:
            True if deleted, False if not found
        """
        gira = await self.get_by_id(gira_id, tenant_id)
        if not gira:
            return False
        
        gira.soft_delete()
        self.db.add(gira)
        await self.db.flush()
        return True
