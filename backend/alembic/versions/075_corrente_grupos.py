"""Grupos da corrente (AM-23) — `corrente_grupos`, `corrente_grupo_membros`, `comunicado_grupos`
e o público `grupos` nos avisos.

- `corrente_grupos`: `nome` (≤ 60), `cor` (paleta fechada, CHECK `ck_corrente_grupos_cor`),
  `descricao` (≤ 300), `arquivado_em`, timestamps. Nome único por terreiro sem diferenciar
  maiúsculas, só entre os não arquivados (índice único parcial em `lower(nome)`).
- `corrente_grupo_membros`: PK (`grupo_id`, `medium_id`), `tenant_id`, `desde`.
- `comunicado_grupos`: PK (`comunicado_id`, `grupo_id`), `tenant_id` — avisos com
  `publico = 'grupos'`.
- `ck_comunicados_publico` passa a aceitar `grupos` (a coluna é texto com CHECK desde a 071
  justamente para isso).

Sem feature nova de permissão: grupos usam `MEDIUNS` (§6.7 do plano da Área).

Downgrade: avisos com público `grupos` são arquivados (soft delete) e voltam a `todos` só para
caber no CHECK antigo — nunca ficam visíveis para a corrente inteira; depois as três tabelas saem.

Revision ID: 075_corrente_grupos
Revises: 073_giras_orientacoes_corrente
Create Date: 2026-10-07
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "075_corrente_grupos"
down_revision: str = "073_giras_orientacoes_corrente"
branch_labels = None
depends_on = None

CORES = ("ambar", "petroleo", "violeta", "azul", "verde", "vinho", "terra", "grafite")
_CHECK_COR = "cor IN (" + ", ".join(f"'{c}'" for c in CORES) + ")"


def _uuid_fk(nome: str, alvo: str, **kw) -> sa.Column:
    return sa.Column(nome, postgresql.UUID(as_uuid=True), sa.ForeignKey(alvo, ondelete="CASCADE"), **kw)


def upgrade() -> None:
    op.create_table(
        "corrente_grupos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
        sa.Column("nome", sa.String(60), nullable=False),
        sa.Column("cor", sa.String(20), nullable=False, server_default="ambar"),
        sa.Column("descricao", sa.String(300), nullable=True),
        sa.Column("arquivado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(_CHECK_COR, name="ck_corrente_grupos_cor"),
    )
    op.create_index("ix_corrente_grupos_tenant_id", "corrente_grupos", ["tenant_id"])
    op.create_index(
        "uq_corrente_grupos_tenant_nome_ativo",
        "corrente_grupos",
        ["tenant_id", sa.text("lower(nome)")],
        unique=True,
        postgresql_where=sa.text("arquivado_em IS NULL"),
    )

    op.create_table(
        "corrente_grupo_membros",
        _uuid_fk("grupo_id", "corrente_grupos.id", primary_key=True),
        _uuid_fk("medium_id", "mediuns.id", primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
        sa.Column("desde", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_corrente_grupo_membros_tenant_id", "corrente_grupo_membros", ["tenant_id"])
    op.create_index("ix_corrente_grupo_membros_medium_id", "corrente_grupo_membros", ["medium_id"])

    op.create_table(
        "comunicado_grupos",
        _uuid_fk("comunicado_id", "comunicados.id", primary_key=True),
        _uuid_fk("grupo_id", "corrente_grupos.id", primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
    )
    op.create_index("ix_comunicado_grupos_tenant_id", "comunicado_grupos", ["tenant_id"])
    op.create_index("ix_comunicado_grupos_grupo_id", "comunicado_grupos", ["grupo_id"])

    op.drop_constraint("ck_comunicados_publico", "comunicados", type_="check")
    op.create_check_constraint(
        "ck_comunicados_publico", "comunicados", "publico IN ('todos', 'atendimento', 'cambones', 'grupos')"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE comunicados SET deleted_at = COALESCE(deleted_at, now()), publico = 'todos' WHERE publico = 'grupos'"
    )
    op.drop_constraint("ck_comunicados_publico", "comunicados", type_="check")
    op.create_check_constraint(
        "ck_comunicados_publico", "comunicados", "publico IN ('todos', 'atendimento', 'cambones')"
    )
    op.drop_index("ix_comunicado_grupos_grupo_id", table_name="comunicado_grupos")
    op.drop_index("ix_comunicado_grupos_tenant_id", table_name="comunicado_grupos")
    op.drop_table("comunicado_grupos")
    op.drop_index("ix_corrente_grupo_membros_medium_id", table_name="corrente_grupo_membros")
    op.drop_index("ix_corrente_grupo_membros_tenant_id", table_name="corrente_grupo_membros")
    op.drop_table("corrente_grupo_membros")
    op.drop_index("uq_corrente_grupos_tenant_nome_ativo", table_name="corrente_grupos")
    op.drop_index("ix_corrente_grupos_tenant_id", table_name="corrente_grupos")
    op.drop_table("corrente_grupos")
