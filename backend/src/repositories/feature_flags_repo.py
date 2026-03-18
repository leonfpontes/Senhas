"""FeatureFlagsRepository - Per-tenant feature management (T100)."""
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from ..models import FeatureFlag
from .base import BaseRepository


class FeatureFlagsRepository(BaseRepository[FeatureFlag]):
    """Repository for FeatureFlag management per tenant.
    
    Provides:
    - CRUD for feature flags
    - Access by tenant_id and feature name
    - Listing enabled features
    - Expiration handling
    """
    
    def __init__(self, db: AsyncSession):
        super().__init__(db, FeatureFlag)
    
    async def get_by_name(
        self,
        tenant_id: UUID,
        feature: str,
    ) -> Optional[FeatureFlag]:
        """Get feature flag by name for tenant.
        
        Args:
            tenant_id: Tenant ID
            feature: Feature name
            
        Returns:
            FeatureFlag object or None
        """
        stmt = select(FeatureFlag).where(
            and_(
                FeatureFlag.tenant_id == tenant_id,
                FeatureFlag.feature == feature,
            )
        )
        
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def exists(
        self,
        tenant_id: UUID,
        feature: str,
    ) -> bool:
        """Check if feature is enabled for tenant.
        
        Args:
            tenant_id: Tenant ID
            feature: Feature name
            
        Returns:
            True if feature is enabled and not expired
        """
        flag = await self.get_by_name(tenant_id, feature)
        
        if not flag or not flag.enabled:
            return False
        
        # Check if expired
        if flag.expires_at and flag.expires_at < datetime.utcnow():
            return False
        
        return True
    
    async def list_enabled(self, tenant_id: UUID) -> List[FeatureFlag]:
        """List all enabled features for tenant.
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            List of enabled FeatureFlags
        """
        stmt = select(FeatureFlag).where(
            and_(
                FeatureFlag.tenant_id == tenant_id,
                FeatureFlag.enabled == True,
            )
        )
        
        result = await self.db.execute(stmt)
        flags = result.scalars().all()
        
        # Filter out expired flags
        now = datetime.utcnow()
        return [f for f in flags if not f.expires_at or f.expires_at > now]
    
    async def list_all_for_tenant(self, tenant_id: UUID) -> List[FeatureFlag]:
        """List all feature flags for tenant (enabled and disabled).
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            List of all FeatureFlags
        """
        stmt = select(FeatureFlag).where(
            FeatureFlag.tenant_id == tenant_id
        ).order_by(FeatureFlag.feature)
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def enable(
        self,
        tenant_id: UUID,
        feature: str,
        expires_at: Optional[datetime] = None,
        description: Optional[str] = None,
    ) -> FeatureFlag:
        """Enable feature for tenant.
        
        Args:
            tenant_id: Tenant ID
            feature: Feature name
            expires_at: Optional expiration date
            description: Optional description
            
        Returns:
            FeatureFlag object
        """
        flag = await self.get_by_name(tenant_id, feature)
        
        if flag:
            # Update existing
            flag.enabled = True
            flag.expires_at = expires_at
            if description:
                flag.description = description
            await self.db.flush()
            await self.db.refresh(flag)
        else:
            # Create new
            flag = FeatureFlag(
                tenant_id=tenant_id,
                feature=feature,
                enabled=True,
                expires_at=expires_at,
                description=description,
            )
            self.db.add(flag)
            await self.db.flush()
            await self.db.refresh(flag)
        
        return flag
    
    async def disable(
        self,
        tenant_id: UUID,
        feature: str,
    ) -> Optional[FeatureFlag]:
        """Disable feature for tenant.
        
        Args:
            tenant_id: Tenant ID
            feature: Feature name
            
        Returns:
            Updated FeatureFlag or None
        """
        flag = await self.get_by_name(tenant_id, feature)
        
        if not flag:
            return None
        
        flag.enabled = False
        flag.expires_at = None
        await self.db.flush()
        await self.db.refresh(flag)
        return flag
    
    async def create_or_update(
        self,
        tenant_id: UUID,
        feature: str,
        enabled: bool,
        expires_at: Optional[datetime] = None,
        description: Optional[str] = None,
    ) -> FeatureFlag:
        """Create or update feature flag.
        
        Args:
            tenant_id: Tenant ID
            feature: Feature name
            enabled: Enabled status
            expires_at: Optional expiration
            description: Optional description
            
        Returns:
            FeatureFlag object
        """
        flag = await self.get_by_name(tenant_id, feature)
        
        if flag:
            flag.enabled = enabled
            flag.expires_at = expires_at
            if description:
                flag.description = description
            await self.db.flush()
            await self.db.refresh(flag)
        else:
            flag = FeatureFlag(
                tenant_id=tenant_id,
                feature=feature,
                enabled=enabled,
                expires_at=expires_at,
                description=description,
            )
            self.db.add(flag)
            await self.db.flush()
            await self.db.refresh(flag)
        
        return flag
