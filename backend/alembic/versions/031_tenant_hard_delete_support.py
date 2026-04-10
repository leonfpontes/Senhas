"""Tenant hard delete support: fix audit_logs and estoque FKs.

Two critical FK fixes required before tenant hard delete can work correctly:

1. audit_logs.tenant_id: CASCADE → SET NULL
   - Audit logs must be PRESERVED when a tenant is deleted (LGPD compliance).
   - With CASCADE, all audit history is wiped. SET NULL keeps the records
     while orphaning them (tenant_id = NULL), which is already the established
     pattern for platform-level audit events.

2. estoque_movimentacoes.item_id: RESTRICT → CASCADE
   - Hard delete tenant → cascades to estoque_itens →  RESTRICT on
     estoque_movimentacoes.item_id blocks the delete with ForeignKeyViolationError.
   - Movimentações are operational history tied to the item's lifecycle;
     deleting the item should delete its movements.

Both use NOT VALID to avoid full-table lock during ADD CONSTRAINT.
VALIDATE CONSTRAINT follows with ShareUpdateExclusiveLock (allows concurrent DML).

Revision ID: 031_tenant_hard_delete_support
Revises: 030_lgpd_account_deletion
Create Date: 2026-04-10
"""

from alembic import op
from sqlalchemy import inspect, text

revision: str = "031_tenant_hard_delete_support"
down_revision: str = "030_lgpd_account_deletion"
branch_labels = None
depends_on = None


def _find_fk_name(inspector, table: str, referred_table: str, local_col: str) -> str | None:
    """Return the name of the FK from table.local_col → referred_table, or None."""
    for fk in inspector.get_foreign_keys(table):
        if fk["referred_table"] == referred_table and local_col in fk["constrained_columns"]:
            return fk["name"]
    return None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # ── 1. audit_logs.tenant_id: CASCADE → SET NULL ──────────────────────────
    fk_audit = _find_fk_name(inspector, "audit_logs", "tenants", "tenant_id")
    if fk_audit:
        op.drop_constraint(fk_audit, "audit_logs", type_="foreignkey")
    op.create_foreign_key(
        "fk_audit_logs_tenant_id_tenants",
        "audit_logs",
        "tenants",
        ["tenant_id"],
        ["id"],
        ondelete="SET NULL",
        postgresql_not_valid=True,
    )
    op.execute(text("ALTER TABLE audit_logs VALIDATE CONSTRAINT fk_audit_logs_tenant_id_tenants"))

    # ── 2. estoque_movimentacoes.item_id: RESTRICT → CASCADE ─────────────────
    fk_estoque = _find_fk_name(inspector, "estoque_movimentacoes", "estoque_itens", "item_id")
    if fk_estoque:
        op.drop_constraint(fk_estoque, "estoque_movimentacoes", type_="foreignkey")
    op.create_foreign_key(
        "fk_estoque_movimentacoes_item_id_estoque_itens",
        "estoque_movimentacoes",
        "estoque_itens",
        ["item_id"],
        ["id"],
        ondelete="CASCADE",
        postgresql_not_valid=True,
    )
    op.execute(
        text(
            "ALTER TABLE estoque_movimentacoes VALIDATE CONSTRAINT "
            "fk_estoque_movimentacoes_item_id_estoque_itens"
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # ── 1. audit_logs.tenant_id: SET NULL → CASCADE ──────────────────────────
    fk_audit = _find_fk_name(inspector, "audit_logs", "tenants", "tenant_id")
    if fk_audit:
        op.drop_constraint(fk_audit, "audit_logs", type_="foreignkey")
    op.create_foreign_key(
        "fk_audit_logs_tenant_id_tenants",
        "audit_logs",
        "tenants",
        ["tenant_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # ── 2. estoque_movimentacoes.item_id: CASCADE → RESTRICT ─────────────────
    fk_estoque = _find_fk_name(inspector, "estoque_movimentacoes", "estoque_itens", "item_id")
    if fk_estoque:
        op.drop_constraint(fk_estoque, "estoque_movimentacoes", type_="foreignkey")
    op.create_foreign_key(
        "fk_estoque_movimentacoes_item_id_estoque_itens",
        "estoque_movimentacoes",
        "estoque_itens",
        ["item_id"],
        ["id"],
        ondelete="RESTRICT",
    )
