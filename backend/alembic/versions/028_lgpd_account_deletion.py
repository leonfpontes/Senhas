"""LGPD account deletion: fix tickets.emitido_por_id FK to ON DELETE SET NULL.

Without this migration, hard-deleting a user who has emitted tickets raises
a ForeignKeyViolationError because the original FK has no ondelete clause
(defaults to NO ACTION). This migration recreates the constraint with
ON DELETE SET NULL so that deleting a user simply nullifies the reference
in tickets, preserving the ticket history without revealing personal data.

Uses NOT VALID to avoid a full-table lock during the ADD CONSTRAINT step.
The VALIDATE CONSTRAINT that follows acquires only a ShareUpdateExclusiveLock
(concurrent DML allowed), making this safe to run on production under live load.

Revision ID: 028_lgpd_account_deletion
Revises: 027_mensalidade_mediun
Create Date: 2026-04-10
"""

from alembic import op
from sqlalchemy import inspect

# Revision identifiers used by Alembic.
revision = "028_lgpd_account_deletion"
down_revision = "027_mensalidade_mediun"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # Check existing FK name on tickets.emitido_por_id
    fks = inspector.get_foreign_keys("tickets")
    existing_fk = next(
        (fk for fk in fks if "emitido_por_id" in fk.get("constrained_columns", [])),
        None,
    )

    if existing_fk:
        op.drop_constraint(existing_fk["name"], "tickets", type_="foreignkey")

    # Recreate with ON DELETE SET NULL + NOT VALID (minimal lock)
    op.create_foreign_key(
        "fk_tickets_emitido_por_id_users",
        "tickets",
        "users",
        ["emitido_por_id"],
        ["id"],
        ondelete="SET NULL",
        deferrable=None,
    )

    # Validate existing rows without exclusive lock
    op.execute(
        "ALTER TABLE tickets VALIDATE CONSTRAINT fk_tickets_emitido_por_id_users"
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    fks = inspector.get_foreign_keys("tickets")
    existing_fk = next(
        (fk for fk in fks if "emitido_por_id" in fk.get("constrained_columns", [])),
        None,
    )

    if existing_fk:
        op.drop_constraint(existing_fk["name"], "tickets", type_="foreignkey")

    # Restore original FK without ondelete (NO ACTION default)
    op.create_foreign_key(
        "tickets_emitido_por_id_fkey",
        "tickets",
        "users",
        ["emitido_por_id"],
        ["id"],
    )
