"""Duplas da noite na Porta (médium + cambone por gira) e o toggle do médium no Modo TV.

- `gira_duplas`: uma linha por médium trabalhando na gira, com o cambone que o auxilia. Um
  cambone fica em no máximo uma dupla por gira (índice único parcial).
- `tenant_configs.enable_tv_medium`: o Modo TV mostra o médium da última senha chamada só
  quando a casa liga (padrão desligado).

Downgrade: remove a tabela e a coluna (as senhas guardam médium/cambone em texto, nada se perde
do histórico de atendimentos).

Revision ID: 096_gira_duplas
Revises: 095_tenant_self_deactivated_by
Create Date: 2026-10-20
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "096_gira_duplas"
down_revision: str = "095_tenant_self_deactivated_by"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gira_duplas",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "gira_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("giras.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "medium_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("mediuns.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "cambone_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("mediuns.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("gira_id", "medium_id", name="uq_gira_duplas_gira_medium"),
        sa.CheckConstraint(
            "cambone_id IS NULL OR cambone_id <> medium_id", name="ck_gira_duplas_cambone_diferente"
        ),
    )
    op.create_index("ix_gira_duplas_tenant_id", "gira_duplas", ["tenant_id"])
    op.create_index(
        "uq_gira_duplas_gira_cambone",
        "gira_duplas",
        ["gira_id", "cambone_id"],
        unique=True,
        postgresql_where=sa.text("cambone_id IS NOT NULL"),
    )
    op.add_column(
        "tenant_configs",
        sa.Column("enable_tv_medium", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("tenant_configs", "enable_tv_medium")
    op.drop_index("uq_gira_duplas_gira_cambone", table_name="gira_duplas")
    op.drop_index("ix_gira_duplas_tenant_id", table_name="gira_duplas")
    op.drop_table("gira_duplas")
