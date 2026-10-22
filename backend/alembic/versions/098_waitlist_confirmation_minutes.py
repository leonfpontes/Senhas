"""Prazo da fila de espera em minutos (`giras.waitlist_confirmation_minutes`).

O prazo para quem foi promovido da fila confirmar a vaga era guardado em horas inteiras
(`waitlist_confirmation_hours`); agora aceita tempo quebrado (ex.: 1h30, 45 min) e passa a ser
guardado em minutos. Os valores existentes são convertidos (`horas * 60`).

Downgrade: volta para horas arredondando para cima (90 min → 2h; nunca encurta o prazo).

Revision ID: 098_waitlist_confirmation_minutes
Revises: 097_platform_recibos
Create Date: 2026-10-22
"""

import sqlalchemy as sa
from alembic import op

revision: str = "098_waitlist_confirmation_minutes"
down_revision: str = "097_platform_recibos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("giras", sa.Column("waitlist_confirmation_minutes", sa.Integer(), nullable=True))
    op.execute(
        "UPDATE giras SET waitlist_confirmation_minutes = waitlist_confirmation_hours * 60 "
        "WHERE waitlist_confirmation_hours IS NOT NULL"
    )
    op.drop_column("giras", "waitlist_confirmation_hours")


def downgrade() -> None:
    op.add_column("giras", sa.Column("waitlist_confirmation_hours", sa.Integer(), nullable=True))
    op.execute(
        "UPDATE giras SET waitlist_confirmation_hours = CEIL(waitlist_confirmation_minutes / 60.0)::int "
        "WHERE waitlist_confirmation_minutes IS NOT NULL"
    )
    op.drop_column("giras", "waitlist_confirmation_minutes")
