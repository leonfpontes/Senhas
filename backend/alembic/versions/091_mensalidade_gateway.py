"""Mensalidade com baixa automática — gateway da casa e cobranças dinâmicas (F-02/AM-22).

Tabelas (colunas "enum" são texto com CHECK, minúsculas):
- `mensalidade_gateways`: a conta de recebimentos que a casa conectou — uma por terreiro
  (`tenant_id` único). `provedor` stripe | mercadopago (decisão do dono de 09/10: cada casa
  escolhe), `status` pendente | ativo | desconectado, capacidades vindas do provedor
  (`pix_disponivel`, `boleto_disponivel`, `cadastro_completo`, `recebimentos_ativos`),
  `stripe_account_id` (único; id da conta conectada, não é segredo) e as colunas do Mercado Pago
  reservadas para o PR seguinte (`mp_user_id`, `mp_access_token_enc`, `mp_refresh_token_enc`,
  `mp_token_expira_em` — tokens só cifrados, core/secret_box).
- `mensalidade_cobrancas`: cobrança dinâmica (PIX/boleto) na conta da casa para um médium e um
  mês. `external_id` único por provedor (`uq_mensalidade_cobrancas_provedor_external`),
  `conta_externa` (conta da casa no provedor), status pendente | paga | expirada | cancelada |
  estornada, copia-e-cola, boleto, `expira_em`, `pago_em`, `valor_pago`, `raw` (JSONB mínimo, sem
  dado pessoal). Índice único parcial: uma cobrança pendente por médium + mês + método.

Coluna nova: `mensalidade_pagamentos.origem` (direcao | gateway, NULL nos registros antigos) —
"Paga pelo PIX (automático)" × "Confirmada pela direção" no painel.

Sem ENUM novo e sem feature de grupo nova (o gateway é do módulo FINANCEIRO).

Downgrade: apaga as duas tabelas e a coluna (as cobranças se perdem; os meses pagos continuam
PAGO em `mensalidade_pagamentos`).

Revision ID: 091_mensalidade_gateway
Revises: 089_ficha_espiritual
Create Date: 2026-10-09
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "091_mensalidade_gateway"
# Criada em paralelo com a 090 (outro card): o orquestrador re-encadeia no merge.
down_revision: str = "089_ficha_espiritual"
branch_labels = None
depends_on = None

PROVEDORES = ("stripe", "mercadopago")
STATUS_GATEWAY = ("pendente", "ativo", "desconectado")
METODOS = ("pix", "boleto")
STATUS_COBRANCA = ("pendente", "paga", "expirada", "cancelada", "estornada")


def _in(coluna: str, valores) -> str:
    return f"{coluna} IN (" + ", ".join(f"'{v}'" for v in valores) + ")"


def _uuid_fk(nome: str, alvo: str, ondelete: str = "CASCADE", **kw) -> sa.Column:
    return sa.Column(nome, postgresql.UUID(as_uuid=True), sa.ForeignKey(alvo, ondelete=ondelete), **kw)


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ]


def _flag(nome: str) -> sa.Column:
    return sa.Column(nome, sa.Boolean(), nullable=False, server_default=sa.text("false"))


def upgrade() -> None:
    op.create_table(
        "mensalidade_gateways",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False, unique=True),
        sa.Column("provedor", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pendente"),
        _flag("pix_disponivel"),
        _flag("boleto_disponivel"),
        _flag("cadastro_completo"),
        _flag("recebimentos_ativos"),
        sa.Column("stripe_account_id", sa.String(255), nullable=True, unique=True),
        sa.Column("mp_user_id", sa.String(64), nullable=True),
        sa.Column("mp_access_token_enc", sa.Text(), nullable=True),
        sa.Column("mp_refresh_token_enc", sa.Text(), nullable=True),
        sa.Column("mp_token_expira_em", sa.DateTime(timezone=True), nullable=True),
        _uuid_fk("conectado_por", "users.id", ondelete="SET NULL", nullable=True),
        sa.Column("conectado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("desconectado_em", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.CheckConstraint(_in("provedor", PROVEDORES), name="ck_mensalidade_gateways_provedor"),
        sa.CheckConstraint(_in("status", STATUS_GATEWAY), name="ck_mensalidade_gateways_status"),
    )

    op.create_table(
        "mensalidade_cobrancas",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
        _uuid_fk("mediun_id", "mediuns.id", nullable=False),
        sa.Column("mes_referencia", sa.Date(), nullable=False),
        sa.Column("valor", sa.Numeric(10, 2), nullable=False),
        sa.Column("provedor", sa.String(20), nullable=False),
        sa.Column("conta_externa", sa.String(255), nullable=False),
        sa.Column("external_id", sa.String(255), nullable=False),
        sa.Column("metodo", sa.String(10), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pendente"),
        sa.Column("copia_e_cola", sa.Text(), nullable=True),
        sa.Column("boleto_url", sa.Text(), nullable=True),
        sa.Column("boleto_linha_digitavel", sa.String(100), nullable=True),
        sa.Column("expira_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pago_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valor_pago", sa.Numeric(10, 2), nullable=True),
        _uuid_fk("criado_por", "users.id", ondelete="SET NULL", nullable=True),
        sa.Column("raw", postgresql.JSONB(), nullable=True),
        *_timestamps(),
        sa.CheckConstraint(_in("provedor", PROVEDORES), name="ck_mensalidade_cobrancas_provedor"),
        sa.CheckConstraint(_in("metodo", METODOS), name="ck_mensalidade_cobrancas_metodo"),
        sa.CheckConstraint(_in("status", STATUS_COBRANCA), name="ck_mensalidade_cobrancas_status"),
        sa.UniqueConstraint("provedor", "external_id", name="uq_mensalidade_cobrancas_provedor_external"),
    )
    op.create_index("ix_mensalidade_cobrancas_tenant_mes", "mensalidade_cobrancas", ["tenant_id", "mes_referencia"])
    op.create_index("ix_mensalidade_cobrancas_mediun_mes", "mensalidade_cobrancas", ["mediun_id", "mes_referencia"])
    op.create_index(
        "uq_mensalidade_cobrancas_pendente",
        "mensalidade_cobrancas",
        ["mediun_id", "mes_referencia", "metodo"],
        unique=True,
        postgresql_where=sa.text("status = 'pendente'"),
    )

    op.add_column("mensalidade_pagamentos", sa.Column("origem", sa.String(20), nullable=True))
    op.create_check_constraint(
        "ck_mensalidade_pagamentos_origem",
        "mensalidade_pagamentos",
        "origem IS NULL OR origem IN ('direcao', 'gateway')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_mensalidade_pagamentos_origem", "mensalidade_pagamentos", type_="check")
    op.drop_column("mensalidade_pagamentos", "origem")
    op.drop_index("uq_mensalidade_cobrancas_pendente", table_name="mensalidade_cobrancas")
    op.drop_index("ix_mensalidade_cobrancas_mediun_mes", table_name="mensalidade_cobrancas")
    op.drop_index("ix_mensalidade_cobrancas_tenant_mes", table_name="mensalidade_cobrancas")
    op.drop_table("mensalidade_cobrancas")
    op.drop_table("mensalidade_gateways")
