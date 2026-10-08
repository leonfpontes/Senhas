"""Ficha espiritual do médium (F-05) e caminhada na Área do Médium (AM-19).

Tabelas (colunas "enum" são texto com CHECK, minúsculas):
- `ficha_campos`: campos configuráveis da ficha por terreiro — `chave` (única no terreiro),
  `rotulo`, `tipo` (texto | data | lista | sim_nao), `opcoes` (lista, JSONB), `tradicao`
  (umbanda | candomble | outra), `ordem`, `visivel_ao_medium`, `medium_pode_sugerir`,
  `arquivado_em`. Modelos iniciais de Umbanda e Candomblé são aplicados pela tela (não aqui).
- `ficha_valores`: valor de um campo para um médium (único por médium e campo).
- `medium_marcos`: linha do tempo da caminhada (entrada, batismo, obrigação, coroação, outro),
  com data, observação curta e `visivel_ao_medium`.
- `ficha_sugestoes`: o médium sugere um valor (campos com `medium_pode_sugerir`); a direção aceita
  ou recusa no painel. Uma sugestão pendente por médium e campo (índice único parcial).

Colunas em `mediuns` — consentimento explícito para guardar dado religioso (LGPD art. 11, I):
`consentimento_dado_religioso_em`, `_por` (usuário que registrou: a direção no painel ou o próprio
médium na Área), `_versao` (do texto aceito) e `_revogado_em` (o médium retirou: os dados ficam
inacessíveis e a direção é avisada para apagá-los).

Sem acesso nos grupos padrão: ver a docstring da 088 (exceção consciente).

Downgrade: apaga as linhas `ficha_espiritual` de `group_permissions`, as quatro tabelas e as
colunas (os dados da ficha se perdem; o valor do ENUM fica — ver 088).

Revision ID: 089_ficha_espiritual
Revises: 088_permissao_ficha_enum
Create Date: 2026-10-08
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "089_ficha_espiritual"
down_revision: str = "088_permissao_ficha_enum"
branch_labels = None
depends_on = None

TIPOS_CAMPO = ("texto", "data", "lista", "sim_nao")
TRADICOES = ("umbanda", "candomble", "outra")
TIPOS_MARCO = ("entrada", "batismo", "obrigacao", "coroacao", "outro")
STATUS_SUGESTAO = ("pendente", "aceita", "recusada")


def _in(coluna: str, valores) -> str:
    return f"{coluna} IN (" + ", ".join(f"'{v}'" for v in valores) + ")"


def _uuid_fk(nome: str, alvo: str, ondelete: str = "CASCADE", **kw) -> sa.Column:
    return sa.Column(nome, postgresql.UUID(as_uuid=True), sa.ForeignKey(alvo, ondelete=ondelete), **kw)


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ]


def upgrade() -> None:
    op.add_column("mediuns", sa.Column("consentimento_dado_religioso_em", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "mediuns",
        _uuid_fk("consentimento_dado_religioso_por", "users.id", ondelete="SET NULL", nullable=True),
    )
    op.add_column("mediuns", sa.Column("consentimento_dado_religioso_versao", sa.String(20), nullable=True))
    op.add_column(
        "mediuns", sa.Column("consentimento_dado_religioso_revogado_em", sa.DateTime(timezone=True), nullable=True)
    )

    op.create_table(
        "ficha_campos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
        sa.Column("chave", sa.String(60), nullable=False),
        sa.Column("rotulo", sa.String(80), nullable=False),
        sa.Column("tipo", sa.String(20), nullable=False, server_default="texto"),
        sa.Column("opcoes", postgresql.JSONB(), nullable=True),
        sa.Column("tradicao", sa.String(20), nullable=False, server_default="outra"),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("visivel_ao_medium", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("medium_pode_sugerir", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("arquivado_em", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("tenant_id", "chave", name="uq_ficha_campos_tenant_chave"),
        sa.CheckConstraint(_in("tipo", TIPOS_CAMPO), name="ck_ficha_campos_tipo"),
        sa.CheckConstraint(_in("tradicao", TRADICOES), name="ck_ficha_campos_tradicao"),
    )
    op.create_index("ix_ficha_campos_tenant_id", "ficha_campos", ["tenant_id"])

    op.create_table(
        "ficha_valores",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
        _uuid_fk("medium_id", "mediuns.id", nullable=False),
        _uuid_fk("campo_id", "ficha_campos.id", nullable=False),
        sa.Column("valor", sa.Text(), nullable=False),
        _uuid_fk("atualizado_por", "users.id", ondelete="SET NULL", nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("medium_id", "campo_id", name="uq_ficha_valores_medium_campo"),
    )
    op.create_index("ix_ficha_valores_tenant_id", "ficha_valores", ["tenant_id"])
    op.create_index("ix_ficha_valores_campo_id", "ficha_valores", ["campo_id"])

    op.create_table(
        "medium_marcos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
        _uuid_fk("medium_id", "mediuns.id", nullable=False),
        sa.Column("tipo", sa.String(20), nullable=False),
        sa.Column("titulo", sa.String(120), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("observacao", sa.String(300), nullable=True),
        sa.Column("visivel_ao_medium", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        _uuid_fk("registrado_por", "users.id", ondelete="SET NULL", nullable=True),
        *_timestamps(),
        sa.CheckConstraint(_in("tipo", TIPOS_MARCO), name="ck_medium_marcos_tipo"),
    )
    op.create_index("ix_medium_marcos_tenant_id", "medium_marcos", ["tenant_id"])
    op.create_index("ix_medium_marcos_medium_id", "medium_marcos", ["medium_id"])

    op.create_table(
        "ficha_sugestoes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
        _uuid_fk("medium_id", "mediuns.id", nullable=False),
        _uuid_fk("campo_id", "ficha_campos.id", nullable=False),
        sa.Column("valor_sugerido", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pendente"),
        sa.Column("decidido_em", sa.DateTime(timezone=True), nullable=True),
        _uuid_fk("decidido_por", "users.id", ondelete="SET NULL", nullable=True),
        *_timestamps(),
        sa.CheckConstraint(_in("status", STATUS_SUGESTAO), name="ck_ficha_sugestoes_status"),
    )
    op.create_index("ix_ficha_sugestoes_tenant_id", "ficha_sugestoes", ["tenant_id"])
    op.create_index("ix_ficha_sugestoes_medium_id", "ficha_sugestoes", ["medium_id"])
    op.create_index(
        "uq_ficha_sugestoes_pendente",
        "ficha_sugestoes",
        ["medium_id", "campo_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pendente'"),
    )


def downgrade() -> None:
    op.execute("DELETE FROM group_permissions WHERE feature = 'ficha_espiritual'")
    op.drop_index("uq_ficha_sugestoes_pendente", table_name="ficha_sugestoes")
    op.drop_index("ix_ficha_sugestoes_medium_id", table_name="ficha_sugestoes")
    op.drop_index("ix_ficha_sugestoes_tenant_id", table_name="ficha_sugestoes")
    op.drop_table("ficha_sugestoes")
    op.drop_index("ix_medium_marcos_medium_id", table_name="medium_marcos")
    op.drop_index("ix_medium_marcos_tenant_id", table_name="medium_marcos")
    op.drop_table("medium_marcos")
    op.drop_index("ix_ficha_valores_campo_id", table_name="ficha_valores")
    op.drop_index("ix_ficha_valores_tenant_id", table_name="ficha_valores")
    op.drop_table("ficha_valores")
    op.drop_index("ix_ficha_campos_tenant_id", table_name="ficha_campos")
    op.drop_table("ficha_campos")
    op.drop_column("mediuns", "consentimento_dado_religioso_revogado_em")
    op.drop_column("mediuns", "consentimento_dado_religioso_versao")
    op.drop_column("mediuns", "consentimento_dado_religioso_por")
    op.drop_column("mediuns", "consentimento_dado_religioso_em")
