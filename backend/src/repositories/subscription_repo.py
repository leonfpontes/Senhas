"""SubscriptionRepository - Tenant subscription management (T097)."""
from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from ..models import Subscription, PlanType, SubscriptionStatus
from .base import BaseRepository


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
        subscription.monthly_price = plan_config["price"]
        
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
        configs = {
            PlanType.FREE: {
                "max_users": 1,
                "max_giras_per_month": 2,
                "price": 0.0,
            },
            PlanType.BASIC: {
                "max_users": 5,
                "max_giras_per_month": 10,
                "price": 49.0,
            },
            PlanType.PRO: {
                "max_users": 20,
                "max_giras_per_month": 50,
                "price": 79.0,
            },
            PlanType.PREMIUM: {
                "max_users": 99999,  # Effectively unlimited
                "max_giras_per_month": 999999,
                "price": 99.0,
            },
            PlanType.ENTERPRISE: {
                "max_users": 99999,  # Effectively unlimited
                "max_giras_per_month": 999999,
                "price": 0.0,  # Custom pricing
            },
        }
        return configs.get(plan, configs[PlanType.FREE])
