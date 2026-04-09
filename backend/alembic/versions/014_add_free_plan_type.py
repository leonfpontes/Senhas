"""Add FREE value to plan_type enum.

Revision ID: 014_add_free_plan_type
Revises: 013_audit_logs_drop_timestamps
Create Date: 2026-03-20

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "014_add_free_plan_type"
down_revision: str = "013_audit_logs_drop_timestamps"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL: ADD VALUE is not transactional, must run outside transaction block.
    # Detect actual enum name: may be 'plan_type' (created by migration 003 raw SQL)
    # or 'plantype' (created by SQLAlchemy model auto-create from PlanType class).
    bind = op.get_bind()
    result = bind.execute(
        sa.text(
            "SELECT typname FROM pg_type WHERE typtype = 'e' "
            "AND typname IN ('plan_type', 'plantype') LIMIT 1"
        )
    )
    row = result.fetchone()
    if row:
        type_name = row[0]
        op.execute(f"ALTER TYPE {type_name} ADD VALUE IF NOT EXISTS 'FREE'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values.
    # No-op: FREE label remains but is unused after downgrade.
    pass
