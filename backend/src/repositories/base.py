"""Base repository pattern for database access (T028)."""
from typing import TypeVar, Generic, List, Optional, Type
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete
from sqlalchemy.orm import DeclarativeBase

from ..core.errors import NotFoundError

T = TypeVar("T", bound=DeclarativeBase)


class BaseRepository(Generic[T]):
    """Base repository providing async CRUD operations with automatic tenant filtering.
    
    This repository ensures all operations are automatically scoped to a tenant,
    implementing multi-tenant data isolation at the repository layer.
    
    All methods are async/await compatible with SQLAlchemy 2.0.
    """
    
    def __init__(self, db: AsyncSession, model: Type[T]):
        """Initialize repository.
        
        Args:
            db: Async database session
            model: SQLAlchemy model class
        """
        self.db = db
        self.model = model
    
    async def get_by_id(
        self,
        model_id: UUID,
        tenant_id: UUID,
        include_deleted: bool = False,
    ) -> Optional[T]:
        """Get single record by ID (auto-filtered by tenant).
        
        Args:
            model_id: Record ID
            tenant_id: Tenant ID for filtering
            include_deleted: Include soft-deleted records
            
        Returns:
            Model instance or None
        """
        stmt = select(self.model).where(
            (self.model.id == model_id) & (self.model.tenant_id == tenant_id)
        )
        
        if not include_deleted and hasattr(self.model, "deleted_at"):
            stmt = stmt.where(self.model.deleted_at.is_(None))
        
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def list(
        self,
        tenant_id: UUID,
        skip: int = 0,
        limit: int = 100,
        include_deleted: bool = False,
    ) -> List[T]:
        """List records with pagination (auto-filtered by tenant).
        
        Args:
            tenant_id: Tenant ID for filtering
            skip: Number of records to skip
            limit: Maximum records to return
            include_deleted: Include soft-deleted records
            
        Returns:
            List of model instances
        """
        stmt = select(self.model).where(self.model.tenant_id == tenant_id)
        
        if not include_deleted and hasattr(self.model, "deleted_at"):
            stmt = stmt.where(self.model.deleted_at.is_(None))
        
        stmt = stmt.offset(skip).limit(limit)
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def create(
        self,
        tenant_id: UUID,
        **data,
    ) -> T:
        """Create new record.
        
        Args:
            tenant_id: Tenant ID
            **data: Model fields
            
        Returns:
            Created model instance
        """
        obj = self.model(tenant_id=tenant_id, **data)
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj
    
    async def update(
        self,
        model_id: UUID,
        tenant_id: UUID,
        **data,
    ) -> Optional[T]:
        """Update record (auto-filtered by tenant).
        
        Args:
            model_id: Record ID
            tenant_id: Tenant ID
            **data: Fields to update
            
        Returns:
            Updated model instance or None
        """
        # Verify record exists and belongs to tenant
        obj = await self.get_by_id(model_id, tenant_id)
        if not obj:
            return None
        
        # Update fields
        for key, value in data.items():
            if hasattr(obj, key):
                setattr(obj, key, value)
        
        await self.db.commit()
        await self.db.refresh(obj)
        return obj
    
    async def delete(
        self,
        model_id: UUID,
        tenant_id: UUID,
        soft: bool = True,
    ) -> bool:
        """Delete record (hard or soft delete).
        
        Args:
            model_id: Record ID
            tenant_id: Tenant ID
            soft: Use soft delete if True, hard delete if False
            
        Returns:
            True if deleted, False if not found
        """
        obj = await self.get_by_id(model_id, tenant_id)
        if not obj:
            return False
        
        if soft and hasattr(obj, "soft_delete"):
            obj.soft_delete()
            await self.db.commit()
        else:
            await self.db.delete(obj)
            await self.db.commit()
        
        return True
    
    async def count(
        self,
        tenant_id: UUID,
        include_deleted: bool = False,
    ) -> int:
        """Count records (auto-filtered by tenant).
        
        Args:
            tenant_id: Tenant ID
            include_deleted: Include soft-deleted records
            
        Returns:
            Record count
        """
        stmt = select(func.count(self.model.id)).where(
            self.model.tenant_id == tenant_id
        )
        
        if not include_deleted and hasattr(self.model, "deleted_at"):
            stmt = stmt.where(self.model.deleted_at.is_(None))
        
        result = await self.db.execute(stmt)
        return result.scalar() or 0
    
    async def exists(
        self,
        model_id: UUID,
        tenant_id: UUID,
        include_deleted: bool = False,
    ) -> bool:
        """Check if record exists (auto-filtered by tenant).
        
        Args:
            model_id: Record ID
            tenant_id: Tenant ID
            include_deleted: Include soft-deleted records
            
        Returns:
            True if exists, False otherwise
        """
        obj = await self.get_by_id(model_id, tenant_id, include_deleted)
        return obj is not None
