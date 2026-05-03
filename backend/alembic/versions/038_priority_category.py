"""Add priority_category column to tickets

Revision ID: 038_priority_category
Revises: 037_merge_030_036
Create Date: 2026-05-03

Adds a nullable VARCHAR(50) column `priority_category` to the tickets table.
Valid values: ELDERLY | DISABILITY_OR_AUTISM | PREGNANT_LACTATING_OR_INFANT | REDUCED_MOBILITY

Backfill: tickets with observacoes containing '"preferencial"' (old boolean flag) are
initialized to 'ELDERLY' as the default migration category.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "038_priority_category"
down_revision = "037_merge_030_036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tickets",
        sa.Column("priority_category", sa.String(50), nullable=True),
    )
    op.create_index("ix_tickets_priority_category", "tickets", ["priority_category"])

    # Backfill: existing preferencial tickets get ELDERLY as default category
    op.execute(
        """
        UPDATE tickets
        SET priority_category = 'ELDERLY'
        WHERE observacoes IS NOT NULL
          AND observacoes::text LIKE '%"preferencial"%'
          AND priority_category IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_tickets_priority_category", table_name="tickets")
    op.drop_column("tickets", "priority_category")
