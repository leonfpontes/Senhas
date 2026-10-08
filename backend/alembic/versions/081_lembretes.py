"""Lembretes e avisos por e-mail da Área do Médium (AM-15).

- `medium_preferencias`: liga/desliga por tipo de aviso por e-mail (mensalidade, escalas,
  confirmação, faltas, avisos; tudo ligado por padrão) e o token do link "Não quero mais
  receber" do rodapé. Uma linha por médium.
- `medium_lembretes_enviados`: marca "já mandei" por (terreiro, tipo, referência, médium),
  gravada ANTES do envio com `INSERT ... ON CONFLICT DO NOTHING RETURNING` — com 2 workers só
  um envia. Índice único parcial para as marcas com médium e outro para as do terreiro (resumo
  diário dos administradores, sem médium).
- `tenant_configs.area_medium_lembrete_mensalidade` (padrão ligado, D-29): a casa pode desligar os
  lembretes da mensalidade.
- `comunicados.avisar_email` + `avisar_email_em`: "Avisar por e-mail também" no aviso.

Downgrade: apaga as tabelas e as colunas (marcas e preferências se perdem).

Revision ID: 081_lembretes
Revises: 080_escala_planos
Create Date: 2026-10-08
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "081_lembretes"
down_revision: str = "080_escala_planos"
branch_labels = None
depends_on = None

TIPOS = (
    "mensalidade_antes",
    "mensalidade_depois",
    "pix_alterado",
    "escala_nova",
    "vespera",
    "confirmacao",
    "falta",
    "aviso",
    "cancelada",
    "resumo_admin",
)


def _in(coluna: str, valores) -> str:
    return f"{coluna} IN (" + ", ".join(f"'{v}'" for v in valores) + ")"


def _uuid_fk(nome: str, alvo: str, **kw) -> sa.Column:
    return sa.Column(nome, postgresql.UUID(as_uuid=True), sa.ForeignKey(alvo, ondelete="CASCADE"), **kw)


def upgrade() -> None:
    op.add_column(
        "tenant_configs",
        sa.Column("area_medium_lembrete_mensalidade", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column(
        "comunicados", sa.Column("avisar_email", sa.Boolean(), nullable=False, server_default=sa.text("false"))
    )
    op.add_column("comunicados", sa.Column("avisar_email_em", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "medium_preferencias",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
        _uuid_fk("medium_id", "mediuns.id", nullable=False),
        sa.Column("email_mensalidade", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("email_escalas", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("email_confirmacao", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("email_faltas", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("email_avisos", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("token_descadastro", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("medium_id", name="uq_medium_preferencias_medium"),
        sa.UniqueConstraint("token_descadastro", name="uq_medium_preferencias_token"),
    )
    op.create_index("ix_medium_preferencias_tenant_id", "medium_preferencias", ["tenant_id"])

    op.create_table(
        "medium_lembretes_enviados",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
        _uuid_fk("medium_id", "mediuns.id", nullable=True),
        sa.Column("tipo", sa.String(30), nullable=False),
        sa.Column("referencia", sa.String(80), nullable=False),
        sa.Column("enviado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(_in("tipo", TIPOS), name="ck_medium_lembretes_enviados_tipo"),
    )
    op.create_index(
        "uq_medium_lembretes_enviados_medium",
        "medium_lembretes_enviados",
        ["tenant_id", "tipo", "referencia", "medium_id"],
        unique=True,
        postgresql_where=sa.text("medium_id IS NOT NULL"),
    )
    op.create_index(
        "uq_medium_lembretes_enviados_terreiro",
        "medium_lembretes_enviados",
        ["tenant_id", "tipo", "referencia"],
        unique=True,
        postgresql_where=sa.text("medium_id IS NULL"),
    )
    op.create_index("ix_medium_lembretes_enviados_medium_id", "medium_lembretes_enviados", ["medium_id"])


def downgrade() -> None:
    op.drop_index("ix_medium_lembretes_enviados_medium_id", table_name="medium_lembretes_enviados")
    op.drop_index("uq_medium_lembretes_enviados_terreiro", table_name="medium_lembretes_enviados")
    op.drop_index("uq_medium_lembretes_enviados_medium", table_name="medium_lembretes_enviados")
    op.drop_table("medium_lembretes_enviados")
    op.drop_index("ix_medium_preferencias_tenant_id", table_name="medium_preferencias")
    op.drop_table("medium_preferencias")
    op.drop_column("comunicados", "avisar_email_em")
    op.drop_column("comunicados", "avisar_email")
    op.drop_column("tenant_configs", "area_medium_lembrete_mensalidade")
