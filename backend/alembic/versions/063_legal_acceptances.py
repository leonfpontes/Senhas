"""Tabela legal_acceptances: prova do aceite dos Termos e da Privacidade no cadastro.

Até aqui o cadastro exigia o checkbox "Li e aceito os Termos de Uso e a Política de
Privacidade", mas não guardava nada. Agora cada aceite vira uma linha com documento, versão,
data, IP e navegador (só acréscimo: versão nova = linha nova).

Contas antigas não ganham linha retroativa: não há como provar um aceite que não foi gravado.

Revision ID: 063_legal_acceptances
Revises: 062_permissao_site_copia
Create Date: 2026-10-07
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "063_legal_acceptances"
down_revision: str = "062_permissao_site_copia"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "legal_acceptances",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document", sa.String(20), nullable=False),
        sa.Column("version", sa.String(20), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(255), nullable=True),
        sa.UniqueConstraint("user_id", "document", "version", name="uq_legal_acceptances_user_document_version"),
    )
    op.create_index("ix_legal_acceptances_tenant_id", "legal_acceptances", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_legal_acceptances_tenant_id", table_name="legal_acceptances")
    op.drop_table("legal_acceptances")
