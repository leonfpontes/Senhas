"""Add fila de espera (waitlist) support.

New TicketStatus values (WAITLISTED, WAITLIST_EXPIRED), promotion/confirmation
timestamps on tickets, per-gira confirmation window, and the tenant-level
enable_waitlist feature toggle (PRO+).

ALTER TYPE ... ADD VALUE is non-transactional in PostgreSQL — it commits
immediately and cannot be rolled back inside a transaction. Mirrors the
pattern used in 032_tenant_audit_enum.py.

Revision ID: 049_ticket_waitlist
Revises: 048_mediuns_data_entrada_saida
Create Date: 2026-07-14
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision: str = "049_ticket_waitlist"
down_revision: str = "048_mediuns_data_entrada_saida"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ticket_status enum values match TicketStatus.value (lowercase), not .name.
    op.execute(text("ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'waitlisted'"))
    op.execute(text("ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'waitlist_expired'"))

    op.add_column("tickets", sa.Column("promoted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tickets", sa.Column("confirmation_expires_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column("giras", sa.Column("waitlist_confirmation_hours", sa.Integer(), nullable=True))

    op.add_column(
        "tenant_configs",
        sa.Column("enable_waitlist", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("tenant_configs", "enable_waitlist")
    op.drop_column("giras", "waitlist_confirmation_hours")
    op.drop_column("tickets", "confirmation_expires_at")
    op.drop_column("tickets", "promoted_at")
    # PostgreSQL does not support removing enum values without recreating the
    # type. Downgrade leaves 'waitlisted'/'waitlist_expired' in place, unused.
