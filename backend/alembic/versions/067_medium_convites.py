"""Tabela medium_convites: convite da casa para a Área do Médium (AM-03).

Token opaco guardado como sha256 (`token_hash`, único), validade de 7 dias (`expira_em`),
uso único (`usado_em`) e revogação (`revogado_em`). No máximo um convite em aberto por
médium: índice único parcial `uq_medium_convites_aberto` (reenviar revoga o anterior).

Revision ID: 067_medium_convites
Revises: 066_tenant_area_medium
Create Date: 2026-10-07
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "067_medium_convites"
down_revision: str = "066_tenant_area_medium"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "medium_convites",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("medium_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("mediuns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expira_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("usado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revogado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("criado_por", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_medium_convites_tenant_id", "medium_convites", ["tenant_id"])
    op.create_index("ix_medium_convites_medium_id", "medium_convites", ["medium_id"])
    op.create_index(
        "uq_medium_convites_aberto",
        "medium_convites",
        ["medium_id"],
        unique=True,
        postgresql_where=sa.text("usado_em IS NULL AND revogado_em IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_medium_convites_aberto", table_name="medium_convites")
    op.drop_index("ix_medium_convites_medium_id", table_name="medium_convites")
    op.drop_index("ix_medium_convites_tenant_id", table_name="medium_convites")
    op.drop_table("medium_convites")
