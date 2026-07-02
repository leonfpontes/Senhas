"""Add tenants.self_deactivated_at — dedicated marker for self-service deactivation.

Security-review follow-up: the initial deactivation/reactivation flow (045)
keyed off `is_active=False AND deleted_at IS NOT NULL` to mean "self-
deactivated, reversible". No other live code path produces that exact
combination today, but the signature was borrowed rather than owned —
sharing it with any future tenant-suspension feature would let a former
tenant admin silently self-reactivate past an unrelated hold. This adds
an explicit, single-purpose column instead.

Revision ID: 046_tenant_self_deactivated_at
Revises: 045_tenant_deactivation_audit_actions
Create Date: 2026-07-02
"""

from alembic import op
import sqlalchemy as sa

revision: str = "046_tenant_self_deactivated_at"
down_revision: str = "045_tenant_deactivation_audit_actions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("self_deactivated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenants", "self_deactivated_at")
