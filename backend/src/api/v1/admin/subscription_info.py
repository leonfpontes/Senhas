"""Admin endpoint — current tenant subscription info (read-only)."""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.models import User
from src.models.subscriptions import PlanType
from src.api.dependencies import get_current_user
from src.repositories.subscription_repo import SubscriptionRepository

router = APIRouter(prefix="/api/v1/admin", tags=["admin-subscription"])
logger = logging.getLogger(__name__)

# Plan hierarchy for feature gating (index = tier level)
_PLAN_TIER = {
    PlanType.FREE: 0,
    PlanType.BASIC: 1,
    PlanType.PRO: 2,
    PlanType.PREMIUM: 3,
    PlanType.ENTERPRISE: 4,
}


class PlanFeatures(BaseModel):
    """Which features are available for current plan."""
    email_transacional: bool = False
    tema_personalizado: bool = False
    analytics_basico: bool = False
    analytics_avancado: bool = False
    associados: bool = False
    export_csv: bool = False
    bulk_operations: bool = False
    auditoria: bool = False
    webhooks: bool = False
    api_access: bool = False
    suporte_prioritario: bool = False


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
    features: PlanFeatures


def _get_plan_features(plan: PlanType) -> PlanFeatures:
    """Derive feature flags from plan tier."""
    tier = _PLAN_TIER.get(plan, 0)
    return PlanFeatures(
        email_transacional=tier >= 1,
        tema_personalizado=tier >= 1,
        analytics_basico=tier >= 1,
        analytics_avancado=tier >= 2,
        associados=tier >= 2,
        export_csv=tier >= 2,
        bulk_operations=tier >= 2,
        auditoria=tier >= 2,
        webhooks=tier >= 3,
        api_access=tier >= 3,
        suporte_prioritario=tier >= 3,
    )


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
            features=_get_plan_features(PlanType.FREE),
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
        features=_get_plan_features(sub.plan),
    )
