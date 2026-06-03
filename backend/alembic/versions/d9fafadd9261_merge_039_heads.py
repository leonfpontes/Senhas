"""merge_039_heads

Revision ID: d9fafadd9261
Revises: 039_email_unique, 039_cursos_presenciais
Create Date: 2026-06-03 13:27:49.685074

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers used by Alembic.
revision = 'd9fafadd9261'
down_revision = ('039_email_unique', '039_cursos_presenciais')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
