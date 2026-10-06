"""Admin Associados - CRUD /api/v1/admin/associados.

Módulo inteiro gated por ``require_plan_feature("associados")`` (PRO+) — a tela
já escondia fora do plano, mas a API aceitava qualquer plano.
"""
from fastapi import APIRouter, HTTPException, Depends, status, Path, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, ConfigDict, EmailStr
from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from src.core.database import get_db
from src.models import User, PermissionFeature
from src.repositories.associado_repo import AssociadoRepository
from src.services.audit_service import AuditService
from src.api.dependencies import get_current_user, require_group_permission, require_plan_feature
from src.core.errors import InsufficientPermissionsError, NotFoundError

router = APIRouter(
    prefix="/api/v1/admin/associados",
    tags=["admin-associados"],
    dependencies=[Depends(require_plan_feature("associados"))],
)
logger = logging.getLogger(__name__)

_EMAIL_DUPLICADO = "Já existe um associado com este e-mail"


async def _cancelar_contas_futuras(db: AsyncSession, tenant_id: UUID, associado_id: UUID) -> None:
    """Exclusão/isenção: mensalidades futuras pendentes deixam de ser devidas."""
    from src.services.mensalidade_contas_service import cancelar_contas_futuras_pendentes

    try:
        await cancelar_contas_futuras_pendentes(
            db=db, tenant_id=tenant_id, tipo_pessoa="associado", pessoa_id=associado_id
        )
    except Exception:
        logger.exception("Falha ao cancelar contas futuras da mensalidade do associado %s", associado_id)


# ── Schemas ──────────────────────────────────────────────────────────────

class AssociadoCreate(BaseModel):
    nome: str
    email: EmailStr
    telefone: Optional[str] = None
    mensalidade_isento: bool = False


class AssociadoUpdate(BaseModel):
    """``telefone: null`` limpa o telefone; campo ausente não muda."""

    nome: Optional[str] = None
    email: Optional[EmailStr] = None
    telefone: Optional[str] = None
    mensalidade_isento: Optional[bool] = None


class AssociadoResponse(BaseModel):
    id: UUID
    nome: str
    email: str
    telefone: Optional[str] = None
    mensalidade_isento: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


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
            detail=_EMAIL_DUPLICADO,
        )

    try:
        associado = await repo.create_associado(
            tenant_id=current_user.tenant_id,
            nome=data.nome,
            email=data.email,
            telefone=data.telefone,
            mensalidade_isento=data.mensalidade_isento,
        )
    except IntegrityError:
        # Corrida com outro cadastro do mesmo e-mail (o índice único parcial
        # só considera associados ativos — recadastrar um excluído é permitido).
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_EMAIL_DUPLICADO)

    audit = AuditService(db)
    await audit.log_create(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="Associado",
        resource_id=associado.id,
        details={"nome": data.nome, "email": data.email},
    )

    # Create pending conta a receber for next month if associado mensalidade is configured
    # (isento de mensalidade não gera conta).
    try:
        from src.repositories.mensalidade_repo import MensalidadeRepository
        from src.repositories.config_repo import TenantConfigRepository
        from src.services.mensalidade_contas_service import criar_conta_proxima_mensalidade
        from decimal import Decimal
        cfg_repo = TenantConfigRepository(db)
        tc = await cfg_repo.get_by_tenant(current_user.tenant_id)
        if tc and tc.enable_mensalidade_associado and not data.mensalidade_isento:
            mens_repo = MensalidadeRepository(db)
            config = await mens_repo.get_config(current_user.tenant_id)
            if config and config.valor_mensal_associado > 0:
                await criar_conta_proxima_mensalidade(
                    db=db,
                    tenant_id=current_user.tenant_id,
                    tipo_pessoa="associado",
                    pessoa_id=associado.id,
                    pessoa_nome=associado.nome,
                    valor=config.valor_mensal_associado,
                    dia_vencimento=config.dia_vencimento_associado,
                    criado_por=current_user.id,
                )
    except Exception:
        logger.exception("Falha ao criar conta a receber para associado %s", associado.id)

    await db.commit()
    await db.refresh(associado)
    return AssociadoResponse.model_validate(associado)


@router.get("", response_model=List[AssociadoResponse], dependencies=[Depends(require_group_permission(PermissionFeature.ASSOCIADOS, "view"))])
async def list_associados(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None, max_length=255, description="Filtra por nome, e-mail ou telefone"),
) -> List[AssociadoResponse]:
    """List associados for the tenant (paginado: a tela busca todas as páginas)."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = AssociadoRepository(db)
    items = await repo.list_by_tenant(current_user.tenant_id, skip=skip, limit=limit, search=search)
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
                detail=_EMAIL_DUPLICADO,
            )

    was_isento = bool(associado.mensalidade_isento)
    # telefone enviado (mesmo null) = aplicar; ausente = não mexe.
    updated = await repo.update_associado(
        associado,
        nome=data.nome,
        email=data.email,
        telefone=data.telefone if "telefone" in data.model_fields_set else ...,
        mensalidade_isento=data.mensalidade_isento,
    )
    if data.mensalidade_isento is True and not was_isento:
        await _cancelar_contas_futuras(db, current_user.tenant_id, associado_id)

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
    await _cancelar_contas_futuras(db, current_user.tenant_id, associado_id)

    audit = AuditService(db)
    await audit.log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="Associado",
        resource_id=associado_id,
    )

    await db.commit()
