"""T058: Admin Giras CRUD - GET/POST/PUT/DELETE /api/v1/admin/giras/{id}"""
from fastapi import APIRouter, HTTPException, Depends, status, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone, timedelta
import logging

from src.core.config import settings
from src.core.database import get_db
from src.models import User, UserRole, Gira, PermissionFeature
from src.models.tenants import Tenant
from src.models.senha_controls import SenhaControl
from src.repositories.gira_repo import GiraRepository
from src.repositories.subscription_repo import SubscriptionRepository
from src.services.audit_service import AuditService
from src.models.subscriptions import SubscriptionStatus

_BASE = settings.FRONTEND_URL.rstrip("/")
from src.api.dependencies import get_current_user, require_group_permission, require_any_group_permission
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
    recados: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "nome": "Gira de Maio",
                "descricao": "Gira mensal de maio",
                "data_inicio": "2026-05-01T18:00:00Z",
                "data_fim": "2026-05-02T02:00:00Z",
                "local": "Centro Espírita",
                "recados": "Investimento sugerido: R$ 20. Trazer uma vela branca.",
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
    recados: Optional[str] = None


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
    max_tickets: Optional[int] = None
    release_start_at: Optional[datetime] = None
    release_end_at: Optional[datetime] = None
    sponsor_max_tickets: Optional[int] = None
    sponsor_release_start_at: Optional[datetime] = None
    sponsor_release_end_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SenhaConfigRequest(BaseModel):
    """Senha configuration for a gira."""
    max_tickets: int
    release_start_at: datetime
    release_end_at: datetime
    # Sponsor config (optional)
    sponsor_max_tickets: Optional[int] = None
    sponsor_release_start_at: Optional[datetime] = None
    sponsor_release_end_at: Optional[datetime] = None
    # Fila de espera: hours a promoted ticket has to confirm (PRO+ only; ignored
    # server-side when the tenant doesn't have the feature enabled)
    waitlist_confirmation_hours: Optional[int] = None


class SenhaConfigResponse(BaseModel):
    """Senha config + stats response."""
    max_tickets: int
    release_start_at: datetime
    release_end_at: datetime
    current_count: int = 0
    public_link: str = ""
    # Sponsor config
    sponsor_max_tickets: Optional[int] = None
    sponsor_release_start_at: Optional[datetime] = None
    sponsor_release_end_at: Optional[datetime] = None
    sponsor_current_count: int = 0
    sponsor_public_link: str = ""
    waitlist_confirmation_hours: Optional[int] = None


class UnifiedLinksResponse(BaseModel):
    """Tenant-wide links that always resolve to the next/active gira."""
    public_link: str
    sponsor_public_link: str


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
        # Block operations for suspended subscriptions (payment failed)
        if sub.status == SubscriptionStatus.SUSPENDED:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Assinatura suspensa por falta de pagamento. Regularize sua assinatura para criar novas giras.",
            )

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
        if sub.max_giras_per_month != -1 and current_month_count >= sub.max_giras_per_month:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Limite mensal de giras atingido ({sub.max_giras_per_month}). Faça upgrade do plano.",
            )

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


@router.get("", response_model=List[GiraResponse], dependencies=[Depends(require_any_group_permission(PermissionFeature.GIRAS, PermissionFeature.RELATORIO_GIRA, action="view"))])
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

    if date_from:
        stmt = stmt.where(Gira.data_inicio >= datetime.fromisoformat(date_from))

    if date_to:
        # Include the full day
        stmt = stmt.where(Gira.data_inicio < datetime.fromisoformat(date_to) + timedelta(days=1))

    stmt = stmt.order_by(Gira.data_inicio.desc()).offset(skip).limit(limit)

    result = await db.execute(stmt)
    giras = result.scalars().all()

    return [GiraResponse.from_orm(g) for g in giras]


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
    
    return GiraResponse.from_orm(gira)


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
        **gira_update.dict(exclude_unset=True),
    )
    
    # Log audit
    audit_service = AuditService(db)
    await audit_service.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="Gira",
        resource_id=gira_id,
        previous_state=GiraResponse.from_orm(existing_gira).model_dump(mode='json'),
        new_state=GiraResponse.from_orm(updated_gira).model_dump(mode='json'),
    )
    
    await db.commit()
    return GiraResponse.from_orm(updated_gira)


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
    """Get current ticket count for a gira."""
    query = select(SenhaControl).where(
        and_(SenhaControl.tenant_id == tenant_id, SenhaControl.gira_id == gira_id, SenhaControl.is_sponsor == is_sponsor)
    )
    result = await db.execute(query)
    sc = result.scalar_one_or_none()
    return sc.total_emitido if sc else 0


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
        current_count=current_count,
        public_link=f"{_BASE}/public/gira/{gira_id}",
        sponsor_max_tickets=updated_gira.sponsor_max_tickets,
        sponsor_release_start_at=sp_now,
        sponsor_release_end_at=sp_end,
        sponsor_current_count=sponsor_count,
        sponsor_public_link=f"{_BASE}/public/gira/{gira_id}?tipo=associado" if updated_gira.sponsor_max_tickets else "",
    )
