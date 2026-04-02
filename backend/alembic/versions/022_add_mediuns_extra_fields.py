"""Add extra profile fields to mediuns table.

Revision ID: 022_add_mediuns_extra_fields
Revises: 021_add_mediuns_table
Create Date: 2026-04-02

Adds optional personal/contact fields to the mediuns table
so it can serve as a full profile record for the terreiro.
"""
from alembic import op
import sqlalchemy as sa

revision = "022_add_mediuns_extra_fields"
down_revision = "021_add_mediuns_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("mediuns", sa.Column("telefone", sa.String(30), nullable=True))
    op.add_column("mediuns", sa.Column("email", sa.String(255), nullable=True))
    op.add_column("mediuns", sa.Column("data_nascimento", sa.Date(), nullable=True))
    op.add_column("mediuns", sa.Column("endereco", sa.String(500), nullable=True))
    op.add_column("mediuns", sa.Column("observacoes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("mediuns", "observacoes")
    op.drop_column("mediuns", "endereco")
    op.drop_column("mediuns", "data_nascimento")
    op.drop_column("mediuns", "email")
    op.drop_column("mediuns", "telefone")
