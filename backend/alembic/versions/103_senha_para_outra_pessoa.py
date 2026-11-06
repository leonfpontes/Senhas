"""Beta "Senha para outra pessoa" — `tickets.email_de_quem_pediu`.

Com a beta ligada, quem preenche pega a senha em nome de quem vai: a senha fica com um
consulente sem e-mail (o nome chamado na porta, como o acompanhante) e o e-mail de quem
preencheu fica aqui, para receber o bilhete, a fila de espera e os reenvios. Vazio em
toda senha comum. Aditiva; o downgrade só tira a coluna.

Revision ID: 103_senha_para_outra_pessoa
Revises: 102_laboratorio_beta_tester
Create Date: 2026-11-02
"""

import sqlalchemy as sa
from alembic import op

revision: str = "103_senha_para_outra_pessoa"
down_revision: str = "102_laboratorio_beta_tester"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tickets", sa.Column("email_de_quem_pediu", sa.String(255), nullable=True))
    op.create_index(
        "ix_tickets_email_de_quem_pediu",
        "tickets",
        ["tenant_id", "email_de_quem_pediu"],
        postgresql_where=sa.text("email_de_quem_pediu IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_tickets_email_de_quem_pediu", table_name="tickets")
    op.drop_column("tickets", "email_de_quem_pediu")
