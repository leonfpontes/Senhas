"""Create Phase 6 tables for platform features.

Revision ID: 003_platform_tables
Revises: 002_create_tables
Create Date: 2026-03-05 16:00:00.000000

This migration creates tables for Phase 6 (Super Admin Platform):
- Subscription (tenant plans)
- Invoice (billing)
- FeatureFlag (per-tenant features)
- Updates User table (makes tenant_id nullable for SUPER_ADMIN)

NOTE: Uses raw SQL (CREATE TABLE IF NOT EXISTS) to bypass SQLAlchemy's
automatic CREATE TYPE behaviour which ignores create_type=False in some versions.
"""

from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

# Revision identifiers used by Alembic.
revision = '003_platform_tables'
down_revision = '002_create_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create platform tables via raw SQL + idempotent ALTER TABLE."""

    # ── Enum types (idempotent) ──────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN CREATE TYPE plan_type AS ENUM ('basic','pro','premium','enterprise');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$
    """)
    op.execute("""
        DO $$ BEGIN CREATE TYPE subscription_status AS ENUM ('active','suspended','cancelled','expired');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$
    """)
    op.execute("""
        DO $$ BEGIN CREATE TYPE invoice_status AS ENUM ('draft','sent','paid','overdue','cancelled');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$
    """)

    # ── SUBSCRIPTIONS ────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS subscriptions (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id           UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
            plan                plan_type NOT NULL DEFAULT 'basic',
            status              subscription_status NOT NULL DEFAULT 'active',
            max_users           INTEGER NOT NULL DEFAULT 10,
            max_giras_per_month INTEGER NOT NULL DEFAULT 100,
            current_users       INTEGER NOT NULL DEFAULT 0,
            monthly_price       DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            currency            VARCHAR(3) NOT NULL DEFAULT 'USD',
            is_trial            BOOLEAN NOT NULL DEFAULT FALSE,
            trial_ends_at       TIMESTAMPTZ,
            billing_cycle_start TIMESTAMPTZ NOT NULL DEFAULT now(),
            billing_cycle_end   TIMESTAMPTZ,
            auto_renew          BOOLEAN NOT NULL DEFAULT TRUE,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at          TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_subscriptions_tenant_id ON subscriptions (tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_subscriptions_plan      ON subscriptions (plan)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_subscriptions_status    ON subscriptions (status)")

    # ── INVOICES ─────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS invoices (
            id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            invoice_number    VARCHAR(50) NOT NULL UNIQUE,
            period_start      TIMESTAMPTZ NOT NULL,
            period_end        TIMESTAMPTZ NOT NULL,
            subtotal          DOUBLE PRECISION NOT NULL,
            tax_amount        DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            discount_amount   DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            total_amount      DOUBLE PRECISION NOT NULL,
            status            invoice_status NOT NULL DEFAULT 'draft',
            paid_amount       DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            payment_method    VARCHAR(50),
            payment_reference VARCHAR(255),
            due_date          TIMESTAMPTZ NOT NULL,
            paid_at           TIMESTAMPTZ,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at        TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoices_tenant_id    ON invoices (tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoices_status       ON invoices (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoices_period_start ON invoices (period_start)")

    # ── FEATURE_FLAGS ────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS feature_flags (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            feature     VARCHAR(100) NOT NULL,
            enabled     BOOLEAN NOT NULL DEFAULT FALSE,
            expires_at  TIMESTAMPTZ,
            description VARCHAR(500),
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at  TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_feature_flags_tenant_id ON feature_flags (tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_feature_flags_feature   ON feature_flags (feature)")

    # ── UPDATE USERS TABLE (idempotent) ──────────────────────────────────
    bind = op.get_bind()
    insp = inspect(bind)

    # Make tenant_id nullable for SUPER_ADMIN users
    user_cols = {c["name"]: c for c in insp.get_columns("users")}
    if user_cols.get("tenant_id", {}).get("nullable") is False:
        op.alter_column('users', 'tenant_id',
                        existing_type=postgresql.UUID(as_uuid=True),
                        nullable=True)

    # Make email globally unique (drop old compound, add simple)
    user_constraints = {uc["name"] for uc in insp.get_unique_constraints("users")}
    if "uq_users_tenant_email" in user_constraints:
        op.drop_constraint('uq_users_tenant_email', 'users', type_='unique')
    if "uq_users_email" not in user_constraints:
        op.create_unique_constraint('uq_users_email', 'users', ['email'])

    # Drop old username compound constraint
    if "uq_users_tenant_username" in user_constraints:
        op.drop_constraint('uq_users_tenant_username', 'users', type_='unique')


def downgrade() -> None:
    """Downgrade platform tables."""
    op.execute("DROP TABLE IF EXISTS feature_flags CASCADE")
    op.execute("DROP TABLE IF EXISTS invoices CASCADE")
    op.execute("DROP TABLE IF EXISTS subscriptions CASCADE")

    op.execute("DROP TYPE IF EXISTS invoice_status")
    op.execute("DROP TYPE IF EXISTS subscription_status")
    op.execute("DROP TYPE IF EXISTS plan_type")

    # Revert users table changes
    bind = op.get_bind()
    insp = inspect(bind)
    user_constraints = {uc["name"] for uc in insp.get_unique_constraints("users")}

    if "uq_users_email" in user_constraints:
        op.drop_constraint('uq_users_email', 'users', type_='unique')
    if "uq_users_tenant_email" not in user_constraints:
        op.create_unique_constraint('uq_users_tenant_email', 'users', ['tenant_id', 'email'])
    if "uq_users_tenant_username" not in user_constraints:
        op.create_unique_constraint('uq_users_tenant_username', 'users', ['tenant_id', 'username'])

    op.alter_column('users', 'tenant_id',
                    existing_type=postgresql.UUID(as_uuid=True),
                    nullable=False)
