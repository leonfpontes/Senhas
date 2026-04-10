"""Add slots_returned to senha_controls for ticket delete/vaga return.

Revision ID: 028_slots_returned_senha_control
Revises: 027_mensalidade_mediun
Create Date: 2026-04-09
"""
from alembic import op
import sqlalchemy as sa

revision = "028_slots_returned_senha_control"
down_revision = "027_mensalidade_mediun"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "senha_controls",
        sa.Column(
            "slots_returned",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )


def downgrade() -> None:
    op.drop_column("senha_controls", "slots_returned")
