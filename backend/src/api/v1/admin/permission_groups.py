"""API endpoints for managing permission groups (fine-grained RBAC)."""
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
import logging

from fastapi import APIRouter, Depends, Path, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.database import get_db
from ....core.errors import InsufficientPermissionsError, NotFoundError, ConflictError
from ....models import User, PermissionFeature, GroupPermission
from ....repositories.permission_group_repo import PermissionGroupRepository
from ....services.permission_service import PermissionService
from ....services.audit_service import AuditService
from ....api.dependencies import get_current_user

router = APIRouter(prefix="/api/v1/admin/permission-groups", tags=["admin-permission-groups"])
logger = logging.getLogger(__name__)


# --- Schemas ---

class PermissionGroupCreate(BaseModel):
    name: str
    description: Optional[str] = None


class PermissionGroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class GroupPermissionSchema(BaseModel):
    feature: PermissionFeature
    can_view: bool = False
    can_insert: bool = False
    can_edit: bool = False
    can_delete: bool = False


class SetGroupPermissionsRequest(BaseModel):
    permissions: List[GroupPermissionSchema]
    version: int


class AddMemberRequest(BaseModel):
    user_id: UUID


class PermissionGroupResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    description: Optional[str] = None
    version: int
    created_at: datetime
    updated_at: datetime
    members_count: int
    features_configured_count: int

    class Config:
        from_attributes = True


class GroupPermissionResponse(BaseModel):
    id: UUID
    group_id: UUID
    feature: str
    can_view: bool
    can_insert: bool
    can_edit: bool
    can_delete: bool

    class Config:
        from_attributes = True


class GroupMemberResponse(BaseModel):
    id: UUID
    email: str
    username: str

    class Config:
        from_attributes = True


# --- Endpoints ---

@router.get("", response_model=List[PermissionGroupResponse])
async def list_groups(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[PermissionGroupResponse]:
    """List all permission groups for the current tenant (admin only)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = PermissionGroupRepository(db)
    groups = await repo.list(current_user.tenant_id, skip=skip, limit=limit)

    response_list = []
    for g in groups:
        members_count = await repo.get_members_count(g.id, current_user.tenant_id)
        
        # Count features configured (G10: health/configured count)
        stmt = select(func.count(GroupPermission.id)).where(
            (GroupPermission.group_id == g.id) &
            (
                (GroupPermission.can_view == True) |
                (GroupPermission.can_insert == True) |
                (GroupPermission.can_edit == True) |
                (GroupPermission.can_delete == True)
            )
        )
        res = await db.execute(stmt)
        configured_count = res.scalar() or 0

        response_list.append(
            PermissionGroupResponse(
                id=g.id,
                tenant_id=g.tenant_id,
                name=g.name,
                description=g.description,
                version=g.version,
                created_at=g.created_at,
                updated_at=g.updated_at,
                members_count=members_count,
                features_configured_count=configured_count,
            )
        )

    return response_list


@router.post("", response_model=PermissionGroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    request: PermissionGroupCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PermissionGroupResponse:
    """Create a new permission group (admin only)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = PermissionGroupRepository(db)
    
    # Check duplicate name
    dup_stmt = select(repo.model).where(
        (repo.model.tenant_id == current_user.tenant_id) &
        (func.lower(repo.model.name) == func.lower(request.name)) &
        (repo.model.deleted_at.is_(None))
    )
    dup_res = await db.execute(dup_stmt)
    if dup_res.scalar_one_or_none():
        raise ConflictError("Já existe um grupo com este nome.")

    group = await repo.create(
        tenant_id=current_user.tenant_id,
        name=request.name,
        description=request.description,
        version=1,
    )

    # Log audit explicitly (T11)
    audit_service = AuditService(db)
    await audit_service.log_create(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="PermissionGroup",
        resource_id=group.id,
        details={"name": request.name, "description": request.description},
    )

    return PermissionGroupResponse(
        id=group.id,
        tenant_id=group.tenant_id,
        name=group.name,
        description=group.description,
        version=group.version,
        created_at=group.created_at,
        updated_at=group.updated_at,
        members_count=0,
        features_configured_count=0,
    )


@router.get("/me/permissions")
async def get_my_permissions(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Dict[str, bool]]:
    """Get consolidated effective permissions for the logged-in user.
    
    Includes Cache-Control headers to optimize client requests (T13).
    """
    service = PermissionService(db)
    perms = await service.get_user_effective_permissions(current_user.id, current_user.tenant_id)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return perms


@router.get("/{group_id}", response_model=PermissionGroupResponse)
async def get_group(
    group_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PermissionGroupResponse:
    """Get details of a permission group (admin only)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = PermissionGroupRepository(db)
    group = await repo.get_by_id(group_id, current_user.tenant_id)
    if not group:
        raise NotFoundError("Grupo de permissão")

    members_count = await repo.get_members_count(group_id, current_user.tenant_id)
    
    # Configured features count
    stmt = select(func.count(GroupPermission.id)).where(
        (GroupPermission.group_id == group.id) &
        (
            (GroupPermission.can_view == True) |
            (GroupPermission.can_insert == True) |
            (GroupPermission.can_edit == True) |
            (GroupPermission.can_delete == True)
        )
    )
    res = await db.execute(stmt)
    configured_count = res.scalar() or 0

    return PermissionGroupResponse(
        id=group.id,
        tenant_id=group.tenant_id,
        name=group.name,
        description=group.description,
        version=group.version,
        created_at=group.created_at,
        updated_at=group.updated_at,
        members_count=members_count,
        features_configured_count=configured_count,
    )


@router.put("/{group_id}", response_model=PermissionGroupResponse)
async def update_group(
    group_id: UUID = Path(...),
    request: PermissionGroupUpdate = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PermissionGroupResponse:
    """Update name and description of a permission group (admin only)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = PermissionGroupRepository(db)
    group = await repo.get_by_id(group_id, current_user.tenant_id)
    if not group:
        raise NotFoundError("Grupo de permissão")

    previous_state = {"name": group.name, "description": group.description}
    update_data = request.dict(exclude_unset=True)

    # Check duplicate name on rename
    if "name" in update_data and update_data["name"] != group.name:
        dup_stmt = select(repo.model).where(
            (repo.model.tenant_id == current_user.tenant_id) &
            (func.lower(repo.model.name) == func.lower(update_data["name"])) &
            (repo.model.deleted_at.is_(None))
        )
        dup_res = await db.execute(dup_stmt)
        if dup_res.scalar_one_or_none():
            raise ConflictError("Já existe um grupo com este nome.")

    updated_group = await repo.update(group_id, current_user.tenant_id, **update_data)

    # Log audit explicitly (T11)
    audit_service = AuditService(db)
    await audit_service.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="PermissionGroup",
        resource_id=group_id,
        previous_state=previous_state,
        new_state=update_data,
    )

    members_count = await repo.get_members_count(group_id, current_user.tenant_id)
    # Configured count
    stmt = select(func.count(GroupPermission.id)).where(
        (GroupPermission.group_id == group_id) &
        (
            (GroupPermission.can_view == True) |
            (GroupPermission.can_insert == True) |
            (GroupPermission.can_edit == True) |
            (GroupPermission.can_delete == True)
        )
    )
    res = await db.execute(stmt)
    configured_count = res.scalar() or 0

    return PermissionGroupResponse(
        id=updated_group.id,
        tenant_id=updated_group.tenant_id,
        name=updated_group.name,
        description=updated_group.description,
        version=updated_group.version,
        created_at=updated_group.created_at,
        updated_at=updated_group.updated_at,
        members_count=members_count,
        features_configured_count=configured_count,
    )


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: UUID = Path(...),
    force: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete (soft delete) a group (admin only).
    
    If the group contains members, raises 409 Conflict unless force=true is passed (G2).
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = PermissionGroupRepository(db)
    group = await repo.get_by_id(group_id, current_user.tenant_id)
    if not group:
        raise NotFoundError("Grupo de permissão")

    members_count = await repo.get_members_count(group_id, current_user.tenant_id)
    if members_count > 0 and not force:
        raise ConflictError(
            f"O grupo possui {members_count} membros ativos.",
            details={"member_count": members_count, "error_code": "GROUP_HAS_MEMBERS"},
        )

    # Log audit explicitly (T11)
    audit_service = AuditService(db)
    await audit_service.log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="PermissionGroup",
        resource_id=group_id,
        previous_state={"name": group.name, "description": group.description, "members_count": members_count},
    )

    # Clean up memberships for this group to avoid leaving orphans
    from ....models import UserGroupMembership
    from sqlalchemy import delete as sql_delete
    await db.execute(sql_delete(UserGroupMembership).where(UserGroupMembership.group_id == group_id))

    # Perform soft delete on the group
    await repo.delete(group_id, current_user.tenant_id, soft=True)
    await db.commit()


@router.get("/{group_id}/permissions", response_model=List[GroupPermissionResponse])
async def get_group_permissions(
    group_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[GroupPermissionResponse]:
    """List all permissions configured for a group (admin only)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = PermissionGroupRepository(db)
    group = await repo.get_with_permissions(group_id, current_user.tenant_id)
    if not group:
        raise NotFoundError("Grupo de permissão")

    return [GroupPermissionResponse.from_orm(p) for p in group.permissions]


@router.put("/{group_id}/permissions", response_model=PermissionGroupResponse)
async def set_group_permissions(
    group_id: UUID = Path(...),
    request: SetGroupPermissionsRequest = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PermissionGroupResponse:
    """Replace all permissions of a group, using optimistic locking validation (T3) (admin only)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = PermissionGroupRepository(db)
    
    # Load original state for auditing
    original_group = await repo.get_with_permissions(group_id, current_user.tenant_id)
    if not original_group:
        raise NotFoundError("Grupo de permissão")
        
    prev_perms = [
        {"feature": p.feature.value, "view": p.can_view, "insert": p.can_insert, "edit": p.can_edit, "delete": p.can_delete}
        for p in original_group.permissions
    ]

    new_perms = [p.dict() for p in request.permissions]

    # Save permissions inside repository
    updated_group = await repo.set_group_permissions(
        group_id=group_id,
        tenant_id=current_user.tenant_id,
        permissions=new_perms,
        expected_version=request.version,
    )

    # Log audit explicitly (T11)
    audit_service = AuditService(db)
    await audit_service.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="PermissionGroupPermissions",
        resource_id=group_id,
        previous_state={"permissions": prev_perms},
        new_state={"permissions": new_perms},
    )

    members_count = await repo.get_members_count(group_id, current_user.tenant_id)
    # Configured count
    stmt = select(func.count(GroupPermission.id)).where(
        (GroupPermission.group_id == group_id) &
        (
            (GroupPermission.can_view == True) |
            (GroupPermission.can_insert == True) |
            (GroupPermission.can_edit == True) |
            (GroupPermission.can_delete == True)
        )
    )
    res = await db.execute(stmt)
    configured_count = res.scalar() or 0

    return PermissionGroupResponse(
        id=updated_group.id,
        tenant_id=updated_group.tenant_id,
        name=updated_group.name,
        description=updated_group.description,
        version=updated_group.version,
        created_at=updated_group.created_at,
        updated_at=updated_group.updated_at,
        members_count=members_count,
        features_configured_count=configured_count,
    )


@router.get("/{group_id}/members", response_model=List[GroupMemberResponse])
async def list_group_members(
    group_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[GroupMemberResponse]:
    """List all users belonging to a group (admin only)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = PermissionGroupRepository(db)
    # Check group exists
    group = await repo.get_by_id(group_id, current_user.tenant_id)
    if not group:
        raise NotFoundError("Grupo de permissão")

    members = await repo.list_members(group_id, current_user.tenant_id)
    return [GroupMemberResponse.from_orm(m) for m in members]


@router.post("/{group_id}/members", response_model=GroupMemberResponse)
async def add_group_member(
    group_id: UUID = Path(...),
    request: AddMemberRequest = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GroupMemberResponse:
    """Add a user to a group, validating cross-tenant bounds (T2) (admin only)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = PermissionGroupRepository(db)
    
    # repo.add_member does verification of user tenant matches current_user.tenant_id
    membership = await repo.add_member(
        group_id=group_id,
        user_id=request.user_id,
        tenant_id=current_user.tenant_id,
    )

    # Fetch added user details to return and log
    user_stmt = select(User).where(User.id == request.user_id)
    user_res = await db.execute(user_stmt)
    user = user_res.scalar_one()

    # Log audit explicitly (T11)
    audit_service = AuditService(db)
    await audit_service.log_create(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="UserGroupMembership",
        resource_id=membership.id,
        details={"group_id": str(group_id), "user_id": str(request.user_id), "username": user.username},
    )

    return GroupMemberResponse(id=user.id, email=user.email, username=user.username)


@router.delete("/{group_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_group_member(
    group_id: UUID = Path(...),
    user_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a user from a permission group (admin only)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    repo = PermissionGroupRepository(db)
    removed = await repo.remove_member(group_id, user_id, current_user.tenant_id)
    if not removed:
        raise NotFoundError("Associação de usuário não encontrada neste grupo")

    # Fetch removed user details for logging
    user_stmt = select(User).where(User.id == user_id)
    user_res = await db.execute(user_stmt)
    user = user_res.scalar_one_or_none()
    username = user.username if user else "Deletado"

    # Log audit explicitly (T11)
    audit_service = AuditService(db)
    await audit_service.log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="UserGroupMembership",
        resource_id=user_id,  # references user removed
        previous_state={"group_id": str(group_id), "user_id": str(user_id), "username": username},
    )
