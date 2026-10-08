"""Presença (AM-17/AM-28) — participações, modo de presença da casa e do tipo, prazo da justificativa.

- `atividade_participacoes` (§8.3 do plano da Área do Médium): uma linha por médium por
  atividade — convocação (`convocado`, `origem`, `grupo_id`, `funcao_id`), resposta (vou/não
  vou), justificativa (≤ 500, dado possivelmente de saúde — §6.8), presença (`presenca`,
  `presenca_origem`, quem registrou e quando), dispensa e substituição (fase 2). Colunas "enum"
  são texto com CHECK, minúsculas. **Única por (`atividade_id`, `medium_id`)**: o "Cheguei" e a
  chamada ao mesmo tempo nunca duplicam a linha.
- `tenant_configs.presenca_modo_padrao` (`confianca` | `app` | `qr`, padrão `confianca`, D-11) e
  `tenant_configs.presenca_prazo_justificativa_dias` (1 a 30, padrão 7, D-12).
- `atividade_tipos.presenca_modo` (null = padrão da casa). Dados: tipo com o "Cheguei" ligado no
  AM-08 (`checkin_pelo_medium`) passa a ter o modo `app` explícito — nada muda para a casa.
- O QR do dia (AM-28) não tem tabela: o código é um HMAC do id da atividade + janela de 60 s
  com a chave do servidor (`services/presenca.codigo_qr`).

Downgrade: apaga a tabela e as colunas (as participações se perdem).

Revision ID: 079_presenca
Revises: 078_atividades
Create Date: 2026-10-08
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "079_presenca"
down_revision: str = "078_atividades"
branch_labels = None
depends_on = None

MODOS = ("confianca", "app", "qr")
ORIGENS = ("elegivel", "grupo", "funcao", "rodizio", "manual", "avulso")
RESPOSTAS = ("sem_resposta", "vou", "nao_vou")
PRESENCAS = ("nao_registrada", "presente", "ausente")
PRESENCA_ORIGENS = ("checkin_medium", "chamada", "encerramento", "confianca")


def _in(coluna: str, valores) -> str:
    return f"{coluna} IN (" + ", ".join(f"'{v}'" for v in valores) + ")"


def _uuid_fk(nome: str, alvo: str, ondelete="CASCADE", **kw) -> sa.Column:
    return sa.Column(nome, postgresql.UUID(as_uuid=True), sa.ForeignKey(alvo, ondelete=ondelete), **kw)


def upgrade() -> None:
    op.add_column(
        "tenant_configs",
        sa.Column("presenca_modo_padrao", sa.String(20), nullable=False, server_default="confianca"),
    )
    op.add_column(
        "tenant_configs",
        sa.Column("presenca_prazo_justificativa_dias", sa.Integer(), nullable=False, server_default="7"),
    )
    op.create_check_constraint("ck_tenant_configs_presenca_modo", "tenant_configs", _in("presenca_modo_padrao", MODOS))
    op.create_check_constraint(
        "ck_tenant_configs_presenca_prazo", "tenant_configs", "presenca_prazo_justificativa_dias BETWEEN 1 AND 30"
    )

    op.add_column("atividade_tipos", sa.Column("presenca_modo", sa.String(20), nullable=True))
    op.create_check_constraint(
        "ck_atividade_tipos_presenca_modo", "atividade_tipos", "presenca_modo IS NULL OR " + _in("presenca_modo", MODOS)
    )
    op.execute("UPDATE atividade_tipos SET presenca_modo = 'app' WHERE checkin_pelo_medium")

    op.create_table(
        "atividade_participacoes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
        _uuid_fk("atividade_id", "atividades.id", nullable=False),
        _uuid_fk("medium_id", "mediuns.id", nullable=False),
        sa.Column("convocado", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("origem", sa.String(20), nullable=False, server_default="elegivel"),
        _uuid_fk("grupo_id", "corrente_grupos.id", ondelete="SET NULL", nullable=True),
        _uuid_fk("funcao_id", "funcoes_corrente.id", ondelete="SET NULL", nullable=True),
        sa.Column("resposta", sa.String(20), nullable=False, server_default="sem_resposta"),
        sa.Column("respondido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("justificativa", sa.String(500), nullable=True),
        sa.Column("justificativa_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("presenca", sa.String(20), nullable=False, server_default="nao_registrada"),
        sa.Column("presenca_origem", sa.String(20), nullable=True),
        sa.Column("presenca_registrada_em", sa.DateTime(timezone=True), nullable=True),
        _uuid_fk("presenca_registrada_por", "users.id", ondelete="SET NULL", nullable=True),
        sa.Column("dispensado_em", sa.DateTime(timezone=True), nullable=True),
        _uuid_fk("substituida_por_id", "atividade_participacoes.id", ondelete="SET NULL", nullable=True),
        sa.Column("lembrete_enviado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("atividade_id", "medium_id", name="uq_atividade_participacoes_atividade_medium"),
        sa.CheckConstraint(_in("origem", ORIGENS), name="ck_atividade_participacoes_origem"),
        sa.CheckConstraint(_in("resposta", RESPOSTAS), name="ck_atividade_participacoes_resposta"),
        sa.CheckConstraint(_in("presenca", PRESENCAS), name="ck_atividade_participacoes_presenca"),
        sa.CheckConstraint(
            "presenca_origem IS NULL OR " + _in("presenca_origem", PRESENCA_ORIGENS),
            name="ck_atividade_participacoes_presenca_origem",
        ),
    )
    op.create_index(
        "ix_atividade_participacoes_tenant_medium", "atividade_participacoes", ["tenant_id", "medium_id"]
    )
    op.create_index(
        "ix_atividade_participacoes_tenant_atividade", "atividade_participacoes", ["tenant_id", "atividade_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_atividade_participacoes_tenant_atividade", table_name="atividade_participacoes")
    op.drop_index("ix_atividade_participacoes_tenant_medium", table_name="atividade_participacoes")
    op.drop_table("atividade_participacoes")
    op.drop_constraint("ck_atividade_tipos_presenca_modo", "atividade_tipos", type_="check")
    op.drop_column("atividade_tipos", "presenca_modo")
    op.drop_constraint("ck_tenant_configs_presenca_prazo", "tenant_configs", type_="check")
    op.drop_constraint("ck_tenant_configs_presenca_modo", "tenant_configs", type_="check")
    op.drop_column("tenant_configs", "presenca_prazo_justificativa_dias")
    op.drop_column("tenant_configs", "presenca_modo_padrao")
