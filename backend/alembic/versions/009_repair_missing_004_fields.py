"""Repair missing fields from 004 in legacy local databases.

Revision ID: 009_repair_missing_004_fields
Revises: 008_user_profile_fields
Create Date: 2026-03-19 09:45:00.000000

Some local/dev databases were stamped forward without fully applying
004_gira_senha_fields. This repair migration is idempotent and only adds
missing objects.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


revision = "009_repair_missing_004_fields"
down_revision = "008_user_profile_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # giras columns from 004
    gira_columns = {column["name"] for column in inspector.get_columns("giras")}
    if "max_tickets" not in gira_columns:
        op.add_column("giras", sa.Column("max_tickets", sa.Integer(), nullable=True))
    if "release_start_at" not in gira_columns:
        op.add_column("giras", sa.Column("release_start_at", sa.DateTime(timezone=True), nullable=True))
    if "release_end_at" not in gira_columns:
        op.add_column("giras", sa.Column("release_end_at", sa.DateTime(timezone=True), nullable=True))

    # consulentes normalized columns/index from 004
    consulente_columns = {column["name"] for column in inspector.get_columns("consulentes")}
    if "email_normalized" not in consulente_columns:
        op.add_column("consulentes", sa.Column("email_normalized", sa.String(length=255), nullable=True))
    if "phone_normalized" not in consulente_columns:
        op.add_column("consulentes", sa.Column("phone_normalized", sa.String(length=20), nullable=True))

    consulente_indexes = {index["name"] for index in inspector.get_indexes("consulentes")}
    if "ix_consulentes_email_normalized" not in consulente_indexes:
        op.create_index("ix_consulentes_email_normalized", "consulentes", ["email_normalized"])

    # backfill normalized email when available
    if "email_normalized" in {column["name"] for column in inspector.get_columns("consulentes")}:
        op.execute(
            "UPDATE consulentes "
            "SET email_normalized = LOWER(TRIM(email)) "
            "WHERE email IS NOT NULL AND (email_normalized IS NULL OR email_normalized = '')"
        )

    # tickets.emitido_por_id nullable from 004
    ticket_columns = inspector.get_columns("tickets")
    emitido_por_meta = next((column for column in ticket_columns if column["name"] == "emitido_por_id"), None)
    if emitido_por_meta is not None and emitido_por_meta.get("nullable") is False:
        op.alter_column(
            "tickets",
            "emitido_por_id",
            existing_type=postgresql.UUID(as_uuid=True),
            nullable=True,
        )


def downgrade() -> None:
    # Intentionally conservative: avoid destructive downgrade for repair migration.
    pass
