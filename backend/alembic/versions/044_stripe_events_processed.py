"""Add stripe_events_processed (webhook idempotency tracking).

Stripe delivers webhooks at-least-once — the same event can arrive more than
once. Without tracking processed event ids, reprocessing duplicates audit
log entries (and would duplicate emails once billing notifications are added).

Revision ID: 044_stripe_events_processed
Revises: 043_user_sessions
Create Date: 2026-07-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "044_stripe_events_processed"
down_revision = "043_user_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stripe_events_processed",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_id", sa.String(255), nullable=False, unique=True),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_stripe_events_processed_event_id", "stripe_events_processed", ["event_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_stripe_events_processed_event_id", table_name="stripe_events_processed")
    op.drop_table("stripe_events_processed")
