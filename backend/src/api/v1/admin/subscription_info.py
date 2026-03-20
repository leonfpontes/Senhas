"""Admin endpoint — current tenant subscription info (read-only)."""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.models import User
from src.api.dependencies import get_current_user
from src.repositories.subscription_repo import SubscriptionRepository

router = APIRouter(prefix="/api/v1/admin", tags=["admin-subscription"])
logger = logging.getLogger(__name__)


class SubscriptionInfoResponse(BaseModel):
    plan: str
    status: str
    max_users: int
    max_giras_per_month: int
    current_users: int
    monthly_price: float
    is_trial: bool
    trial_ends_at: Optional[str] = None
    auto_renew: bool


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

    if not sub:
        return SubscriptionInfoResponse(
            plan="free",
            status="active",
            max_users=1,
            max_giras_per_month=2,
            current_users=0,
            monthly_price=0.0,
            is_trial=False,
            auto_renew=False,
        )

    return SubscriptionInfoResponse(
        plan=sub.plan.value,
        status=sub.status.value,
        max_users=sub.max_users,
        max_giras_per_month=sub.max_giras_per_month,
        current_users=sub.current_users,
        monthly_price=sub.monthly_price,
        is_trial=sub.is_trial,
        trial_ends_at=sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
        auto_renew=sub.auto_renew,
    )
