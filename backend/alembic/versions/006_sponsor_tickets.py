"""Add sponsor ticket support - sponsor fields on giras, tickets, senha_controls, tenant_configs.

Revision ID: 006_sponsor_tickets
Revises: 005_ticket_door_fields
Create Date: 2026-03-17 10:00:00.000000

This migration adds:
- giras: sponsor_max_tickets, sponsor_release_start_at, sponsor_release_end_at
- tickets: is_sponsor (boolean, default false)
- senha_controls: is_sponsor (boolean, default false) + updated unique constraint
- tenant_configs: sponsor_priority_mode (string, default 'first')
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "006_sponsor_tickets"
down_revision = "005_ticket_door_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- giras: sponsor emission config --
    op.add_column("giras", sa.Column("sponsor_max_tickets", sa.Integer(), nullable=True))
    op.add_column("giras", sa.Column("sponsor_release_start_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("giras", sa.Column("sponsor_release_end_at", sa.DateTime(timezone=True), nullable=True))

    # -- tickets: sponsor flag --
    op.add_column("tickets", sa.Column("is_sponsor", sa.Boolean(), nullable=False, server_default=sa.text("false")))

    # -- senha_controls: sponsor flag + new unique constraint --
    op.add_column("senha_controls", sa.Column("is_sponsor", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.drop_constraint("uq_senha_control_tenant_gira", "senha_controls", type_="unique")
    op.create_unique_constraint(
        "uq_senha_control_tenant_gira_sponsor",
        "senha_controls",
        ["tenant_id", "gira_id", "is_sponsor"],
    )

    # -- tenant_configs: sponsor priority mode --
    op.add_column(
        "tenant_configs",
        sa.Column("sponsor_priority_mode", sa.String(20), nullable=False, server_default="first"),
    )


def downgrade() -> None:
    # -- tenant_configs --
    op.drop_column("tenant_configs", "sponsor_priority_mode")

    # -- senha_controls: revert constraint --
    op.drop_constraint("uq_senha_control_tenant_gira_sponsor", "senha_controls", type_="unique")
    # Remove sponsor rows before restoring old constraint
    op.execute("DELETE FROM senha_controls WHERE is_sponsor = true")
    op.create_unique_constraint(
        "uq_senha_control_tenant_gira",
        "senha_controls",
        ["tenant_id", "gira_id"],
    )
    op.drop_column("senha_controls", "is_sponsor")

    # -- tickets --
    op.drop_column("tickets", "is_sponsor")

    # -- giras --
    op.drop_column("giras", "sponsor_release_end_at")
    op.drop_column("giras", "sponsor_release_start_at")
    op.drop_column("giras", "sponsor_max_tickets")
