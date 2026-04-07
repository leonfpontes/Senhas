"""Add mensalidade tables and mediun isento field.

Revision ID: 027_mensalidade_mediun
Revises: 026_stripe_billing
Create Date: 2026-04-07
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, BYTEA

revision = "027_mensalidade_mediun"
down_revision = "026_stripe_billing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add mensalidade_isento to mediuns
    op.add_column(
        "mediuns",
        sa.Column(
            "mensalidade_isento",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # 2. Create ENUM type
    mensalidade_status = sa.Enum(
        "PENDENTE", "PAGO", "ISENTO", name="mensalidade_status"
    )
    mensalidade_status.create(op.get_bind())

    # 3. Create mensalidade_configs (1:1 per tenant)
    op.create_table(
        "mensalidade_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("valor_mensal", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
        sa.Column("dia_vencimento", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_unique_constraint(
        "uq_mensalidade_configs_tenant_id", "mensalidade_configs", ["tenant_id"]
    )
    op.create_index(
        "ix_mensalidade_configs_tenant_id", "mensalidade_configs", ["tenant_id"]
    )

    # 4. Create mensalidade_pagamentos
    op.create_table(
        "mensalidade_pagamentos",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "mediun_id",
            UUID(as_uuid=True),
            sa.ForeignKey("mediuns.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("mes_referencia", sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("PENDENTE", "PAGO", "ISENTO", name="mensalidade_status", create_type=False),
            nullable=False,
            server_default="PENDENTE",
        ),
        sa.Column("data_pagamento", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valor_vigente", sa.Numeric(10, 2), nullable=True),
        sa.Column("valor_pago", sa.Numeric(10, 2), nullable=True),
        sa.Column("comprovante_data", BYTEA(), nullable=True),
        sa.Column("comprovante_filename", sa.String(255), nullable=True),
        sa.Column("comprovante_mime", sa.String(50), nullable=True),
        sa.Column("observacao", sa.Text(), nullable=True),
        sa.Column(
            "registrado_por",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_unique_constraint(
        "uq_mensalidade_mediun_mes",
        "mensalidade_pagamentos",
        ["mediun_id", "mes_referencia"],
    )
    op.create_index(
        "ix_mensalidade_pagamentos_tenant_mes",
        "mensalidade_pagamentos",
        ["tenant_id", "mes_referencia"],
    )
    op.create_index(
        "ix_mensalidade_pagamentos_mediun_id",
        "mensalidade_pagamentos",
        ["mediun_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_mensalidade_pagamentos_mediun_id", table_name="mensalidade_pagamentos")
    op.drop_index("ix_mensalidade_pagamentos_tenant_mes", table_name="mensalidade_pagamentos")
    op.drop_constraint("uq_mensalidade_mediun_mes", "mensalidade_pagamentos", type_="unique")
    op.drop_table("mensalidade_pagamentos")

    op.drop_index("ix_mensalidade_configs_tenant_id", table_name="mensalidade_configs")
    op.drop_constraint("uq_mensalidade_configs_tenant_id", "mensalidade_configs", type_="unique")
    op.drop_table("mensalidade_configs")

    sa.Enum(name="mensalidade_status").drop(op.get_bind())

    op.drop_column("mediuns", "mensalidade_isento")
