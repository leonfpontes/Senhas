"""Add user profile fields.

Revision ID: 008_user_profile_fields
Revises: 007_walk_in_tickets
Create Date: 2026-03-18 18:10:00.000000

This migration adds:
- users.full_name
- users.phone
- users.profile_photo_url
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "008_user_profile_fields"
down_revision = "007_walk_in_tickets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    user_columns = {column["name"] for column in inspector.get_columns("users")}

    if "full_name" not in user_columns:
        op.add_column("users", sa.Column("full_name", sa.String(length=255), nullable=True))

    if "phone" not in user_columns:
        op.add_column("users", sa.Column("phone", sa.String(length=20), nullable=True))

    if "profile_photo_url" not in user_columns:
        op.add_column("users", sa.Column("profile_photo_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    user_columns = {column["name"] for column in inspector.get_columns("users")}

    if "profile_photo_url" in user_columns:
        op.drop_column("users", "profile_photo_url")

    if "phone" in user_columns:
        op.drop_column("users", "phone")

    if "full_name" in user_columns:
        op.drop_column("users", "full_name")
