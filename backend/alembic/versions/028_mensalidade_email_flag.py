"""Add email_relatorio_ativo flag to mensalidade_configs.

Revision ID: 028_mensalidade_email_flag
Revises: 027_mensalidade_mediun
Create Date: 2026-04-07
"""
from alembic import op
import sqlalchemy as sa

revision = "028_mensalidade_email_flag"
down_revision = "027_mensalidade_mediun"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "mensalidade_configs",
        sa.Column(
            "email_relatorio_ativo",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("mensalidade_configs", "email_relatorio_ativo")
