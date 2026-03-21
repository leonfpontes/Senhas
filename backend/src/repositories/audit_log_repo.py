"""T053: AuditLogRepository - Immutable audit trail queries."""
from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, desc, func
from sqlalchemy.orm import selectinload

from ..models import AuditLog, AuditAction


class AuditLogRepository:
    """Repository for AuditLog queries (IMMUTABLE - no updates/deletes).
    
    Audit logs are write-once, read-many for compliance.
    Provides querying and filtering capabilities.
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.model = AuditLog
    
    async def create(
        self,
        tenant_id: Optional[UUID],
        user_id: Optional[UUID],
        action: AuditAction,
        resource_type: str,
        resource_id: Optional[UUID] = None,
        details: Optional[dict] = None,
    ) -> AuditLog:
        """Create audit log entry (IMMUTABLE).
        
        Args:
            tenant_id: Tenant ID (None for platform-level events)
            user_id: User ID (None for unauthenticated events)
            action: AuditAction enum
            resource_type: Resource type (Ticket, User, Gira, etc.)
            resource_id: Resource ID
            details: Extra metadata (JSON)
            
        Returns:
            Created AuditLog
        """
        log = AuditLog(
            tenant_id=tenant_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
        )
        self.db.add(log)
        await self.db.flush()
        await self.db.refresh(log)
        return log
    
    async def get_by_resource(
        self,
        tenant_id: Optional[UUID],
        resource_type: str,
        resource_id: UUID,
    ) -> List[AuditLog]:
        """Get all audit logs for a specific resource.
        
        Args:
            tenant_id: Tenant ID
            resource_type: Resource type
            resource_id: Resource ID
            
        Returns:
            List of AuditLog objects (chronological)
        """
        stmt = select(AuditLog).where(
            and_(
                AuditLog.tenant_id == tenant_id,
                AuditLog.resource_type == resource_type,
                AuditLog.resource_id == resource_id,
            )
        ).order_by(AuditLog.created_at)
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def list_filtered(
        self,
        tenant_id: UUID,
        skip: int = 0,
        limit: int = 100,
        action: Optional[AuditAction] = None,
        resource_type: Optional[str] = None,
        user_id: Optional[UUID] = None,
    ) -> List[AuditLog]:
        """List audit logs with optional filters, eager-loading User."""
        conditions = [AuditLog.tenant_id == tenant_id]
        if action:
            conditions.append(AuditLog.action == action)
        if resource_type:
            conditions.append(AuditLog.resource_type == resource_type)
        if user_id:
            conditions.append(AuditLog.user_id == user_id)

        stmt = (
            select(AuditLog)
            .options(selectinload(AuditLog.user))
            .where(and_(*conditions))
            .order_by(desc(AuditLog.created_at))
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def count_filtered(
        self,
        tenant_id: UUID,
        action: Optional[AuditAction] = None,
        resource_type: Optional[str] = None,
        user_id: Optional[UUID] = None,
    ) -> int:
        """Count audit logs with optional filters."""
        conditions = [AuditLog.tenant_id == tenant_id]
        if action:
            conditions.append(AuditLog.action == action)
        if resource_type:
            conditions.append(AuditLog.resource_type == resource_type)
        if user_id:
            conditions.append(AuditLog.user_id == user_id)

        stmt = select(func.count(AuditLog.id)).where(and_(*conditions))
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def list_by_tenant(
        self,
        tenant_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[AuditLog]:
        """List audit logs for a tenant (paginated)."""
        return await self.list_filtered(tenant_id, skip, limit)

    async def list_by_action(
        self,
        tenant_id: UUID,
        action: AuditAction,
        skip: int = 0,
        limit: int = 100,
    ) -> List[AuditLog]:
        """List audit logs by action type."""
        return await self.list_filtered(tenant_id, skip, limit, action=action)

    async def list_by_user(
        self,
        tenant_id: UUID,
        user_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[AuditLog]:
        """List audit logs for a specific user."""
        return await self.list_filtered(tenant_id, skip, limit, user_id=user_id)

    async def list_by_resource_type(
        self,
        tenant_id: UUID,
        resource_type: str,
        skip: int = 0,
        limit: int = 100,
    ) -> List[AuditLog]:
        """List audit logs for a resource type."""
        return await self.list_filtered(tenant_id, skip, limit, resource_type=resource_type)
