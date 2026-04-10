"""Admin Médiuns - CRUD /api/v1/admin/mediuns."""
from datetime import date, datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user
from src.core.database import get_db
from src.core.errors import InsufficientPermissionsError, NotFoundError
from src.models import User
from src.repositories.mediun_repo import MediumRepository
from src.repositories.subscription_repo import SubscriptionRepository
from src.models.subscriptions import SubscriptionStatus
from src.services.audit_service import AuditService

router = APIRouter(prefix="/api/v1/admin/mediuns", tags=["admin-mediuns"])


# ── Schemas ──────────────────────────────────────────────────────────────


class MediumCreate(BaseModel):
    nome: str
    is_atendimento: bool = False
    telefone: Optional[str] = None
    email: Optional[str] = None
    data_nascimento: Optional[date] = None
    cep: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    observacoes: Optional[str] = None

    @field_validator("nome")
    @classmethod
    def validate_nome(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Nome não pode ser vazio")
        return stripped


class MediumUpdate(BaseModel):
    nome: Optional[str] = None
    is_atendimento: Optional[bool] = None
    is_active: Optional[bool] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    data_nascimento: Optional[date] = None
    cep: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    observacoes: Optional[str] = None

    @field_validator("nome")
    @classmethod
    def validate_nome(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        stripped = v.strip()
        if not stripped:
            raise ValueError("Nome não pode ser vazio")
        return stripped


class MediumResponse(BaseModel):
    id: UUID
    nome: str
    is_atendimento: bool
    is_active: bool
    telefone: Optional[str] = None
    email: Optional[str] = None
    data_nascimento: Optional[date] = None
    cep: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    observacoes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class BirthdayMediumResponse(BaseModel):
    id: UUID
    nome: str
    telefone: Optional[str] = None
    data_nascimento: Optional[date] = None
    dias_ate_aniversario: int

    class Config:
        from_attributes = True


# ── Endpoints ────────────────────────────────────────────────────────────


@router.get("/aniversariantes", response_model=List[BirthdayMediumResponse])
async def list_aniversariantes(
    dias: int = Query(7, ge=0, le=365, description="Janela de dias (0 = somente hoje)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[BirthdayMediumResponse]:
    """List médiuns whose birthday falls within the next *dias* days."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")
    sub_repo = SubscriptionRepository(db)
    sub = await sub_repo.get_by_tenant(current_user.tenant_id)
    if sub is not None and sub.max_mediuns == 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Funcionalidade de médiuns não disponível no plano atual.",
        )
    repo = MediumRepository(db)
    return await repo.list_aniversariantes(current_user.tenant_id, dias=dias)


@router.get("/options", response_model=List[MediumResponse])
async def list_mediuns_options(
    only_atendimento: bool = Query(False, description="Filtrar apenas médiuns de atendimento"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[MediumResponse]:
    """List active mediuns for dropdown use.

    Use ``only_atendimento=true`` to get only médiuns de atendimento
    (valid as médium); ``only_atendimento=false`` (default) returns all
    active mediuns (valid as cambone).
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")
    repo = MediumRepository(db)
    return await repo.list(current_user.tenant_id, only_atendimento=only_atendimento)


@router.get("", response_model=List[MediumResponse])
async def list_mediuns(
    search: Optional[str] = Query(None),
    include_inactive: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[MediumResponse]:
    """List mediuns for the CRUD management page."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")
    repo = MediumRepository(db)
    return await repo.list(
        current_user.tenant_id,
        search=search,
        include_inactive=include_inactive,
    )


@router.post("", response_model=MediumResponse, status_code=status.HTTP_201_CREATED)
async def create_medium(
    data: MediumCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MediumResponse:
    """Create a new medium/cambone."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    # Check plan limit
    sub_repo = SubscriptionRepository(db)
    sub = await sub_repo.get_by_tenant(current_user.tenant_id)
    if sub is not None:
        if sub.status == SubscriptionStatus.SUSPENDED:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Assinatura suspensa por falta de pagamento. Regularize sua assinatura para adicionar médiuns.",
            )
        if sub.max_mediuns > 0:
            repo_check = MediumRepository(db)
            current_count = await repo_check.count(current_user.tenant_id)
            if current_count >= sub.max_mediuns:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Limite de médiuns/cambones atingido ({sub.max_mediuns}). Faça upgrade do plano.",
                )

    repo = MediumRepository(db)
    medium = await repo.create(
        tenant_id=current_user.tenant_id,
        nome=data.nome,
        is_atendimento=data.is_atendimento,
        telefone=data.telefone or None,
        email=data.email or None,
        data_nascimento=data.data_nascimento,
        cep=data.cep or None,
        logradouro=data.logradouro or None,
        numero=data.numero or None,
        bairro=data.bairro or None,
        cidade=data.cidade or None,
        observacoes=data.observacoes or None,
    )
    await db.commit()
    await db.refresh(medium)

    audit = AuditService(db)
    await audit.log_create(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="Medium",
        resource_id=medium.id,
        details={"nome": medium.nome, "is_atendimento": medium.is_atendimento},
    )
    await db.commit()
    return medium


@router.patch("/{medium_id}", response_model=MediumResponse)
async def update_medium(
    medium_id: UUID = Path(...),
    data: MediumUpdate = ...,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MediumResponse:
    """Update name, is_atendimento flag, or active status."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = MediumRepository(db)
    medium = await repo.get(current_user.tenant_id, medium_id)
    if not medium:
        raise NotFoundError("Médium não encontrado")

    changes: dict = {}
    if data.nome is not None:
        changes["nome"] = {"old": medium.nome, "new": data.nome}
        medium.nome = data.nome
    if data.is_atendimento is not None:
        changes["is_atendimento"] = {"old": medium.is_atendimento, "new": data.is_atendimento}
        medium.is_atendimento = data.is_atendimento
    if data.is_active is not None:
        changes["is_active"] = {"old": medium.is_active, "new": data.is_active}
        medium.is_active = data.is_active
    # Optional contact/profile fields — None means "don't change",
    # empty string means "clear the field"
    _SENTINEL = object()
    for field in ("telefone", "email", "observacoes", "cep", "logradouro", "numero", "bairro", "cidade"):
        raw = getattr(data, field, None)
        if raw is not None:
            new_val = raw.strip() or None
            old_val = getattr(medium, field)
            if new_val != old_val:
                changes[field] = {"old": old_val, "new": new_val}
                setattr(medium, field, new_val)
    if data.data_nascimento is not None:
        old_dn = medium.data_nascimento
        if data.data_nascimento != old_dn:
            changes["data_nascimento"] = {"old": str(old_dn), "new": str(data.data_nascimento)}
            medium.data_nascimento = data.data_nascimento

    await db.commit()
    await db.refresh(medium)

    audit = AuditService(db)
    await audit.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="Medium",
        resource_id=medium.id,
        previous_state={k: v["old"] for k, v in changes.items()},
        new_state={k: v["new"] for k, v in changes.items()},
    )
    await db.commit()
    return medium


@router.delete("/{medium_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_medium(
    medium_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete a medium/cambone."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = MediumRepository(db)
    medium = await repo.get(current_user.tenant_id, medium_id)
    if not medium:
        raise NotFoundError("Médium não encontrado")

    medium.deleted_at = datetime.now(timezone.utc)
    await db.commit()

    audit = AuditService(db)
    await audit.log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="Medium",
        resource_id=medium_id,
        previous_state={"nome": medium.nome},
    )
    await db.commit()
