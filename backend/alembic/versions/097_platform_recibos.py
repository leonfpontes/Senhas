"""Recibos emitidos pela plataforma para terreiros (`platform_recibos`).

Sequência por ano (único `ano` + `numero`), dados do emissor e nome do terreiro gravados no recibo,
`tenant_id` com SET NULL (recibo sobrevive à exclusão definitiva do terreiro).

Downgrade: remove a tabela (os recibos emitidos se perdem — exporte antes).

Revision ID: 097_platform_recibos
Revises: 096_gira_duplas
Create Date: 2026-10-22
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "097_platform_recibos"
down_revision: str = "096_gira_duplas"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_recibos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("ano", sa.Integer(), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("tenant_nome", sa.String(255), nullable=False),
        sa.Column("pagador_nome", sa.String(160), nullable=False),
        sa.Column("pagador_documento", sa.String(20), nullable=True),
        sa.Column("valor", sa.Numeric(10, 2), nullable=False),
        sa.Column("referente", sa.String(300), nullable=False),
        sa.Column("forma_pagamento", sa.String(20), nullable=True),
        sa.Column("data_pagamento", sa.Date(), nullable=False),
        sa.Column("emissor_nome", sa.String(160), nullable=False),
        sa.Column("emissor_empresa", sa.String(200), nullable=False),
        sa.Column("emissor_cnpj", sa.String(20), nullable=True),
        sa.Column("emissor_cidade", sa.String(100), nullable=True),
        sa.Column(
            "emitido_por",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("cancelado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("motivo_cancelamento", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("ano", "numero", name="uq_platform_recibos_ano_numero"),
        sa.CheckConstraint("valor > 0", name="ck_platform_recibos_valor_positivo"),
        sa.CheckConstraint(
            "forma_pagamento IS NULL OR forma_pagamento IN "
            "('pix', 'transferencia', 'dinheiro', 'cartao', 'boleto', 'outro')",
            name="ck_platform_recibos_forma",
        ),
    )
    op.create_index("ix_platform_recibos_tenant_created", "platform_recibos", ["tenant_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_platform_recibos_tenant_created", table_name="platform_recibos")
    op.drop_table("platform_recibos")
