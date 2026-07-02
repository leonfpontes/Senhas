"""Stripe webhook idempotency tracking."""
from datetime import datetime
from sqlalchemy import String, DateTime, Index, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
import uuid

from .base import Base


class StripeEventProcessed(Base):
    """One row per Stripe webhook event id already handled.

    Stripe delivers webhooks at-least-once — the same event can be resent
    (retries, duplicate delivery). Before processing a webhook, the handler
    tries to insert the event_id here first; a unique-constraint violation
    means it was already processed, so it's safe to skip and return 200.

    Append-only log — no updated_at/deleted_at, rows are never modified.
    """

    __tablename__ = "stripe_events_processed"
    __table_args__ = (
        Index("ix_stripe_events_processed_event_id", "event_id", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    def __repr__(self) -> str:
        return f"<StripeEventProcessed(event_id={self.event_id}, event_type={self.event_type})>"
