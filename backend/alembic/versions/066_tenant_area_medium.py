"""Chave da Área do Médium por terreiro (lançamento em piloto).

`tenants.area_medium_liberada` (bool, padrão false). A Área do Médium vai para a
produção desligada; a plataforma liga por terreiro em /platform (Tenant 360) e,
no lançamento, para todos. Vale junto com o plano (`area_medium`, Basic+).

Revision ID: 066_tenant_area_medium
Revises: 065_mediuns_user_id
Create Date: 2026-10-07
"""

import sqlalchemy as sa
from alembic import op

revision: str = "066_tenant_area_medium"
down_revision: str = "065_mediuns_user_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("area_medium_liberada", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("tenants", "area_medium_liberada")
