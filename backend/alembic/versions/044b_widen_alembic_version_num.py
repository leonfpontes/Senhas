"""Widen alembic_version.version_num before it needs to hold a >32-char id.

Alembic creates alembic_version.version_num as VARCHAR(32) by default.
Revision 045_tenant_deactivation_audit_actions is 37 chars, so on a brand-new
database `alembic upgrade head` fails with StringDataRightTruncation while
recording that it applied 045 — and because the whole run executes in a
single transaction, everything (001..044 included) rolls back, so a widening
migration placed after the current head would never even be reached. This
migration is wired in as 045's down_revision (ahead of 044's own successor)
so the column is wide enough before that write happens.

Revision ID: 044b_widen_alembic_version_num
Revises: 044_stripe_events_processed
Create Date: 2026-07-09
"""

from alembic import op
import sqlalchemy as sa

revision: str = "044b_widen_alembic_version_num"
down_revision: str = "044_stripe_events_processed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "alembic_version",
        "version_num",
        existing_type=sa.String(32),
        type_=sa.String(255),
    )


def downgrade() -> None:
    op.alter_column(
        "alembic_version",
        "version_num",
        existing_type=sa.String(255),
        type_=sa.String(32),
    )
