"""Configuração da Área do Médium e chave PIX da mensalidade (AM-10).

`tenant_configs` (a casa decide o que o médium vê):
- `area_medium_ativa` (bool, padrão true): liga/desliga da própria casa. A chave da
  plataforma (`tenants.area_medium_liberada`, 066) continua valendo por cima.
- `area_medium_boas_vindas` (texto) e `area_medium_whatsapp` (dígitos com DDI,
  botão "Falar com a casa").
- `area_medium_agenda`, `area_medium_avisos`, `area_medium_mensalidade` (bool,
  padrão true): módulos visíveis na Área.

`mensalidade_configs` (para onde vai o dinheiro, docs/plano-area-do-medium.md §7.3):
- `pix_tipo` (cpf/cnpj/email/telefone/aleatoria, CHECK — string, não ENUM do PG),
  `pix_chave` (≤ 77, já normalizada no formato do DICT), `pix_nome_recebedor` (≤ 25),
  `pix_cidade` (≤ 15), `pix_instrucoes` e `pix_alterado_em`.

Revision ID: 068_area_medium_config_pix
Revises: 067_medium_convites
Create Date: 2026-10-07
"""

import sqlalchemy as sa
from alembic import op

revision: str = "068_area_medium_config_pix"
down_revision: str = "067_medium_convites"
branch_labels = None
depends_on = None

_TRUE = sa.text("true")


def upgrade() -> None:
    op.add_column("tenant_configs", sa.Column("area_medium_ativa", sa.Boolean(), nullable=False, server_default=_TRUE))
    op.add_column("tenant_configs", sa.Column("area_medium_boas_vindas", sa.Text(), nullable=True))
    op.add_column("tenant_configs", sa.Column("area_medium_whatsapp", sa.String(length=20), nullable=True))
    op.add_column("tenant_configs", sa.Column("area_medium_agenda", sa.Boolean(), nullable=False, server_default=_TRUE))
    op.add_column("tenant_configs", sa.Column("area_medium_avisos", sa.Boolean(), nullable=False, server_default=_TRUE))
    op.add_column(
        "tenant_configs", sa.Column("area_medium_mensalidade", sa.Boolean(), nullable=False, server_default=_TRUE)
    )

    op.add_column("mensalidade_configs", sa.Column("pix_tipo", sa.String(length=10), nullable=True))
    op.add_column("mensalidade_configs", sa.Column("pix_chave", sa.String(length=77), nullable=True))
    op.add_column("mensalidade_configs", sa.Column("pix_nome_recebedor", sa.String(length=25), nullable=True))
    op.add_column("mensalidade_configs", sa.Column("pix_cidade", sa.String(length=15), nullable=True))
    op.add_column("mensalidade_configs", sa.Column("pix_instrucoes", sa.Text(), nullable=True))
    op.add_column("mensalidade_configs", sa.Column("pix_alterado_em", sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint(
        "ck_mensalidade_configs_pix_tipo",
        "mensalidade_configs",
        "pix_tipo IS NULL OR pix_tipo IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_mensalidade_configs_pix_tipo", "mensalidade_configs", type_="check")
    for col in ("pix_alterado_em", "pix_instrucoes", "pix_cidade", "pix_nome_recebedor", "pix_chave", "pix_tipo"):
        op.drop_column("mensalidade_configs", col)
    for col in (
        "area_medium_mensalidade",
        "area_medium_avisos",
        "area_medium_agenda",
        "area_medium_whatsapp",
        "area_medium_boas_vindas",
        "area_medium_ativa",
    ):
        op.drop_column("tenant_configs", col)
