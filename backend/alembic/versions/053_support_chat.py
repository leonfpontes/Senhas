"""Add support_conversations / support_messages — chat de suporte tenant ↔ superadmin.

Cada usuário autenticado do tenant tem uma conversa 1:1 com o suporte da
plataforma (UNIQUE tenant_id+owner_user_id — "sessão por usuário"). O ADMIN
do tenant enxerga todas as conversas do seu terreiro via query própria
(sem tabela extra); o superadmin atende todas as conversas de todos os
tenants numa inbox nova em /platform/suporte.

- support_conversations: uma linha por usuário, com dois timestamps de
  leitura (owner_last_read_at / support_last_read_at — cada lado marca só a
  própria leitura) e last_message_at denormalizado pra ordenar a inbox sem
  subquery.
- support_messages: histórico de mensagens. sender_user_id usa
  ON DELETE SET NULL (não CASCADE) + sender_name_snapshot, pra sobreviver
  caso o usuário remetente seja removido depois.

Revision ID: 053_support_chat
Revises: 052_dedupe_consulentes_unique_email
Create Date: 2026-08-13
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers
revision: str = "053_support_chat"
down_revision: str = "052_dedupe_consulentes_unique_email"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Enum de status da conversa (IF NOT EXISTS para idempotência)
    op.execute(
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_conversation_status') "
        "THEN CREATE TYPE support_conversation_status AS ENUM ('open', 'resolved'); END IF; END $$"
    )

    # 2. Tabela de conversas — uma por (tenant, usuário)
    op.create_table(
        "support_conversations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_name_snapshot", sa.String(255), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM("open", "resolved", name="support_conversation_status", create_type=False),
            nullable=False,
            server_default="open",
        ),
        sa.Column("owner_last_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("support_last_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "owner_user_id", name="uq_support_conversations_tenant_owner"),
    )
    op.create_index("ix_support_conversations_tenant_id", "support_conversations", ["tenant_id"])
    op.create_index("ix_support_conversations_owner_user_id", "support_conversations", ["owner_user_id"])
    op.create_index("ix_support_conversations_status_last_message", "support_conversations", ["status", "last_message_at"])

    # 3. Tabela de mensagens
    op.create_table(
        "support_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("support_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("sender_name_snapshot", sa.String(255), nullable=False),
        sa.Column("is_from_support", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_support_messages_tenant_id", "support_messages", ["tenant_id"])
    op.create_index("ix_support_messages_conversation_id", "support_messages", ["conversation_id"])


def downgrade() -> None:
    op.drop_index("ix_support_messages_conversation_id", table_name="support_messages")
    op.drop_index("ix_support_messages_tenant_id", table_name="support_messages")
    op.drop_table("support_messages")

    op.drop_index("ix_support_conversations_status_last_message", table_name="support_conversations")
    op.drop_index("ix_support_conversations_owner_user_id", table_name="support_conversations")
    op.drop_index("ix_support_conversations_tenant_id", table_name="support_conversations")
    op.drop_table("support_conversations")

    op.execute("DROP TYPE IF EXISTS support_conversation_status")
