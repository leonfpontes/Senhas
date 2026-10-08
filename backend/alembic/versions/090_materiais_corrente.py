"""Estudos e documentos da casa (AM-21) — tabelas `materiais_corrente` e `material_grupos`.

- `materiais_corrente`: `titulo` (≤ 120), `tipo` (`link | texto | ponto`, CHECK), `url` (≤ 500,
  só http/https — CHECK `ck_materiais_corrente_url`; obrigatória no tipo `link`), `texto` (texto
  simples, obrigatório em `texto`/`ponto`), `categoria` (≤ 60, texto livre), `publico`
  (`todos | atendimento | cambones | grupos`, como os avisos), `ordem`, `publicado`,
  `created_by`, timestamps e `arquivado_em`.
- `material_grupos`: PK (`material_id`, `grupo_id`), `tenant_id` — materiais com público `grupos`.

Sem upload de arquivo (banco limitado a 8 GB): PDF entra como link do Drive. Sem valor novo de
permissão: a gestão usa o grupo `COMUNICADOS` (já liberado no grupo padrão pela 071).

Downgrade: as duas tabelas saem (os materiais são perdidos).

Revision ID: 090_materiais_corrente
Revises: 081_lembretes
Create Date: 2026-10-08
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "090_materiais_corrente"
down_revision: str = "081_lembretes"
branch_labels = None
depends_on = None


def _uuid_fk(nome: str, alvo: str, ondelete: str = "CASCADE", **kw) -> sa.Column:
    return sa.Column(nome, postgresql.UUID(as_uuid=True), sa.ForeignKey(alvo, ondelete=ondelete), **kw)


def upgrade() -> None:
    op.create_table(
        "materiais_corrente",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
        sa.Column("titulo", sa.String(120), nullable=False),
        sa.Column("tipo", sa.String(20), nullable=False),
        sa.Column("url", sa.String(500), nullable=True),
        sa.Column("texto", sa.Text(), nullable=True),
        sa.Column("categoria", sa.String(60), nullable=False, server_default="Estudos"),
        sa.Column("publico", sa.String(20), nullable=False, server_default="todos"),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("publicado", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        _uuid_fk("created_by", "users.id", ondelete="SET NULL", nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("arquivado_em", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("tipo IN ('link', 'texto', 'ponto')", name="ck_materiais_corrente_tipo"),
        sa.CheckConstraint(
            "publico IN ('todos', 'atendimento', 'cambones', 'grupos')", name="ck_materiais_corrente_publico"
        ),
        sa.CheckConstraint("url IS NULL OR url ~* '^https?://'", name="ck_materiais_corrente_url"),
        sa.CheckConstraint("tipo <> 'link' OR url IS NOT NULL", name="ck_materiais_corrente_link_url"),
        sa.CheckConstraint("tipo = 'link' OR texto IS NOT NULL", name="ck_materiais_corrente_texto"),
    )
    op.create_index("ix_materiais_corrente_tenant_id", "materiais_corrente", ["tenant_id"])
    op.create_index("ix_materiais_corrente_tenant_ordem", "materiais_corrente", ["tenant_id", "ordem"])

    op.create_table(
        "material_grupos",
        _uuid_fk("material_id", "materiais_corrente.id", primary_key=True),
        _uuid_fk("grupo_id", "corrente_grupos.id", primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
    )
    op.create_index("ix_material_grupos_tenant_id", "material_grupos", ["tenant_id"])
    op.create_index("ix_material_grupos_grupo_id", "material_grupos", ["grupo_id"])


def downgrade() -> None:
    op.drop_index("ix_material_grupos_grupo_id", table_name="material_grupos")
    op.drop_index("ix_material_grupos_tenant_id", table_name="material_grupos")
    op.drop_table("material_grupos")
    op.drop_index("ix_materiais_corrente_tenant_ordem", table_name="materiais_corrente")
    op.drop_index("ix_materiais_corrente_tenant_id", table_name="materiais_corrente")
    op.drop_table("materiais_corrente")
