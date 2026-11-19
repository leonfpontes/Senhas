"""Ordem de atendimento da fila da Porta, escolhida por terreiro.

`tenant_configs.queue_order_mode`:
- ``numero`` (padrão): a fila segue o número da senha, como sempre foi;
- ``chegada``: quem já chegou (check-in) vem primeiro, na ordem em que chegou;
  quem ainda não chegou fica depois, pelo número.

As faixas de prioridade (preferenciais por categoria) e a regra dos associados
continuam valendo nos dois modos. Padrão ``numero``: nada muda para quem já existe.

Revision ID: 109_ordem_atendimento_fila
Revises: 108_tenant_ia_site_liberada
Create Date: 2026-11-19
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "109_ordem_atendimento_fila"
down_revision = "108_tenant_ia_site_liberada"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenant_configs",
        sa.Column("queue_order_mode", sa.String(length=20), nullable=False, server_default="numero"),
    )
    op.create_check_constraint(
        "ck_tenant_configs_queue_order_mode",
        "tenant_configs",
        "queue_order_mode IN ('numero', 'chegada')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_tenant_configs_queue_order_mode", "tenant_configs", type_="check")
    op.drop_column("tenant_configs", "queue_order_mode")
