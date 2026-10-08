"""Troca do e-mail de login com confirmação no endereço novo (AM-13, Perfil do médium).

`users.email_pendente` (o endereço pedido), `users.email_pendente_token_hash` (sha256 do token
opaco enviado só no link para o endereço novo; índice único) e `users.email_pendente_expira_em`
(24 h). O `users.email` só muda quando o link é aberto (`POST /api/v1/public/email/confirmar`);
as três colunas são limpas na confirmação (uso único) e trocadas a cada novo pedido.

Criada em paralelo com a 075 (AM-23): no merge, a ordem final é acertada pelo orquestrador.

Revision ID: 074_medium_email_pendente
Revises: 073_giras_orientacoes_corrente
Create Date: 2026-10-07
"""

import sqlalchemy as sa
from alembic import op

revision: str = "074_medium_email_pendente"
down_revision: str = "073_giras_orientacoes_corrente"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email_pendente", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("email_pendente_token_hash", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("email_pendente_expira_em", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        "uq_users_email_pendente_token_hash", "users", ["email_pendente_token_hash"], unique=True
    )


def downgrade() -> None:
    op.drop_index("uq_users_email_pendente_token_hash", table_name="users")
    op.drop_column("users", "email_pendente_expira_em")
    op.drop_column("users", "email_pendente_token_hash")
    op.drop_column("users", "email_pendente")
