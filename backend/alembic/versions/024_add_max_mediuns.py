"""Add max_mediuns to subscriptions table.

Revision ID: 024_add_max_mediuns
Revises: 023_mediuns_addr
Create Date: 2026-04-02
"""
from alembic import op
import sqlalchemy as sa

revision = "024_add_max_mediuns"
down_revision = "023_mediuns_addr"
branch_labels = None
depends_on = None

# Default limits per plan name (stored as enum name in DB)
_PLAN_DEFAULTS = {
    "FREE": 0,
    "BASIC": 15,
    "PRO": 30,
    "PREMIUM": 9999999,
}


def upgrade() -> None:
    op.add_column(
        "subscriptions",
        sa.Column("max_mediuns", sa.Integer(), nullable=False, server_default="0"),
    )
    # Backfill existing subscriptions based on their plan
    for plan_name, limit in _PLAN_DEFAULTS.items():
        op.execute(
            f"UPDATE subscriptions SET max_mediuns = {limit} WHERE plan = '{plan_name}'"
        )


def downgrade() -> None:
    op.drop_column("subscriptions", "max_mediuns")
