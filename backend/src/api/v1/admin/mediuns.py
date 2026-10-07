"""Admin Médiuns - CRUD /api/v1/admin/mediuns.

Plano (P-09): listar/consultar fica liberado mesmo fora do plano (modo
somente leitura); criar, editar e excluir exigem ``require_plan_feature("mediuns")``
e reativar um médium respeita o limite ``max_mediuns`` como a criação.
"""
import logging
import re
from datetime import date, datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import (
    effective_limit,
    get_current_user,
    require_group_permission,
    require_plan_feature,
)
from src.core.database import get_db
from src.core.errors import InsufficientPermissionsError, NotFoundError
from src.models import User, PermissionFeature
from src.repositories.mediun_repo import MediumRepository
from src.repositories.subscription_repo import SubscriptionRepository
from src.services.audit_service import AuditService
from src.services.medium_area import sync_pure_medium_user

router = APIRouter(prefix="/api/v1/admin/mediuns", tags=["admin-mediuns"])
logger = logging.getLogger(__name__)

_GATE_PLANO = Depends(require_plan_feature("mediuns"))


def _so_digitos(v: Optional[str]) -> Optional[str]:
    """Telefone gravado só com dígitos (a tela aplica a máscara)."""
    if v is None:
        return None
    digits = re.sub(r"\D", "", v)
    return digits or None


async def _checar_limite_mediuns(db: AsyncSession, tenant_id: UUID) -> None:
    """max_mediuns do plano (-1 = ilimitado). Usado na criação e na reativação."""
    sub = await SubscriptionRepository(db).get_by_tenant(tenant_id)
    if sub is None:
        return
    max_mediuns = effective_limit(sub, "max_mediuns")
    if max_mediuns == 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Funcionalidade de médiuns não disponível no plano atual.",
        )
    if max_mediuns > 0:
        current_count = await MediumRepository(db).count(tenant_id)
        if current_count >= max_mediuns:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Limite de médiuns/cambones atingido ({max_mediuns}). Faça upgrade do plano.",
            )


async def _cancelar_contas_futuras(db: AsyncSession, tenant_id: UUID, medium_id: UUID, referencia: Optional[date]) -> None:
    from src.services.mensalidade_contas_service import cancelar_contas_futuras_pendentes

    try:
        await cancelar_contas_futuras_pendentes(
            db=db, tenant_id=tenant_id, tipo_pessoa="mediun", pessoa_id=medium_id, referencia=referencia
        )
    except Exception:
        logger.exception("Falha ao cancelar contas futuras da mensalidade do médium %s", medium_id)


# ── Schemas ──────────────────────────────────────────────────────────────


class MediumCreate(BaseModel):
    nome: str
    is_atendimento: bool = False
    mensalidade_isento: bool = False
    data_entrada: Optional[date] = None
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
    """Campo enviado com ``null`` limpa o valor; campo ausente não muda."""

    nome: Optional[str] = None
    is_atendimento: Optional[bool] = None
    is_active: Optional[bool] = None
    mensalidade_isento: Optional[bool] = None
    data_entrada: Optional[date] = None
    data_saida: Optional[date] = None
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
    mensalidade_isento: bool = False
    data_entrada: Optional[date] = None
    data_saida: Optional[date] = None
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

    model_config = ConfigDict(from_attributes=True)


class BirthdayMediumResponse(BaseModel):
    id: UUID
    nome: str
    telefone: Optional[str] = None
    data_nascimento: Optional[date] = None
    dias_ate_aniversario: int

    model_config = ConfigDict(from_attributes=True)


# ── Endpoints ────────────────────────────────────────────────────────────


@router.get("/aniversariantes", response_model=List[BirthdayMediumResponse], dependencies=[Depends(require_plan_feature("mediuns")), Depends(require_group_permission(PermissionFeature.MEDIUNS, "view"))])
async def list_aniversariantes(
    dias: int = Query(7, ge=0, le=365, description="Janela de dias (0 = somente hoje)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[BirthdayMediumResponse]:
    """List médiuns whose birthday falls within the next *dias* days."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")
    repo = MediumRepository(db)
    return await repo.list_aniversariantes(current_user.tenant_id, dias=dias)


@router.get("/options", response_model=List[MediumResponse], dependencies=[Depends(require_group_permission(PermissionFeature.MEDIUNS, "view"))])
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
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")
    repo = MediumRepository(db)
    return await repo.list(current_user.tenant_id, only_atendimento=only_atendimento)


@router.get("", response_model=List[MediumResponse], dependencies=[Depends(require_group_permission(PermissionFeature.MEDIUNS, "view"))])
async def list_mediuns(
    search: Optional[str] = Query(None),
    include_inactive: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[MediumResponse]:
    """List mediuns for the CRUD management page."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")
    repo = MediumRepository(db)
    return await repo.list(
        current_user.tenant_id,
        search=search,
        include_inactive=include_inactive,
    )


@router.post("", response_model=MediumResponse, status_code=status.HTTP_201_CREATED, dependencies=[_GATE_PLANO, Depends(require_group_permission(PermissionFeature.MEDIUNS, "insert"))])
async def create_medium(
    data: MediumCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MediumResponse:
    """Create a new medium/cambone."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    # Plano sem médiuns (FREE) e status da assinatura já barrados pelo
    # require_plan_feature("mediuns") do decorator (403 / 402). Aqui só o limite
    # numérico: max_mediuns -1 = ilimitado, > 0 = limite.
    await _checar_limite_mediuns(db, current_user.tenant_id)

    repo = MediumRepository(db)
    medium = await repo.create(
        tenant_id=current_user.tenant_id,
        nome=data.nome,
        is_atendimento=data.is_atendimento,
        mensalidade_isento=data.mensalidade_isento,
        data_entrada=data.data_entrada,
        telefone=_so_digitos(data.telefone),
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

    # Create pending conta a receber for next month if mensalidade is configured
    # (isento de mensalidade não gera conta). Só com mensalidade de médiuns no
    # plano (Basic+ desde out/2026): a config pode ter ficado gravada de quando o
    # tenant tinha um plano maior, e o espelho em contas a receber não deve nascer.
    try:
        from src.repositories.mensalidade_repo import MensalidadeRepository
        from src.services.mensalidade_contas_service import criar_conta_proxima_mensalidade
        from src.services.plan_features import get_effective_plan_features
        mens_repo = MensalidadeRepository(db)
        config = await mens_repo.get_config(current_user.tenant_id)
        sub = await SubscriptionRepository(db).get_by_tenant(current_user.tenant_id)
        plan_has_mensalidade = get_effective_plan_features(sub).mensalidade_mediun
        if plan_has_mensalidade and config and config.valor_mensal > 0 and not medium.mensalidade_isento:
            await criar_conta_proxima_mensalidade(
                db=db,
                tenant_id=current_user.tenant_id,
                tipo_pessoa="mediun",
                pessoa_id=medium.id,
                pessoa_nome=medium.nome,
                valor=config.valor_mensal,
                dia_vencimento=config.dia_vencimento,
                criado_por=current_user.id,
            )
    except Exception:
        logger.exception("Falha ao criar conta a receber para médium %s", medium.id)

    await db.commit()
    return medium


@router.patch("/{medium_id}", response_model=MediumResponse, dependencies=[_GATE_PLANO, Depends(require_group_permission(PermissionFeature.MEDIUNS, "edit"))])
async def update_medium(
    medium_id: UUID = Path(...),
    data: MediumUpdate = ...,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MediumResponse:
    """Update a médium. Field sent as null clears it; missing field is unchanged."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = MediumRepository(db)
    medium = await repo.get(current_user.tenant_id, medium_id)
    if not medium:
        raise NotFoundError("Médium não encontrado")

    fields_set = data.model_fields_set
    changes: dict = {}
    was_active = medium.is_active
    was_isento = medium.mensalidade_isento

    # Reativar conta no limite do plano, como criar (antes furava max_mediuns).
    if data.is_active is True and not was_active:
        await _checar_limite_mediuns(db, current_user.tenant_id)

    # Campos obrigatórios/booleanos: null é ignorado (não dá para "limpar").
    for field in ("nome", "is_atendimento", "is_active", "mensalidade_isento"):
        value = getattr(data, field)
        if field in fields_set and value is not None and value != getattr(medium, field):
            changes[field] = {"old": getattr(medium, field), "new": value}
            setattr(medium, field, value)

    # Datas: enviada (mesmo null) = aplicar — reativar limpa data_saida.
    for field in ("data_entrada", "data_saida", "data_nascimento"):
        if field in fields_set and getattr(data, field) != getattr(medium, field):
            changes[field] = {"old": str(getattr(medium, field)), "new": str(getattr(data, field))}
            setattr(medium, field, getattr(data, field))

    # Texto opcional: enviado com null ou "" limpa (antes null era ignorado
    # e a tela não conseguia apagar telefone/e-mail/endereço).
    for field in ("telefone", "email", "observacoes", "cep", "logradouro", "numero", "bairro", "cidade"):
        if field not in fields_set:
            continue
        raw = getattr(data, field)
        new_val = _so_digitos(raw) if field == "telefone" else ((raw or "").strip() or None)
        old_val = getattr(medium, field)
        if new_val != old_val:
            changes[field] = {"old": old_val, "new": new_val}
            setattr(medium, field, new_val)

    # Saiu da casa ou ficou isento: as mensalidades futuras pendentes (a do
    # mês seguinte nasce no cadastro) deixam de ser devidas.
    if was_active and not medium.is_active:
        await _cancelar_contas_futuras(db, current_user.tenant_id, medium.id, medium.data_saida)
    elif medium.mensalidade_isento and not was_isento:
        await _cancelar_contas_futuras(db, current_user.tenant_id, medium.id, None)

    # Área do Médium (AM-02, D-08): inativar desativa a conta `medium` pura ligada
    # (reativar devolve); operador/admin ligado só perde/recupera a Área.
    if was_active != medium.is_active:
        await sync_pure_medium_user(db, current_user.tenant_id, medium)

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


@router.delete("/{medium_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_GATE_PLANO, Depends(require_group_permission(PermissionFeature.MEDIUNS, "delete"))])
async def delete_medium(
    medium_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete a medium/cambone."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = MediumRepository(db)
    medium = await repo.get(current_user.tenant_id, medium_id)
    if not medium:
        raise NotFoundError("Médium não encontrado")

    medium.deleted_at = datetime.now(timezone.utc)
    await _cancelar_contas_futuras(db, current_user.tenant_id, medium.id, None)
    # Área do Médium (AM-02, D-08): a conta `medium` pura ligada é desativada;
    # operador/admin ligado só perde a Área (require_medium exige médium não excluído).
    await sync_pure_medium_user(db, current_user.tenant_id, medium)
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
