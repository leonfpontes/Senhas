"""Add contas_financeiras, categorias_financeiras, contas_bancarias tables.

Revision ID: 041_contas_financeiras
Revises: b6d4a9b749d5
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "041_contas_financeiras"
down_revision = "b6d4a9b749d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "categorias_financeiras",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nome", sa.String(100), nullable=False),
        sa.Column("tipo", sa.String(10), nullable=False, server_default="ambos"),
        sa.Column("cor", sa.String(7), nullable=True),
        sa.Column("ativo", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_categorias_financeiras_tenant_id", "categorias_financeiras", ["tenant_id"])

    op.create_table(
        "contas_bancarias",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nome", sa.String(100), nullable=False),
        sa.Column("banco", sa.String(100), nullable=True),
        sa.Column("saldo_inicial", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("ativo", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_contas_bancarias_tenant_id", "contas_bancarias", ["tenant_id"])

    op.create_table(
        "contas_financeiras",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", sa.String(10), nullable=False),
        sa.Column("descricao", sa.String(255), nullable=False),
        sa.Column("valor", sa.Numeric(10, 2), nullable=False),
        sa.Column("data_vencimento", sa.Date, nullable=False),
        sa.Column("data_competencia", sa.Date, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pendente"),
        sa.Column("data_pagamento", sa.Date, nullable=True),
        sa.Column("valor_pago", sa.Numeric(10, 2), nullable=True),
        sa.Column("categoria_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("categorias_financeiras.id", ondelete="SET NULL"), nullable=True),
        sa.Column("conta_bancaria_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contas_bancarias.id", ondelete="SET NULL"), nullable=True),
        sa.Column("recorrencia", sa.String(10), nullable=True),
        sa.Column("observacoes", sa.Text, nullable=True),
        sa.Column("comprovante_url", sa.String(500), nullable=True),
        sa.Column("criado_por", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_contas_financeiras_tenant_id", "contas_financeiras", ["tenant_id"])
    op.create_index("ix_contas_financeiras_tipo", "contas_financeiras", ["tipo"])
    op.create_index("ix_contas_financeiras_status", "contas_financeiras", ["status"])
    op.create_index("ix_contas_financeiras_data_vencimento", "contas_financeiras", ["data_vencimento"])

    # Add CONTAS_FINANCEIRAS to permission_feature enum
    bind = op.get_bind()
    bind.execute(sa.text(
        "ALTER TYPE permission_feature ADD VALUE IF NOT EXISTS 'contas_financeiras'"
    ))


def downgrade() -> None:
    op.drop_table("contas_financeiras")
    op.drop_table("contas_bancarias")
    op.drop_table("categorias_financeiras")
