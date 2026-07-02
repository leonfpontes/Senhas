"""Add giras.recados — texto livre opcional incluído no email de emissão.

Campo opcional para investimento, itens de doação ou outros avisos que o
terreiro queira comunicar junto com a senha do consulente. Quando vazio, o
bloco correspondente simplesmente não aparece no email (ver
services/email/templates/ticket_emission.py).

Revision ID: 047_giras_recados
Revises: 046_tenant_self_deactivated_at
Create Date: 2026-07-02
"""

from alembic import op
import sqlalchemy as sa

revision: str = "047_giras_recados"
down_revision: str = "046_tenant_self_deactivated_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "giras",
        sa.Column("recados", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("giras", "recados")
