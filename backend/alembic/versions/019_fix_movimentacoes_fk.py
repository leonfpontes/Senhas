"""019: Fix estoque_movimentacoes.item_id FK — CASCADE → RESTRICT

Movimentações são um ledger imutável de histórico contábil.
A FK nunca deve permitir cascade-delete de movimentações quando um item
é fisicamente removido do banco. RESTRICT força tratamento explícito.

Revision ID: 019_fix_movimentacoes_fk
Revises: 018_estoque
"""
from alembic import op

# revision identifiers
revision: str = "019_fix_movimentacoes_fk"
down_revision: str = "018_estoque"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "estoque_movimentacoes_item_id_fkey",
        "estoque_movimentacoes",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "estoque_movimentacoes_item_id_fkey",
        "estoque_movimentacoes",
        "estoque_itens",
        ["item_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(
        "estoque_movimentacoes_item_id_fkey",
        "estoque_movimentacoes",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "estoque_movimentacoes_item_id_fkey",
        "estoque_movimentacoes",
        "estoque_itens",
        ["item_id"],
        ["id"],
        ondelete="CASCADE",
    )
