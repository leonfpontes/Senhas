"""merge_030_036_heads

Revision ID: 037_merge_030_036
Revises: 030_merge_028_heads, 036_site_builder
Create Date: 2026-05-03 10:22:44.273961

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers used by Alembic.
revision = '037_merge_030_036'
down_revision = ('030_merge_028_heads', '036_site_builder')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
