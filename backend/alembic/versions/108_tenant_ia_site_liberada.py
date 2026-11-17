"""Liberação da plataforma, por terreiro, da beta "Textos do site com IA".

A beta usa a chave da Anthropic do GiraHub, então não basta o terreiro ser beta tester: a plataforma
liga `tenants.ia_site_liberada` casa por casa em /platform. Sem isso a beta some do Laboratório e o
servidor recusa o pedido de sugestão. Coluna nova, padrão falso: nada muda para quem já existe.

Revision ID: 108_tenant_ia_site_liberada
Revises: 107_site_secoes_novo_construtor
Create Date: 2026-11-17
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "108_tenant_ia_site_liberada"
down_revision = "107_site_secoes_novo_construtor"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("ia_site_liberada", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("tenants", "ia_site_liberada")
