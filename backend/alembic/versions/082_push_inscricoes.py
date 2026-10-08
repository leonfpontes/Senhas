"""Notificação no celular da Área do Médium (AM-16) — Web Push com VAPID.

- `push_inscricoes`: uma linha por aparelho/navegador que ligou as notificações (endpoint do
  serviço de push, único; chaves `p256dh`/`auth` da inscrição; `user_agent` curto; último envio
  com sucesso e falhas seguidas). Do médium (`tenant_id`, `user_id`, `medium_id`, FKs com CASCADE).
- `medium_preferencias.push_<tipo>` (mensalidade, escalas, confirmacao, faltas, avisos): o
  liga/desliga por tipo para o celular, separado do e-mail; tudo ligado por padrão (só vale para
  quem inscreveu um aparelho).

Sem tipo novo de lembrete: o push sai junto do e-mail pelo agendador do AM-15 e usa a mesma
marca `medium_lembretes_enviados` (uma vez só por lembrete, nos dois canais).

Downgrade: apaga a tabela e as colunas (as inscrições se perdem; o médium liga de novo no Perfil).

Revision ID: 082_push_inscricoes
Revises: 081_lembretes
Create Date: 2026-10-08
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "082_push_inscricoes"
down_revision: str = "081_lembretes"
branch_labels = None
depends_on = None

PREFERENCIAS = ("mensalidade", "escalas", "confirmacao", "faltas", "avisos")


def _uuid_fk(nome: str, alvo: str) -> sa.Column:
    return sa.Column(nome, postgresql.UUID(as_uuid=True), sa.ForeignKey(alvo, ondelete="CASCADE"), nullable=False)


def upgrade() -> None:
    for p in PREFERENCIAS:
        op.add_column(
            "medium_preferencias",
            sa.Column(f"push_{p}", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        )

    op.create_table(
        "push_inscricoes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _uuid_fk("tenant_id", "tenants.id"),
        _uuid_fk("user_id", "users.id"),
        _uuid_fk("medium_id", "mediuns.id"),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.String(200), nullable=False),
        sa.Column("auth", sa.String(200), nullable=False),
        sa.Column("user_agent", sa.String(120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failures", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.UniqueConstraint("endpoint", name="uq_push_inscricoes_endpoint"),
    )
    op.create_index("ix_push_inscricoes_tenant_medium", "push_inscricoes", ["tenant_id", "medium_id"])
    op.create_index("ix_push_inscricoes_user_id", "push_inscricoes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_push_inscricoes_user_id", table_name="push_inscricoes")
    op.drop_index("ix_push_inscricoes_tenant_medium", table_name="push_inscricoes")
    op.drop_table("push_inscricoes")
    for p in reversed(PREFERENCIAS):
        op.drop_column("medium_preferencias", f"push_{p}")
