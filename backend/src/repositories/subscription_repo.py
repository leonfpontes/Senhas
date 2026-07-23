"""SubscriptionRepository - Tenant subscription management (T097)."""
from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from ..models import Subscription, PlanType, SubscriptionStatus
from .base import BaseRepository

# Fonte única de verdade para limites por plano.
# Importada por webhooks.py, platform/subscriptions.py, platform/billing_sync.py e
# admin/billing_stripe.py para manter tudo em sync — não duplicar esses valores.
# PREMIUM usa números grandes (não -1) como sentinel de "ilimitado" — é o que
# o restante do frontend (platform/billing.tsx, admin/plano.tsx, admin/mediuns.tsx)
# já espera; ver test_webhook_plan_sync.py::test_premium_never_uses_negative_one.
PLAN_LIMITS: dict = {
    PlanType.FREE:    {"max_users": 1,     "max_giras_per_month": 4,      "max_mediuns": 0,       "price": 0.0},
    PlanType.BASIC:   {"max_users": 3,     "max_giras_per_month": 10,     "max_mediuns": 50,      "price": 49.0},
    PlanType.PRO:     {"max_users": 10,    "max_giras_per_month": 15,     "max_mediuns": 150,     "price": 79.0},
    PlanType.PREMIUM: {"max_users": 99999, "max_giras_per_month": 999999, "max_mediuns": 9999999, "price": 99.0},
}


class SubscriptionRepository(BaseRepository[Subscription]):
    """Repository for Subscription management.
    
    Provides:
    - CRUD for subscriptions
    - Access by tenant_id
    - Filtering by plan and status
    - Subscription phase management
    """
    
    def __init__(self, db: AsyncSession):
        super().__init__(db, Subscription)
    
    async def get_by_tenant(self, tenant_id: UUID) -> Optional[Subscription]:
        """Get subscription for a tenant.
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            Subscription object or None
        """
        stmt = select(Subscription).where(Subscription.tenant_id == tenant_id)
        
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def list_by_plan(
        self,
        plan: PlanType,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Subscription]:
        """Get subscriptions by plan.
        
        Args:
            plan: Plan type
            skip: Pagination offset
            limit: Pagination limit
            
        Returns:
            List of subscriptions
        """
        stmt = select(Subscription).where(
            Subscription.plan == plan
        ).offset(skip).limit(limit)
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def list_by_status(
        self,
        status: SubscriptionStatus,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Subscription]:
        """Get subscriptions by status.
        
        Args:
            status: Subscription status
            skip: Pagination offset
            limit: Pagination limit
            
        Returns:
            List of subscriptions
        """
        stmt = select(Subscription).where(
            Subscription.status == status
        ).offset(skip).limit(limit)
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def create_for_tenant(
        self,
        tenant_id: UUID,
        plan: PlanType = PlanType.BASIC,
        is_trial: bool = False,
        trial_ends_at = None,
    ) -> Subscription:
        """Create subscription for tenant.
        
        Args:
            tenant_id: Tenant ID
            plan: Plan type (default: BASIC)
            is_trial: Whether is trial
            trial_ends_at: Trial expiration date
            
        Returns:
            Created Subscription
        """
        # Get plan defaults
        plan_config = self._get_plan_config(plan)
        
        subscription = Subscription(
            tenant_id=tenant_id,
            plan=plan,
            status=SubscriptionStatus.ACTIVE,
            max_users=plan_config["max_users"],
            max_giras_per_month=plan_config["max_giras_per_month"],
            max_mediuns=plan_config["max_mediuns"],
            monthly_price=plan_config["price"],
            is_trial=is_trial,
            trial_ends_at=trial_ends_at,
        )
        
        self.db.add(subscription)
        await self.db.flush()
        await self.db.refresh(subscription)
        return subscription
    
    async def upgrade_plan(
        self,
        tenant_id: UUID,
        new_plan: PlanType,
    ) -> Optional[Subscription]:
        """Upgrade subscription to new plan.
        
        Args:
            tenant_id: Tenant ID
            new_plan: New plan type
            
        Returns:
            Updated Subscription or None
        """
        stmt = select(Subscription).where(Subscription.tenant_id == tenant_id)
        
        result = await self.db.execute(stmt)
        subscription = result.scalar_one_or_none()
        
        if not subscription:
            return None
        
        plan_config = self._get_plan_config(new_plan)
        
        subscription.plan = new_plan
        subscription.max_users = plan_config["max_users"]
        subscription.max_giras_per_month = plan_config["max_giras_per_month"]
        subscription.max_mediuns = plan_config["max_mediuns"]
        subscription.monthly_price = plan_config["price"]
        
        await self.db.flush()
        await self.db.refresh(subscription)
        return subscription
    
    async def reset_to_free(
        self,
        tenant_id: UUID,
        status: SubscriptionStatus = SubscriptionStatus.CANCELLED,
    ) -> Optional[Subscription]:
        """Reset a tenant's subscription to the FREE plan.

        Used by: the customer.subscription.deleted webhook (paid period ended
        — status=CANCELLED, the default), the self-service "deactivate account"
        flow (immediate Stripe cancel — status=CANCELLED), and the "reactivate
        account" flow (account always comes back on FREE, never auto-restores
        the previous paid plan — pass status=ACTIVE, since there's no
        cancelled subscription to reflect anymore).

        Clears the Stripe subscription/price linkage but preserves
        stripe_customer_id — the Customer object in Stripe isn't deleted,
        only the Subscription, so a future checkout can reuse it.

        Args:
            tenant_id: Tenant ID
            status: Resulting SubscriptionStatus (default CANCELLED)

        Returns:
            Updated Subscription or None if the tenant has no subscription row
        """
        subscription = await self.get_by_tenant(tenant_id)
        if not subscription:
            return None

        free = PLAN_LIMITS[PlanType.FREE]
        subscription.plan = PlanType.FREE
        subscription.status = status
        subscription.stripe_subscription_id = None
        subscription.stripe_price_id = None
        subscription.cancel_at_period_end = False
        subscription.max_users = free["max_users"]
        subscription.max_giras_per_month = free["max_giras_per_month"]
        subscription.max_mediuns = free["max_mediuns"]
        subscription.monthly_price = free["price"]
        subscription.is_trial = False
        subscription.trial_ends_at = None

        await self.db.flush()
        await self.db.refresh(subscription)
        return subscription

    def _get_plan_config(self, plan: PlanType) -> dict:
        """Get plan configuration.
        
        Args:
            plan: Plan type
            
        Returns:
            Plan config dict with limits and pricing
        """
        return PLAN_LIMITS.get(plan, PLAN_LIMITS[PlanType.FREE])
