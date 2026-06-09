"""Admin Associados - CRUD /api/v1/admin/associados."""
from fastapi import APIRouter, HTTPException, Depends, status, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from src.core.database import get_db
from src.models import User, PermissionFeature
from src.repositories.associado_repo import AssociadoRepository
from src.services.audit_service import AuditService
from src.api.dependencies import get_current_user, require_group_permission
from src.core.errors import InsufficientPermissionsError, NotFoundError

router = APIRouter(prefix="/api/v1/admin/associados", tags=["admin-associados"])
logger = logging.getLogger(__name__)


# ── Schemas ──────────────────────────────────────────────────────────────

class AssociadoCreate(BaseModel):
    nome: str
    email: EmailStr
    telefone: Optional[str] = None


class AssociadoUpdate(BaseModel):
    nome: Optional[str] = None
    email: Optional[EmailStr] = None
    telefone: Optional[str] = None


class AssociadoResponse(BaseModel):
    id: UUID
    nome: str
    email: str
    telefone: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Endpoints ────────────────────────────────────────────────────────────

@router.post("", response_model=AssociadoResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_group_permission(PermissionFeature.ASSOCIADOS, "insert"))])
async def create_associado(
    data: AssociadoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssociadoResponse:
    """Create a new associado (admin only)."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = AssociadoRepository(db)

    # Check duplicate email within tenant
    existing = await repo.get_by_email(current_user.tenant_id, data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe um associado com este e-mail",
        )

    associado = await repo.create_associado(
        tenant_id=current_user.tenant_id,
        nome=data.nome,
        email=data.email,
        telefone=data.telefone,
    )

    audit = AuditService(db)
    await audit.log_create(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="Associado",
        resource_id=associado.id,
        details={"nome": data.nome, "email": data.email},
    )

    await db.commit()
    await db.refresh(associado)
    return AssociadoResponse.model_validate(associado)


@router.get("", response_model=List[AssociadoResponse], dependencies=[Depends(require_group_permission(PermissionFeature.ASSOCIADOS, "view"))])
async def list_associados(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[AssociadoResponse]:
    """List associados for the tenant."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = AssociadoRepository(db)
    items = await repo.list_by_tenant(current_user.tenant_id, skip=skip, limit=limit)
    return [AssociadoResponse.model_validate(a) for a in items]


@router.get("/count", dependencies=[Depends(require_group_permission(PermissionFeature.ASSOCIADOS, "view"))])
async def count_associados(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Count associados for the tenant."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = AssociadoRepository(db)
    total = await repo.count_by_tenant(current_user.tenant_id)
    return {"count": total}


@router.get("/{associado_id}", response_model=AssociadoResponse, dependencies=[Depends(require_group_permission(PermissionFeature.ASSOCIADOS, "view"))])
async def get_associado(
    associado_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssociadoResponse:
    """Get associado details."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = AssociadoRepository(db)
    associado = await repo.get_by_id(associado_id, current_user.tenant_id)
    if not associado:
        raise NotFoundError("Associado não encontrado")

    return AssociadoResponse.model_validate(associado)


@router.put("/{associado_id}", response_model=AssociadoResponse, dependencies=[Depends(require_group_permission(PermissionFeature.ASSOCIADOS, "edit"))])
async def update_associado(
    data: AssociadoUpdate,
    associado_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssociadoResponse:
    """Update an associado."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = AssociadoRepository(db)
    associado = await repo.get_by_id(associado_id, current_user.tenant_id)
    if not associado:
        raise NotFoundError("Associado não encontrado")

    # Check email conflict if changing email
    if data.email and data.email != associado.email:
        conflict = await repo.get_by_email(current_user.tenant_id, data.email)
        if conflict and conflict.id != associado.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe um associado com este e-mail",
            )

    updated = await repo.update_associado(
        associado,
        nome=data.nome,
        email=data.email,
        telefone=data.telefone if data.telefone is not None else ...,
    )

    audit = AuditService(db)
    await audit.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="Associado",
        resource_id=associado_id,
    )

    await db.commit()
    await db.refresh(updated)
    return AssociadoResponse.model_validate(updated)


@router.delete("/{associado_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_group_permission(PermissionFeature.ASSOCIADOS, "delete"))])
async def delete_associado(
    associado_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete an associado."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = AssociadoRepository(db)
    deleted = await repo.delete(associado_id, current_user.tenant_id, soft=True)
    if not deleted:
        raise NotFoundError("Associado não encontrado")

    audit = AuditService(db)
    await audit.log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="Associado",
        resource_id=associado_id,
    )

    await db.commit()
