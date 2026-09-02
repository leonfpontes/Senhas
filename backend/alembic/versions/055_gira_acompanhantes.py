"""Acompanhantes por gira.

Nova feature opcional: o admin pode permitir, por gira, que o consulente leve
acompanhantes. Na emissão pública o titular escolhe quantos acompanhantes vai
levar (até giras.max_acompanhantes) e cada acompanhante recebe uma senha
própria, com número sequencial da mesma numeração da gira (consome
max_tickets normalmente).

- giras.allow_acompanhantes: toggle por gira (off por padrão)
- giras.max_acompanhantes: máximo de acompanhantes por emissão (nullable —
  só relevante quando allow_acompanhantes está ligado)
- tickets.is_acompanhante: marca a senha extra do acompanhante
- tickets.parent_ticket_id: vincula a senha do acompanhante à senha do
  titular, para cascatear cancelamento e listar os números no e-mail

Revision ID: 055_gira_acompanhantes
Revises: 054_purge_soft_deleted_gira_time_slots
Create Date: 2026-09-02
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "055_gira_acompanhantes"
down_revision: str = "054_purge_soft_deleted_gira_time_slots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "giras",
        sa.Column("allow_acompanhantes", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "giras",
        sa.Column("max_acompanhantes", sa.Integer(), nullable=True),
    )

    op.add_column(
        "tickets",
        sa.Column("is_acompanhante", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "tickets",
        sa.Column("parent_ticket_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tickets.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_tickets_parent_ticket_id", "tickets", ["parent_ticket_id"])


def downgrade() -> None:
    op.drop_index("ix_tickets_parent_ticket_id", table_name="tickets")
    op.drop_column("tickets", "parent_ticket_id")
    op.drop_column("tickets", "is_acompanhante")

    op.drop_column("giras", "max_acompanhantes")
    op.drop_column("giras", "allow_acompanhantes")
