"""Add mediuns.data_entrada e mediuns.data_saida — vínculo com a casa.

Permite registrar quando o médium/cambone entrou na casa e, se inativado,
quando saiu — sem precisar excluir o cadastro. Usado para calcular tempo
de casa e identificar os integrantes mais antigos.

Revision ID: 048_mediuns_data_entrada_saida
Revises: 047_giras_recados
Create Date: 2026-07-09
"""

from alembic import op
import sqlalchemy as sa

revision: str = "048_mediuns_data_entrada_saida"
down_revision: str = "047_giras_recados"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "mediuns",
        sa.Column("data_entrada", sa.Date(), nullable=True),
    )
    op.add_column(
        "mediuns",
        sa.Column("data_saida", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("mediuns", "data_saida")
    op.drop_column("mediuns", "data_entrada")
