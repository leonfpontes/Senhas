"""Merge 009 dual heads into single lineage.

Revision ID: 010_merge_009_heads
Revises: 009_image_binary_storage, 009_repair_missing_004_fields
Create Date: 2026-03-19 14:00:00.000000
"""

from alembic import op

revision = "010_merge_009_heads"
down_revision = ("009_image_binary_storage", "009_repair_missing_004_fields")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
