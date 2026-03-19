"""T052: TenantConfigRepository - Branding and settings management."""
from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..models import TenantConfig


UNSET = object()


class TenantConfigRepository:
    """Repository for TenantConfig management.
    
    Provides:
    - Get/update tenant branding
    - Feature flag management
    - Custom settings storage
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.model = TenantConfig
        self._UNSET = UNSET
    
    async def get_by_tenant(self, tenant_id: UUID) -> Optional[TenantConfig]:
        """Get config for a tenant (creates default if not exists).
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            TenantConfig object
        """
        stmt = select(TenantConfig).where(TenantConfig.tenant_id == tenant_id)
        result = await self.db.execute(stmt)
        config = result.scalar_one_or_none()
        
        # Create default config if not exists
        if not config:
            config = TenantConfig(
                tenant_id=tenant_id,
                primary_color="#000000",
                secondary_color="#FFFFFF",
            )
            self.db.add(config)
            await self.db.flush()
            await self.db.refresh(config)
        
        return config
    
    async def update_branding(
        self,
        tenant_id: UUID,
        primary_color: Optional[str] | object = UNSET,
        secondary_color: Optional[str] | object = UNSET,
    ) -> TenantConfig:
        """Update tenant branding (colors only; logo managed via dedicated upload).
        
        Args:
            tenant_id: Tenant ID
            primary_color: Primary hex color
            secondary_color: Secondary hex color
            
        Returns:
            Updated TenantConfig
        """
        config = await self.get_by_tenant(tenant_id)
        if config is None:
            raise RuntimeError("Tenant config not available")
        
        if primary_color is not self._UNSET:
            config.primary_color = primary_color
        if secondary_color is not self._UNSET:
            config.secondary_color = secondary_color
        
        self.db.add(config)
        await self.db.flush()
        await self.db.refresh(config)
        return config
    
    async def update_email_settings(
        self,
        tenant_id: UUID,
        reply_to_email: Optional[str] | object = UNSET,
        email_signature: Optional[str] | object = UNSET,
    ) -> TenantConfig:
        """Update email settings.
        
        Args:
            tenant_id: Tenant ID
            reply_to_email: Reply-to email address
            email_signature: Email signature
            
        Returns:
            Updated TenantConfig
        """
        config = await self.get_by_tenant(tenant_id)
        if config is None:
            raise RuntimeError("Tenant config not available")
        
        if reply_to_email is not self._UNSET:
            config.reply_to_email = reply_to_email
        if email_signature is not self._UNSET:
            config.email_signature = email_signature
        
        self.db.add(config)
        await self.db.flush()
        await self.db.refresh(config)
        return config
    
    async def toggle_feature(
        self,
        tenant_id: UUID,
        feature_flag: str,
        enabled: bool,
    ) -> TenantConfig:
        """Toggle a feature flag.
        
        Args:
            tenant_id: Tenant ID
            feature_flag: Feature name (enable_bulk_operations, etc.)
            enabled: Enable or disable
            
        Returns:
            Updated TenantConfig
        """
        config = await self.get_by_tenant(tenant_id)
        if config is None:
            raise RuntimeError("Tenant config not available")
        
        if feature_flag in [
            "enable_bulk_operations",
            "enable_analytics",
            "enable_webhooks",
            "enable_walk_in",
        ]:
            setattr(config, feature_flag, enabled)
        
        self.db.add(config)
        await self.db.flush()
        await self.db.refresh(config)
        return config
    
    async def update_custom_settings(
        self,
        tenant_id: UUID,
        settings: dict,
    ) -> TenantConfig:
        """Update custom settings (JSON).
        
        Args:
            tenant_id: Tenant ID
            settings: Settings dict
            
        Returns:
            Updated TenantConfig
        """
        config = await self.get_by_tenant(tenant_id)
        if config is None:
            raise RuntimeError("Tenant config not available")
        config.custom_settings = settings or {}
        
        self.db.add(config)
        await self.db.flush()
        await self.db.refresh(config)
        return config
