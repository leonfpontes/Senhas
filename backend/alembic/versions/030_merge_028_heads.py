"""merge 028 divergent heads

Revision ID: 030_merge_028_heads
Revises: 029_rename_enum_types, 028_slots_returned_senha_control
Create Date: 2026-04-26

"""

from alembic import op

revision = "030_merge_028_heads"
down_revision = ("029_rename_enum_types", "028_slots_returned_senha_control")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
