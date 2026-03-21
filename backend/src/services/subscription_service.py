"""SubscriptionService - Plan management and upgrades/downgrades (T102)."""
from typing import Optional
from uuid import UUID
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Subscription, PlanType, SubscriptionStatus
from ..repositories.subscription_repo import SubscriptionRepository
from ..repositories.billing_repo import BillingRepository
from ..core.errors import NotFoundError, InvalidInputError


class SubscriptionService:
    """Service for subscription and plan management.
    
    Handles:
    - Creating subscriptions
    - Upgrading/downgrading plans
    - Trial management
    - Usage tracking
    - Billing cycle management
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.subscription_repo = SubscriptionRepository(db)
        self.billing_repo = BillingRepository(db)
    
    async def get_subscription(self, tenant_id: UUID) -> Optional[dict]:
        """Get tenant subscription.
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            Subscription dict or None
        """
        sub = await self.subscription_repo.get_by_tenant(tenant_id)
        
        if not sub:
            return None
        
        return self._subscription_to_dict(sub)
    
    async def upgrade_plan(
        self,
        tenant_id: UUID,
        new_plan: PlanType,
    ) -> dict:
        """Upgrade tenant subscription plan.
        
        Args:
            tenant_id: Tenant ID
            new_plan: New plan type
            
        Returns:
            Updated subscription dict
            
        Raises:
            NotFoundError: If subscription not found
        """
        sub = await self.subscription_repo.upgrade_plan(tenant_id, new_plan)
        
        if not sub:
            raise NotFoundError("Subscrição não encontrada")
        
        # Create invoice for the upgrade
        await self._create_upgrade_invoice(tenant_id, sub)
        
        return self._subscription_to_dict(sub)
    
    async def downgrade_plan(
        self,
        tenant_id: UUID,
        new_plan: PlanType,
    ) -> dict:
        """Downgrade tenant subscription plan.
        
        Args:
            tenant_id: Tenant ID
            new_plan: New plan type
            
        Returns:
            Updated subscription dict
            
        Raises:
            NotFoundError: If subscription not found
        """
        current = await self.subscription_repo.get_by_tenant(tenant_id)
        
        if not current:
            raise NotFoundError("Subscrição não encontrada")
        
        # Check if really downgrading
        plan_hierarchy = {
            PlanType.FREE: 0,
            PlanType.BASIC: 1,
            PlanType.PRO: 2,
            PlanType.PREMIUM: 3,
            PlanType.ENTERPRISE: 4,
        }
        
        if plan_hierarchy.get(new_plan, 0) >= plan_hierarchy.get(current.plan, 0):
            raise InvalidInputError("Downgrade deve ser para um plano inferior")
        
        sub = await self.subscription_repo.upgrade_plan(tenant_id, new_plan)
        
        return self._subscription_to_dict(sub)
    
    async def activate_trial(
        self,
        tenant_id: UUID,
        trial_days: int = 14,
    ) -> dict:
        """Activate trial for tenant.
        
        Args:
            tenant_id: Tenant ID
            trial_days: Number of trial days
            
        Returns:
            Updated subscription dict
            
        Raises:
            NotFoundError: If subscription not found
        """
        sub = await self.subscription_repo.get_by_tenant(tenant_id)
        
        if not sub:
            raise NotFoundError("Subscrição não encontrada")
        
        if not sub.is_trial:
            raise InvalidInputError("Trial já foi utilizado")
        
        sub.trial_ends_at = datetime.now(timezone.utc) + timedelta(days=trial_days)
        
        await self.db.flush()
        await self.db.refresh(sub)
        
        return self._subscription_to_dict(sub)
    
    async def suspend_subscription(self, tenant_id: UUID) -> dict:
        """Suspend tenant subscription.
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            Updated subscription dict
            
        Raises:
            NotFoundError: If subscription not found
        """
        sub = await self.subscription_repo.get_by_tenant(tenant_id)
        
        if not sub:
            raise NotFoundError("Subscrição não encontrada")
        
        sub.status = SubscriptionStatus.SUSPENDED
        
        await self.db.flush()
        await self.db.refresh(sub)
        
        return self._subscription_to_dict(sub)
    
    async def reactivate_subscription(self, tenant_id: UUID) -> dict:
        """Reactivate suspended subscription.
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            Updated subscription dict
            
        Raises:
            NotFoundError: If subscription not found
        """
        sub = await self.subscription_repo.get_by_tenant(tenant_id)
        
        if not sub:
            raise NotFoundError("Subscrição não encontrada")
        
        sub.status = SubscriptionStatus.ACTIVE
        
        await self.db.flush()
        await self.db.refresh(sub)
        
        return self._subscription_to_dict(sub)
    
    async def record_usage(
        self,
        tenant_id: UUID,
        current_users: int,
    ) -> dict:
        """Record current user count.
        
        Args:
            tenant_id: Tenant ID
            current_users: Current user count
            
        Returns:
            Updated subscription dict
            
        Raises:
            NotFoundError: If subscription not found
            InvalidInputError: If exceeds limit
        """
        sub = await self.subscription_repo.get_by_tenant(tenant_id)
        
        if not sub:
            raise NotFoundError("Subscrição não encontrada")
        
        if current_users > sub.max_users:
            raise InvalidInputError(
                f"Limite de usuários ({sub.max_users}) excedido"
            )
        
        sub.current_users = current_users
        
        await self.db.flush()
        await self.db.refresh(sub)
        
        return self._subscription_to_dict(sub)
    
    def _subscription_to_dict(self, sub: Subscription) -> dict:
        """Convert Subscription to dict.
        
        Args:
            sub: Subscription object
            
        Returns:
            Dict representation
        """
        return {
            "id": str(sub.id),
            "tenant_id": str(sub.tenant_id),
            "plan": sub.plan.value,
            "status": sub.status.value,
            "max_users": sub.max_users,
            "max_giras_per_month": sub.max_giras_per_month,
            "current_users": sub.current_users,
            "monthly_price": sub.monthly_price,
            "is_trial": sub.is_trial,
            "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
            "auto_renew": sub.auto_renew,
            "created_at": sub.created_at.isoformat(),
        }
    
    async def _create_upgrade_invoice(
        self,
        tenant_id: UUID,
        subscription: Subscription,
    ) -> None:
        """Create invoice for plan upgrade (prorated).
        
        Args:
            tenant_id: Tenant ID
            subscription: Updated subscription
        """
        now = datetime.now(timezone.utc)
        invoice_number = f"INV-{tenant_id.hex}-{int(now.timestamp())}"
        
        # Prorated amount (simplified)
        prorate_factor = 0.5  # Example: 50% of month remaining
        amount = subscription.monthly_price * prorate_factor
        
        await self.billing_repo.create_invoice(
            tenant_id=tenant_id,
            invoice_number=invoice_number,
            period_start=now,
            period_end=now + timedelta(days=30),
            subtotal=amount,
            tax_amount=0,
            discount_amount=0,
        )
