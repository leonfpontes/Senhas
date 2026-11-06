"""Laboratório das betas — `tenants.beta_tester`.

A plataforma marca o terreiro como beta tester (como a `area_medium_liberada` da Área do Médium);
só então a casa vê Configurações › Laboratório e liga ou desliga cada beta. As betas ligadas ficam
em `feature_flags` com a chave `beta_<nome>` (tabela que já existe). Desligar não apaga dado.

Revision ID: 102_laboratorio_beta_tester
Revises: 101_comunicado_mediuns
Create Date: 2026-11-02
"""

import sqlalchemy as sa
from alembic import op

revision: str = "102_laboratorio_beta_tester"
down_revision: str = "101_comunicado_mediuns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("beta_tester", sa.Boolean(), server_default=sa.text("false"), nullable=False))


def downgrade() -> None:
    op.drop_column("tenants", "beta_tester")
