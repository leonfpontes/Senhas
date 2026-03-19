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
    """Create initial schema tables."""
    # Create enum types (idempotent for re-runs against existing DBs)
    op.execute("DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'member'); EXCEPTION WHEN duplicate_object THEN NULL; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE password_status AS ENUM ('active', 'archived', 'deleted'); EXCEPTION WHEN duplicate_object THEN NULL; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE audit_action AS ENUM ('create', 'read', 'update', 'delete'); EXCEPTION WHEN duplicate_object THEN NULL; END $$")
    
    # Tenants table
    op.create_table(
        'tenants',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('name', sa.String(255), nullable=False, unique=True),
        sa.Column('slug', sa.String(255), nullable=False, unique=True),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('is_active', sa.Boolean, default=True, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_tenants_slug', 'tenants', ['slug'])
    op.create_index('ix_tenants_is_active', 'tenants', ['is_active'])
    
    # Users table
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('username', sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('role', sa.Enum('admin', 'member', name='user_role'), default='member', nullable=False),
        sa.Column('is_active', sa.Boolean, default=True, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_unique_constraint('uq_users_tenant_email', 'users', ['tenant_id', 'email'])
    op.create_unique_constraint('uq_users_tenant_username', 'users', ['tenant_id', 'username'])
    op.create_index('ix_users_tenant_id', 'users', ['tenant_id'])
    op.create_index('ix_users_is_active', 'users', ['is_active'])
    
    # Password entries table
    op.create_table(
        'passwords',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('encrypted_value', sa.Text, nullable=False),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('status', sa.Enum('active', 'archived', 'deleted', name='password_status'), default='active', nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_passwords_tenant_id', 'passwords', ['tenant_id'])
    op.create_index('ix_passwords_status', 'passwords', ['status'])
    op.create_index('ix_passwords_category', 'passwords', ['category'])
    
    # Audit logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('action', sa.Enum('create', 'read', 'update', 'delete', name='audit_action'), nullable=False),
        sa.Column('resource_type', sa.String(100), nullable=False),
        sa.Column('resource_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('details', postgresql.JSON, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_audit_logs_tenant_id', 'audit_logs', ['tenant_id'])
    op.create_index('ix_audit_logs_user_id', 'audit_logs', ['user_id'])
    op.create_index('ix_audit_logs_created_at', 'audit_logs', ['created_at'])


def downgrade() -> None:
    """Drop initial schema tables."""
    op.drop_table('audit_logs')
    op.drop_table('passwords')
    op.drop_table('users')
    op.drop_table('tenants')
    
    # Drop enum types
    op.execute("DROP TYPE audit_action")
    op.execute("DROP TYPE password_status")
    op.execute("DROP TYPE user_role")
