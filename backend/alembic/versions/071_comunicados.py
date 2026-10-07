"""Avisos da casa (AM-09) — tabelas `comunicados` e `comunicado_leituras` + acesso no grupo padrão.

- `comunicados`: `titulo` (≤ 120), `corpo` (texto simples, sem HTML), `publico`
  (`todos | atendimento | cambones`, texto com CHECK para crescer com os grupos da corrente do
  AM-23 sem `ALTER TYPE`), `fixado`, `publicar_em` (agora ou agendado), `expira_em` (opcional),
  `criado_por`, timestamps e soft delete.
- `comunicado_leituras`: quem leu (`medium_id`) e quando (`lido_em`); único por aviso + médium.
- Acesso total à feature `comunicados` (valor criado na 070) nos grupos padrão "Acesso total"
  (Q-05: operador sem grupo não acessa nada; os operadores migrados estão nesse grupo). Grupos
  que o admin criou ficam sem a feature até ele marcar. Idempotente (`ON CONFLICT DO NOTHING`).

Downgrade: apaga as linhas `comunicados` de `group_permissions` e as duas tabelas (o valor do
ENUM fica — ver 070).

Revision ID: 071_comunicados
Revises: 070_permissao_comunicados_enum
Create Date: 2026-10-07
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "071_comunicados"
down_revision: str = "070_permissao_comunicados_enum"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "comunicados",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("titulo", sa.String(120), nullable=False),
        sa.Column("corpo", sa.Text(), nullable=False),
        sa.Column("publico", sa.String(20), nullable=False, server_default="todos"),
        sa.Column("fixado", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("publicar_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expira_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "criado_por", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("publico IN ('todos', 'atendimento', 'cambones')", name="ck_comunicados_publico"),
    )
    op.create_index("ix_comunicados_tenant_id", "comunicados", ["tenant_id"])
    op.create_index("ix_comunicados_tenant_publicar_em", "comunicados", ["tenant_id", "publicar_em"])

    op.create_table(
        "comunicado_leituras",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "comunicado_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("comunicados.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "medium_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("mediuns.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("lido_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("comunicado_id", "medium_id", name="uq_comunicado_leituras_comunicado_medium"),
    )
    op.create_index("ix_comunicado_leituras_tenant_id", "comunicado_leituras", ["tenant_id"])
    op.create_index("ix_comunicado_leituras_medium_id", "comunicado_leituras", ["medium_id"])

    op.execute(
        """
        INSERT INTO group_permissions (id, group_id, feature, can_view, can_insert, can_edit, can_delete, created_at, updated_at)
        SELECT gen_random_uuid(), id, 'comunicados'::permission_feature, true, true, true, true, now(), now()
          FROM permission_groups
         WHERE is_default AND deleted_at IS NULL
        ON CONFLICT (group_id, feature) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM group_permissions WHERE feature = 'comunicados'")
    op.drop_index("ix_comunicado_leituras_medium_id", table_name="comunicado_leituras")
    op.drop_index("ix_comunicado_leituras_tenant_id", table_name="comunicado_leituras")
    op.drop_table("comunicado_leituras")
    op.drop_index("ix_comunicados_tenant_publicar_em", table_name="comunicados")
    op.drop_index("ix_comunicados_tenant_id", table_name="comunicados")
    op.drop_table("comunicados")
