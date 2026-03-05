"""FastAPI dependency injection utilities (T022)."""
from fastapi import Request, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import uuid

from ..core.database import get_db
from ..core.errors import (
    UnauthorizedError,
    InsufficientPermissionsError,
    MultiTenantViolationError,
    NotFoundError,
)
from ..models import User, UserRole
from ..middleware.tenant_context import get_tenant_id
from sqlalchemy import select


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Get current authenticated user from JWT token.
    
    Args:
        request: FastAPI request with JWT token data
        db: Database session
        
    Returns:
        Current User object
        
    Raises:
        UnauthorizedError: If user not found or token invalid
    """
    # Get user_id from JWT token (set by jwt_middleware)
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise UnauthorizedError("Usuário não identificado")
    
    # Get user from database
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user or not user.is_active:
        raise UnauthorizedError("Usuário não encontrado ou inativo")
    
    return user


async def get_tenant_from_request(request: Request) -> uuid.UUID:
    """Get tenant_id from request context (set by tenant_context_middleware).
    
    Args:
        request: FastAPI request
        
    Returns:
        Tenant ID
        
    Raises:
        MultiTenantViolationError: If tenant_id not in context
    """
    return get_tenant_id(request)


async def require_role(
    required_role: UserRole,
) -> callable:
    """Dependency factory for role-based access control (RBAC).
    
    Usage in endpoint:
        @router.get("/admin-only")
        async def admin_endpoint(
            user: User = Depends(get_current_user),
            _: None = Depends(require_role(UserRole.ADMIN)),
        ):
            ...
    
    Args:
        required_role: Required user role
        
    Returns:
        Dependency function
    """
    async def check_role(user: User = Depends(get_current_user)):
        # Super admin has access to everything
        if user.role == UserRole.SUPER_ADMIN:
            return None
        
        # Check if user has required role or higher
        if user.role != required_role and required_role != UserRole.OPERATOR:
            raise InsufficientPermissionsError(required_role.value)
        
        return None
    
    return check_role


async def validate_tenant_access(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> uuid.UUID:
    """Validate that current user has access to requested tenant.
    
    Args:
        request: FastAPI request
        current_user: Current authenticated user
        
    Returns:
        Tenant ID
        
    Raises:
        MultiTenantViolationError: If user doesn't belong to tenant
    """
    tenant_id = getattr(request.state, "tenant_id", None)
    
    # Super admin can access any tenant
    if current_user.is_super_admin:
        return tenant_id
    
    # Regular user can only access their own tenant
    if current_user.tenant_id != tenant_id:
        raise MultiTenantViolationError()
    
    return tenant_id
