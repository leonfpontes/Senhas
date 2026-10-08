"""Programa de Parceiros GiraHub — pedidos de interesse (C-06).

- `parceiro_interesses`: quem preencheu o formulário público de `/parceiros` (loja de artigos
  religiosos, dirigente/médium, criador de conteúdo, federação...). Tabela da PLATAFORMA, sem
  `tenant_id` — o interessado ainda não tem conta. `ip_hash` é HMAC do IP (nunca o IP em claro).
  `status` (novo · em_contato · aprovado · recusado), `cupom` e `observacoes` são da equipe.

Downgrade: apaga a tabela (os pedidos se perdem).

Revision ID: 084_parceiros
Revises: 083_meus_dados_aniversarios
Create Date: 2026-10-08
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "084_parceiros"
down_revision: str = "083_meus_dados_aniversarios"
branch_labels = None
depends_on = None

TIPOS = ("loja", "dirigente_medium", "criador_conteudo", "federacao", "outro")
STATUS = ("novo", "em_contato", "aprovado", "recusado")


def _in(coluna: str, valores) -> str:
    return f"{coluna} IN (" + ", ".join(f"'{v}'" for v in valores) + ")"


def upgrade() -> None:
    op.create_table(
        "parceiro_interesses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("tipo", sa.String(30), nullable=False),
        sa.Column("nome_negocio", sa.String(160), nullable=True),
        sa.Column("cidade", sa.String(100), nullable=False),
        sa.Column("uf", sa.String(2), nullable=False),
        sa.Column("whatsapp", sa.String(20), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("como_divulgar", sa.Text(), nullable=False),
        sa.Column("aceite_regulamento_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ip_hash", sa.String(64), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'novo'")),
        sa.Column("cupom", sa.String(40), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(_in("tipo", TIPOS), name="ck_parceiro_interesses_tipo"),
        sa.CheckConstraint(_in("status", STATUS), name="ck_parceiro_interesses_status"),
    )
    op.create_index("ix_parceiro_interesses_status_created", "parceiro_interesses", ["status", "created_at"])
    op.create_index("ix_parceiro_interesses_email", "parceiro_interesses", ["email"])


def downgrade() -> None:
    op.drop_index("ix_parceiro_interesses_email", table_name="parceiro_interesses")
    op.drop_index("ix_parceiro_interesses_status_created", table_name="parceiro_interesses")
    op.drop_table("parceiro_interesses")
