"""T053: AuditLogRepository - Immutable audit trail queries."""
from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, desc

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
    
    async def list_by_tenant(
        self,
        tenant_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[AuditLog]:
        """List audit logs for a tenant (paginated).
        
        Args:
            tenant_id: Tenant ID
            skip: Pagination offset
            limit: Pagination limit
            
        Returns:
            List of AuditLog objects (reverse chronological)
        """
        stmt = select(AuditLog).where(
            AuditLog.tenant_id == tenant_id
        ).order_by(desc(AuditLog.created_at)).offset(skip).limit(limit)
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def list_by_action(
        self,
        tenant_id: UUID,
        action: AuditAction,
        skip: int = 0,
        limit: int = 100,
    ) -> List[AuditLog]:
        """List audit logs by action type.
        
        Args:
            tenant_id: Tenant ID
            action: AuditAction type
            skip: Pagination offset
            limit: Pagination limit
            
        Returns:
            List of AuditLog objects
        """
        stmt = select(AuditLog).where(
            and_(
                AuditLog.tenant_id == tenant_id,
                AuditLog.action == action,
            )
        ).order_by(desc(AuditLog.created_at)).offset(skip).limit(limit)
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def list_by_user(
        self,
        tenant_id: UUID,
        user_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[AuditLog]:
        """List audit logs for a specific user.
        
        Args:
            tenant_id: Tenant ID
            user_id: User ID
            skip: Pagination offset
            limit: Pagination limit
            
        Returns:
            List of AuditLog objects
        """
        stmt = select(AuditLog).where(
            and_(
                AuditLog.tenant_id == tenant_id,
                AuditLog.user_id == user_id,
            )
        ).order_by(desc(AuditLog.created_at)).offset(skip).limit(limit)
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def list_by_resource_type(
        self,
        tenant_id: UUID,
        resource_type: str,
        skip: int = 0,
        limit: int = 100,
    ) -> List[AuditLog]:
        """List audit logs for a resource type.
        
        Args:
            tenant_id: Tenant ID
            resource_type: Resource type
            skip: Pagination offset
            limit: Pagination limit
            
        Returns:
            List of AuditLog objects
        """
        stmt = select(AuditLog).where(
            and_(
                AuditLog.tenant_id == tenant_id,
                AuditLog.resource_type == resource_type,
            )
        ).order_by(desc(AuditLog.created_at)).offset(skip).limit(limit)
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
