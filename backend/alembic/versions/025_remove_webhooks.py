"""Remove enable_webhooks column from tenant_configs.

Revision ID: 025_remove_webhooks
Revises: 024_add_max_mediuns
Create Date: 2026-04-02
"""
from alembic import op
import sqlalchemy as sa

revision = "025_remove_webhooks"
down_revision = "024_add_max_mediuns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("tenant_configs", "enable_webhooks")


def downgrade() -> None:
    op.add_column(
        "tenant_configs",
        sa.Column(
            "enable_webhooks",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
