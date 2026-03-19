"""Add endereco (address) to tenant_configs.

Revision ID: 011_tenant_endereco
Revises: 010_merge_009_heads
Create Date: 2026-03-19 15:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "011_tenant_endereco"
down_revision = "010_merge_009_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("tenant_configs")}

    if "endereco" not in columns:
        op.add_column(
            "tenant_configs",
            sa.Column("endereco", sa.String(length=500), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("tenant_configs")}

    if "endereco" in columns:
        op.drop_column("tenant_configs", "endereco")
