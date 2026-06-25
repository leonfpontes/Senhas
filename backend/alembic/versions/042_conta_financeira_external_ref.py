"""Add external_ref to contas_financeiras for mensalidade sync.

Revision ID: 042_conta_financeira_external_ref
Revises: 041_contas_financeiras
Create Date: 2026-06-25
"""
from alembic import op
import sqlalchemy as sa

revision = "042_cf_external_ref"
down_revision = "041_contas_financeiras"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "contas_financeiras",
        sa.Column("external_ref", sa.String(120), nullable=True),
    )
    op.create_index(
        "ix_contas_financeiras_external_ref",
        "contas_financeiras",
        ["external_ref"],
    )


def downgrade() -> None:
    op.drop_index("ix_contas_financeiras_external_ref", table_name="contas_financeiras")
    op.drop_column("contas_financeiras", "external_ref")
