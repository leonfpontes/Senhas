"""Initial schema creation for Senhas multi-tenant database.

Revision ID: 001_init_schema
Revises: 
Create Date: 2026-03-05 00:00:00.000000

This migration creates the foundational tables for the multi-tenant password management system:
- Tenants (organizations)
- Users (admin and members)
- Roles and permissions
- Organizations/Terreiros
- Password entries
- Audit logs
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers used by Alembic.
revision = '001_init_schema'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Superseded by 002_create_tables which creates the full schema."""
    # Migration 001 originally created basic tenants/users/passwords/audit_logs.
    # Migration 002 re-creates all of these with expanded definitions (more columns,
    # more enum values, additional tables). To avoid conflicts, 001 is now a no-op.
    pass


def downgrade() -> None:
    """No-op (superseded by 002)."""
    pass
