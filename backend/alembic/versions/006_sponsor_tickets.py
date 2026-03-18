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
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "006_sponsor_tickets"
down_revision = "005_ticket_door_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

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

    # -- tenant_configs: create baseline table if missing, otherwise add sponsor column --
    if "tenant_configs" not in existing_tables:
        op.create_table(
            "tenant_configs",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
            sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
            sa.Column("logo_url", sa.String(length=500), nullable=True),
            sa.Column("primary_color", sa.String(length=7), nullable=False, server_default="#000000"),
            sa.Column("secondary_color", sa.String(length=7), nullable=False, server_default="#FFFFFF"),
            sa.Column("reply_to_email", sa.String(length=255), nullable=True),
            sa.Column("email_signature", sa.String(length=1000), nullable=True),
            sa.Column("enable_bulk_operations", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("enable_analytics", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("enable_webhooks", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("sponsor_priority_mode", sa.String(length=20), nullable=False, server_default="first"),
            sa.Column("custom_settings", postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("tenant_id", name="uq_tenant_configs_tenant_id"),
        )
        op.create_index("ix_tenant_configs_tenant_id", "tenant_configs", ["tenant_id"])
    else:
        existing_columns = {column["name"] for column in inspector.get_columns("tenant_configs")}
        if "sponsor_priority_mode" not in existing_columns:
            op.add_column(
                "tenant_configs",
                sa.Column("sponsor_priority_mode", sa.String(20), nullable=False, server_default="first"),
            )


def downgrade() -> None:
    # -- tenant_configs --
    bind = op.get_bind()
    inspector = inspect(bind)
    if "tenant_configs" in inspector.get_table_names():
        existing_columns = {column["name"] for column in inspector.get_columns("tenant_configs")}
        if "sponsor_priority_mode" in existing_columns:
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
