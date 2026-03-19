"""Store images as binary in database.

Revision ID: 009_image_binary_storage
Revises: 008_user_profile_fields
Create Date: 2026-03-19 10:00:00.000000

This migration adds binary image storage columns:
- tenant_configs.logo_data (BYTEA) + logo_content_type
- users.profile_photo_data (BYTEA) + profile_photo_content_type
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "009_image_binary_storage"
down_revision = "008_user_profile_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # -- tenant_configs --
    tc_columns = {col["name"] for col in inspector.get_columns("tenant_configs")}

    if "logo_data" not in tc_columns:
        op.add_column(
            "tenant_configs",
            sa.Column("logo_data", sa.LargeBinary(), nullable=True),
        )

    if "logo_content_type" not in tc_columns:
        op.add_column(
            "tenant_configs",
            sa.Column("logo_content_type", sa.String(length=50), nullable=True),
        )

    # -- users --
    user_columns = {col["name"] for col in inspector.get_columns("users")}

    if "profile_photo_data" not in user_columns:
        op.add_column(
            "users",
            sa.Column("profile_photo_data", sa.LargeBinary(), nullable=True),
        )

    if "profile_photo_content_type" not in user_columns:
        op.add_column(
            "users",
            sa.Column("profile_photo_content_type", sa.String(length=50), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    user_columns = {col["name"] for col in inspector.get_columns("users")}
    if "profile_photo_content_type" in user_columns:
        op.drop_column("users", "profile_photo_content_type")
    if "profile_photo_data" in user_columns:
        op.drop_column("users", "profile_photo_data")

    tc_columns = {col["name"] for col in inspector.get_columns("tenant_configs")}
    if "logo_content_type" in tc_columns:
        op.drop_column("tenant_configs", "logo_content_type")
    if "logo_data" in tc_columns:
        op.drop_column("tenant_configs", "logo_data")
