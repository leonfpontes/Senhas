"""Troca e substituição na escala + abono da justificativa (AM-27).

- `participacao_trocas`: um médium pede que um colega vá no lugar dele numa escala (gira com
  função, faxina, atividade "só escalados"). Status pedido · aceito · aprovado · recusado ·
  cancelado; substituto vazio = "a direção escolhe". Uma troca aberta por participação (índice
  único parcial).
- `atividade_participacoes`: origem `troca` (a linha do substituto) e o abono da justificativa
  (`justificativa_avaliacao` aceita | recusada, quando e quem).
- `tenant_configs.escala_troca_exige_aprovacao` (padrão ligado): troca combinada entre médiuns
  precisa da aprovação da direção.
- `medium_preferencias.mostrar_nome_colegas` (D-07, padrão desligado): o primeiro nome aparece para
  os colegas de escala na hora de pedir troca.
- `medium_lembretes_enviados.tipo`: `troca_pedida`, `troca_resposta`, `troca_aprovada`.

Downgrade: apaga a tabela e as colunas; linhas com origem `troca` voltam a `manual` e as marcas de
e-mail das trocas somem (o CHECK antigo não as aceita).

Revision ID: 086_trocas_escala
Revises: 085_assinatura_boleto
Create Date: 2026-10-08
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "086_trocas_escala"
down_revision: str = "085_assinatura_boleto"
branch_labels = None
depends_on = None

ORIGENS_ANTES = ("elegivel", "grupo", "funcao", "rodizio", "manual", "avulso")
ORIGENS = ORIGENS_ANTES + ("troca",)
TIPOS_ANTES = (
    "mensalidade_antes",
    "mensalidade_depois",
    "pix_alterado",
    "escala_nova",
    "vespera",
    "confirmacao",
    "falta",
    "aviso",
    "cancelada",
    "resumo_admin",
)
TIPOS_TROCA = ("troca_pedida", "troca_resposta", "troca_aprovada")
TIPOS = TIPOS_ANTES + TIPOS_TROCA
STATUS = ("pedido", "aceito", "aprovado", "recusado", "cancelado")
FECHADA_POR = ("solicitante", "substituto", "direcao")


def _in(coluna: str, valores) -> str:
    return f"{coluna} IN (" + ", ".join(f"'{v}'" for v in valores) + ")"


def _uuid_fk(nome: str, alvo: str, ondelete: str = "CASCADE", **kw) -> sa.Column:
    return sa.Column(nome, postgresql.UUID(as_uuid=True), sa.ForeignKey(alvo, ondelete=ondelete), **kw)


def upgrade() -> None:
    op.add_column(
        "tenant_configs",
        sa.Column("escala_troca_exige_aprovacao", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column(
        "medium_preferencias",
        sa.Column("mostrar_nome_colegas", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.add_column("atividade_participacoes", sa.Column("justificativa_avaliacao", sa.String(10), nullable=True))
    op.add_column(
        "atividade_participacoes", sa.Column("justificativa_avaliada_em", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "atividade_participacoes",
        _uuid_fk("justificativa_avaliada_por", "users.id", ondelete="SET NULL", nullable=True),
    )
    op.create_check_constraint(
        "ck_atividade_participacoes_justificativa_avaliacao",
        "atividade_participacoes",
        "justificativa_avaliacao IS NULL OR " + _in("justificativa_avaliacao", ("aceita", "recusada")),
    )
    op.drop_constraint("ck_atividade_participacoes_origem", "atividade_participacoes", type_="check")
    op.create_check_constraint("ck_atividade_participacoes_origem", "atividade_participacoes", _in("origem", ORIGENS))

    op.drop_constraint("ck_medium_lembretes_enviados_tipo", "medium_lembretes_enviados", type_="check")
    op.create_check_constraint("ck_medium_lembretes_enviados_tipo", "medium_lembretes_enviados", _in("tipo", TIPOS))

    op.create_table(
        "participacao_trocas",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
        _uuid_fk("atividade_id", "atividades.id", nullable=False),
        _uuid_fk("participacao_id", "atividade_participacoes.id", nullable=False),
        _uuid_fk("solicitante_id", "mediuns.id", nullable=False),
        _uuid_fk("substituto_id", "mediuns.id", nullable=True),
        sa.Column("indicado_pela_direcao", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("status", sa.String(20), nullable=False, server_default="pedido"),
        sa.Column("recado", sa.String(200), nullable=True),
        sa.Column("respondido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fechada_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fechada_por", sa.String(20), nullable=True),
        _uuid_fk("decidido_por", "users.id", ondelete="SET NULL", nullable=True),
        _uuid_fk("nova_participacao_id", "atividade_participacoes.id", ondelete="SET NULL", nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(_in("status", STATUS), name="ck_participacao_trocas_status"),
        sa.CheckConstraint(
            "fechada_por IS NULL OR " + _in("fechada_por", FECHADA_POR), name="ck_participacao_trocas_fechada_por"
        ),
        sa.CheckConstraint(
            "substituto_id IS NULL OR substituto_id <> solicitante_id", name="ck_participacao_trocas_outro_medium"
        ),
    )
    op.create_index("ix_participacao_trocas_tenant_status", "participacao_trocas", ["tenant_id", "status"])
    op.create_index("ix_participacao_trocas_tenant_atividade", "participacao_trocas", ["tenant_id", "atividade_id"])
    op.create_index("ix_participacao_trocas_solicitante", "participacao_trocas", ["solicitante_id"])
    op.create_index("ix_participacao_trocas_substituto", "participacao_trocas", ["substituto_id"])
    op.create_index(
        "uq_participacao_trocas_aberta",
        "participacao_trocas",
        ["participacao_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('pedido', 'aceito')"),
    )


def downgrade() -> None:
    op.drop_index("uq_participacao_trocas_aberta", table_name="participacao_trocas")
    op.drop_index("ix_participacao_trocas_substituto", table_name="participacao_trocas")
    op.drop_index("ix_participacao_trocas_solicitante", table_name="participacao_trocas")
    op.drop_index("ix_participacao_trocas_tenant_atividade", table_name="participacao_trocas")
    op.drop_index("ix_participacao_trocas_tenant_status", table_name="participacao_trocas")
    op.drop_table("participacao_trocas")

    op.execute("DELETE FROM medium_lembretes_enviados WHERE " + _in("tipo", TIPOS_TROCA))
    op.drop_constraint("ck_medium_lembretes_enviados_tipo", "medium_lembretes_enviados", type_="check")
    op.create_check_constraint(
        "ck_medium_lembretes_enviados_tipo", "medium_lembretes_enviados", _in("tipo", TIPOS_ANTES)
    )

    op.execute("UPDATE atividade_participacoes SET origem = 'manual' WHERE origem = 'troca'")
    op.drop_constraint("ck_atividade_participacoes_origem", "atividade_participacoes", type_="check")
    op.create_check_constraint(
        "ck_atividade_participacoes_origem", "atividade_participacoes", _in("origem", ORIGENS_ANTES)
    )
    op.drop_constraint("ck_atividade_participacoes_justificativa_avaliacao", "atividade_participacoes", type_="check")
    op.drop_column("atividade_participacoes", "justificativa_avaliada_por")
    op.drop_column("atividade_participacoes", "justificativa_avaliada_em")
    op.drop_column("atividade_participacoes", "justificativa_avaliacao")

    op.drop_column("medium_preferencias", "mostrar_nome_colegas")
    op.drop_column("tenant_configs", "escala_troca_exige_aprovacao")
