"""ConsolidatedAuditRepository - Cross-tenant audit log queries (T098)."""
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

from ..models import AuditLog, AuditAction
from .base import BaseRepository


class ConsolidatedAuditRepository(BaseRepository[AuditLog]):
    """Repository for cross-tenant audit log queries.
    
    Unlike tenant-specific audit queries, this provides:
    - Aggregated statistics across all tenants
    - Filtering by date range
    - Grouping by tenant, action, user
    - SUPER_ADMIN use only
    """
    
    def __init__(self, db: AsyncSession):
        super().__init__(db, AuditLog)
    
    async def get_by_tenant(self, tenant_id: UUID) -> List[AuditLog]:
        """Get audit logs for specific tenant.
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            List of AuditLog records
        """
        stmt = select(AuditLog).where(
            AuditLog.tenant_id == tenant_id
        ).order_by(AuditLog.created_at.desc())
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def get_range(
        self,
        start_date: datetime,
        end_date: datetime,
        skip: int = 0,
        limit: int = 1000,
    ) -> List[AuditLog]:
        """Get audit logs in date range (all tenants).
        
        Args:
            start_date: Start datetime
            end_date: End datetime
            skip: Pagination offset
            limit: Pagination limit
            
        Returns:
            List of AuditLog records
        """
        stmt = select(AuditLog).where(
            and_(
                AuditLog.created_at >= start_date,
                AuditLog.created_at <= end_date,
            )
        ).offset(skip).limit(limit).order_by(AuditLog.created_at.desc())
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def count_by_tenant(
        self,
        start_date: datetime,
        end_date: datetime,
    ) -> Dict[UUID, int]:
        """Count audit logs grouped by tenant in date range.
        
        Args:
            start_date: Start datetime
            end_date: End datetime
            
        Returns:
            Dict mapping tenant_id to count
        """
        stmt = select(
            AuditLog.tenant_id,
            func.count(AuditLog.id).label("count"),
        ).where(
            and_(
                AuditLog.created_at >= start_date,
                AuditLog.created_at <= end_date,
            )
        ).group_by(AuditLog.tenant_id)
        
        result = await self.db.execute(stmt)
        rows = result.all()
        
        return {row[0]: row[1] for row in rows}
    
    async def count_by_action(
        self,
        start_date: datetime,
        end_date: datetime,
    ) -> Dict[str, int]:
        """Count audit logs grouped by action in date range.
        
        Args:
            start_date: Start datetime
            end_date: End datetime
            
        Returns:
            Dict mapping action to count
        """
        stmt = select(
            AuditLog.action,
            func.count(AuditLog.id).label("count"),
        ).where(
            and_(
                AuditLog.created_at >= start_date,
                AuditLog.created_at <= end_date,
            )
        ).group_by(AuditLog.action)
        
        result = await self.db.execute(stmt)
        rows = result.all()
        
        return {row[0].value: row[1] for row in rows}
    
    async def count_by_user(
        self,
        start_date: datetime,
        end_date: datetime,
    ) -> Dict[UUID, int]:
        """Count audit logs grouped by user in date range.
        
        Args:
            start_date: Start datetime
            end_date: End datetime
            
        Returns:
            Dict mapping user_id to count
        """
        stmt = select(
            AuditLog.user_id,
            func.count(AuditLog.id).label("count"),
        ).where(
            and_(
                AuditLog.created_at >= start_date,
                AuditLog.created_at <= end_date,
                AuditLog.user_id.isnot(None),
            )
        ).group_by(AuditLog.user_id)
        
        result = await self.db.execute(stmt)
        rows = result.all()
        
        return {row[0]: row[1] for row in rows}
    
    async def get_summary(
        self,
        start_date: datetime,
        end_date: datetime,
    ) -> Dict[str, Any]:
        """Get consolidated audit summary.
        
        Args:
            start_date: Start datetime
            end_date: End datetime
            
        Returns:
            Summary dict with counts and statistics
        """
        total_count = await self._count_total(start_date, end_date)
        by_tenant = await self.count_by_tenant(start_date, end_date)
        by_action = await self.count_by_action(start_date, end_date)
        by_user = await self.count_by_user(start_date, end_date)
        
        return {
            "total": total_count,
            "by_tenant": by_tenant,
            "by_action": by_action,
            "by_user": by_user,
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
        }
    
    async def _count_total(
        self,
        start_date: datetime,
        end_date: datetime,
    ) -> int:
        """Count total audit logs in date range.
        
        Args:
            start_date: Start datetime
            end_date: End datetime
            
        Returns:
            Total count
        """
        stmt = select(func.count()).select_from(AuditLog).where(
            and_(
                AuditLog.created_at >= start_date,
                AuditLog.created_at <= end_date,
            )
        )
        
        result = await self.db.execute(stmt)
        return result.scalar() or 0
