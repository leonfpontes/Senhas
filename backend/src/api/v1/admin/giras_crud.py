"""T058: Admin Giras CRUD - GET/POST/PUT/DELETE /api/v1/admin/giras/{id}"""
from fastapi import APIRouter, HTTPException, Depends, status, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from src.core.database import get_db
from src.models import User, UserRole, Gira
from src.repositories.gira_repo import GiraRepository
from src.services.audit_service import AuditService
from src.api.dependencies import get_current_user
from src.core.errors import (
    UnauthorizedError,
    InsufficientPermissionsError,
    NotFoundError,
)

router = APIRouter(prefix="/api/v1/admin/giras", tags=["admin-giras"])
logger = logging.getLogger(__name__)


class GiraCreate(BaseModel):
    """Gira creation request."""
    nome: str
    descricao: Optional[str] = None
    data_inicio: datetime
    data_fim: Optional[datetime] = None
    local: Optional[str] = None
    is_active: bool = True

    class Config:
        json_schema_extra = {
            "example": {
                "nome": "Gira de Maio",
                "descricao": "Gira mensal de maio",
                "data_inicio": "2026-05-01T18:00:00Z",
                "data_fim": "2026-05-02T02:00:00Z",
                "local": "Centro Espírita",
            }
        }


class GiraUpdate(BaseModel):
    """Gira update request."""
    nome: Optional[str] = None
    descricao: Optional[str] = None
    data_inicio: Optional[datetime] = None
    data_fim: Optional[datetime] = None
    local: Optional[str] = None
    is_active: Optional[bool] = None


class GiraResponse(BaseModel):
    """Gira response."""
    id: UUID
    nome: str
    descricao: Optional[str]
    data_inicio: datetime
    data_fim: Optional[datetime]
    local: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.post("", response_model=GiraResponse, status_code=status.HTTP_201_CREATED)
async def create_gira(
    gira: GiraCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GiraResponse:
    """Create new gira.
    
    Requires admin role.
    """
    # Check permissions
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")
    
    # Create gira
    repo = GiraRepository(db)
    created_gira = await repo.create(
        tenant_id=current_user.tenant_id,
        **gira.dict(),
    )
    
    # Log audit
    audit_service = AuditService(db)
    await audit_service.log_create(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="Gira",
        resource_id=created_gira.id,
        details={"nome": gira.nome},
    )
    
    await db.commit()
    return GiraResponse.from_orm(created_gira)


@router.get("", response_model=List[GiraResponse])
async def list_giras(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[GiraResponse]:
    """List giras for tenant.
    
    Requires admin role.
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")
    
    repo = GiraRepository(db)
    giras = await repo.list(current_user.tenant_id, skip=skip, limit=limit)
    
    return [GiraResponse.from_orm(g) for g in giras]


@router.get("/{gira_id}", response_model=GiraResponse)
async def get_gira(
    gira_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GiraResponse:
    """Get specific gira.
    
    Requires admin role.
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")
    
    repo = GiraRepository(db)
    gira = await repo.get_by_id(gira_id, current_user.tenant_id)
    
    if not gira:
        raise NotFoundError("Gira não encontrado")
    
    return GiraResponse.from_orm(gira)


@router.put("/{gira_id}", response_model=GiraResponse)
async def update_gira(
    gira_id: UUID = Path(...),
    gira_update: GiraUpdate = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GiraResponse:
    """Update gira.
    
    Requires admin role.
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")
    
    repo = GiraRepository(db)
    existing_gira = await repo.get_by_id(gira_id, current_user.tenant_id)
    
    if not existing_gira:
        raise NotFoundError("Gira não encontrado")
    
    updated_gira = await repo.update(
        gira_id,
        current_user.tenant_id,
        **gira_update.dict(exclude_unset=True),
    )
    
    # Log audit
    audit_service = AuditService(db)
    await audit_service.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="Gira",
        resource_id=gira_id,
        previous_state=GiraResponse.from_orm(existing_gira).dict(),
        new_state=GiraResponse.from_orm(updated_gira).dict(),
    )
    
    await db.commit()
    return GiraResponse.from_orm(updated_gira)


@router.delete("/{gira_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_gira(
    gira_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete (soft delete) gira.
    
    Requires admin role.
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")
    
    repo = GiraRepository(db)
    deleted = await repo.delete_soft(gira_id, current_user.tenant_id)
    
    if not deleted:
        raise NotFoundError("Gira não encontrado")
    
    # Log audit
    audit_service = AuditService(db)
    await audit_service.log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="Gira",
        resource_id=gira_id,
    )
    
    await db.commit()
