"""Cria as tabelas de cursos presenciais e participantes.

Revision ID: 039_cursos_presenciais
Revises: 038_priority_category
Create Date: 2026-06-02

Esta migração adiciona as tabelas ``cursos_presenciais`` e ``curso_participantes``,
com índices para facilitar consultas por tenant, data de início e status.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# Identificadores de revisão usados pelo Alembic.
revision: str = "039_cursos_presenciais"
down_revision: str = "038_priority_category"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Tabela de cursos presenciais
    op.create_table(
        "cursos_presenciais",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("titulo", sa.String(255), nullable=False),
        sa.Column("ementa", sa.Text, nullable=True),
        sa.Column("data_inicio", sa.DateTime(timezone=True), nullable=False),
        sa.Column("data_fim", sa.DateTime(timezone=True), nullable=True),
        sa.Column("max_participantes", sa.Integer, nullable=True),
        sa.Column("valor_mensalidade_padrao", sa.Numeric(10, 2), nullable=True),
        sa.Column("local", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("observacoes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_cursos_presenciais_tenant_id", "cursos_presenciais", ["tenant_id"]
    )
    op.create_index(
        "ix_cursos_presenciais_data_inicio", "cursos_presenciais", ["data_inicio"]
    )
    op.create_index(
        "ix_cursos_presenciais_is_active", "cursos_presenciais", ["is_active"]
    )

    # Tabela de participantes dos cursos
    op.create_table(
        "curso_participantes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "curso_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cursos_presenciais.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("data_nascimento", sa.Date, nullable=True),
        sa.Column("celular", sa.String(20), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("valor_mensalidade", sa.Numeric(10, 2), nullable=True),
        sa.Column("pago", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("valor_pago", sa.Numeric(10, 2), nullable=True),
        sa.Column("data_pagamento", sa.DateTime(timezone=True), nullable=True),
        sa.Column("observacoes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_curso_participantes_tenant_id", "curso_participantes", ["tenant_id"]
    )
    op.create_index(
        "ix_curso_participantes_curso_id", "curso_participantes", ["curso_id"]
    )


def downgrade() -> None:
    # Remove índices e tabelas na ordem inversa
    op.drop_index(
        "ix_curso_participantes_curso_id", table_name="curso_participantes"
    )
    op.drop_index(
        "ix_curso_participantes_tenant_id", table_name="curso_participantes"
    )
    op.drop_table("curso_participantes")

    op.drop_index(
        "ix_cursos_presenciais_is_active", table_name="cursos_presenciais"
    )
    op.drop_index(
        "ix_cursos_presenciais_data_inicio", table_name="cursos_presenciais"
    )
    op.drop_index(
        "ix_cursos_presenciais_tenant_id", table_name="cursos_presenciais"
    )
    op.drop_table("cursos_presenciais")