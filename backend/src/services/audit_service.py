"""T056: AuditService - Log admin actions automatically."""
from typing import Optional, Dict, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from ..models import AuditLog, AuditAction
from ..repositories.audit_log_repo import AuditLogRepository


class AuditService:
    \"\"\"Service for logging admin actions.
    
    Every admin action is logged for compliance:
    - Action type (CREATE, UPDATE, DELETE, etc.)
    - Resource type and ID
    - Actor (user_id)
    - Metadata (before/after states)
    - Timestamp
    \"\"\"
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = AuditLogRepository(db)
    
    async def log_create(
        self,
        tenant_id: UUID,
        user_id: UUID,
        resource_type: str,
        resource_id: UUID,
        details: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        \"\"\"Log resource creation.
        
        Args:
            tenant_id: Tenant ID
            user_id: Admin user ID
            resource_type: Type of resource (User, Gira, etc.)
            resource_id: Resource ID
            details: Extra metadata
            
        Returns:
            Created AuditLog
        \"\"\"
        return await self.repo.create(
            tenant_id=tenant_id,
            user_id=user_id,
            action=AuditAction.CREATE,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
        )
    
    async def log_update(
        self,
        tenant_id: UUID,
        user_id: UUID,
        resource_type: str,
        resource_id: UUID,
        previous_state: Optional[Dict[str, Any]] = None,
        new_state: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        \"\"\"Log resource update.
        
        Args:
            tenant_id: Tenant ID
            user_id: Admin user ID
            resource_type: Type of resource
            resource_id: Resource ID
            previous_state: State before update
            new_state: State after update
            
        Returns:
            Created AuditLog
        \"\"\"
        return await self.repo.create(
            tenant_id=tenant_id,
            user_id=user_id,
            action=AuditAction.UPDATE,
            resource_type=resource_type,
            resource_id=resource_id,
            details={
                \"previous_state\": previous_state or {},
                \"new_state\": new_state or {},
            },
        )
    
    async def log_delete(
        self,
        tenant_id: UUID,
        user_id: UUID,
        resource_type: str,
        resource_id: UUID,
        previous_state: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        \"\"\"Log resource deletion.
        
        Args:
            tenant_id: Tenant ID
            user_id: Admin user ID
            resource_type: Type of resource
            resource_id: Resource ID
            previous_state: State before deletion
            
        Returns:
            Created AuditLog
        \"\"\"
        return await self.repo.create(
            tenant_id=tenant_id,
            user_id=user_id,
            action=AuditAction.DELETE,
            resource_type=resource_type,
            resource_id=resource_id,
            details={
                \"previous_state\": previous_state or {},
            },
        )
    
    async def log_bulk_operation(
        self,
        tenant_id: UUID,
        user_id: UUID,
        operation_type: str,  # bulk_mark_used, bulk_cancel, etc.
        resource_type: str,
        count: int,
        resource_ids: Optional[list] = None,
    ) -> AuditLog:
        \"\"\"Log bulk operations.
        
        Args:
            tenant_id: Tenant ID
            user_id: Admin user ID
            operation_type: Type of bulk operation
            resource_type: Resource type
            count: Number of resources affected
            resource_ids: IDs of affected resources
            
        Returns:
            Created AuditLog
        \"\"\"
        return await self.repo.create(
            tenant_id=tenant_id,
            user_id=user_id,
            action=AuditAction.UPDATE,  # Treat as update
            resource_type=resource_type,
            details={
                \"operation_type\": operation_type,
                \"count\": count,
                \"resource_ids\": resource_ids or [],
            },
        )
    
    async def log_login(
        self,
        tenant_id: Optional[UUID],
        user_id: UUID,
        success: bool,
        ip_address: Optional[str] = None,
    ) -> AuditLog:
        \"\"\"Log user login attempt.
        
        Args:
            tenant_id: Tenant ID (None for platform admin)
            user_id: User ID
            success: Whether login succeeded
            ip_address: Client IP address
            
        Returns:
            Created AuditLog
        \"\"\"
        return await self.repo.create(
            tenant_id=tenant_id,
            user_id=user_id,
            action=AuditAction.LOGIN,
            resource_type=\"User\",
            resource_id=user_id,
            details={
                \"success\": success,
                \"ip_address\": ip_address,
                \"timestamp\": datetime.utcnow().isoformat(),
            },
        )
    
    async def log_config_change(
        self,
        tenant_id: UUID,
        user_id: UUID,
        config_type: str,  # branding, email_settings, features, etc.
        previous_values: Optional[Dict[str, Any]] = None,
        new_values: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        \"\"\"Log configuration changes.
        
        Args:
            tenant_id: Tenant ID
            user_id: Admin user ID
            config_type: Type of config change
            previous_values: Previous configuration
            new_values: New configuration
            
        Returns:
            Created AuditLog
        \"\"\"
        return await self.repo.create(
            tenant_id=tenant_id,
            user_id=user_id,
            action=AuditAction.UPDATE,
            resource_type=\"TenantConfig\",
            details={
                \"config_type\": config_type,
                \"previous_values\": previous_values or {},
                \"new_values\": new_values or {},
            },
        )
