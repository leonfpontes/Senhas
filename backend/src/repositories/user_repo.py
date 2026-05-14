"""T051: UserRepository - CRUD + filtering for admin users."""
from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from ..models import User, UserRole
from .base import BaseRepository


class UserRepository(BaseRepository[User]):
    """Repository for User management.
    
    Provides:
    - CRUD operations
    - Filtering by role (admin, operator, etc.)
    - Email uniqueness checking
    - User activation/deactivation
    """
    
    def __init__(self, db: AsyncSession):
        super().__init__(db, User)
    
    async def create(self, tenant_id: UUID, **kwargs) -> User:
        """Create new user.
        
        Args:
            tenant_id: Tenant ID
            **kwargs: User fields (email, username, role, etc.)
            
        Returns:
            Created User object
        """
        user = User(tenant_id=tenant_id, **kwargs)
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user
    
    async def get_by_email(self, tenant_id: UUID, email: str) -> Optional[User]:
        """Get user by email (tenant-scoped).
        
        Args:
            tenant_id: Tenant ID
            email: User email
            
        Returns:
            User object or None
        """
        stmt = select(User).where(
            and_(
                User.tenant_id == tenant_id,
                User.email == email,
                User.deleted_at.is_(None),
            )
        )
        
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_email_including_deleted(self, tenant_id: UUID, email: str) -> Optional[User]:
        """Get user by email including soft-deleted records (tenant-scoped)."""
        stmt = select(User).where(
            and_(
                User.tenant_id == tenant_id,
                User.email == email,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_admins(self, tenant_id: UUID) -> List[User]:
        """Get all admins for a tenant.
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            List of admin User objects
        """
        stmt = select(User).where(
            and_(
                User.tenant_id == tenant_id,
                User.role.in_([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
                User.deleted_at.is_(None),
            )
        ).order_by(User.created_at.desc())
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def get_by_role(
        self,
        tenant_id: UUID,
        role: UserRole,
        skip: int = 0,
        limit: int = 50,
    ) -> List[User]:
        """Get users by role.
        
        Args:
            tenant_id: Tenant ID
            role: UserRole (ADMIN, OPERATOR, etc.)
            skip: Pagination offset
            limit: Pagination limit
            
        Returns:
            List of User objects
        """
        stmt = select(User).where(
            and_(
                User.tenant_id == tenant_id,
                User.role == role,
                User.deleted_at.is_(None),
            )
        ).order_by(User.email).offset(skip).limit(limit)
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def get_active_users(self, tenant_id: UUID) -> List[User]:
        """Get all active users for a tenant.
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            List of active User objects
        """
        stmt = select(User).where(
            and_(
                User.tenant_id == tenant_id,
                User.is_active == True,
                User.deleted_at.is_(None),
            )
        ).order_by(User.email)
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def deactivate(self, user_id: UUID, tenant_id: UUID) -> bool:
        """Deactivate a user.
        
        Args:
            user_id: User ID
            tenant_id: Tenant ID
            
        Returns:
            True if deactivated, False if not found
        """
        user = await self.get_by_id(user_id, tenant_id)
        if not user:
            return False
        
        user.is_active = False
        self.db.add(user)
        await self.db.flush()
        return True
    
    async def activate(self, user_id: UUID, tenant_id: UUID) -> bool:
        """Activate a user.
        
        Args:
            user_id: User ID
            tenant_id: Tenant ID
            
        Returns:
            True if activated, False if not found
        """
        user = await self.get_by_id(user_id, tenant_id)
        if not user:
            return False
        
        user.is_active = True
        self.db.add(user)
        await self.db.flush()
        return True
    
    async def update_role(
        self,
        user_id: UUID,
        tenant_id: UUID,
        role: UserRole,
    ) -> Optional[User]:
        """Update user role.
        
        Args:
            user_id: User ID
            tenant_id: Tenant ID
            role: New UserRole
            
        Returns:
            Updated User or None
        """
        user = await self.get_by_id(user_id, tenant_id)
        if not user:
            return None
        
        user.role = role
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user
    
    async def delete_soft(self, user_id: UUID, tenant_id: UUID) -> bool:
        """Soft delete a user.
        
        Args:
            user_id: User ID
            tenant_id: Tenant ID
            
        Returns:
            True if deleted, False if not found
        """
        user = await self.get_by_id(user_id, tenant_id)
        if not user:
            return False
        
        user.soft_delete()
        self.db.add(user)
        await self.db.flush()
        return True
