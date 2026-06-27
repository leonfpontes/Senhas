"""T060: Admin Bulk Operations - POST/DELETE bulk mark-used, cancel"""
from fastapi import APIRouter, Depends, status, Path, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List
from uuid import UUID
import logging

from src.core.database import get_db
from src.models import User, Ticket, TicketStatus, PermissionFeature
from src.repositories.senha_control_repo_extended import SenhaControlRepositoryExtended
from src.services.audit_service import AuditService
from src.api.dependencies import get_current_user, require_group_permission
from src.core.errors import InsufficientPermissionsError
from src.core.limiter import limiter

router = APIRouter(prefix="/api/v1/admin", tags=["admin-bulk"])
logger = logging.getLogger(__name__)


class BulkOperationRequest(BaseModel):
    """Bulk operation request."""
    ticket_ids: List[UUID]
    dry_run: bool = False


class BulkOperationResponse(BaseModel):
    """Bulk operation response."""
    modified: int
    failed: int
    errors: List[str]


@router.post("/giras/{gira_id}/tickets/bulk-mark-used", response_model=BulkOperationResponse, dependencies=[Depends(require_group_permission(PermissionFeature.TICKETS, "edit"))])
@limiter.limit("20/minute")
async def bulk_mark_used(
    http_request: Request,
    gira_id: UUID = Path(...),
    request: BulkOperationRequest = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BulkOperationResponse:
    """Mark multiple tickets as used/completed.
    
    Requires admin role.
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")
    
    repo = SenhaControlRepositoryExtended(db)
    result = await repo.bulk_mark_used(
        ticket_ids=request.ticket_ids,
        tenant_id=current_user.tenant_id,
        dry_run=request.dry_run,
    )
    
    if not request.dry_run:
        # Log audit
        audit_service = AuditService(db)
        await audit_service.log_bulk_operation(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            operation_type="bulk_mark_used",
            resource_type="Ticket",
            count=result["modified"],
            resource_ids=request.ticket_ids,
        )
        await db.commit()
    
    return BulkOperationResponse(**result)


@router.post("/giras/{gira_id}/tickets/bulk-cancel", response_model=BulkOperationResponse, dependencies=[Depends(require_group_permission(PermissionFeature.TICKETS, "delete"))])
@limiter.limit("20/minute")
async def bulk_cancel(
    http_request: Request,
    gira_id: UUID = Path(...),
    request: BulkOperationRequest = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BulkOperationResponse:
    """Cancel multiple tickets.
    
    Requires admin role.
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")
    
    repo = SenhaControlRepositoryExtended(db)
    result = await repo.bulk_cancel(
        ticket_ids=request.ticket_ids,
        tenant_id=current_user.tenant_id,
        dry_run=request.dry_run,
    )
    
    if not request.dry_run:
        # Log audit
        audit_service = AuditService(db)
        await audit_service.log_bulk_operation(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            operation_type="bulk_cancel",
            resource_type="Ticket",
            count=result["modified"],
            resource_ids=request.ticket_ids,
        )
        await db.commit()
    
    return BulkOperationResponse(**result)
