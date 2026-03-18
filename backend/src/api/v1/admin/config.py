"""T062: Admin Config - GET/PUT /api/v1/admin/tenant/config (branding, settings)"""
import logging
import re
from typing import Optional, Dict, Any
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, field_validator

from src.core.database import get_db
from src.models import User, TenantConfig
from src.repositories.config_repo import TenantConfigRepository
from src.services.audit_service import AuditService
from src.api.dependencies import get_current_user
from src.core.errors import InsufficientPermissionsError

router = APIRouter(prefix="/api/v1/admin", tags=["admin-config"])
logger = logging.getLogger(__name__)
HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


class TenantConfigResponse(BaseModel):
    """Tenant config response."""
    logo_url: Optional[str]
    primary_color: str
    secondary_color: str
    reply_to_email: Optional[str]
    email_signature: Optional[str]
    enable_bulk_operations: bool
    enable_analytics: bool
    enable_webhooks: bool
    enable_walk_in: bool
    custom_settings: Optional[Dict[str, Any]]
    sponsor_priority_mode: str = "first"

    class Config:
        from_attributes = True


class TenantConfigUpdate(BaseModel):
    """Tenant config update request."""
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    reply_to_email: Optional[str] = None
    email_signature: Optional[str] = None
    enable_bulk_operations: Optional[bool] = None
    enable_analytics: Optional[bool] = None
    enable_webhooks: Optional[bool] = None
    enable_walk_in: Optional[bool] = None
    custom_settings: Optional[Dict[str, Any]] = None
    sponsor_priority_mode: Optional[str] = None

    @field_validator("primary_color", "secondary_color")
    @classmethod
    def validate_hex_color(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value

        normalized = value.strip()
        if not HEX_COLOR_RE.match(normalized):
            raise ValueError("Cor deve estar no formato hexadecimal #RRGGBB")

        return normalized.upper()

    @field_validator("logo_url", mode="before")
    @classmethod
    def validate_logo_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None

        normalized = value.strip()
        if normalized == "":
            return None

        parsed = urlparse(normalized)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("URL do logo deve ser uma URL http(s) válida")

        return normalized


@router.get("/tenant/config", response_model=TenantConfigResponse)
async def get_tenant_config(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TenantConfigResponse:
    """Get tenant configuration.
    
    Requires admin role.
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")
    
    # SUPER_ADMIN has no tenant — return platform defaults
    if current_user.tenant_id is None:
        return TenantConfigResponse(
            logo_url=None,
            primary_color="#6366f1",
            secondary_color="#ec4899",
            reply_to_email=None,
            email_signature=None,
            enable_bulk_operations=True,
            enable_analytics=True,
            enable_webhooks=False,
            enable_walk_in=False,
            custom_settings=None,
            sponsor_priority_mode="first",
        )
    
    repo = TenantConfigRepository(db)
    config = await repo.get_by_tenant(current_user.tenant_id)
    
    return TenantConfigResponse.from_orm(config)


@router.put("/tenant/config", response_model=TenantConfigResponse)
async def update_tenant_config(
    config_update: TenantConfigUpdate,
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
    if {"logo_url", "primary_color", "secondary_color"} & provided_fields:
        await repo.update_branding(
            tenant_id=current_user.tenant_id,
            logo_url=config_update.logo_url if "logo_url" in provided_fields else repo._UNSET,
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
    
    # Update feature flags
    if config_update.enable_bulk_operations is not None:
        await repo.toggle_feature(
            tenant_id=current_user.tenant_id,
            feature_flag="enable_bulk_operations",
            enabled=config_update.enable_bulk_operations,
        )
    
    if config_update.enable_analytics is not None:
        await repo.toggle_feature(
            tenant_id=current_user.tenant_id,
            feature_flag="enable_analytics",
            enabled=config_update.enable_analytics,
        )
    
    if config_update.enable_webhooks is not None:
        await repo.toggle_feature(
            tenant_id=current_user.tenant_id,
            feature_flag="enable_webhooks",
            enabled=config_update.enable_webhooks,
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
    
    return TenantConfigResponse.from_orm(updated_config)
