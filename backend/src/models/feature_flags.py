"""FeatureFlag model - per-tenant feature management (Phase 6 - T100)."""
from sqlalchemy import Column, String, ForeignKey, Boolean, Index, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
import uuid

from .base import TimestampedModel


class FeatureFlag(TimestampedModel):
    """Per-tenant feature flag model.
    
    Enables/disables features per tenant:
    - advanced_analytics
    - webhook_notifications
    - api_access
    - sso_integration
    - custom_branding
    - white_label
    """
    
    __tablename__ = "feature_flags"
    __table_args__ = (
        Index("ix_feature_flags_tenant_id", "tenant_id"),
        Index("ix_feature_flags_feature", "feature"),
    )
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    
    # Feature name
    feature: Mapped[str] = mapped_column(String(100), nullable=False)
    
    # Status
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    # Optional expiration (trial features)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Metadata
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="feature_flags")
    
    def __repr__(self) -> str:
        return f"<FeatureFlag(tenant_id={self.tenant_id}, feature={self.feature}, enabled={self.enabled})>"
