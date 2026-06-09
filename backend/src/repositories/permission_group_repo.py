"""Repository for permission groups and user memberships (RBAC)."""
from typing import List, Optional, Dict, Any
from uuid import UUID
import sqlalchemy as sa
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import NotFoundError, ConflictError, ForbiddenError
from ..models import User, PermissionGroup, GroupPermission, UserGroupMembership, PermissionFeature
from .base import BaseRepository


class PermissionGroupRepository(BaseRepository[PermissionGroup]):
    """Repository for managing permission groups, fine-grained feature permissions, and user memberships."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, PermissionGroup)

    async def list(
        self,
        tenant_id: UUID,
        skip: int = 0,
        limit: int = 100,
        include_deleted: bool = False,
    ) -> List[PermissionGroup]:
        """List permission groups sorted alphabetically by name (G14)."""
        stmt = select(self.model).where(self.model.tenant_id == tenant_id)
        if not include_deleted:
            stmt = stmt.where(self.model.deleted_at.is_(None))
        stmt = stmt.order_by(self.model.name.asc()).offset(skip).limit(limit)
        
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_with_permissions(self, group_id: UUID, tenant_id: UUID) -> Optional[PermissionGroup]:
        """Get a single group and eagerly load its permissions."""
        stmt = (
            select(self.model)
            .options(selectinload(self.model.permissions))
            .where((self.model.id == group_id) & (self.model.tenant_id == tenant_id) & (self.model.deleted_at.is_(None)))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_user_groups(self, user_id: UUID, tenant_id: UUID) -> List[PermissionGroup]:
        """List all active groups a user is currently a member of."""
        stmt = (
            select(self.model)
            .join(UserGroupMembership, UserGroupMembership.group_id == self.model.id)
            .where(
                (UserGroupMembership.user_id == user_id)
                & (UserGroupMembership.tenant_id == tenant_id)
                & (self.model.deleted_at.is_(None))
            )
            .order_by(self.model.name.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_user_all_permissions(self, user_id: UUID, tenant_id: UUID) -> Dict[PermissionFeature, Dict[str, bool]]:
        """Fetch consolidated permissions for a user across all features in a single JOIN query (T5).
        
        Uses SQL MAX() to implement OR consolidation logic directly in the database.
        """
        stmt = (
            select(
                GroupPermission.feature,
                func.max(GroupPermission.can_view.cast(sa.Integer)).label("can_view"),
                func.max(GroupPermission.can_insert.cast(sa.Integer)).label("can_insert"),
                func.max(GroupPermission.can_edit.cast(sa.Integer)).label("can_edit"),
                func.max(GroupPermission.can_delete.cast(sa.Integer)).label("can_delete"),
            )
            .select_from(UserGroupMembership)
            .join(GroupPermission, GroupPermission.group_id == UserGroupMembership.group_id)
            .join(PermissionGroup, PermissionGroup.id == UserGroupMembership.group_id)
            .where(
                (UserGroupMembership.user_id == user_id)
                & (UserGroupMembership.tenant_id == tenant_id)
                & (PermissionGroup.deleted_at.is_(None))
            )
            .group_by(GroupPermission.feature)
        )
        
        result = await self.db.execute(stmt)
        rows = result.all()
        
        perms = {}
        for row in rows:
            # Map the feature and convert integer flags back to booleans
            perms[row.feature] = {
                "view": bool(row.can_view),
                "insert": bool(row.can_insert),
                "edit": bool(row.can_edit),
                "delete": bool(row.can_delete),
            }
        return perms

    async def get_user_permissions(self, user_id: UUID, tenant_id: UUID, feature: PermissionFeature) -> Dict[str, bool]:
        """Fetch consolidated permissions for a user on a specific feature."""
        stmt = (
            select(
                func.max(GroupPermission.can_view.cast(sa.Integer)).label("can_view"),
                func.max(GroupPermission.can_insert.cast(sa.Integer)).label("can_insert"),
                func.max(GroupPermission.can_edit.cast(sa.Integer)).label("can_edit"),
                func.max(GroupPermission.can_delete.cast(sa.Integer)).label("can_delete"),
            )
            .select_from(UserGroupMembership)
            .join(GroupPermission, GroupPermission.group_id == UserGroupMembership.group_id)
            .join(PermissionGroup, PermissionGroup.id == UserGroupMembership.group_id)
            .where(
                (UserGroupMembership.user_id == user_id)
                & (UserGroupMembership.tenant_id == tenant_id)
                & (GroupPermission.feature == feature)
                & (PermissionGroup.deleted_at.is_(None))
            )
        )
        result = await self.db.execute(stmt)
        row = result.first()
        
        if not row or row.can_view is None:
            return {"view": False, "insert": False, "edit": False, "delete": False}
            
        return {
            "view": bool(row.can_view),
            "insert": bool(row.can_insert),
            "edit": bool(row.can_edit),
            "delete": bool(row.can_delete),
        }

    async def set_group_permissions(
        self, group_id: UUID, tenant_id: UUID, permissions: List[Dict[str, Any]], expected_version: int
    ) -> PermissionGroup:
        """Replace all permissions for a group with optimistic locking validation (T3)."""
        # Fetch group
        group = await self.get_by_id(group_id, tenant_id)
        if not group:
            raise NotFoundError("Grupo de permissão")
            
        # Optimistic locking check (T3)
        if group.version != expected_version:
            raise ConflictError("As permissões deste grupo foram alteradas por outro usuário. Recarregue a página.")

        # Delete existing permissions for the group
        delete_stmt = delete(GroupPermission).where(GroupPermission.group_id == group_id)
        await self.db.execute(delete_stmt)

        # Insert new permissions
        for perm_data in permissions:
            gp = GroupPermission(
                group_id=group_id,
                feature=perm_data["feature"],
                can_view=perm_data.get("can_view", False),
                can_insert=perm_data.get("can_insert", False),
                can_edit=perm_data.get("can_edit", False),
                can_delete=perm_data.get("can_delete", False),
            )
            self.db.add(gp)

        # Increment version (T3)
        group.version += 1
        
        await self.db.commit()
        await self.db.refresh(group)
        return group

    async def add_member(self, group_id: UUID, user_id: UUID, tenant_id: UUID) -> UserGroupMembership:
        """Add a user to a permission group, performing cross-tenant validation (T2) and soft-deleted validation (T6)."""
        # Fetch group
        group = await self.get_by_id(group_id, tenant_id)
        if not group:
            raise NotFoundError("Grupo de permissão")

        # Fetch and validate user (T2)
        user_stmt = select(User).where(
            (User.id == user_id)
            & (User.tenant_id == tenant_id)
            & (User.deleted_at.is_(None))  # Cannot add soft-deleted users (T6)
        )
        user_result = await self.db.execute(user_stmt)
        user = user_result.scalar_one_or_none()
        if not user:
            raise NotFoundError("Usuário ativo")

        # Prevent adding administrators to groups (as they bypass group checks anyway)
        if user.is_admin:
            raise ForbiddenError("Administradores não precisam pertencer a grupos de permissão.")

        # Check duplicate membership (T12)
        existing_stmt = select(UserGroupMembership).where(
            (UserGroupMembership.group_id == group_id) & (UserGroupMembership.user_id == user_id)
        )
        existing_result = await self.db.execute(existing_stmt)
        if existing_result.scalar_one_or_none():
            raise ConflictError("Este usuário já pertence a este grupo.")

        # Add membership
        membership = UserGroupMembership(group_id=group_id, user_id=user_id, tenant_id=tenant_id)
        self.db.add(membership)
        await self.db.commit()
        await self.db.refresh(membership)
        return membership

    async def remove_member(self, group_id: UUID, user_id: UUID, tenant_id: UUID) -> bool:
        """Remove a user from a permission group."""
        stmt = select(UserGroupMembership).where(
            (UserGroupMembership.group_id == group_id)
            & (UserGroupMembership.user_id == user_id)
            & (UserGroupMembership.tenant_id == tenant_id)
        )
        result = await self.db.execute(stmt)
        membership = result.scalar_one_or_none()
        if not membership:
            return False
            
        await self.db.delete(membership)
        await self.db.commit()
        return True

    async def list_members(self, group_id: UUID, tenant_id: UUID) -> List[User]:
        """List active users that belong to a group, filtering out soft-deleted users (T6)."""
        stmt = (
            select(User)
            .join(UserGroupMembership, UserGroupMembership.user_id == User.id)
            .where(
                (UserGroupMembership.group_id == group_id)
                & (UserGroupMembership.tenant_id == tenant_id)
                & (User.deleted_at.is_(None))  # T6
            )
            .order_by(User.username.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_members_count(self, group_id: UUID, tenant_id: UUID) -> int:
        """Count active users in a group."""
        stmt = (
            select(func.count(User.id))
            .join(UserGroupMembership, UserGroupMembership.user_id == User.id)
            .where(
                (UserGroupMembership.group_id == group_id)
                & (UserGroupMembership.tenant_id == tenant_id)
                & (User.deleted_at.is_(None))
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0
