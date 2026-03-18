"""Add walk-in ticket support.

Revision ID: 007_walk_in_tickets
Revises: 006_sponsor_tickets
Create Date: 2026-03-18 10:20:00.000000

This migration adds:
- tenant_configs: enable_walk_in
- tickets: is_walk_in
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "007_walk_in_tickets"
down_revision = "006_sponsor_tickets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    tenant_config_columns = {column["name"] for column in inspector.get_columns("tenant_configs")}
    if "enable_walk_in" not in tenant_config_columns:
        op.add_column(
            "tenant_configs",
            sa.Column("enable_walk_in", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )

    ticket_columns = {column["name"] for column in inspector.get_columns("tickets")}
    if "is_walk_in" not in ticket_columns:
        op.add_column(
            "tickets",
            sa.Column("is_walk_in", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    ticket_columns = {column["name"] for column in inspector.get_columns("tickets")}
    if "is_walk_in" in ticket_columns:
        op.drop_column("tickets", "is_walk_in")

    tenant_config_columns = {column["name"] for column in inspector.get_columns("tenant_configs")}
    if "enable_walk_in" in tenant_config_columns:
        op.drop_column("tenant_configs", "enable_walk_in")