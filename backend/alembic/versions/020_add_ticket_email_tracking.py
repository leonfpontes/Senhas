"""Add email tracking fields to tickets.

Revision ID: 020_add_ticket_email_tracking
Revises: 019_fix_movimentacoes_fk
Create Date: 2026-04-01
"""
import sqlalchemy as sa
from alembic import op

revision: str = "020_add_ticket_email_tracking"
down_revision: str = "019_fix_movimentacoes_fk"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tickets", sa.Column("resend_email_id", sa.String(255), nullable=True))
    op.add_column("tickets", sa.Column("email_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tickets", sa.Column("email_provider", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("tickets", "email_provider")
    op.drop_column("tickets", "email_sent_at")
    op.drop_column("tickets", "resend_email_id")
