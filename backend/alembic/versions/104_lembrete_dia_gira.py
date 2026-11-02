"""Beta "Lembrete no dia da gira" — `tickets.lembrete_enviado_em`.

O agendador do lembrete marca a senha ANTES de enfileirar o e-mail (UPDATE ... WHERE
lembrete_enviado_em IS NULL RETURNING), então cada pessoa recebe no máximo um lembrete, mesmo
com dois workers. Aditiva; o downgrade só tira a coluna.

Revision ID: 104_lembrete_dia_gira
Revises: 103_senha_para_outra_pessoa
Create Date: 2026-11-02
"""

import sqlalchemy as sa
from alembic import op

revision: str = "104_lembrete_dia_gira"
down_revision: str = "103_senha_para_outra_pessoa"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tickets", sa.Column("lembrete_enviado_em", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("tickets", "lembrete_enviado_em")
