"""T063: Admin Audit Trail - GET /api/v1/admin/audit-logs (immutable logs)"""
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional, Set
from uuid import UUID
from datetime import datetime

from src.core.database import get_db
from src.models import User, AuditLog, AuditAction, PermissionFeature
from src.repositories.audit_log_repo import AuditLogRepository
from src.api.dependencies import get_current_user, require_group_permission
from src.core.errors import InsufficientPermissionsError

router = APIRouter(prefix="/api/v1/admin", tags=["admin-audit"])


class AuditLogResponse(BaseModel):
    """Audit log response."""
    id: UUID
    action: str
    resource_type: str
    resource_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    user_name: Optional[str] = None
    details: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    """Paginated audit log list response."""
    total: int
    skip: int
    limit: int
    items: List[AuditLogResponse]


@router.get("/audit-logs", response_model=AuditLogListResponse, dependencies=[Depends(require_group_permission(PermissionFeature.AUDITORIA, "view"))])
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

    # Parse action filter
    action_enum = None
    if action_filter:
        try:
            action_enum = AuditAction(action_filter)
        except ValueError:
            return AuditLogListResponse(total=0, skip=skip, limit=limit, items=[])

    # Single unified query with all filters + eager-loaded User
    logs = await repo.list_filtered(
        tenant_id=current_user.tenant_id,
        skip=skip,
        limit=limit,
        action=action_enum,
        resource_type=resource_type_filter,
        user_id=user_id_filter,
    )
    total = await repo.count_filtered(
        tenant_id=current_user.tenant_id,
        action=action_enum,
        resource_type=resource_type_filter,
        user_id=user_id_filter,
    )

    def _user_name(log: AuditLog) -> Optional[str]:
        if log.user:
            return log.user.full_name or log.user.email
        return None

    # Collect impersonated_by UUIDs from details to resolve names
    impersonator_ids: Set[str] = set()
    for log in logs:
        if log.details:
            _collect_impersonator_ids(log.details, impersonator_ids)
    impersonator_names = await _resolve_user_names(db, impersonator_ids)

    def _enrich_details(details: Optional[dict]) -> Optional[dict]:
        if not details:
            return details
        enriched = dict(details)
        _replace_impersonator_ids(enriched, impersonator_names)
        return enriched

    items = [
        AuditLogResponse(
            id=log.id,
            action=log.action.value if hasattr(log.action, 'value') else log.action,
            resource_type=log.resource_type,
            resource_id=log.resource_id,
            user_id=log.user_id,
            user_name=_user_name(log),
            details=_enrich_details(log.details),
            created_at=log.created_at,
        )
        for log in logs
    ]

    return AuditLogListResponse(
        total=total,
        skip=skip,
        limit=limit,
        items=items,
    )


def _collect_impersonator_ids(details: dict, ids: Set[str]) -> None:
    """Recursively collect impersonated_by UUIDs from details."""
    for key, val in details.items():
        if key == "impersonated_by" and isinstance(val, str) and len(val) >= 32:
            ids.add(val)
        elif isinstance(val, dict):
            _collect_impersonator_ids(val, ids)


def _replace_impersonator_ids(details: dict, names: dict) -> None:
    """Recursively replace impersonated_by UUIDs with user names."""
    for key in list(details.keys()):
        val = details[key]
        if key == "impersonated_by" and isinstance(val, str) and val in names:
            details[key] = names[val]
        elif isinstance(val, dict):
            _replace_impersonator_ids(val, names)


async def _resolve_user_names(db: AsyncSession, user_ids: Set[str]) -> dict:
    """Batch resolve user UUIDs to display names."""
    if not user_ids:
        return {}
    try:
        uuids = [UUID(uid) for uid in user_ids]
        stmt = select(User.id, User.full_name, User.email).where(User.id.in_(uuids))
        result = await db.execute(stmt)
        return {
            str(row.id): (row.full_name or row.email)
            for row in result.all()
        }
    except Exception:
        return {}
