"""Add agendamento por horário (time-slot scheduling) support.

New optional feature: a gira can be split into named attendance time windows
(ex: 20h, 20h30, 21h) each with its own capacity, so consulentes pick when
they intend to be attended instead of everyone queuing at the door at once.

- tenant_configs.enable_time_slot_scheduling: tenant-wide toggle (off by default)
- giras.use_time_slots: per-gira toggle (off by default)
- gira_time_slot_templates: tenant-wide default set of horários, copied into
  a gira's own slots when it enables use_time_slots
- gira_time_slots: per-gira horário instances with SenhaControl-style atomic
  counters (total_emitido/slots_returned/version)
- tickets.time_slot_id: which horário the consulente picked (nullable)

Revision ID: 051_gira_time_slots
Revises: 050_trial_premium
Create Date: 2026-08-03
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "051_gira_time_slots"
down_revision: str = "050_trial_premium"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenant_configs",
        sa.Column("enable_time_slot_scheduling", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "giras",
        sa.Column("use_time_slots", sa.Boolean(), nullable=False, server_default="false"),
    )

    op.create_table(
        "gira_time_slot_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("horario", sa.Time(), nullable=False),
        sa.Column("capacidade_maxima", sa.Integer(), nullable=False),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_gira_time_slot_templates_tenant_id", "gira_time_slot_templates", ["tenant_id"])

    op.create_table(
        "gira_time_slots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("gira_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("giras.id", ondelete="CASCADE"), nullable=False),
        sa.Column("horario", sa.Time(), nullable=False),
        sa.Column("capacidade_maxima", sa.Integer(), nullable=False),
        sa.Column("total_emitido", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("slots_returned", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "gira_id", "horario", name="uq_gira_time_slot_tenant_gira_horario"),
    )
    op.create_index("ix_gira_time_slots_tenant_id", "gira_time_slots", ["tenant_id"])
    op.create_index("ix_gira_time_slots_gira_id", "gira_time_slots", ["gira_id"])

    op.add_column(
        "tickets",
        sa.Column("time_slot_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("gira_time_slots.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_tickets_time_slot_id", "tickets", ["time_slot_id"])


def downgrade() -> None:
    op.drop_index("ix_tickets_time_slot_id", table_name="tickets")
    op.drop_column("tickets", "time_slot_id")

    op.drop_index("ix_gira_time_slots_gira_id", table_name="gira_time_slots")
    op.drop_index("ix_gira_time_slots_tenant_id", table_name="gira_time_slots")
    op.drop_table("gira_time_slots")

    op.drop_index("ix_gira_time_slot_templates_tenant_id", table_name="gira_time_slot_templates")
    op.drop_table("gira_time_slot_templates")

    op.drop_column("giras", "use_time_slots")
    op.drop_column("tenant_configs", "enable_time_slot_scheduling")
