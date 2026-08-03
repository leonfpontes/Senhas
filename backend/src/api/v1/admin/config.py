"""T062: Admin Config - GET/PUT /api/v1/admin/tenant/config (branding, settings)"""
import logging
import re
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, field_validator

from sqlalchemy import select
from src.core.database import get_db
from src.models import User, TenantConfig, PermissionFeature
from src.models.tenants import Tenant
from src.repositories.config_repo import TenantConfigRepository
from src.services.audit_service import AuditService
from src.api.dependencies import get_current_user, require_group_permission
from src.core.errors import InsufficientPermissionsError, ValidationError

router = APIRouter(prefix="/api/v1/admin", tags=["admin-config"])
logger = logging.getLogger(__name__)
HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

MAX_LOGO_BYTES = 2 * 1024 * 1024   # 2 MB
ALLOWED_LOGO_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _build_logo_url(request: Request, config: TenantConfig) -> Optional[str]:
    """Build public logo URL if binary data exists, else fall back to legacy logo_url."""
    if config.logo_data:
        base = str(request.base_url).rstrip("/")
        return f"{base}/api/v1/public/tenant/{config.tenant_id}/logo"
    return config.logo_url


class TenantConfigResponse(BaseModel):
    """Tenant config response."""
    tenant_nome: Optional[str] = None
    logo_url: Optional[str]
    primary_color: str
    secondary_color: str
    endereco: Optional[str] = None
    reply_to_email: Optional[str]
    email_signature: Optional[str]
    enable_bulk_operations: bool
    enable_analytics: bool
    enable_walk_in: bool
    custom_settings: Optional[Dict[str, Any]]
    sponsor_priority_mode: str = "first"
    validate_associado_on_emit: bool = False
    enable_estoque_log: bool = True
    enable_mensalidade_associado: bool = False
    enable_waitlist: bool = False
    enable_time_slot_scheduling: bool = False

    class Config:
        from_attributes = True


class TenantBrandingResponse(BaseModel):
    """Public-ish branding subset (sem dados sensíveis). Consumido pelo
    ThemeProvider de QUALQUER usuário autenticado do tenant, não só quem
    tem CONFIGURACOES:view — logo/cores já são expostos sem autenticação
    nas páginas públicas de emissão de ticket (ver public/emit_ticket.py)."""
    tenant_nome: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: str
    secondary_color: str
    font_color: Optional[str] = None


class TenantConfigUpdate(BaseModel):
    """Tenant config update request."""
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    endereco: Optional[str] = None
    reply_to_email: Optional[str] = None
    email_signature: Optional[str] = None
    enable_bulk_operations: Optional[bool] = None
    enable_analytics: Optional[bool] = None
    enable_walk_in: Optional[bool] = None
    custom_settings: Optional[Dict[str, Any]] = None
    sponsor_priority_mode: Optional[str] = None
    validate_associado_on_emit: Optional[bool] = None
    enable_estoque_log: Optional[bool] = None
    enable_mensalidade_associado: Optional[bool] = None
    enable_waitlist: Optional[bool] = None
    enable_time_slot_scheduling: Optional[bool] = None

    @field_validator("primary_color", "secondary_color")
    @classmethod
    def validate_hex_color(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value

        normalized = value.strip()
        if not HEX_COLOR_RE.match(normalized):
            raise ValueError("Cor deve estar no formato hexadecimal #RRGGBB")

        return normalized.upper()


@router.get("/tenant/branding", response_model=TenantBrandingResponse)
async def get_tenant_branding(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TenantBrandingResponse:
    """Branding (logo/cores) para o shell do app.

    Intencionalmente SEM require_group_permission(CONFIGURACOES, "view"):
    branding é cosmético, não sensível — já é servido sem autenticação nas
    páginas públicas de ticket (public/emit_ticket.py). Todo usuário
    autenticado do tenant precisa disso pro ThemeProvider, não só admins
    com CONFIGURACOES. Ver exceção documentada em CLAUDE.md.
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Usuário do tenant necessário")

    if current_user.tenant_id is None:
        return TenantBrandingResponse(
            tenant_nome=None, logo_url=None,
            primary_color="#6366f1", secondary_color="#ec4899", font_color=None,
        )

    repo = TenantConfigRepository(db)
    config = await repo.get_by_tenant(current_user.tenant_id)
    tenant_result = await db.execute(select(Tenant.name).where(Tenant.id == current_user.tenant_id))
    tenant_name = tenant_result.scalar_one_or_none()

    font_color = None
    if config.custom_settings and isinstance(config.custom_settings, dict):
        fc = config.custom_settings.get("font_color")
        font_color = fc if isinstance(fc, str) else None

    return TenantBrandingResponse(
        tenant_nome=tenant_name,
        logo_url=_build_logo_url(request, config),
        primary_color=config.primary_color,
        secondary_color=config.secondary_color,
        font_color=font_color,
    )


@router.get("/tenant/config", response_model=TenantConfigResponse, dependencies=[Depends(require_group_permission(PermissionFeature.CONFIGURACOES, "view"))])
async def get_tenant_config(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TenantConfigResponse:
    """Get tenant configuration."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")
    
    # SUPER_ADMIN has no tenant — return platform defaults
    if current_user.tenant_id is None:
        return TenantConfigResponse(
            tenant_nome=None,
            logo_url=None,
            primary_color="#6366f1",
            secondary_color="#ec4899",
            endereco=None,
            reply_to_email=None,
            email_signature=None,
            enable_bulk_operations=True,
            enable_analytics=True,
            enable_walk_in=False,
            custom_settings=None,
            sponsor_priority_mode="first",
            validate_associado_on_emit=False,
            enable_estoque_log=True,
        )
    
    repo = TenantConfigRepository(db)
    config = await repo.get_by_tenant(current_user.tenant_id)
    
    tenant_result = await db.execute(
        select(Tenant.name).where(Tenant.id == current_user.tenant_id)
    )
    tenant_name = tenant_result.scalar_one_or_none()

    resp = TenantConfigResponse.from_orm(config)
    resp.logo_url = _build_logo_url(request, config)
    resp.tenant_nome = tenant_name
    return resp


@router.put("/tenant/config", response_model=TenantConfigResponse, dependencies=[Depends(require_group_permission(PermissionFeature.CONFIGURACOES, "edit"))])
async def update_tenant_config(
    config_update: TenantConfigUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TenantConfigResponse:
    """Update tenant configuration.
    
    Requires admin role.
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")
    
    # SUPER_ADMIN has no tenant — config not editable
    if current_user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Super Admin não possui configuração de tenant",
        )
    
    repo = TenantConfigRepository(db)
    provided_fields = config_update.model_fields_set
    
    # Get current config
    current_config = await repo.get_by_tenant(current_user.tenant_id)
    previous_state = TenantConfigResponse.from_orm(current_config).dict()
    
    # Update branding if provided
    if {"primary_color", "secondary_color"} & provided_fields:
        await repo.update_branding(
            tenant_id=current_user.tenant_id,
            primary_color=config_update.primary_color if "primary_color" in provided_fields else repo._UNSET,
            secondary_color=config_update.secondary_color if "secondary_color" in provided_fields else repo._UNSET,
        )
    
    # Update email if provided
    if {"reply_to_email", "email_signature"} & provided_fields:
        await repo.update_email_settings(
            tenant_id=current_user.tenant_id,
            reply_to_email=config_update.reply_to_email if "reply_to_email" in provided_fields else repo._UNSET,
            email_signature=config_update.email_signature if "email_signature" in provided_fields else repo._UNSET,
        )
    
    # Update endereco if provided
    if "endereco" in provided_fields:
        current_config = await repo.get_by_tenant(current_user.tenant_id)
        current_config.endereco = config_update.endereco
        await db.flush()
    
    # Update feature flags
    # enable_bulk_operations is always-on; ignore any incoming value
    if config_update.enable_analytics is not None:
        await repo.toggle_feature(
            tenant_id=current_user.tenant_id,
            feature_flag="enable_analytics",
            enabled=config_update.enable_analytics,
        )
    
    if config_update.enable_walk_in is not None:
        await repo.toggle_feature(
            tenant_id=current_user.tenant_id,
            feature_flag="enable_walk_in",
            enabled=config_update.enable_walk_in,
        )
    
    # Update custom settings
    if config_update.custom_settings is not None:
        await repo.update_custom_settings(
            tenant_id=current_user.tenant_id,
            settings=config_update.custom_settings,
        )
    
    # Update sponsor priority mode
    if config_update.sponsor_priority_mode is not None:
        if config_update.sponsor_priority_mode not in ("first", "interleave"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="sponsor_priority_mode deve ser 'first' ou 'interleave'",
            )
        current_config = await repo.get_by_tenant(current_user.tenant_id)
        if current_config is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Configuração do tenant não encontrada",
            )
        current_config.sponsor_priority_mode = config_update.sponsor_priority_mode
        await db.flush()
    
    # Update validate_associado_on_emit
    if config_update.validate_associado_on_emit is not None:
        current_config = await repo.get_by_tenant(current_user.tenant_id)
        current_config.validate_associado_on_emit = config_update.validate_associado_on_emit
        await db.flush()

    # Update enable_estoque_log
    if config_update.enable_estoque_log is not None:
        await repo.toggle_feature(
            tenant_id=current_user.tenant_id,
            feature_flag="enable_estoque_log",
            enabled=config_update.enable_estoque_log,
        )

    # Update enable_mensalidade_associado
    if config_update.enable_mensalidade_associado is not None:
        await repo.toggle_feature(
            tenant_id=current_user.tenant_id,
            feature_flag="enable_mensalidade_associado",
            enabled=config_update.enable_mensalidade_associado,
        )

    # Update enable_waitlist — enabling it requires a PRO/Premium plan;
    # disabling is always allowed regardless of plan.
    if config_update.enable_waitlist is not None:
        if config_update.enable_waitlist:
            from src.services.plan_features import _get_plan_features
            from src.repositories.subscription_repo import SubscriptionRepository
            from src.models.subscriptions import SubscriptionStatus

            sub = await SubscriptionRepository(db).get_by_tenant(current_user.tenant_id)
            plan = sub.plan if sub else None
            suspended = bool(sub and sub.status == SubscriptionStatus.SUSPENDED)
            if plan is None or not _get_plan_features(plan, suspended=suspended).fila_espera:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Fila de espera disponível apenas nos planos Pro e Premium",
                )
        await repo.toggle_feature(
            tenant_id=current_user.tenant_id,
            feature_flag="enable_waitlist",
            enabled=config_update.enable_waitlist,
        )

    # Update enable_time_slot_scheduling — no plan gate, available on every plan.
    if config_update.enable_time_slot_scheduling is not None:
        await repo.toggle_feature(
            tenant_id=current_user.tenant_id,
            feature_flag="enable_time_slot_scheduling",
            enabled=config_update.enable_time_slot_scheduling,
        )

    # Get updated config
    updated_config = await repo.get_by_tenant(current_user.tenant_id)
    new_state = TenantConfigResponse.from_orm(updated_config).dict()
    
    # Log audit
    audit_service = AuditService(db)
    await audit_service.log_config_change(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        config_type="tenant_config",
        previous_values=previous_state,
        new_values=new_state,
    )
    
    await db.commit()
    
    resp = TenantConfigResponse.from_orm(updated_config)
    resp.logo_url = _build_logo_url(request, updated_config)
    return resp


@router.post("/tenant/logo", response_model=TenantConfigResponse, dependencies=[Depends(require_group_permission(PermissionFeature.CONFIGURACOES, "edit"))])
async def upload_tenant_logo(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TenantConfigResponse:
    """Upload tenant logo (stored as binary in database).
    
    Accepts JPG, PNG or WEBP up to 2 MB. Requires admin role.
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    if current_user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Super Admin não possui configuração de tenant",
        )

    if file.content_type not in ALLOWED_LOGO_CONTENT_TYPES:
        raise ValidationError("Formato inválido. Use JPG, PNG ou WEBP")

    contents = await file.read()
    if len(contents) == 0:
        raise ValidationError("Arquivo de imagem vazio")

    if len(contents) > MAX_LOGO_BYTES:
        raise ValidationError("Imagem excede o limite de 2 MB")

    repo = TenantConfigRepository(db)
    config = await repo.get_by_tenant(current_user.tenant_id)

    config.logo_data = contents
    config.logo_content_type = file.content_type
    config.logo_url = None  # clear legacy URL

    db.add(config)
    await db.commit()
    await db.refresh(config)

    resp = TenantConfigResponse.from_orm(config)
    resp.logo_url = _build_logo_url(request, config)
    return resp


@router.delete("/tenant/logo", response_model=TenantConfigResponse, dependencies=[Depends(require_group_permission(PermissionFeature.CONFIGURACOES, "edit"))])
async def delete_tenant_logo(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TenantConfigResponse:
    """Remove tenant logo. Requires admin role."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    if current_user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Super Admin não possui configuração de tenant",
        )

    repo = TenantConfigRepository(db)
    config = await repo.get_by_tenant(current_user.tenant_id)

    config.logo_data = None
    config.logo_content_type = None
    config.logo_url = None

    db.add(config)
    await db.commit()
    await db.refresh(config)

    resp = TenantConfigResponse.from_orm(config)
    resp.logo_url = _build_logo_url(request, config)
    return resp
