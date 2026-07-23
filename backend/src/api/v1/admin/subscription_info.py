"""Admin endpoint — current tenant subscription info (read-only)."""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.models import User
from src.models.giras import Gira
from src.models.subscriptions import PlanType, SubscriptionStatus
from src.api.dependencies import get_current_user
from src.repositories.subscription_repo import SubscriptionRepository, PLAN_LIMITS
from src.repositories.mediun_repo import MediumRepository

router = APIRouter(prefix="/api/v1/admin", tags=["admin-subscription"])
logger = logging.getLogger(__name__)

from src.services.plan_features import PlanFeatures, _get_plan_features, _PLAN_TIER


async def _count_active_users(db: AsyncSession, tenant_id) -> int:
    """Count active, non-deleted users for a tenant."""
    stmt = select(func.count()).select_from(User).where(
        and_(
            User.tenant_id == tenant_id,
            User.is_active.is_(True),
            User.deleted_at.is_(None),
        )
    )
    result = await db.execute(stmt)
    return result.scalar() or 0


class SubscriptionInfoResponse(BaseModel):
    plan: str
    status: str
    max_users: int
    max_giras_per_month: int
    max_mediuns: int
    current_users: int
    current_giras_this_month: int
    current_mediuns: int
    monthly_price: float
    is_trial: bool
    trial_ends_at: Optional[str] = None
    auto_renew: bool
    cancel_at_period_end: bool = False
    current_period_end: Optional[str] = None
    features: PlanFeatures


@router.get("/subscription", response_model=SubscriptionInfoResponse)
async def get_tenant_subscription(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current tenant's subscription info (read-only)."""
    tenant_id = getattr(request.state, "tenant_id", None) or current_user.tenant_id

    repo = SubscriptionRepository(db)
    sub = await repo.get_by_tenant(tenant_id)

    # Count giras created this calendar month (excluding soft-deleted)
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    giras_stmt = select(func.count()).select_from(Gira).where(
        and_(
            Gira.tenant_id == tenant_id,
            Gira.created_at >= month_start,
            Gira.deleted_at.is_(None),
        )
    )
    giras_result = await db.execute(giras_stmt)
    current_giras_this_month = giras_result.scalar() or 0

    # Count active users dynamically
    active_users = await _count_active_users(db, tenant_id)

    # Count active médiuns dynamically
    medium_repo = MediumRepository(db)
    current_mediuns = await medium_repo.count(tenant_id)

    if not sub:
        free = PLAN_LIMITS[PlanType.FREE]
        return SubscriptionInfoResponse(
            plan="free",
            status="active",
            max_users=free["max_users"],
            max_giras_per_month=free["max_giras_per_month"],
            max_mediuns=free["max_mediuns"],
            current_users=active_users,
            current_giras_this_month=current_giras_this_month,
            current_mediuns=current_mediuns,
            monthly_price=free["price"],
            is_trial=False,
            auto_renew=False,
            features=_get_plan_features(PlanType.FREE),
        )

    return SubscriptionInfoResponse(
        plan=sub.plan.value,
        status=sub.status.value,
        max_users=sub.max_users,
        max_giras_per_month=sub.max_giras_per_month,
        max_mediuns=sub.max_mediuns,
        current_users=active_users,
        current_giras_this_month=current_giras_this_month,
        current_mediuns=current_mediuns,
        monthly_price=sub.monthly_price,
        is_trial=sub.is_trial,
        trial_ends_at=sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
        auto_renew=sub.auto_renew,
        cancel_at_period_end=sub.cancel_at_period_end,
        current_period_end=sub.current_period_end.isoformat() if sub.current_period_end else None,
        features=_get_plan_features(sub.plan, suspended=sub.status == SubscriptionStatus.SUSPENDED),
    )
