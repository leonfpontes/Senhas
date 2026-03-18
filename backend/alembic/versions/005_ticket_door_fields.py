"""Add door control fields to tickets for Visão da Porta.

Revision ID: 005_ticket_door_fields
Revises: 004_gira_senha_fields
Create Date: 2026-03-20 10:00:00.000000

This migration adds:
- tickets: checkin_em (when consulente checked in at the door)
- tickets: atendido_em (when consultation started)
- tickets: medium_nome (name of the medium doing the consultation)
- tickets: cambone_nome (name of the cambono assisting)
- tickets: atendimento_descricao (notes about the consultation)
"""

from alembic import op
import sqlalchemy as sa

# Revision identifiers used by Alembic.
revision = '005_ticket_door_fields'
down_revision = '004_gira_senha_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add door control columns to tickets."""

    # ========== TICKETS: door control fields ==========
    op.add_column('tickets', sa.Column('checkin_em', sa.DateTime(timezone=True), nullable=True))
    op.add_column('tickets', sa.Column('atendido_em', sa.DateTime(timezone=True), nullable=True))
    op.add_column('tickets', sa.Column('medium_nome', sa.String(255), nullable=True))
    op.add_column('tickets', sa.Column('cambone_nome', sa.String(255), nullable=True))
    op.add_column('tickets', sa.Column('atendimento_descricao', sa.Text(), nullable=True))

    # Index for efficient queue queries (checkin status)
    op.create_index('ix_tickets_checkin_em', 'tickets', ['checkin_em'])


def downgrade() -> None:
    """Remove door control columns from tickets."""

    op.drop_index('ix_tickets_checkin_em', table_name='tickets')
    op.drop_column('tickets', 'atendimento_descricao')
    op.drop_column('tickets', 'cambone_nome')
    op.drop_column('tickets', 'medium_nome')
    op.drop_column('tickets', 'atendido_em')
    op.drop_column('tickets', 'checkin_em')
