"""Add TENANT_DEACTIVATED / TENANT_REACTIVATED to audit_action PostgreSQL enum.

Supports the new self-service "deactivate account" flow (soft, reversible —
distinct from the existing hard-delete LGPD flow). ALTER TYPE ... ADD VALUE
is non-transactional in PostgreSQL; each statement commits immediately.

Revision ID: 045_tenant_deactivation_audit_actions
Revises: 044_stripe_events_processed
Create Date: 2026-07-02
"""

from alembic import op
from sqlalchemy import text

revision: str = "045_tenant_deactivation_audit_actions"
down_revision: str = "044_stripe_events_processed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(text("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'TENANT_DEACTIVATED'"))
    op.execute(text("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'TENANT_REACTIVATED'"))


def downgrade() -> None:
    # PostgreSQL does not support removing enum values without recreating the type.
    # Downgrade is a no-op — the values will remain but will be unused.
    pass
