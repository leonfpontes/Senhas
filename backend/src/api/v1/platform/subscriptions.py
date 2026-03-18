"""Platform API - Subscription management endpoint (T107)."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
from uuid import UUID

from src.core.database import get_db
from src.api.dependencies import get_current_user
from src.models import User, UserRole, PlanType, SubscriptionStatus
from src.services.subscription_service import SubscriptionService
from src.repositories.subscription_repo import SubscriptionRepository
from src.core.errors import NotFoundError

router = APIRouter(prefix="/api/v1/platform/subscriptions", tags=["platform-subscriptions"])


class SubscriptionResponse(BaseModel):
    """Subscription response."""
    id: str
    tenant_id: str
    plan: str
    status: str
    max_users: int
    max_giras_per_month: int
    current_users: int
    monthly_price: float
    is_trial: bool
    trial_ends_at: Optional[str]
    auto_renew: bool
    created_at: str


class UpgradePlanRequest(BaseModel):
    """Request to upgrade plan."""
    plan: PlanType


class RecordUsageRequest(BaseModel):
    """Request to record usage."""
    current_users: int


async def require_super_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency to require SUPER_ADMIN role."""
    if user.role != UserRole.SUPER_ADMIN or user.tenant_id is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas SUPER_ADMIN pode acessar esta operação",
        )
    return user


@router.get("/{tenant_id}", response_model=SubscriptionResponse)
async def get_subscription(
    tenant_id: UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get subscription for tenant."""
    service = SubscriptionService(db)
    
    try:
        result = await service.get_subscription(tenant_id)
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subscrição não encontrada",
            )
        
        return SubscriptionResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar subscrição: {str(e)}",
        )


@router.put("/{tenant_id}/upgrade", response_model=SubscriptionResponse)
async def upgrade_subscription(
    tenant_id: UUID,
    request: UpgradePlanRequest,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Upgrade tenant subscription plan."""
    service = SubscriptionService(db)
    
    try:
        result = await service.upgrade_plan(tenant_id, request.plan)
        await db.commit()
        
        return SubscriptionResponse(**result)
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao fazer upgrade: {str(e)}",
        )


@router.put("/{tenant_id}/downgrade", response_model=SubscriptionResponse)
async def downgrade_subscription(
    tenant_id: UUID,
    request: UpgradePlanRequest,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Downgrade tenant subscription plan."""
    service = SubscriptionService(db)
    
    try:
        result = await service.downgrade_plan(tenant_id, request.plan)
        await db.commit()
        
        return SubscriptionResponse(**result)
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao fazer downgrade: {str(e)}",
        )


@router.post("/{tenant_id}/suspend", response_model=SubscriptionResponse)
async def suspend_subscription(
    tenant_id: UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Suspend tenant subscription."""
    service = SubscriptionService(db)
    
    try:
        result = await service.suspend_subscription(tenant_id)
        await db.commit()
        
        return SubscriptionResponse(**result)
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao suspender: {str(e)}",
        )


@router.post("/{tenant_id}/reactivate", response_model=SubscriptionResponse)
async def reactivate_subscription(
    tenant_id: UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Reactivate tenant subscription."""
    service = SubscriptionService(db)
    
    try:
        result = await service.reactivate_subscription(tenant_id)
        await db.commit()
        
        return SubscriptionResponse(**result)
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao reativar: {str(e)}",
        )
