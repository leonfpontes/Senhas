"""Subscription model - tenant plans and billing (Phase 6 - T097)."""
from sqlalchemy import Column, String, ForeignKey, Boolean, Integer, Float, Index, Enum as SQLEnum, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
import uuid
import enum

from .base import TimestampedModel


class PlanType(str, enum.Enum):
    """Subscription plan types."""
    
    BASIC = "basic"          # 10 users, 100 giras/month, $0/month
    PRO = "pro"              # 50 users, 1000 giras/month, $99/month
    PREMIUM = "premium"      # 500 users, 10000 giras/month, $499/month
    ENTERPRISE = "enterprise"  # Unlimited, custom SLA, custom pricing


class SubscriptionStatus(str, enum.Enum):
    """Subscription status."""
    
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class Subscription(TimestampedModel):
    """Tenant subscription model.
    
    Tracks:
    - Current plan (basic, pro, premium, enterprise)
    - Billing info (price, cycle)
    - Usage limits
    - Trial status
    - Auto-renewal settings
    """
    
    __tablename__ = "subscriptions"
    __table_args__ = (
        Index("ix_subscriptions_tenant_id", "tenant_id"),
        Index("ix_subscriptions_plan", "plan"),
        Index("ix_subscriptions_status", "status"),
    )
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    plan: Mapped[PlanType] = mapped_column(
        SQLEnum(PlanType, name="plan_type", create_constraint=False,
                values_callable=lambda e: [x.name for x in e]),
        default=PlanType.BASIC,
        nullable=False,
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        SQLEnum(SubscriptionStatus, name="subscription_status", create_constraint=False,
                values_callable=lambda e: [x.name for x in e]),
        default=SubscriptionStatus.ACTIVE,
        nullable=False,
    )
    
    # Usage limits
    max_users: Mapped[int] = mapped_column(Integer, nullable=False)  # Based on plan
    max_giras_per_month: Mapped[int] = mapped_column(Integer, nullable=False)  # Based on plan
    current_users: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # Billing
    monthly_price: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    
    # Trial
    is_trial: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Billing cycle
    billing_cycle_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    billing_cycle_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Auto-renewal
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="subscription")
    
    def __repr__(self) -> str:
        return f"<Subscription(tenant_id={self.tenant_id}, plan={self.plan.value}, status={self.status.value})>"
