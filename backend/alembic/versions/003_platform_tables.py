"""Create Phase 6 tables for platform features.

Revision ID: 003_platform_tables
Revises: 002_create_tables
Create Date: 2026-03-05 16:00:00.000000

This migration creates tables for Phase 6 (Super Admin Platform):
- Subscription (tenant plans)
- Invoice (billing)
- FeatureFlag (per-tenant features)
- Updates User table (makes tenant_id nullable for SUPER_ADMIN)
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# Revision identifiers used by Alembic.
revision = '003_platform_tables'
down_revision = '002_create_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create platform tables."""
    
    # Create enum types for new tables
    op.execute("CREATE TYPE plan_type AS ENUM ('basic', 'pro', 'premium', 'enterprise')")
    op.execute("CREATE TYPE subscription_status AS ENUM ('active', 'suspended', 'cancelled', 'expired')")
    op.execute("CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled')")
    
    # ========== SUBSCRIPTIONS TABLE ==========
    op.create_table(
        'subscriptions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('plan', sa.Enum('basic', 'pro', 'premium', 'enterprise', name='plan_type'), nullable=False, server_default='basic'),
        sa.Column('status', sa.Enum('active', 'suspended', 'cancelled', 'expired', name='subscription_status'), nullable=False, server_default='active'),
        sa.Column('max_users', sa.Integer(), nullable=False, server_default='10'),
        sa.Column('max_giras_per_month', sa.Integer(), nullable=False, server_default='100'),
        sa.Column('current_users', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('monthly_price', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('currency', sa.String(3), nullable=False, server_default='USD'),
        sa.Column('is_trial', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('trial_ends_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('billing_cycle_start', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('billing_cycle_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('auto_renew', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_subscriptions_tenant_id', 'subscriptions', ['tenant_id'])
    op.create_index('ix_subscriptions_plan', 'subscriptions', ['plan'])
    op.create_index('ix_subscriptions_status', 'subscriptions', ['status'])
    
    # ========== INVOICES TABLE ==========
    op.create_table(
        'invoices',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('invoice_number', sa.String(50), nullable=False, unique=True),
        sa.Column('period_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('period_end', sa.DateTime(timezone=True), nullable=False),
        sa.Column('subtotal', sa.Float(), nullable=False),
        sa.Column('tax_amount', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('discount_amount', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('total_amount', sa.Float(), nullable=False),
        sa.Column('status', sa.Enum('draft', 'sent', 'paid', 'overdue', 'cancelled', name='invoice_status'), nullable=False, server_default='draft'),
        sa.Column('paid_amount', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('payment_method', sa.String(50), nullable=True),
        sa.Column('payment_reference', sa.String(255), nullable=True),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_invoices_tenant_id', 'invoices', ['tenant_id'])
    op.create_index('ix_invoices_status', 'invoices', ['status'])
    op.create_index('ix_invoices_period_start', 'invoices', ['period_start'])
    
    # ========== FEATURE_FLAGS TABLE ==========
    op.create_table(
        'feature_flags',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('feature', sa.String(100), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_feature_flags_tenant_id', 'feature_flags', ['tenant_id'])
    op.create_index('ix_feature_flags_feature', 'feature_flags', ['feature'])
    
    # ========== UPDATE USERS TABLE ==========
    # Make tenant_id nullable for SUPER_ADMIN users
    op.alter_column('users', 'tenant_id', existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    
    # Make email globally unique (for SUPER_ADMIN)
    op.drop_constraint('uq_users_tenant_email', 'users', type_='unique')
    op.create_unique_constraint('uq_users_email', 'users', ['email'])
    
    # Drop old username constraint and create new one (username global or per-tenant)
    op.drop_constraint('uq_users_tenant_username', 'users', type_='unique')


def downgrade() -> None:
    """Downgrade platform tables."""
    
    # Drop tables in reverse order
    op.drop_table('feature_flags')
    op.drop_table('invoices')
    op.drop_table('subscriptions')
    
    # Drop enums
    op.execute("DROP TYPE IF EXISTS invoice_status")
    op.execute("DROP TYPE IF EXISTS subscription_status")
    op.execute("DROP TYPE IF EXISTS plan_type")
    
    # Revert users table changes
    op.drop_constraint('uq_users_email', 'users', type_='unique')
    op.create_unique_constraint('uq_users_tenant_email', 'users', ['tenant_id', 'email'])
    op.create_unique_constraint('uq_users_tenant_username', 'users', ['tenant_id', 'username'])
    op.alter_column('users', 'tenant_id', existing_type=postgresql.UUID(as_uuid=True), nullable=False)
