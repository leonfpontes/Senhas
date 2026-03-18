"""T063: Admin Audit Trail - GET /api/v1/admin/audit-logs (immutable logs)"""
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from src.core.database import get_db
from src.models import User, AuditLog, AuditAction
from src.repositories.audit_log_repo import AuditLogRepository
from src.api.dependencies import get_current_user
from src.core.errors import InsufficientPermissionsError

router = APIRouter(prefix="/api/v1/admin", tags=["admin-audit"])


class AuditLogResponse(BaseModel):
    """Audit log response."""
    id: UUID
    action: str
    resource_type: str
    resource_id: Optional[UUID]
    user_id: Optional[UUID]
    details: Optional[dict]
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    """Paginated audit log list response."""
    total: int
    skip: int
    limit: int
    items: List[AuditLogResponse]


@router.get("/audit-logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    action_filter: Optional[str] = Query(None),
    resource_type_filter: Optional[str] = Query(None),
    user_id_filter: Optional[UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AuditLogListResponse:
    """List audit logs for tenant.
    
    Requires admin role.
    
    Query parameters:
    - skip: Pagination offset
    - limit: Max results (1-500)
    - action_filter: Filter by action type
    - resource_type_filter: Filter by resource type
    - user_id_filter: Filter by actor user ID
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")
    
    repo = AuditLogRepository(db)
    
    # Get appropriate filtered list based on query params
    if action_filter:
        try:
            action = AuditAction(action_filter)
            logs = await repo.list_by_action(
                tenant_id=current_user.tenant_id,
                action=action,
                skip=skip,
                limit=limit,
            )
        except ValueError:
            logs = []
    elif resource_type_filter:
        logs = await repo.list_by_resource_type(
            tenant_id=current_user.tenant_id,
            resource_type=resource_type_filter,
            skip=skip,
            limit=limit,
        )
    elif user_id_filter:
        logs = await repo.list_by_user(
            tenant_id=current_user.tenant_id,
            user_id=user_id_filter,
            skip=skip,
            limit=limit,
        )
    else:
        logs = await repo.list_by_tenant(
            tenant_id=current_user.tenant_id,
            skip=skip,
            limit=limit,
        )
    
    # For total, would need a count query - simplified for now
    total = skip + len(logs)  # Approximate
    
    return AuditLogListResponse(
        total=total,
        skip=skip,
        limit=limit,
        items=[AuditLogResponse.from_orm(log) for log in logs],
    )
