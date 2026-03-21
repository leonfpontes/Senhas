"""Widen invoices.invoice_number from VARCHAR(50) to VARCHAR(100)

Revision ID: 015_widen_invoice_number
Create Date: 2026-03-20

The generated invoice_number (INV-{uuid}-{timestamp}) can exceed 50 chars.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision: str = "015_widen_invoice_number"
down_revision: str = "014_add_free_plan_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "invoices",
        "invoice_number",
        existing_type=sa.String(50),
        type_=sa.String(100),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "invoices",
        "invoice_number",
        existing_type=sa.String(100),
        type_=sa.String(50),
        existing_nullable=False,
    )
