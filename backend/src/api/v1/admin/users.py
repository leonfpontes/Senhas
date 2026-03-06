"""T065: Admin Users - GET/POST/PUT/DELETE /api/v1/admin/users/{id}"""
from fastapi import APIRouter, HTTPException, Depends, status, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from uuid import UUID
import logging

from src.core.database import get_db
from src.models import User, UserRole
from src.repositories.user_repo import UserRepository
from src.security.password import hash_password
from src.services.audit_service import AuditService
from src.api.dependencies import get_current_user
from src.core.errors import (
    InsufficientPermissionsError,
    NotFoundError,
)

router = APIRouter(prefix="/api/v1/admin/users", tags=["admin-users"])
logger = logging.getLogger(__name__)


class UserCreate(BaseModel):
    """User creation request."""
    email: EmailStr
    username: str
    password: str
    role: UserRole = UserRole.OPERATOR


class UserUpdate(BaseModel):
    """User update request."""
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class UserResponse(BaseModel):
    """User response."""
    id: UUID
    email: str
    username: str
    role: str
    is_active: bool
    created_at: str

    class Config:
        from_attributes = True


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Create new user (admin only)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")
    
    # Check if email already exists
    repo = UserRepository(db)
    existing = await repo.get_by_email(current_user.tenant_id, user_data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email já registrado",
        )
    
    # Create user
    hashed_password = hash_password(user_data.password)
    created_user = await repo.create(
        tenant_id=current_user.tenant_id,
        email=user_data.email,
        username=user_data.username,
        password_hash=hashed_password,
        role=user_data.role,
    )
    
    # Log audit
    audit_service = AuditService(db)
    await audit_service.log_create(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="User",
        resource_id=created_user.id,
        details={"email": user_data.email, "role": user_data.role.value},
    )
    
    await db.commit()
    return UserResponse.from_orm(created_user)


@router.get("", response_model=List[UserResponse])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    role_filter: Optional[UserRole] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[UserResponse]:
    """List users (admin only)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")
    
    repo = UserRepository(db)
    
    if role_filter:
        users = await repo.get_by_role(
            current_user.tenant_id,
            role_filter,
            skip=skip,
            limit=limit,
        )
    else:
        users = await repo.list(current_user.tenant_id, skip=skip, limit=limit)
    
    return [UserResponse.from_orm(u) for u in users]


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Get user details (admin only)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")
    
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id, current_user.tenant_id)
    
    if not user:
        raise NotFoundError("Usuário não encontrado")
    
    return UserResponse.from_orm(user)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID = Path(...),
    user_update: UserUpdate = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Update user (admin only)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")
    
    repo = UserRepository(db)
    existing_user = await repo.get_by_id(user_id, current_user.tenant_id)
    
    if not existing_user:
        raise NotFoundError("Usuário não encontrado")
    
    # Update fields
    update_data = user_update.dict(exclude_unset=True, exclude={"password"})
    
    for key, value in update_data.items():
        if hasattr(existing_user, key):
            setattr(existing_user, key, value)
    
    # Handle password separately
    if user_update.password:
        existing_user.password_hash = hash_password(user_update.password)
    
    db.add(existing_user)
    await db.flush()
    await db.refresh(existing_user)
    
    # Log audit
    audit_service = AuditService(db)
    await audit_service.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="User",
        resource_id=user_id,
    )
    
    await db.commit()
    return UserResponse.from_orm(existing_user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete (soft delete) user (admin only)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")
    
    repo = UserRepository(db)
    deleted = await repo.delete_soft(user_id, current_user.tenant_id)
    
    if not deleted:
        raise NotFoundError("Usuário não encontrado")
    
    # Log audit
    audit_service = AuditService(db)
    await audit_service.log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="User",
        resource_id=user_id,
    )
    
    await db.commit()
