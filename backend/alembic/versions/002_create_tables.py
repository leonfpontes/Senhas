"""Create tables for all models.

Revision ID: 002_create_tables
Revises: 001_init_schema
Create Date: 2026-03-05 10:00:00.000000

This migration creates tables for:
- Tenant (multi-tenant organization)
- User (authentication and RBAC)
- Gira (spiritual event)
- Consulente (person requesting ticket)
- Ticket (issued senha - CORE!)
- SenhaControl (atomic emission control)
- AuditLog (immutable audit trail)
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# Revision identifiers used by Alembic.
revision = '002_create_tables'
down_revision = '001_init_schema'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create model tables."""
    # Create enum types
    op.execute("CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'operator')")
    op.execute("CREATE TYPE ticket_status AS ENUM ('emitted', 'called', 'completed', 'cancelled', 'no_show')")
    op.execute("CREATE TYPE audit_action AS ENUM ('create', 'read', 'update', 'delete', 'login', 'logout', 'token_refresh')")
    
    # ========== TENANTS TABLE ==========
    op.create_table(
        'tenants',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(255), nullable=False, unique=True),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_tenants_slug', 'tenants', ['slug'])
    op.create_index('ix_tenants_is_active', 'tenants', ['is_active'])
    
    # ========== USERS TABLE ==========
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('username', sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('role', sa.Enum('super_admin', 'admin', 'operator', name='user_role'), nullable=False, server_default='operator'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('tenant_id', 'email', name='uq_users_tenant_email'),
        sa.UniqueConstraint('tenant_id', 'username', name='uq_users_tenant_username'),
    )
    op.create_index('ix_users_tenant_id', 'users', ['tenant_id'])
    op.create_index('ix_users_is_active', 'users', ['is_active'])
    op.create_index('ix_users_email', 'users', ['email'])
    
    # ========== GIRAS TABLE ==========
    op.create_table(
        'giras',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('nome', sa.String(255), nullable=False),
        sa.Column('descricao', sa.Text(), nullable=True),
        sa.Column('data_inicio', sa.DateTime(timezone=True), nullable=False),
        sa.Column('data_fim', sa.DateTime(timezone=True), nullable=True),
        sa.Column('local', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_giras_tenant_id', 'giras', ['tenant_id'])
    op.create_index('ix_giras_data_inicio', 'giras', ['data_inicio'])
    op.create_index('ix_giras_is_active', 'giras', ['is_active'])
    
    # ========== CONSULENTES TABLE ==========
    op.create_table(
        'consulentes',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('nome', sa.String(255), nullable=False),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('telefone', sa.String(20), nullable=True),
        sa.Column('cpf', sa.String(11), nullable=True),
        sa.Column('endereco', sa.Text(), nullable=True),
        sa.Column('observacoes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_consulentes_tenant_id', 'consulentes', ['tenant_id'])
    op.create_index('ix_consulentes_email', 'consulentes', ['email'])
    op.create_index('ix_consulentes_telefone', 'consulentes', ['telefone'])
    
    # ========== TICKETS TABLE - CORE! ==========
    op.create_table(
        'tickets',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('gira_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('giras.id', ondelete='CASCADE'), nullable=False),
        sa.Column('consulente_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('consulentes.id', ondelete='CASCADE'), nullable=False),
        sa.Column('emitido_por_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('numero', sa.Integer(), nullable=False),
        sa.Column('status', sa.Enum('emitted', 'called', 'completed', 'cancelled', 'no_show', name='ticket_status'), nullable=False, server_default='emitted'),
        sa.Column('chamado_em', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finalizado_em', sa.DateTime(timezone=True), nullable=True),
        sa.Column('observacoes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_tickets_tenant_id', 'tickets', ['tenant_id'])
    op.create_index('ix_tickets_gira_id', 'tickets', ['gira_id'])
    op.create_index('ix_tickets_consulente_id', 'tickets', ['consulente_id'])
    op.create_index('ix_tickets_status', 'tickets', ['status'])
    op.create_index('ix_tickets_numero', 'tickets', ['numero'])
    op.create_index('ix_tickets_created_at', 'tickets', ['created_at'])
    
    # ========== SENHA_CONTROLS TABLE - ATOMIC EMISSION ==========
    op.create_table(
        'senha_controls',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('gira_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('giras.id', ondelete='CASCADE'), nullable=False),
        sa.Column('proximo_numero', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('version', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_emitido', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('tenant_id', 'gira_id', name='uq_senha_control_tenant_gira'),
    )
    op.create_index('ix_senha_controls_tenant_id', 'senha_controls', ['tenant_id'])
    op.create_index('ix_senha_controls_gira_id', 'senha_controls', ['gira_id'])
    
    # ========== AUDIT_LOGS TABLE - IMMUTABLE ==========
    op.create_table(
        'audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('action', sa.Enum('create', 'read', 'update', 'delete', 'login', 'logout', 'token_refresh', name='audit_action'), nullable=False),
        sa.Column('resource_type', sa.String(100), nullable=False),
        sa.Column('resource_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('details', postgresql.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_audit_logs_tenant_id', 'audit_logs', ['tenant_id'])
    op.create_index('ix_audit_logs_user_id', 'audit_logs', ['user_id'])
    op.create_index('ix_audit_logs_created_at', 'audit_logs', ['created_at'])
    op.create_index('ix_audit_logs_action', 'audit_logs', ['action'])
    op.create_index('ix_audit_logs_resource_type', 'audit_logs', ['resource_type'])


def downgrade() -> None:
    """Drop all created tables and enums."""
    # Drop tables in reverse dependency order
    op.drop_table('audit_logs')
    op.drop_table('senha_controls')
    op.drop_table('tickets')
    op.drop_table('consulentes')
    op.drop_table('giras')
    op.drop_table('users')
    op.drop_table('tenants')
    
    # Drop enum types
    op.execute("DROP TYPE audit_action")
    op.execute("DROP TYPE ticket_status")
    op.execute("DROP TYPE user_role")
