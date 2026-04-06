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
from src.repositories.audit_log_repo import AuditLogRepository
from src.models.audit_logs import AuditAction
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


# ---------------------------------------------------------------------------
# Bonus tenant management
# ---------------------------------------------------------------------------

class SetBonusRequest(BaseModel):
    """Request to toggle bonus status for a tenant."""
    is_bonus: bool
    plan: Optional[PlanType] = None  # Plan to grant when enabling bonus


PLAN_LIMITS = {
    PlanType.BASIC:   {"max_users": 5,  "max_giras_per_month": 10, "max_mediuns": 20,  "monthly_price": 49.0},
    PlanType.PRO:     {"max_users": 20, "max_giras_per_month": 50, "max_mediuns": 100, "monthly_price": 79.0},
    PlanType.PREMIUM: {"max_users": -1, "max_giras_per_month": -1, "max_mediuns": -1,  "monthly_price": 99.0},
}


@router.patch("/{tenant_id}/bonus")
async def set_bonus(
    tenant_id: UUID,
    body: SetBonusRequest,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Grant or revoke bonus access for a tenant.

    - Enabling bonus (is_bonus=True): sets is_bonus flag, upgrades to given plan (free if omitted),
      cancels any active Stripe subscription immediately.
    - Disabling bonus (is_bonus=False): removes is_bonus flag; plan stays as-is (tenant must
      subscribe manually to keep paid features).
    """
    repo = SubscriptionRepository(db)
    sub = await repo.get_by_tenant(tenant_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")

    if body.is_bonus:
        # Cancel Stripe subscription if active
        if sub.stripe_subscription_id:
            try:
                from src.services import stripe_service
                await stripe_service.cancel_subscription_immediately(sub.stripe_subscription_id)
            except Exception:
                pass  # Log but continue — Stripe may already be cancelled
            sub.stripe_subscription_id = None
            sub.stripe_price_id = None
            sub.cancel_at_period_end = False

        target_plan = body.plan or PlanType.BASIC
        limits = PLAN_LIMITS.get(target_plan, PLAN_LIMITS[PlanType.BASIC])
        sub.is_bonus = True
        sub.plan = target_plan
        sub.status = SubscriptionStatus.ACTIVE
        sub.max_users = limits["max_users"]
        sub.max_giras_per_month = limits["max_giras_per_month"]
        sub.max_mediuns = limits["max_mediuns"]
        sub.monthly_price = 0.0  # No charge for bonus tenants
    else:
        sub.is_bonus = False
        # Revert to FREE if no active Stripe subscription
        if not sub.stripe_subscription_id:
            sub.plan = PlanType.FREE
            sub.max_users = 1
            sub.max_giras_per_month = 2
            sub.max_mediuns = 0
            sub.monthly_price = 0.0

    audit = AuditLogRepository(db)
    await audit.create(
        tenant_id=tenant_id,
        user_id=current_user.id,
        action=AuditAction.UPDATE,
        resource_type="subscription",
        resource_id=sub.id,
        details={"is_bonus": body.is_bonus, "plan": (body.plan or sub.plan).value if body.is_bonus else sub.plan.value},
    )
    await db.commit()
    await db.refresh(sub)

    return {
        "tenant_id": str(tenant_id),
        "plan": sub.plan.value,
        "is_bonus": sub.is_bonus,
        "status": sub.status.value,
        "monthly_price": sub.monthly_price,
    }
