"""FastAPI dependency injection utilities (T022)."""
from fastapi import Request, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import timezone
import uuid

from ..core.database import get_db
from ..core.errors import (
    UnauthorizedError,
    InsufficientPermissionsError,
    MultiTenantViolationError,
    NotFoundError,
    GroupPermissionDeniedError,
)
from ..models import User, UserRole, PermissionFeature
from ..middleware.tenant_context import get_tenant_id
from ..services.permission_service import PermissionService
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

    # Password change / "logout all devices" invalidates every token issued
    # before that moment — even ones that haven't hit their own exp yet. Cheap
    # to check here: `user` is already loaded, no extra query.
    if user.sessions_revoked_at is not None:
        token_data = getattr(request.state, "token", None)
        token_iat = getattr(token_data, "iat", None)
        if token_iat is not None:
            revoked_at = user.sessions_revoked_at
            if token_iat.tzinfo is None:
                token_iat = token_iat.replace(tzinfo=timezone.utc)
            if revoked_at.tzinfo is None:
                revoked_at = revoked_at.replace(tzinfo=timezone.utc)
            if token_iat < revoked_at:
                raise UnauthorizedError("Sessão revogada")

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


_ROLE_HIERARCHY: dict[UserRole, int] = {
    UserRole.OPERATOR: 0,
    UserRole.ADMIN: 1,
    UserRole.SUPER_ADMIN: 2,
}


async def require_role(
    required_role: UserRole,
) -> callable:
    """Dependency factory for role-based access control (RBAC).

    Uses explicit numeric hierarchy: OPERATOR=0 < ADMIN=1 < SUPER_ADMIN=2.
    A user with a higher or equal level passes; lower levels are denied.

    Usage in endpoint:
        @router.get("/admin-only", dependencies=[Depends(require_role(UserRole.ADMIN))])
    """
    async def check_role(user: User = Depends(get_current_user)):
        user_level = _ROLE_HIERARCHY.get(user.role, -1)
        required_level = _ROLE_HIERARCHY.get(required_role, 99)
        if user_level < required_level:
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


def require_group_permission(feature: PermissionFeature, action: str):
    """Dependency factory for group-based permission checking.
    
    Verifies that the user has the required group permissions for the specific action on a feature.
    """
    async def dependency(
        request: Request,
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        token_data = getattr(request.state, "token", None)
        permission_service = PermissionService(db)
        
        has_perm = await permission_service.check_permission(
            user=user,
            feature=feature,
            action=action,
            token_data=token_data,
        )
        if not has_perm:
            raise GroupPermissionDeniedError(feature.value, action)

        return None

    return dependency


def require_any_group_permission(*features: PermissionFeature, action: str):
    """Dependency factory that grants access if the user has the given action
    on ANY of the listed features.

    Used by read endpoints shared across pages backed by different permission
    groups — e.g. Relatório de Gira reads giras/tickets/door-stats, each
    normally gated by its own feature (GIRAS/TICKETS/PORTA) elsewhere. Without
    this, a group granted only RELATORIO_GIRA view can open the report page
    but every underlying fetch 403s, leaving the ticket listing silently empty.
    """
    async def dependency(
        request: Request,
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        token_data = getattr(request.state, "token", None)
        permission_service = PermissionService(db)

        for feature in features:
            has_perm = await permission_service.check_permission(
                user=user,
                feature=feature,
                action=action,
                token_data=token_data,
            )
            if has_perm:
                return None

        raise GroupPermissionDeniedError(features[0].value, action)

    return dependency

