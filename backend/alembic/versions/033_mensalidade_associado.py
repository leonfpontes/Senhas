"""Mensalidade de associados: novos campos e tabela.

Adds all schema changes for the associados mensalidade feature (PRO+):
  - associados.mensalidade_isento BOOLEAN DEFAULT false
  - mensalidade_configs: valor_mensal_associado, dia_vencimento_associado, relatorio_hora_envio
  - associado_mensalidade_pagamentos table (mirrors mensalidade_pagamentos for associados)
  - tenant_configs.enable_mensalidade_associado BOOLEAN DEFAULT false

Revision ID: 033_mensalidade_associado
Revises: 032_tenant_audit_enum
Create Date: 2026-04-13
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM

revision: str = "033_mensalidade_associado"
down_revision: str = "032_tenant_audit_enum"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # ── 1. associados.mensalidade_isento ─────────────────────────────────
    assoc_cols = {c["name"] for c in inspector.get_columns("associados")}
    if "mensalidade_isento" not in assoc_cols:
        op.add_column(
            "associados",
            sa.Column("mensalidade_isento", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    # ── 2. mensalidade_configs: associado fields + relatorio_hora_envio ──
    mc_cols = {c["name"] for c in inspector.get_columns("mensalidade_configs")}
    if "valor_mensal_associado" not in mc_cols:
        op.add_column(
            "mensalidade_configs",
            sa.Column("valor_mensal_associado", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
        )
    if "dia_vencimento_associado" not in mc_cols:
        op.add_column(
            "mensalidade_configs",
            sa.Column("dia_vencimento_associado", sa.Integer(), nullable=False, server_default="10"),
        )
    if "relatorio_hora_envio" not in mc_cols:
        op.add_column(
            "mensalidade_configs",
            sa.Column("relatorio_hora_envio", sa.Time(), nullable=True),
        )

    # ── 3. associado_mensalidade_pagamentos ───────────────────────────────
    existing_tables = inspector.get_table_names()
    if "associado_mensalidade_pagamentos" not in existing_tables:
        # Ensure the enum type exists (already created by 027, but guard for safety)
        op.execute(
            "DO $$ BEGIN "
            "  CREATE TYPE mensalidade_status AS ENUM ('PENDENTE', 'PAGO', 'ISENTO'); "
            "EXCEPTION WHEN duplicate_object THEN null; "
            "END $$"
        )
        op.create_table(
            "associado_mensalidade_pagamentos",
            sa.Column(
                "id",
                postgresql.UUID(as_uuid=True),
                primary_key=True,
                nullable=False,
                server_default=sa.text("gen_random_uuid()"),
            ),
            sa.Column(
                "tenant_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("tenants.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "associado_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("associados.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("mes_referencia", sa.Date(), nullable=False),
            sa.Column(
                "status",
                PG_ENUM("PENDENTE", "PAGO", "ISENTO", name="mensalidade_status", create_type=False),
                nullable=False,
                server_default="PENDENTE",
            ),
            sa.Column("data_pagamento", sa.DateTime(timezone=True), nullable=True),
            sa.Column("valor_vigente", sa.Numeric(10, 2), nullable=True),
            sa.Column("valor_pago", sa.Numeric(10, 2), nullable=True),
            sa.Column("comprovante_data", postgresql.BYTEA(), nullable=True),
            sa.Column("comprovante_filename", sa.String(255), nullable=True),
            sa.Column("comprovante_mime", sa.String(50), nullable=True),
            sa.Column("observacao", sa.Text(), nullable=True),
            sa.Column(
                "registrado_por",
                postgresql.UUID(as_uuid=True),
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
        )
        op.create_unique_constraint(
            "uq_assoc_mensalidade_assoc_mes",
            "associado_mensalidade_pagamentos",
            ["associado_id", "mes_referencia"],
        )
        op.create_index(
            "ix_assoc_mensalidade_pagamentos_tenant_mes",
            "associado_mensalidade_pagamentos",
            ["tenant_id", "mes_referencia"],
        )
        op.create_index(
            "ix_assoc_mensalidade_pagamentos_associado_id",
            "associado_mensalidade_pagamentos",
            ["associado_id"],
        )

    # ── 4. tenant_configs.enable_mensalidade_associado ────────────────────
    tc_cols = {c["name"] for c in inspector.get_columns("tenant_configs")}
    if "enable_mensalidade_associado" not in tc_cols:
        op.add_column(
            "tenant_configs",
            sa.Column(
                "enable_mensalidade_associado",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # 4. tenant_configs
    tc_cols = {c["name"] for c in inspector.get_columns("tenant_configs")}
    if "enable_mensalidade_associado" in tc_cols:
        op.drop_column("tenant_configs", "enable_mensalidade_associado")

    # 3. associado_mensalidade_pagamentos
    if "associado_mensalidade_pagamentos" in inspector.get_table_names():
        op.drop_index("ix_assoc_mensalidade_pagamentos_associado_id", table_name="associado_mensalidade_pagamentos")
        op.drop_index("ix_assoc_mensalidade_pagamentos_tenant_mes", table_name="associado_mensalidade_pagamentos")
        op.drop_constraint("uq_assoc_mensalidade_assoc_mes", "associado_mensalidade_pagamentos", type_="unique")
        op.drop_table("associado_mensalidade_pagamentos")

    # 2. mensalidade_configs
    mc_cols = {c["name"] for c in inspector.get_columns("mensalidade_configs")}
    for col in ("relatorio_hora_envio", "dia_vencimento_associado", "valor_mensal_associado"):
        if col in mc_cols:
            op.drop_column("mensalidade_configs", col)

    # 1. associados
    assoc_cols = {c["name"] for c in inspector.get_columns("associados")}
    if "mensalidade_isento" in assoc_cols:
        op.drop_column("associados", "mensalidade_isento")
