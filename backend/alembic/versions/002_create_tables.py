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

NOTE: Uses raw SQL (CREATE TABLE IF NOT EXISTS) to bypass SQLAlchemy's
automatic CREATE TYPE behaviour which ignores create_type=False in some versions.
"""

from alembic import op

# Revision identifiers used by Alembic.
revision = '002_create_tables'
down_revision = '001_init_schema'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create model tables via raw SQL for full idempotency."""

    # ── Enum types (idempotent) ──────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN CREATE TYPE user_role AS ENUM ('super_admin','admin','operator');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$
    """)
    op.execute("""
        DO $$ BEGIN CREATE TYPE ticket_status AS ENUM ('emitted','called','completed','cancelled','no_show');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$
    """)
    op.execute("""
        DO $$ BEGIN CREATE TYPE audit_action AS ENUM ('create','read','update','delete','login','logout','token_refresh');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$
    """)

    # ── TENANTS ──────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS tenants (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name            VARCHAR(255) NOT NULL,
            slug            VARCHAR(255) NOT NULL UNIQUE,
            description     VARCHAR(500),
            is_active       BOOLEAN NOT NULL DEFAULT TRUE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at      TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_tenants_slug      ON tenants (slug)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tenants_is_active  ON tenants (is_active)")

    # ── USERS ────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            email           VARCHAR(255) NOT NULL,
            username        VARCHAR(255) NOT NULL,
            password_hash   VARCHAR(255) NOT NULL,
            role            user_role NOT NULL DEFAULT 'operator',
            is_active       BOOLEAN NOT NULL DEFAULT TRUE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at      TIMESTAMPTZ,
            CONSTRAINT uq_users_tenant_email    UNIQUE (tenant_id, email),
            CONSTRAINT uq_users_tenant_username UNIQUE (tenant_id, username)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_tenant_id ON users (tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_is_active ON users (is_active)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_email     ON users (email)")

    # ── GIRAS ────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS giras (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            nome            VARCHAR(255) NOT NULL,
            descricao       TEXT,
            data_inicio     TIMESTAMPTZ NOT NULL,
            data_fim        TIMESTAMPTZ,
            local           VARCHAR(255),
            is_active       BOOLEAN NOT NULL DEFAULT TRUE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at      TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_giras_tenant_id   ON giras (tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_giras_data_inicio ON giras (data_inicio)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_giras_is_active   ON giras (is_active)")

    # ── CONSULENTES ──────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS consulentes (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            nome            VARCHAR(255) NOT NULL,
            email           VARCHAR(255),
            telefone        VARCHAR(20),
            cpf             VARCHAR(11),
            endereco        TEXT,
            observacoes     TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at      TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_consulentes_tenant_id ON consulentes (tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_consulentes_email     ON consulentes (email)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_consulentes_telefone  ON consulentes (telefone)")

    # ── TICKETS (CORE!) ─────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS tickets (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            gira_id         UUID NOT NULL REFERENCES giras(id) ON DELETE CASCADE,
            consulente_id   UUID NOT NULL REFERENCES consulentes(id) ON DELETE CASCADE,
            emitido_por_id  UUID NOT NULL REFERENCES users(id),
            numero          INTEGER NOT NULL,
            status          ticket_status NOT NULL DEFAULT 'emitted',
            chamado_em      TIMESTAMPTZ,
            finalizado_em   TIMESTAMPTZ,
            observacoes     TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at      TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_tickets_tenant_id     ON tickets (tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tickets_gira_id       ON tickets (gira_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tickets_consulente_id ON tickets (consulente_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tickets_status        ON tickets (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tickets_numero        ON tickets (numero)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tickets_created_at    ON tickets (created_at)")

    # ── SENHA_CONTROLS (atomic emission) ─────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS senha_controls (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            gira_id         UUID NOT NULL REFERENCES giras(id) ON DELETE CASCADE,
            proximo_numero  INTEGER NOT NULL DEFAULT 1,
            version         INTEGER NOT NULL DEFAULT 0,
            total_emitido   INTEGER NOT NULL DEFAULT 0,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at      TIMESTAMPTZ,
            CONSTRAINT uq_senha_control_tenant_gira UNIQUE (tenant_id, gira_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_senha_controls_tenant_id ON senha_controls (tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_senha_controls_gira_id   ON senha_controls (gira_id)")

    # ── AUDIT_LOGS (immutable) ───────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
            user_id         UUID REFERENCES users(id)   ON DELETE SET NULL,
            action          audit_action NOT NULL,
            resource_type   VARCHAR(100) NOT NULL,
            resource_id     UUID,
            details         JSONB,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_tenant_id     ON audit_logs (tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_user_id       ON audit_logs (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at    ON audit_logs (created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_action        ON audit_logs (action)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_resource_type ON audit_logs (resource_type)")


def downgrade() -> None:
    """Drop all created tables and enums."""
    op.execute("DROP TABLE IF EXISTS audit_logs CASCADE")
    op.execute("DROP TABLE IF EXISTS senha_controls CASCADE")
    op.execute("DROP TABLE IF EXISTS tickets CASCADE")
    op.execute("DROP TABLE IF EXISTS consulentes CASCADE")
    op.execute("DROP TABLE IF EXISTS giras CASCADE")
    op.execute("DROP TABLE IF EXISTS users CASCADE")
    op.execute("DROP TABLE IF EXISTS tenants CASCADE")
    op.execute("DROP TYPE IF EXISTS audit_action")
    op.execute("DROP TYPE IF EXISTS ticket_status")
    op.execute("DROP TYPE IF EXISTS user_role")
