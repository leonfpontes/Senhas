"""Platform API - Impersonate tenant user endpoint."""
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from uuid import UUID

from src.core.database import get_db
from src.api.dependencies import get_current_user
from src.models import User, UserRole, Tenant
from src.security.jwt import create_access_token

router = APIRouter(prefix="/api/v1/platform/impersonate", tags=["platform-impersonate"])


class ImpersonateUserInfo(BaseModel):
    id: str
    email: str
    username: str
    role: str


class ImpersonateTenantInfo(BaseModel):
    id: str
    name: str
    slug: str


class ImpersonateResponse(BaseModel):
    access_token: str
    user: ImpersonateUserInfo
    tenant: ImpersonateTenantInfo


async def require_super_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency to require SUPER_ADMIN role."""
    if user.role != UserRole.SUPER_ADMIN or user.tenant_id is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas SUPER_ADMIN pode acessar esta operação",
        )
    return user


@router.post("/{user_id}", response_model=ImpersonateResponse)
async def impersonate_user(
    user_id: UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> ImpersonateResponse:
    """Impersonate a tenant user. Mints a short-lived JWT (1h) with impersonated_by tag.

    Guards:
    - Only SUPER_ADMIN can impersonate
    - Cannot impersonate another SUPER_ADMIN
    - Target user must be active and have a tenant
    """
    # Fetch target user
    result = await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    target_user = result.scalar_one_or_none()

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado",
        )

    if not target_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Não é possível impersonar um usuário inativo",
        )

    if target_user.role == UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Não é possível impersonar outro SUPER_ADMIN",
        )

    if target_user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário não possui tenant associado",
        )

    # Fetch tenant
    tenant_result = await db.execute(
        select(Tenant).where(Tenant.id == target_user.tenant_id)
    )
    tenant = tenant_result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant do usuário não encontrado",
        )

    # Mint 1h impersonation token
    access_token = create_access_token(
        user_id=target_user.id,
        tenant_id=target_user.tenant_id,
        role=target_user.role.value if hasattr(target_user.role, 'value') else str(target_user.role),
        expires_delta=timedelta(hours=1),
        impersonated_by=current_user.id,
    )

    return ImpersonateResponse(
        access_token=access_token,
        user=ImpersonateUserInfo(
            id=str(target_user.id),
            email=target_user.email,
            username=target_user.username,
            role=target_user.role.value if hasattr(target_user.role, 'value') else str(target_user.role),
        ),
        tenant=ImpersonateTenantInfo(
            id=str(tenant.id),
            name=tenant.name,
            slug=tenant.slug,
        ),
    )
