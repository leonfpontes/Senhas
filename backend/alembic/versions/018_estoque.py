"""018: Controle de Estoque — cria tabelas de estoque e adiciona flag enable_estoque_log

Revision ID: 018_estoque
Revises: 017_default_brand_colors
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers
revision: str = "018_estoque"
down_revision: str = "017_default_brand_colors"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Cria enum do tipo de movimentação (IF NOT EXISTS para idempotência)
    op.execute("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estoque_movimentacao_tipo') THEN CREATE TYPE estoque_movimentacao_tipo AS ENUM ('entrada', 'saida'); END IF; END $$")

    # 2. Tabela de grupos de material
    op.create_table(
        "estoque_grupos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("descricao", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_estoque_grupos_tenant_id", "estoque_grupos", ["tenant_id"])

    # 3. Tabela de itens do estoque
    op.create_table(
        "estoque_itens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("grupo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("estoque_grupos.id", ondelete="SET NULL"), nullable=True),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("descricao", sa.Text, nullable=True),
        sa.Column("unidade_medida", sa.String(10), nullable=False, server_default="UN"),
        sa.Column("estoque_minimo", sa.Integer, nullable=False, server_default="0"),
        sa.Column("custo_unitario", sa.Numeric(10, 2), nullable=True),
        sa.Column("observacoes", sa.Text, nullable=True),
        sa.Column("foto_data", sa.LargeBinary, nullable=True),
        sa.Column("foto_content_type", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_estoque_itens_tenant_id", "estoque_itens", ["tenant_id"])
    op.create_index("ix_estoque_itens_grupo_id", "estoque_itens", ["grupo_id"])

    # 4. Tabela de movimentações (imutável — sem soft-delete)
    op.create_table(
        "estoque_movimentacoes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("estoque_itens.id", ondelete="CASCADE"), nullable=False),
        sa.Column("usuario_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "tipo",
            sa.Enum("entrada", "saida", name="estoque_movimentacao_tipo", create_type=False),
            nullable=False,
        ),
        sa.Column("quantidade", sa.Integer, nullable=False),
        sa.Column("motivo", sa.Text, nullable=True),
        sa.Column("data_movimentacao", sa.DateTime(timezone=True), nullable=False),
        sa.Column("requisitante", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_estoque_mov_tenant_id", "estoque_movimentacoes", ["tenant_id"])
    op.create_index("ix_estoque_mov_item_id", "estoque_movimentacoes", ["item_id"])
    op.create_index("ix_estoque_mov_data", "estoque_movimentacoes", ["data_movimentacao"])

    # 5. Adiciona flag de log de movimentações ao tenant_configs
    op.add_column(
        "tenant_configs",
        sa.Column("enable_estoque_log", sa.Boolean, nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("tenant_configs", "enable_estoque_log")
    op.drop_index("ix_estoque_mov_data", table_name="estoque_movimentacoes")
    op.drop_index("ix_estoque_mov_item_id", table_name="estoque_movimentacoes")
    op.drop_index("ix_estoque_mov_tenant_id", table_name="estoque_movimentacoes")
    op.drop_table("estoque_movimentacoes")
    op.drop_index("ix_estoque_itens_grupo_id", table_name="estoque_itens")
    op.drop_index("ix_estoque_itens_tenant_id", table_name="estoque_itens")
    op.drop_table("estoque_itens")
    op.drop_index("ix_estoque_grupos_tenant_id", table_name="estoque_grupos")
    op.drop_table("estoque_grupos")
    op.execute("DROP TYPE IF EXISTS estoque_movimentacao_tipo")
