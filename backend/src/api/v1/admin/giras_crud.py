"""T058: Admin Giras CRUD - GET/POST/PUT/DELETE /api/v1/admin/giras/{id}"""
from fastapi import APIRouter, HTTPException, Depends, status, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import List, Optional
from uuid import UUID
from datetime import date, datetime, time, timezone, timedelta
import logging

from src.core.config import settings
from src.core.database import get_db
from src.core.tz import APP_TZ
from src.models import User, UserRole, Gira, PermissionFeature
from src.models.tenants import Tenant
from src.models.tenant_config import TenantConfig
from src.models.senha_controls import SenhaControl
from src.repositories.gira_repo import GiraRepository
from src.repositories.subscription_repo import SubscriptionRepository
from src.services.audit_service import AuditService

_BASE = settings.FRONTEND_URL.rstrip("/")
from src.api.dependencies import effective_limit, get_current_user, require_group_permission, require_any_group_permission
from src.core.errors import (
    UnauthorizedError,
    InsufficientPermissionsError,
    NotFoundError,
)

router = APIRouter(prefix="/api/v1/admin/giras", tags=["admin-giras"])
logger = logging.getLogger(__name__)


# Orientações para a corrente (AM-07): texto livre curto, editado no drawer da gira.
ORIENTACOES_MAX = 2000


def _texto_ou_none(value: Optional[str]) -> Optional[str]:
    """Tira espaços das pontas; texto vazio vira None (apaga o campo)."""
    if value is None:
        return None
    value = value.strip()
    return value or None


class GiraCreate(BaseModel):
    """Gira creation request."""
    nome: str
    descricao: Optional[str] = None
    data_inicio: datetime
    data_fim: Optional[datetime] = None
    local: Optional[str] = None
    is_active: bool = True
    recados: Optional[str] = None
    # Orientações para a corrente (AM-07): só aparecem na Área do Médium.
    orientacoes_corrente: Optional[str] = Field(None, max_length=ORIENTACOES_MAX)

    _normaliza_orientacoes = field_validator("orientacoes_corrente")(_texto_ou_none)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "nome": "Gira de Maio",
                "descricao": "Gira mensal de maio",
                "data_inicio": "2026-05-01T18:00:00Z",
                "data_fim": "2026-05-02T02:00:00Z",
                "local": "Centro Espírita",
                "recados": "Investimento sugerido: R$ 20. Trazer uma vela branca.",
            }
        },
    )


class GiraUpdate(BaseModel):
    """Gira update request."""
    nome: Optional[str] = None
    descricao: Optional[str] = None
    data_inicio: Optional[datetime] = None
    data_fim: Optional[datetime] = None
    local: Optional[str] = None
    is_active: Optional[bool] = None
    recados: Optional[str] = None
    orientacoes_corrente: Optional[str] = Field(None, max_length=ORIENTACOES_MAX)

    _normaliza_orientacoes = field_validator("orientacoes_corrente")(_texto_ou_none)


class GiraResponse(BaseModel):
    """Gira response."""
    id: UUID
    nome: str
    descricao: Optional[str]
    data_inicio: datetime
    data_fim: Optional[datetime]
    local: Optional[str]
    is_active: bool
    recados: Optional[str] = None
    orientacoes_corrente: Optional[str] = None
    allow_acompanhantes: bool = False
    max_acompanhantes: Optional[int] = None
    max_tickets: Optional[int] = None
    release_start_at: Optional[datetime] = None
    release_end_at: Optional[datetime] = None
    sponsor_max_tickets: Optional[int] = None
    sponsor_release_start_at: Optional[datetime] = None
    sponsor_release_end_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SenhaConfigRequest(BaseModel):
    """Senha configuration for a gira."""
    max_tickets: int
    release_start_at: datetime
    release_end_at: datetime
    # Acompanhantes: quando ligado, o titular pode emitir senhas extras para
    # até max_acompanhantes acompanhantes na mesma emissão pública.
    allow_acompanhantes: bool = False
    max_acompanhantes: Optional[int] = None
    # Sponsor config (optional)
    sponsor_max_tickets: Optional[int] = None
    sponsor_release_start_at: Optional[datetime] = None
    sponsor_release_end_at: Optional[datetime] = None
    # Fila de espera: hours a promoted ticket has to confirm (Premium only; ignored
    # server-side when the tenant doesn't have the feature enabled)
    waitlist_confirmation_hours: Optional[int] = None


class SenhaConfigResponse(BaseModel):
    """Senha config + stats response."""
    max_tickets: int
    release_start_at: datetime
    release_end_at: datetime
    allow_acompanhantes: bool = False
    max_acompanhantes: Optional[int] = None
    current_count: int = 0
    public_link: str = ""
    # Sponsor config
    sponsor_max_tickets: Optional[int] = None
    sponsor_release_start_at: Optional[datetime] = None
    sponsor_release_end_at: Optional[datetime] = None
    sponsor_current_count: int = 0
    sponsor_public_link: str = ""
    waitlist_confirmation_hours: Optional[int] = None


def _validate_acompanhantes_config(allow_acompanhantes: bool, max_acompanhantes: Optional[int]) -> None:
    """Valida a config de acompanhantes de uma gira (create e update)."""
    if allow_acompanhantes:
        if max_acompanhantes is None or max_acompanhantes < 1:
            raise HTTPException(
                status_code=400,
                detail="Informe o máximo de acompanhantes (mínimo 1) para permitir acompanhantes",
            )
        if max_acompanhantes > 20:
            raise HTTPException(status_code=400, detail="Máximo de acompanhantes não pode passar de 20")


class UnifiedLinksResponse(BaseModel):
    """Tenant-wide links that always resolve to the next/active gira."""
    public_link: str
    sponsor_public_link: str


class GiraSettingsResponse(BaseModel):
    """Recorte da config do terreiro de que a tela de Giras precisa.

    Exposto com GIRAS:view para quem cria/edita giras sem ter
    CONFIGURACOES:view (antes o seletor de horários sumia para esses usuários).
    A edição dessas configurações continua só em /tenant/config (CONFIGURACOES).
    """
    enable_time_slot_scheduling: bool = False
    # Endereço do terreiro: padrão quando a gira não tem "local" próprio.
    endereco: Optional[str] = None


def _local_day_start_utc(value: str, field: str, plus_days: int = 0) -> datetime:
    """'YYYY-MM-DD' (+ plus_days) → início desse dia em America/Sao_Paulo, em UTC.

    Os filtros de data das telas são dias do terreiro (horário de Brasília);
    comparar com a meia-noite UTC tirava das 21h às 23h59 do dia escolhido.
    """
    try:
        day = date.fromisoformat(value.strip()[:10])
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{field} deve estar no formato AAAA-MM-DD")
    day = day + timedelta(days=plus_days)
    return datetime.combine(day, time.min, tzinfo=APP_TZ).astimezone(timezone.utc)


@router.post("", response_model=GiraResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_group_permission(PermissionFeature.GIRAS, "insert"))])
async def create_gira(
    gira: GiraCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GiraResponse:
    """Create new gira.
    
    Requires admin role.
    """
    # Check permissions
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    # Check monthly gira limit
    sub_repo = SubscriptionRepository(db)
    sub = await sub_repo.get_by_tenant(current_user.tenant_id)
    if sub is not None:
        # SUSPENDED → 402; cancelada/trial vencido → limite do FREE (P-05).
        max_giras = effective_limit(sub, "max_giras_per_month")

        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        count_stmt = select(func.count()).select_from(Gira).where(
            and_(
                Gira.tenant_id == current_user.tenant_id,
                Gira.created_at >= month_start,
                Gira.deleted_at.is_(None),
            )
        )
        result = await db.execute(count_stmt)
        current_month_count = result.scalar() or 0
        if max_giras != -1 and current_month_count >= max_giras:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Limite mensal de giras atingido ({max_giras}). Faça upgrade do plano.",
            )

    # Create gira
    repo = GiraRepository(db)
    created_gira = await repo.create(
        tenant_id=current_user.tenant_id,
        **gira.model_dump(),
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
    return GiraResponse.model_validate(created_gira)


# Lista só de leitura, compartilhada por várias telas: Giras (GIRAS), Relatório
# (RELATORIO_GIRA), Porta e modo TV (PORTA) e Senhas (TICKETS) escolhem a gira por
# ela — e o GiraProvider do layout também. Operador só com PORTA ou só com TICKETS
# ficava sem gira para escolher. Criar/editar/excluir continua exigindo GIRAS.
@router.get(
    "",
    response_model=List[GiraResponse],
    dependencies=[
        Depends(
            require_any_group_permission(
                PermissionFeature.GIRAS,
                PermissionFeature.RELATORIO_GIRA,
                PermissionFeature.PORTA,
                PermissionFeature.TICKETS,
                action="view",
            )
        )
    ],
)
async def list_giras(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    is_active: Optional[bool] = Query(None, description="Filter by active/inactive"),
    date_from: Optional[str] = Query(None, description="Filter giras from this date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Filter giras up to this date (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[GiraResponse]:
    """List giras for tenant with optional filters.
    
    Requires admin role.
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")
    
    stmt = select(Gira).where(
        and_(
            Gira.tenant_id == current_user.tenant_id,
            Gira.deleted_at.is_(None),
        )
    )

    if is_active is not None:
        stmt = stmt.where(Gira.is_active == is_active)

    # Datas são dias do terreiro (America/Sao_Paulo), não dias UTC.
    if date_from:
        stmt = stmt.where(Gira.data_inicio >= _local_day_start_utc(date_from, "date_from"))

    if date_to:
        # Inclui o dia inteiro: até o início do dia seguinte (horário de Brasília).
        stmt = stmt.where(Gira.data_inicio < _local_day_start_utc(date_to, "date_to", plus_days=1))

    stmt = stmt.order_by(Gira.data_inicio.desc()).offset(skip).limit(limit)

    result = await db.execute(stmt)
    giras = result.scalars().all()

    return [GiraResponse.model_validate(g) for g in giras]


@router.get("/unified-links", response_model=UnifiedLinksResponse, dependencies=[Depends(require_group_permission(PermissionFeature.GIRAS, "view"))])
async def get_unified_links(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UnifiedLinksResponse:
    """Tenant-wide public links for senha emission.

    Unlike the per-gira `public_link`/`sponsor_public_link`, these links carry
    no gira_id — the public page resolves the next/active gira on each visit,
    so the same link can be shared once and keeps working across giras.
    """
    tenant_result = await db.execute(select(Tenant.slug).where(Tenant.id == current_user.tenant_id))
    slug = tenant_result.scalar_one_or_none()
    if not slug:
        raise NotFoundError("Tenant not found")

    return UnifiedLinksResponse(
        public_link=f"{_BASE}/public/{slug}/senha",
        sponsor_public_link=f"{_BASE}/public/{slug}/associado",
    )


# Declarada antes de "/{gira_id}" para "settings" não virar um id.
@router.get("/settings", response_model=GiraSettingsResponse, dependencies=[Depends(require_group_permission(PermissionFeature.GIRAS, "view"))])
async def get_gira_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GiraSettingsResponse:
    """Config do terreiro que a tela de Giras usa (só leitura, GIRAS:view)."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    result = await db.execute(
        select(TenantConfig.enable_time_slot_scheduling, TenantConfig.endereco).where(
            TenantConfig.tenant_id == current_user.tenant_id
        )
    )
    row = result.one_or_none()
    if row is None:
        return GiraSettingsResponse()
    return GiraSettingsResponse(
        enable_time_slot_scheduling=bool(row[0]),
        endereco=(row[1] or "").strip() or None,
    )


@router.get("/{gira_id}", response_model=GiraResponse, dependencies=[Depends(require_group_permission(PermissionFeature.GIRAS, "view"))])
async def get_gira(
    gira_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GiraResponse:
    """Get specific gira.
    
    Requires admin role.
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")
    
    repo = GiraRepository(db)
    gira = await repo.get_by_id(gira_id, current_user.tenant_id)
    
    if not gira:
        raise NotFoundError("Gira não encontrado")
    
    return GiraResponse.model_validate(gira)


@router.put("/{gira_id}", response_model=GiraResponse, dependencies=[Depends(require_group_permission(PermissionFeature.GIRAS, "edit"))])
async def update_gira(
    gira_id: UUID = Path(...),
    gira_update: GiraUpdate = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GiraResponse:
    """Update gira.
    
    Requires admin role.
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")
    
    repo = GiraRepository(db)
    existing_gira = await repo.get_by_id(gira_id, current_user.tenant_id)
    
    if not existing_gira:
        raise NotFoundError("Gira não encontrado")

    updated_gira = await repo.update(
        gira_id,
        current_user.tenant_id,
        **gira_update.model_dump(exclude_unset=True),
    )
    
    # Log audit
    audit_service = AuditService(db)
    await audit_service.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="Gira",
        resource_id=gira_id,
        previous_state=GiraResponse.model_validate(existing_gira).model_dump(mode='json'),
        new_state=GiraResponse.model_validate(updated_gira).model_dump(mode='json'),
    )
    
    await db.commit()
    return GiraResponse.model_validate(updated_gira)


@router.delete("/{gira_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_group_permission(PermissionFeature.GIRAS, "delete"))])
async def delete_gira(
    gira_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete (soft delete) gira.
    
    Requires admin role.
    """
    if not current_user.is_operator_or_admin:
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


# ========== SENHA CONFIGURATION ENDPOINTS ==========


async def _get_senha_count(db: AsyncSession, tenant_id: UUID, gira_id: UUID, is_sponsor: bool = False) -> int:
    """Get current ticket count for a gira, net of slots freed by admin cancellations."""
    query = select(SenhaControl).where(
        and_(SenhaControl.tenant_id == tenant_id, SenhaControl.gira_id == gira_id, SenhaControl.is_sponsor == is_sponsor)
    )
    result = await db.execute(query)
    sc = result.scalar_one_or_none()
    if not sc:
        return 0
    return max(0, sc.total_emitido - sc.slots_returned)


@router.get("/{gira_id}/senhas", response_model=SenhaConfigResponse, dependencies=[Depends(require_group_permission(PermissionFeature.GIRAS, "view"))])
async def get_senha_config(
    gira_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SenhaConfigResponse:
    """Get senha configuration and stats for a gira."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = GiraRepository(db)
    gira = await repo.get_by_id(gira_id, current_user.tenant_id)
    if not gira:
        raise NotFoundError("Gira não encontrada")

    current_count = await _get_senha_count(db, current_user.tenant_id, gira_id)
    sponsor_count = await _get_senha_count(db, current_user.tenant_id, gira_id, is_sponsor=True)

    return SenhaConfigResponse(
        max_tickets=gira.max_tickets or 0,
        release_start_at=gira.release_start_at or gira.data_inicio,
        release_end_at=gira.release_end_at or gira.data_inicio,
        allow_acompanhantes=gira.allow_acompanhantes,
        max_acompanhantes=gira.max_acompanhantes,
        current_count=current_count,
        public_link=f"{_BASE}/public/gira/{gira_id}",
        sponsor_max_tickets=gira.sponsor_max_tickets,
        sponsor_release_start_at=gira.sponsor_release_start_at,
        sponsor_release_end_at=gira.sponsor_release_end_at,
        sponsor_current_count=sponsor_count,
        sponsor_public_link=f"{_BASE}/public/gira/{gira_id}?tipo=associado" if gira.sponsor_max_tickets else "",
        waitlist_confirmation_hours=gira.waitlist_confirmation_hours,
    )


@router.put("/{gira_id}/senhas", response_model=SenhaConfigResponse, dependencies=[Depends(require_group_permission(PermissionFeature.GIRAS, "edit"))])
async def update_senha_config(
    config: SenhaConfigRequest,
    gira_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SenhaConfigResponse:
    """Configure senha settings for a gira (max tickets, release window)."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    if config.max_tickets < 1:
        raise HTTPException(status_code=400, detail="max_tickets deve ser >= 1")
    if config.release_end_at <= config.release_start_at:
        raise HTTPException(status_code=400, detail="release_end_at deve ser posterior a release_start_at")
    if config.waitlist_confirmation_hours is not None and config.waitlist_confirmation_hours < 1:
        raise HTTPException(status_code=400, detail="waitlist_confirmation_hours deve ser >= 1")
    _validate_acompanhantes_config(config.allow_acompanhantes, config.max_acompanhantes)

    repo = GiraRepository(db)
    gira = await repo.get_by_id(gira_id, current_user.tenant_id)
    if not gira:
        raise NotFoundError("Gira não encontrada")

    # waitlist_confirmation_hours only makes sense when the tenant actually has
    # the feature enabled; ignore it otherwise instead of silently persisting
    # a setting that will never take effect.
    from src.services import waitlist_service
    waitlist_confirmation_hours = config.waitlist_confirmation_hours
    if not await waitlist_service.waitlist_enabled_for_tenant(db, current_user.tenant_id):
        waitlist_confirmation_hours = None

    await repo.update(
        gira_id,
        current_user.tenant_id,
        max_tickets=config.max_tickets,
        release_start_at=config.release_start_at,
        release_end_at=config.release_end_at,
        allow_acompanhantes=config.allow_acompanhantes,
        max_acompanhantes=config.max_acompanhantes if config.allow_acompanhantes else None,
        sponsor_max_tickets=config.sponsor_max_tickets,
        sponsor_release_start_at=config.sponsor_release_start_at,
        sponsor_release_end_at=config.sponsor_release_end_at,
        waitlist_confirmation_hours=waitlist_confirmation_hours,
    )

    # Ensure SenhaControl exists for regular tickets
    sc_query = select(SenhaControl).where(
        and_(SenhaControl.tenant_id == current_user.tenant_id, SenhaControl.gira_id == gira_id, SenhaControl.is_sponsor == False)
    )
    sc_result = await db.execute(sc_query)
    if not sc_result.scalar_one_or_none():
        db.add(SenhaControl(
            tenant_id=current_user.tenant_id,
            gira_id=gira_id,
            is_sponsor=False,
            proximo_numero=0,
            total_emitido=0,
        ))
        await db.flush()

    # Ensure SenhaControl exists for sponsor tickets if configured
    if config.sponsor_max_tickets and config.sponsor_max_tickets > 0:
        sp_query = select(SenhaControl).where(
            and_(SenhaControl.tenant_id == current_user.tenant_id, SenhaControl.gira_id == gira_id, SenhaControl.is_sponsor == True)
        )
        sp_result = await db.execute(sp_query)
        if not sp_result.scalar_one_or_none():
            db.add(SenhaControl(
                tenant_id=current_user.tenant_id,
                gira_id=gira_id,
                is_sponsor=True,
                proximo_numero=0,
                total_emitido=0,
            ))
            await db.flush()

    audit_service = AuditService(db)
    await audit_service.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="GiraSenhaConfig",
        resource_id=gira_id,
        previous_state={},
        new_state=config.model_dump(mode='json'),
    )
    await db.commit()

    current_count = await _get_senha_count(db, current_user.tenant_id, gira_id)
    sponsor_count = await _get_senha_count(db, current_user.tenant_id, gira_id, is_sponsor=True)
    return SenhaConfigResponse(
        max_tickets=config.max_tickets,
        release_start_at=config.release_start_at,
        release_end_at=config.release_end_at,
        allow_acompanhantes=config.allow_acompanhantes,
        max_acompanhantes=config.max_acompanhantes if config.allow_acompanhantes else None,
        current_count=current_count,
        public_link=f"{_BASE}/public/gira/{gira_id}",
        sponsor_max_tickets=config.sponsor_max_tickets,
        sponsor_release_start_at=config.sponsor_release_start_at,
        sponsor_release_end_at=config.sponsor_release_end_at,
        sponsor_current_count=sponsor_count,
        sponsor_public_link=f"{_BASE}/public/gira/{gira_id}?tipo=associado" if config.sponsor_max_tickets else "",
        waitlist_confirmation_hours=waitlist_confirmation_hours,
    )


@router.post("/{gira_id}/release-now", response_model=SenhaConfigResponse, dependencies=[Depends(require_group_permission(PermissionFeature.GIRAS, "edit"))])
async def release_now(
    gira_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SenhaConfigResponse:
    """Immediately release senhas for a gira (set release_start_at to now)."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = GiraRepository(db)
    gira = await repo.get_by_id(gira_id, current_user.tenant_id)
    if not gira:
        raise NotFoundError("Gira não encontrada")

    if not gira.max_tickets:
        raise HTTPException(status_code=400, detail="Configure a quantidade de senhas primeiro")

    now = datetime.now(timezone.utc)
    end = gira.release_end_at if gira.release_end_at and gira.release_end_at > now else None
    if not end:
        end = now + timedelta(hours=24)

    updated_gira = await repo.update(
        gira_id,
        current_user.tenant_id,
        release_start_at=now,
        release_end_at=end,
    )

    # Ensure SenhaControl exists
    sc_query = select(SenhaControl).where(
        and_(SenhaControl.tenant_id == current_user.tenant_id, SenhaControl.gira_id == gira_id, SenhaControl.is_sponsor == False)
    )
    sc_result = await db.execute(sc_query)
    if not sc_result.scalar_one_or_none():
        db.add(SenhaControl(
            tenant_id=current_user.tenant_id,
            gira_id=gira_id,
            is_sponsor=False,
            proximo_numero=0,
            total_emitido=0,
        ))
        await db.flush()

    sp_now: Optional[datetime] = None
    sp_end: Optional[datetime] = None

    # Also release sponsor senhas if configured
    if gira.sponsor_max_tickets:
        sp_now = now
        sp_end = gira.sponsor_release_end_at if gira.sponsor_release_end_at and gira.sponsor_release_end_at > now else None
        if not sp_end:
            sp_end = now + timedelta(hours=24)
        updated_gira = await repo.update(
            gira_id,
            current_user.tenant_id,
            sponsor_release_start_at=sp_now,
            sponsor_release_end_at=sp_end,
        )
        sp_query = select(SenhaControl).where(
            and_(SenhaControl.tenant_id == current_user.tenant_id, SenhaControl.gira_id == gira_id, SenhaControl.is_sponsor == True)
        )
        sp_result = await db.execute(sp_query)
        if not sp_result.scalar_one_or_none():
            db.add(SenhaControl(
                tenant_id=current_user.tenant_id,
                gira_id=gira_id,
                is_sponsor=True,
                proximo_numero=0,
                total_emitido=0,
            ))
            await db.flush()

    audit_service = AuditService(db)
    await audit_service.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="GiraSenhaConfig",
        resource_id=gira_id,
        previous_state={},
        new_state={"action": "release_now"},
    )
    await db.commit()

    current_count = await _get_senha_count(db, current_user.tenant_id, gira_id)
    sponsor_count = await _get_senha_count(db, current_user.tenant_id, gira_id, is_sponsor=True)
    return SenhaConfigResponse(
        max_tickets=updated_gira.max_tickets,
        release_start_at=now,
        release_end_at=end,
        allow_acompanhantes=updated_gira.allow_acompanhantes,
        max_acompanhantes=updated_gira.max_acompanhantes,
        current_count=current_count,
        public_link=f"{_BASE}/public/gira/{gira_id}",
        sponsor_max_tickets=updated_gira.sponsor_max_tickets,
        sponsor_release_start_at=sp_now or updated_gira.sponsor_release_start_at,
        sponsor_release_end_at=sp_end or updated_gira.sponsor_release_end_at,
        sponsor_current_count=sponsor_count,
        sponsor_public_link=f"{_BASE}/public/gira/{gira_id}?tipo=associado" if updated_gira.sponsor_max_tickets else "",
        # Config completa: sem isto o drawer recebia None e o próximo "Salvar"
        # apagava o prazo de confirmação da fila de espera.
        waitlist_confirmation_hours=updated_gira.waitlist_confirmation_hours,
    )
