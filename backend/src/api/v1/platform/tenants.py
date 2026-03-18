"""Platform API - Tenant management endpoints (T104)."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from uuid import UUID

from src.core.database import get_db
from src.core.errors import NotFoundError, InvalidInputError
from src.api.dependencies import get_current_user
from src.models import User, UserRole, PlanType
from src.services.tenant_service import TenantService
from src.repositories.tenant_repo import TenantRepository

router = APIRouter(prefix="/api/v1/platform/tenants", tags=["platform-tenants"])


class CreateTenantRequest(BaseModel):
    """Request to create new tenant."""
    slug: str
    name: str
    email_admin: EmailStr
    plan: PlanType = PlanType.BASIC
    is_trial: bool = False
    data_retention_days: int = 12


class UpdateTenantRequest(BaseModel):
    """Request to update tenant."""
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class TenantResponse(BaseModel):
    """Tenant response."""
    id: str
    slug: str
    name: str
    description: Optional[str]
    is_active: bool
    created_at: str
    updated_at: str


async def require_super_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency to require SUPER_ADMIN role."""
    if user.role != UserRole.SUPER_ADMIN or user.tenant_id is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas SUPER_ADMIN pode acessar esta operação",
        )
    return user


@router.post("", status_code=status.HTTP_201_CREATED, response_model=dict)
async def create_tenant(
    request: CreateTenantRequest,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create new tenant with initial admin user.
    
    This endpoint is SUPER_ADMIN only and creates:
    - New tenant
    - Initial admin user
    - Subscription
    - API key
    """
    service = TenantService(db)
    
    try:
        result = await service.create_tenant(
            slug=request.slug,
            name=request.name,
            email_admin=request.email_admin,
            plan=request.plan,
            is_trial=request.is_trial,
            data_retention_days=request.data_retention_days,
        )
        
        await db.commit()
        return result
    except InvalidInputError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao criar tenant: {str(e)}",
        )


@router.get("/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get tenant by ID."""
    repo = TenantRepository(db)
    
    try:
        tenant = await repo.get_by_id(tenant_id, None)
        if not tenant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tenant não encontrado",
            )
        
        return TenantResponse(
            id=str(tenant.id),
            slug=tenant.slug,
            name=tenant.name,
            description=tenant.description,
            is_active=tenant.is_active,
            created_at=tenant.created_at.isoformat(),
            updated_at=tenant.updated_at.isoformat(),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar tenant: {str(e)}",
        )


@router.put("/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: UUID,
    request: UpdateTenantRequest,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update tenant."""
    service = TenantService(db)
    
    try:
        update_data = {
            k: v for k, v in request.dict().items() if v is not None
        }
        
        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nenhum campo para atualizar",
            )
        
        result = await service.update_tenant(tenant_id, **update_data)
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tenant não encontrado",
            )
        
        await db.commit()
        
        return TenantResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao atualizar tenant: {str(e)}",
        )


@router.delete("/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tenant(
    tenant_id: UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft delete tenant."""
    service = TenantService(db)
    
    try:
        success = await service.delete_tenant(tenant_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tenant não encontrado",
            )
        
        await db.commit()
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao deletar tenant: {str(e)}",
        )


@router.get("", response_model=List[TenantResponse])
async def list_tenants(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_active: Optional[bool] = None,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> List[dict]:
    """List all tenants with pagination."""
    repo = TenantRepository(db)
    
    try:
        tenants = await repo.search(
            is_active=is_active,
            skip=skip,
            limit=limit,
        )
        
        return [
            TenantResponse(
                id=str(t.id),
                slug=t.slug,
                name=t.name,
                description=t.description,
                is_active=t.is_active,
                created_at=t.created_at.isoformat(),
                updated_at=t.updated_at.isoformat(),
            )
            for t in tenants
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao listar tenants: {str(e)}",
        )


class TenantUserResponse(BaseModel):
    """User response for tenant detail."""
    id: str
    email: str
    username: str
    role: str
    is_active: bool
    created_at: str


@router.get("/{tenant_id}/users", response_model=List[TenantUserResponse])
async def list_tenant_users(
    tenant_id: UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> List[TenantUserResponse]:
    """List all users for a specific tenant."""
    # Verify tenant exists
    repo = TenantRepository(db)
    tenant = await repo.get_by_id(tenant_id, None)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant não encontrado",
        )

    result = await db.execute(
        select(User).where(
            User.tenant_id == tenant_id,
            User.deleted_at.is_(None),
        )
    )
    users = result.scalars().all()

    return [
        TenantUserResponse(
            id=str(u.id),
            email=u.email,
            username=u.username,
            role=u.role.value if hasattr(u.role, 'value') else str(u.role),
            is_active=u.is_active,
            created_at=u.created_at.isoformat(),
        )
        for u in users
    ]
