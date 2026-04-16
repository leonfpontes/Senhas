"""TenantRepository - CRUD + search/filter for platform tenants (T095)."""
from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from sqlalchemy.orm import selectinload

from ..models import Tenant
from ..models.subscriptions import Subscription
from .base import BaseRepository


class TenantRepository(BaseRepository[Tenant]):
    """Repository for Tenant management at platform level.
    
    Provides:
    - CRUD operations for tenants
    - Search and filtering (by slug, name, status)
    - Filtering by subscription plan
    - Listing with pagination
    """
    
    def __init__(self, db: AsyncSession):
        super().__init__(db, Tenant)
    
    async def get_by_id(self, tenant_id: UUID, _tenant_id=None, include_deleted: bool = False) -> Optional[Tenant]:
        """Get tenant by ID (no tenant_id filter since Tenant has no tenant_id column)."""
        stmt = select(Tenant).where(Tenant.id == tenant_id)
        if not include_deleted:
            stmt = stmt.where(Tenant.deleted_at.is_(None))
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_by_slug(self, slug: str) -> Optional[Tenant]:
        """Get tenant by slug.
        
        Args:
            slug: Tenant slug
            
        Returns:
            Tenant object or None
        """
        stmt = select(Tenant).where(
            and_(
                Tenant.slug == slug,
                Tenant.deleted_at.is_(None),
            )
        )
        
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def search(
        self,
        query: Optional[str] = None,
        is_active: Optional[bool] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Tenant]:
        """Search tenants by name or slug.
        
        Args:
            query: Search query (name or slug)
            is_active: Filter by active status
            skip: Pagination offset
            limit: Pagination limit
            
        Returns:
            List of matching tenants
        """
        stmt = select(Tenant).where(Tenant.deleted_at.is_(None))
        
        if query:
            stmt = stmt.where(
                or_(
                    Tenant.name.ilike(f"%{query}%"),
                    Tenant.slug.ilike(f"%{query}%"),
                )
            )
        
        if is_active is not None:
            stmt = stmt.where(Tenant.is_active == is_active)
        
        stmt = stmt.offset(skip).limit(limit).order_by(Tenant.created_at.desc())
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def count_all(self, is_active: Optional[bool] = None) -> int:
        """Count total tenants.
        
        Args:
            is_active: Optional filter by status
            
        Returns:
            Total count
        """
        stmt = select(func.count()).select_from(Tenant).where(Tenant.deleted_at.is_(None))
        
        if is_active is not None:
            stmt = stmt.where(Tenant.is_active == is_active)
        
        result = await self.db.execute(stmt)
        return result.scalar() or 0
    
    async def create(self, **kwargs) -> Tenant:
        """Create new tenant.
        
        Args:
            **kwargs: Tenant fields
            
        Returns:
            Created Tenant object
        """
        tenant = Tenant(**kwargs)
        self.db.add(tenant)
        await self.db.flush()
        await self.db.refresh(tenant)
        return tenant
    
    async def update(self, tenant_id: UUID, **kwargs) -> Optional[Tenant]:
        """Update tenant.
        
        Args:
            tenant_id: Tenant ID
            **kwargs: Fields to update
            
        Returns:
            Updated Tenant object or None
        """
        stmt = select(Tenant).where(
            and_(
                Tenant.id == tenant_id,
                Tenant.deleted_at.is_(None),
            )
        )
        
        result = await self.db.execute(stmt)
        tenant = result.scalar_one_or_none()
        
        if not tenant:
            return None
        
        for key, value in kwargs.items():
            if hasattr(tenant, key):
                setattr(tenant, key, value)
        
        await self.db.flush()
        await self.db.refresh(tenant)
        return tenant
    
    async def soft_delete(self, tenant_id: UUID) -> Optional[Tenant]:
        """Soft delete tenant.
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            Soft-deleted Tenant or None
        """
        stmt = select(Tenant).where(
            and_(
                Tenant.id == tenant_id,
                Tenant.deleted_at.is_(None),
            )
        )
        
        result = await self.db.execute(stmt)
        tenant = result.scalar_one_or_none()
        
        if not tenant:
            return None
        
        tenant.soft_delete()
        await self.db.flush()
        await self.db.refresh(tenant)
        return tenant

    async def get_by_id_with_subscription(self, tenant_id: UUID) -> Optional[Tenant]:
        """Get tenant by ID eagerly loading its subscription.

        Used before hard delete to retrieve stripe IDs before the row vanishes.

        Args:
            tenant_id: Tenant UUID

        Returns:
            Tenant with .subscription populated, or None if not found / soft-deleted.
        """
        stmt = (
            select(Tenant)
            .options(selectinload(Tenant.subscription))
            .where(
                and_(
                    Tenant.id == tenant_id,
                    Tenant.deleted_at.is_(None),
                )
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def hard_delete(self, tenant_id: UUID) -> Optional[Tenant]:
        """Permanently delete a tenant and all cascaded children.

        Relies on SQLAlchemy ORM cascade ("all, delete-orphan") on the Tenant
        model relationships.  The database FK constraints must already allow
        the cascade (audit_logs → SET NULL, estoque_movimentacoes → CASCADE).

        Call flush() before commit in the caller so that the delete is sent
        inside the open transaction and can be rolled back on error.

        Args:
            tenant_id: Tenant UUID

        Returns:
            The Tenant object that was deleted, or None if not found.
        """
        stmt = select(Tenant).where(
            and_(
                Tenant.id == tenant_id,
                Tenant.deleted_at.is_(None),
            )
        )
        result = await self.db.execute(stmt)
        tenant = result.scalar_one_or_none()

        if not tenant:
            return None

        await self.db.delete(tenant)
        await self.db.flush()
        return tenant
