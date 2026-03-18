"""Add senha management fields to giras, consulentes, and tickets.

Revision ID: 004_gira_senha_fields
Revises: 003_platform_tables
Create Date: 2026-03-17 10:00:00.000000

This migration adds:
- giras: max_tickets, release_start_at, release_end_at (for senha emission control)
- consulentes: email_normalized, phone_normalized (for dedup lookups)
- tickets: makes emitido_por_id nullable (public emission has no user context)
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# Revision identifiers used by Alembic.
revision = '004_gira_senha_fields'
down_revision = '003_platform_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add senha management columns."""

    # ========== GIRAS: senha emission fields ==========
    op.add_column('giras', sa.Column('max_tickets', sa.Integer(), nullable=True))
    op.add_column('giras', sa.Column('release_start_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('giras', sa.Column('release_end_at', sa.DateTime(timezone=True), nullable=True))

    # ========== CONSULENTES: normalized fields for dedup ==========
    op.add_column('consulentes', sa.Column('email_normalized', sa.String(255), nullable=True))
    op.add_column('consulentes', sa.Column('phone_normalized', sa.String(20), nullable=True))
    op.create_index('ix_consulentes_email_normalized', 'consulentes', ['email_normalized'])

    # Backfill email_normalized from existing email (lowercase)
    op.execute("UPDATE consulentes SET email_normalized = LOWER(TRIM(email)) WHERE email IS NOT NULL")

    # ========== TICKETS: make emitido_por_id nullable for public emission ==========
    op.alter_column('tickets', 'emitido_por_id',
                    existing_type=postgresql.UUID(as_uuid=True),
                    nullable=True)


def downgrade() -> None:
    """Remove senha management columns."""

    # Revert tickets
    op.alter_column('tickets', 'emitido_por_id',
                    existing_type=postgresql.UUID(as_uuid=True),
                    nullable=False)

    # Revert consulentes
    op.drop_index('ix_consulentes_email_normalized', table_name='consulentes')
    op.drop_column('consulentes', 'phone_normalized')
    op.drop_column('consulentes', 'email_normalized')

    # Revert giras
    op.drop_column('giras', 'release_end_at')
    op.drop_column('giras', 'release_start_at')
    op.drop_column('giras', 'max_tickets')
