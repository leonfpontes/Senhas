"""Refresh-token session tracking — rotation, reuse detection, absolute session cap."""
from sqlalchemy import Column, String, ForeignKey, Index, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from .base import TimestampedModel


class UserSession(TimestampedModel):
    """One row per login (device/tab group), tracking the current valid refresh-token jti.

    Enables:
    - Refresh-token rotation with reuse detection (stolen-token signal): each refresh
      must present the `current_jti`; a mismatch outside the grace window revokes the row.
    - A short grace window (`previous_jti` / `previous_jti_valid_until`) absorbs benign
      races between multiple tabs/devices refreshing at nearly the same instant.
    - An absolute session lifetime cap (`expires_at`), independent of activity — unlike
      Redis TTLs this is durable and immune to cache eviction under memory pressure.
    - "Logout all devices": delete every row for a user_id.
    """

    __tablename__ = "user_sessions"
    __table_args__ = (
        Index("ix_user_sessions_user_id", "user_id"),
        Index("ix_user_sessions_tenant_id", "tenant_id"),
        Index("ix_user_sessions_expires_at", "expires_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True
    )
    current_jti: Mapped[str] = mapped_column(String(36), nullable=False)
    previous_jti: Mapped[str | None] = mapped_column(String(36), nullable=True)
    previous_jti_valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    orig_iat: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)

    user = relationship("User")

    def __repr__(self) -> str:
        return f"<UserSession(id={self.id}, user_id={self.user_id})>"
