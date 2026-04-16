"""Add password reset token fields to users table.

Revision ID: 035_password_reset
Revises: 034_assoc_pag_deleted_at
Create Date: 2026-04-13
"""
from alembic import op
import sqlalchemy as sa

revision = "035_password_reset"
down_revision = "034_assoc_pag_deleted_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("users")}

    if "reset_token_hash" not in cols:
        op.add_column(
            "users",
            sa.Column("reset_token_hash", sa.String(255), nullable=True),
        )

    if "reset_token_expires_at" not in cols:
        op.add_column(
            "users",
            sa.Column("reset_token_expires_at", sa.DateTime(timezone=True), nullable=True),
        )

    # Index for efficient token lookup
    existing_indexes = {idx["name"] for idx in inspector.get_indexes("users")}
    if "ix_users_reset_token_hash" not in existing_indexes:
        op.create_index("ix_users_reset_token_hash", "users", ["reset_token_hash"])


def downgrade() -> None:
    op.drop_index("ix_users_reset_token_hash", table_name="users")
    op.drop_column("users", "reset_token_expires_at")
    op.drop_column("users", "reset_token_hash")
