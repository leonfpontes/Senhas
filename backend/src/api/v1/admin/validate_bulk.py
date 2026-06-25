"""T069: Admin Validate Bulk - POST /api/v1/admin/validate-bulk (dry-run)"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List
from uuid import UUID
import logging

from src.core.database import get_db
from src.models import User, PermissionFeature
from src.repositories.senha_control_repo_extended import SenhaControlRepositoryExtended
from src.api.dependencies import get_current_user, require_group_permission
from src.core.errors import InsufficientPermissionsError

router = APIRouter(prefix="/api/v1/admin", tags=["admin-bulk"])
logger = logging.getLogger(__name__)


class ValidateBulkRequest(BaseModel):
    """Bulk validation request."""
    ticket_ids: List[UUID]
    operation: str  # mark_used, cancel


class ValidateBulkResponse(BaseModel):
    """Bulk validation response."""
    valid: bool
    count: int
    errors: List[str]
    warnings: List[str]


@router.post("/validate-bulk", response_model=ValidateBulkResponse, dependencies=[Depends(require_group_permission(PermissionFeature.TICKETS, "view"))])
async def validate_bulk_operation(
    request: ValidateBulkRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ValidateBulkResponse:
    """Validate bulk operation without executing (dry-run).
    
    Requires admin role.
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")
    
    errors = []
    warnings = []
    
    if not request.ticket_ids:
        errors.append("Nenhum ticket fornecido")
    
    if request.operation not in ["mark_used", "cancel"]:
        errors.append(f"Operação inválida: {request.operation}")
    
    if len(request.ticket_ids) > 1000:
        warnings.append(f"Muitos tickets ({len(request.ticket_ids)}). Considere operações menores.")
    
    repo = SenhaControlRepositoryExtended(db)
    
    # Dry-run the operation
    if request.operation == "mark_used":
        result = await repo.bulk_mark_used(
            ticket_ids=request.ticket_ids,
            tenant_id=current_user.tenant_id,
            dry_run=True,
        )
    else:  # cancel
        result = await repo.bulk_cancel(
            ticket_ids=request.ticket_ids,
            tenant_id=current_user.tenant_id,
            dry_run=True,
        )
    
    if result["errors"]:
        errors.extend(result["errors"])
    
    return ValidateBulkResponse(
        valid=len(errors) == 0,
        count=result["modified"],
        errors=errors,
        warnings=warnings,
    )
