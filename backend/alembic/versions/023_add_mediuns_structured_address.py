"""Replace mediuns.endereco with structured address fields (cep, logradouro, numero, bairro, cidade).

Revision ID: 023_add_mediuns_structured_address
Revises: 022_add_mediuns_extra_fields
Create Date: 2026-04-02
"""
from alembic import op
import sqlalchemy as sa

revision = "023_mediuns_addr"
down_revision = "022_add_mediuns_extra_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("mediuns", "endereco")
    op.add_column("mediuns", sa.Column("cep", sa.String(9), nullable=True))
    op.add_column("mediuns", sa.Column("logradouro", sa.String(255), nullable=True))
    op.add_column("mediuns", sa.Column("numero", sa.String(20), nullable=True))
    op.add_column("mediuns", sa.Column("bairro", sa.String(100), nullable=True))
    op.add_column("mediuns", sa.Column("cidade", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("mediuns", "cidade")
    op.drop_column("mediuns", "bairro")
    op.drop_column("mediuns", "numero")
    op.drop_column("mediuns", "logradouro")
    op.drop_column("mediuns", "cep")
    op.add_column("mediuns", sa.Column("endereco", sa.String(500), nullable=True))
