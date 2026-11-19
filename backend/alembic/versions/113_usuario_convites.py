"""Tabela usuario_convites: convite por e-mail para entrar no painel do terreiro (11/2026).

O admin deixa de definir a senha de quem cadastra: a pessoa recebe um link e cria a própria
senha (ou usa a que já usa no GiraHub). A conta só nasce no aceite. Token opaco guardado como
sha256 (`token_hash`, único), 7 dias (`expira_em`), uso único (`usado_em`), cancelamento
(`revogado_em`) e recusa (`recusado_em`). No máximo um convite em aberto por e-mail no
terreiro: índice único parcial `uq_usuario_convites_aberto`.

Revision ID: 113_usuario_convites
Revises: 112_chaves_pix_cadastro_unico
Create Date: 2026-11-19
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "113_usuario_convites"
down_revision: str = "112_chaves_pix_cadastro_unico"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "usuario_convites",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column(
            "group_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("permission_groups.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expira_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("enviado_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("usado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revogado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recusado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("criado_por", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_usuario_convites_tenant_id", "usuario_convites", ["tenant_id"])
    op.create_index(
        "uq_usuario_convites_aberto",
        "usuario_convites",
        ["tenant_id", "email"],
        unique=True,
        postgresql_where=sa.text("usado_em IS NULL AND revogado_em IS NULL AND recusado_em IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_usuario_convites_aberto", table_name="usuario_convites")
    op.drop_index("ix_usuario_convites_tenant_id", table_name="usuario_convites")
    op.drop_table("usuario_convites")
