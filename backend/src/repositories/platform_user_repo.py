"""PlatformUserRepository - Platform-level SUPER_ADMIN user management (T096)."""
from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func

from ..models import User, UserRole
from .base import BaseRepository


class PlatformUserRepository:
    """Repository for global SUPER_ADMIN user management.
    
    Unlike UserRepository (tenant-scoped), this manages platform-level SUPER_ADMIN users
    who have access to all tenants and can manage the platform.
    
    Provides:
    - CRUD for SUPER_ADMIN users (tenant_id = NULL)
    - Search and filtering
    - Role management
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.model = User
    
    async def get_by_id(self, user_id: UUID) -> Optional[User]:
        """Get platform user (SUPER_ADMIN) by ID.
        
        Args:
            user_id: User ID
            
        Returns:
            User object (SUPER_ADMIN only) or None
        """
        stmt = select(User).where(
            and_(
                User.id == user_id,
                User.role == UserRole.SUPER_ADMIN,
                User.tenant_id.is_(None),  # Global admin
                User.deleted_at.is_(None),
            )
        )
        
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_by_email(self, email: str) -> Optional[User]:
        """Get SUPER_ADMIN user by email — used for uniqueness check.

        Only checks platform users (tenant_id IS NULL). Tenant users with the
        same email are allowed to coexist with a SUPER_ADMIN account.
        
        Args:
            email: User email
            
        Returns:
            User object or None
        """
        stmt = select(User).where(
            and_(
                User.email == email,
                User.tenant_id.is_(None),
                User.deleted_at.is_(None),
            )
        )
        
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def list_all(
        self,
        skip: int = 0,
        limit: int = 100,
    ) -> List[User]:
        """List all platform SUPER_ADMIN users.
        
        Args:
            skip: Pagination offset
            limit: Pagination limit
            
        Returns:
            List of SUPER_ADMIN users
        """
        stmt = select(User).where(
            and_(
                User.role == UserRole.SUPER_ADMIN,
                User.tenant_id.is_(None),
                User.deleted_at.is_(None),
            )
        ).offset(skip).limit(limit).order_by(User.created_at.desc())
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def count_all(self) -> int:
        """Count total platform SUPER_ADMIN users.
        
        Returns:
            Total count
        """
        stmt = select(func.count()).select_from(User).where(
            and_(
                User.role == UserRole.SUPER_ADMIN,
                User.tenant_id.is_(None),
                User.deleted_at.is_(None),
            )
        )
        
        result = await self.db.execute(stmt)
        return result.scalar() or 0
    
    async def create(
        self,
        email: str,
        username: str,
        password_hash: str,
        is_active: bool = True,
    ) -> User:
        """Create new platform SUPER_ADMIN user.
        
        Args:
            email: User email
            username: Username
            password_hash: Hashed password
            is_active: User active status
            
        Returns:
            Created User object
        """
        user = User(
            email=email,
            username=username,
            password_hash=password_hash,
            role=UserRole.SUPER_ADMIN,
            tenant_id=None,  # Global admin
            is_active=is_active,
        )
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user
    
    async def update(self, user_id: UUID, **kwargs) -> Optional[User]:
        """Update platform user.
        
        Args:
            user_id: User ID
            **kwargs: Fields to update
            
        Returns:
            Updated User object or None
        """
        stmt = select(User).where(
            and_(
                User.id == user_id,
                User.role == UserRole.SUPER_ADMIN,
                User.tenant_id.is_(None),
                User.deleted_at.is_(None),
            )
        )
        
        result = await self.db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            return None
        
        # Don't allow changing role or tenant_id
        if "role" in kwargs:
            del kwargs["role"]
        if "tenant_id" in kwargs:
            del kwargs["tenant_id"]
        
        for key, value in kwargs.items():
            if hasattr(user, key):
                setattr(user, key, value)
        
        await self.db.flush()
        await self.db.refresh(user)
        return user
    
    async def soft_delete(self, user_id: UUID) -> Optional[User]:
        """Soft delete platform user.
        
        Args:
            user_id: User ID
            
        Returns:
            Soft-deleted User or None
        """
        stmt = select(User).where(
            and_(
                User.id == user_id,
                User.role == UserRole.SUPER_ADMIN,
                User.tenant_id.is_(None),
                User.deleted_at.is_(None),
            )
        )
        
        result = await self.db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            return None
        
        user.soft_delete()
        await self.db.flush()
        await self.db.refresh(user)
        return user
