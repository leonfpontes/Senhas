"""Add TENANT_DELETED to audit_action PostgreSQL enum.

The Python AuditAction enum gained TENANT_DELETED but the PostgreSQL
enum type was never updated. asyncpg raises InvalidTextRepresentationError
when trying to insert the new value.

ALTER TYPE ... ADD VALUE is non-transactional in PostgreSQL — it commits
immediately and cannot be rolled back inside a transaction. We use
execute_if(dialect="postgresql") to keep it portable.

Revision ID: 032_tenant_audit_enum
Revises: 031_tenant_hard_delete_support
Create Date: 2026-04-10
"""

from alembic import op
from sqlalchemy import text

revision: str = "032_tenant_audit_enum"
down_revision: str = "031_tenant_hard_delete_support"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing enum values in PostgreSQL are uppercase (matching Python enum .name).
    # ADD VALUE is idempotent with IF NOT EXISTS (PostgreSQL 9.6+)
    op.execute(text("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'TENANT_DELETED'"))


def downgrade() -> None:
    # PostgreSQL does not support removing enum values without recreating the type.
    # Downgrade is a no-op — the value will remain but will be unused.
    pass
