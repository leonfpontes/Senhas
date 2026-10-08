"""Atividades da casa (AM-08) — tipos, funções da corrente, atividades internas + dados e acesso.

Tabelas (§8.3 do plano da Área do Médium; colunas "enum" são texto com CHECK, minúsculas):
- `atividade_tipos`: nome (≤ 60, único por terreiro sem diferenciar maiúsculas entre os não
  arquivados), `natureza` (`gira` | `atividade`; um tipo `gira` por terreiro, que nunca é
  arquivado), ícone e cor de listas fechadas (cor null = cor do terreiro), presença,
  confirmação, justificativa, check-in pelo médium + janela, elegíveis, convocação padrão, modo
  de escala, horário/duração e visibilidade padrão, `is_sistema`, `ordem`, `arquivado_em`.
- `atividade_tipo_grupos`: grupos da corrente elegíveis quando `elegiveis = 'grupos'`.
- `funcoes_corrente`: Cambone, Porteiro, Ogã/Atabaque... (escala de gira, AM-18).
- `atividades`: atividade interna (título + início obrigatórios) ou âncora de uma gira
  (`gira_id`, único). Fora do limite de giras/mês, do site, da agenda pública e do sitemap (D-03).

Dados (para TODO terreiro existente; os novos ganham o mesmo em `ensure_default_atividade_tipos`,
chamado no cadastro e na criação pela plataforma):
- os 8 tipos sugeridos (§8.2) — "Gira" é o de sistema; "Desenvolvimento" fica para os médiuns de
  atendimento ou, se a casa já tem um grupo da corrente chamado "Desenvolvimento", para ele;
- as funções sugeridas;
- acesso total à feature `escalas` (valor criado na 077) nos grupos padrão "Acesso total"
  (Q-05). Idempotente (`ON CONFLICT DO NOTHING`).

A lista abaixo é uma cópia congelada de `services/atividades.TIPOS_SUGERIDOS` /
`FUNCOES_SUGERIDAS` (o teste `tests/unit/test_am08_atividades.py` confere que batem).

Downgrade: apaga as linhas `escalas` de `group_permissions` e as quatro tabelas (o valor do ENUM
fica — ver 077).

Revision ID: 078_atividades
Revises: 077_permissao_escalas_enum
Create Date: 2026-10-07
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "078_atividades"
down_revision: str = "077_permissao_escalas_enum"
branch_labels = None
depends_on = None

NATUREZAS = ("gira", "atividade")
ICONES = (
    "gira", "faxina", "vela", "flor", "organizacao", "curso", "desenvolvimento",
    "reuniao", "atabaque", "cozinha", "estudo", "estrela", "folha", "agua",
)
CORES = ("ambar", "petroleo", "violeta", "azul", "verde", "vinho", "terra", "grafite")
ELEGIVEIS = ("todos", "atendimento", "cambones", "grupos")
CONVOCACOES = ("todos_elegiveis", "so_escalados")
MODOS_ESCALA = ("nenhuma", "grupos_por_dia", "funcoes")
VISIBILIDADES = ("corrente", "convocados")
ORIGENS = ("manual", "plano_escala", "gira")

# (nome, natureza, icone, cor, controla_presenca, pede_confirmacao, exige_justificativa,
#  elegiveis, convocacao_padrao, modo_escala, hora_padrao, duracao_min, visibilidade_padrao,
#  is_sistema, ordem)
TIPOS_SUGERIDOS = (
    ("Gira", "gira", "gira", None, True, True, True, "todos", "todos_elegiveis", "funcoes", None, None, "corrente", True, 0),
    ("Faxina", "atividade", "faxina", "petroleo", True, True, True, "todos", "so_escalados", "grupos_por_dia", "09:00", 180, "corrente", False, 1),
    ("Ritual coletivo", "atividade", "vela", "violeta", True, True, True, "todos", "todos_elegiveis", "nenhuma", "20:00", 120, "corrente", False, 2),
    ("Ritual individual", "atividade", "flor", "vinho", True, True, False, "todos", "so_escalados", "nenhuma", None, 60, "convocados", False, 3),
    ("Organização interna", "atividade", "organizacao", "grafite", True, True, False, "todos", "so_escalados", "nenhuma", None, 120, "corrente", False, 4),
    ("Preparação de curso", "atividade", "curso", "azul", False, True, False, "todos", "so_escalados", "nenhuma", None, 120, "corrente", False, 5),
    ("Desenvolvimento", "atividade", "desenvolvimento", "verde", True, True, True, "atendimento", "todos_elegiveis", "nenhuma", "20:00", 120, "corrente", False, 6),
    ("Reunião", "atividade", "reuniao", "ambar", True, True, False, "todos", "todos_elegiveis", "nenhuma", "19:30", 90, "corrente", False, 7),
)
FUNCOES_SUGERIDAS = ("Cambone", "Porteiro", "Ogã/Atabaque", "Cozinha", "Limpeza pós-gira")


def _in(coluna: str, valores) -> str:
    return f"{coluna} IN (" + ", ".join(f"'{v}'" for v in valores) + ")"


def _uuid_fk(nome: str, alvo: str, ondelete="CASCADE", **kw) -> sa.Column:
    return sa.Column(nome, postgresql.UUID(as_uuid=True), sa.ForeignKey(alvo, ondelete=ondelete), **kw)


def _criar_tabelas() -> None:
    op.create_table(
        "atividade_tipos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
        sa.Column("nome", sa.String(60), nullable=False),
        sa.Column("natureza", sa.String(20), nullable=False, server_default="atividade"),
        sa.Column("icone", sa.String(30), nullable=False, server_default="estrela"),
        sa.Column("cor", sa.String(20), nullable=True),
        sa.Column("controla_presenca", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("pede_confirmacao", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("exige_justificativa", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("checkin_pelo_medium", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("checkin_antes_min", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("checkin_depois_min", sa.Integer(), nullable=False, server_default="180"),
        sa.Column("elegiveis", sa.String(20), nullable=False, server_default="todos"),
        sa.Column("convocacao_padrao", sa.String(20), nullable=False, server_default="todos_elegiveis"),
        sa.Column("modo_escala", sa.String(20), nullable=False, server_default="nenhuma"),
        sa.Column("hora_padrao", sa.Time(), nullable=True),
        sa.Column("duracao_min", sa.Integer(), nullable=True),
        sa.Column("visibilidade_padrao", sa.String(20), nullable=False, server_default="corrente"),
        sa.Column("is_sistema", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("arquivado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(_in("natureza", NATUREZAS), name="ck_atividade_tipos_natureza"),
        sa.CheckConstraint(_in("icone", ICONES), name="ck_atividade_tipos_icone"),
        sa.CheckConstraint("cor IS NULL OR " + _in("cor", CORES), name="ck_atividade_tipos_cor"),
        sa.CheckConstraint(_in("elegiveis", ELEGIVEIS), name="ck_atividade_tipos_elegiveis"),
        sa.CheckConstraint(_in("convocacao_padrao", CONVOCACOES), name="ck_atividade_tipos_convocacao"),
        sa.CheckConstraint(_in("modo_escala", MODOS_ESCALA), name="ck_atividade_tipos_modo_escala"),
        sa.CheckConstraint(_in("visibilidade_padrao", VISIBILIDADES), name="ck_atividade_tipos_visibilidade"),
        sa.CheckConstraint(
            "checkin_antes_min BETWEEN 0 AND 1440 AND checkin_depois_min BETWEEN 0 AND 1440",
            name="ck_atividade_tipos_janela_checkin",
        ),
        sa.CheckConstraint("duracao_min IS NULL OR duracao_min BETWEEN 15 AND 1440", name="ck_atividade_tipos_duracao"),
        sa.CheckConstraint("natureza <> 'gira' OR arquivado_em IS NULL", name="ck_atividade_tipos_gira_nao_arquiva"),
    )
    op.create_index("ix_atividade_tipos_tenant_id", "atividade_tipos", ["tenant_id"])
    op.create_index(
        "uq_atividade_tipos_tenant_nome_ativo",
        "atividade_tipos",
        ["tenant_id", sa.text("lower(nome)")],
        unique=True,
        postgresql_where=sa.text("arquivado_em IS NULL"),
    )
    op.create_index(
        "uq_atividade_tipos_gira",
        "atividade_tipos",
        ["tenant_id"],
        unique=True,
        postgresql_where=sa.text("natureza = 'gira'"),
    )

    op.create_table(
        "atividade_tipo_grupos",
        _uuid_fk("tipo_id", "atividade_tipos.id", primary_key=True),
        _uuid_fk("grupo_id", "corrente_grupos.id", primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
    )
    op.create_index("ix_atividade_tipo_grupos_tenant_id", "atividade_tipo_grupos", ["tenant_id"])
    op.create_index("ix_atividade_tipo_grupos_grupo_id", "atividade_tipo_grupos", ["grupo_id"])

    op.create_table(
        "funcoes_corrente",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
        sa.Column("nome", sa.String(60), nullable=False),
        sa.Column("descricao", sa.String(300), nullable=True),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("arquivado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_funcoes_corrente_tenant_id", "funcoes_corrente", ["tenant_id"])
    op.create_index(
        "uq_funcoes_corrente_tenant_nome_ativo",
        "funcoes_corrente",
        ["tenant_id", sa.text("lower(nome)")],
        unique=True,
        postgresql_where=sa.text("arquivado_em IS NULL"),
    )

    op.create_table(
        "atividades",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _uuid_fk("tenant_id", "tenants.id", nullable=False),
        sa.Column("tipo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("atividade_tipos.id"), nullable=False),
        _uuid_fk("gira_id", "giras.id", nullable=True),
        sa.Column("titulo", sa.String(120), nullable=True),
        sa.Column("inicio", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fim", sa.DateTime(timezone=True), nullable=True),
        sa.Column("local", sa.String(200), nullable=True),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("orientacoes", sa.Text(), nullable=True),
        sa.Column("visibilidade", sa.String(20), nullable=False, server_default="corrente"),
        sa.Column("origem", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("escala_plano_dia_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("cancelada_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelamento_motivo", sa.String(300), nullable=True),
        sa.Column("chamada_encerrada_em", sa.DateTime(timezone=True), nullable=True),
        _uuid_fk("chamada_encerrada_por", "users.id", ondelete="SET NULL", nullable=True),
        _uuid_fk("created_by", "users.id", ondelete="SET NULL", nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "gira_id IS NOT NULL OR (titulo IS NOT NULL AND inicio IS NOT NULL)",
            name="ck_atividades_gira_ou_titulo_inicio",
        ),
        sa.CheckConstraint("fim IS NULL OR inicio IS NULL OR fim > inicio", name="ck_atividades_fim_depois_do_inicio"),
        sa.CheckConstraint(_in("visibilidade", VISIBILIDADES), name="ck_atividades_visibilidade"),
        sa.CheckConstraint(_in("origem", ORIGENS), name="ck_atividades_origem"),
    )
    op.create_index("ix_atividades_tenant_id", "atividades", ["tenant_id"])
    op.create_index("ix_atividades_tenant_inicio", "atividades", ["tenant_id", "inicio"])
    op.create_index("ix_atividades_tipo_id", "atividades", ["tipo_id"])
    op.create_index(
        "uq_atividades_gira_id", "atividades", ["gira_id"], unique=True, postgresql_where=sa.text("gira_id IS NOT NULL")
    )


def _dados_sugeridos() -> None:
    conn = op.get_bind()
    inserir_tipo = sa.text(
        """
        INSERT INTO atividade_tipos (
            id, tenant_id, nome, natureza, icone, cor, controla_presenca, pede_confirmacao,
            exige_justificativa, elegiveis, convocacao_padrao, modo_escala, hora_padrao, duracao_min,
            visibilidade_padrao, is_sistema, ordem, created_at, updated_at
        )
        SELECT gen_random_uuid(), t.id, :nome, :natureza, :icone, :cor, :presenca, :confirmacao,
               :justificativa, :elegiveis, :convocacao, :modo, CAST(:hora AS time), :duracao,
               :visibilidade, :sistema, :ordem, now(), now()
          FROM tenants t
        ON CONFLICT DO NOTHING
        """
    )
    for (
        nome, natureza, icone, cor, presenca, confirmacao, justificativa, elegiveis,
        convocacao, modo, hora, duracao, visibilidade, sistema, ordem,
    ) in TIPOS_SUGERIDOS:
        conn.execute(
            inserir_tipo,
            {
                "nome": nome, "natureza": natureza, "icone": icone, "cor": cor, "presenca": presenca,
                "confirmacao": confirmacao, "justificativa": justificativa, "elegiveis": elegiveis,
                "convocacao": convocacao, "modo": modo, "hora": hora, "duracao": duracao,
                "visibilidade": visibilidade, "sistema": sistema, "ordem": ordem,
            },
        )

    # "Desenvolvimento": elegíveis = o grupo "Desenvolvimento" da casa, quando ele existe (AM-23).
    conn.execute(
        sa.text(
            """
            INSERT INTO atividade_tipo_grupos (tipo_id, grupo_id, tenant_id)
            SELECT at.id, g.id, at.tenant_id
              FROM atividade_tipos at
              JOIN corrente_grupos g
                ON g.tenant_id = at.tenant_id AND g.arquivado_em IS NULL AND lower(g.nome) = 'desenvolvimento'
             WHERE lower(at.nome) = 'desenvolvimento' AND at.natureza = 'atividade' AND at.arquivado_em IS NULL
            ON CONFLICT DO NOTHING
            """
        )
    )
    conn.execute(
        sa.text(
            """
            UPDATE atividade_tipos at SET elegiveis = 'grupos'
             WHERE EXISTS (SELECT 1 FROM atividade_tipo_grupos atg WHERE atg.tipo_id = at.id)
            """
        )
    )

    inserir_funcao = sa.text(
        """
        INSERT INTO funcoes_corrente (id, tenant_id, nome, ordem, created_at, updated_at)
        SELECT gen_random_uuid(), t.id, :nome, :ordem, now(), now() FROM tenants t
        ON CONFLICT DO NOTHING
        """
    )
    for ordem, nome in enumerate(FUNCOES_SUGERIDAS):
        conn.execute(inserir_funcao, {"nome": nome, "ordem": ordem})

    op.execute(
        """
        INSERT INTO group_permissions (id, group_id, feature, can_view, can_insert, can_edit, can_delete, created_at, updated_at)
        SELECT gen_random_uuid(), id, 'escalas'::permission_feature, true, true, true, true, now(), now()
          FROM permission_groups
         WHERE is_default AND deleted_at IS NULL
        ON CONFLICT (group_id, feature) DO NOTHING
        """
    )


def upgrade() -> None:
    _criar_tabelas()
    _dados_sugeridos()


def downgrade() -> None:
    op.execute("DELETE FROM group_permissions WHERE feature = 'escalas'")
    op.drop_index("uq_atividades_gira_id", table_name="atividades")
    op.drop_index("ix_atividades_tipo_id", table_name="atividades")
    op.drop_index("ix_atividades_tenant_inicio", table_name="atividades")
    op.drop_index("ix_atividades_tenant_id", table_name="atividades")
    op.drop_table("atividades")
    op.drop_index("uq_funcoes_corrente_tenant_nome_ativo", table_name="funcoes_corrente")
    op.drop_index("ix_funcoes_corrente_tenant_id", table_name="funcoes_corrente")
    op.drop_table("funcoes_corrente")
    op.drop_index("ix_atividade_tipo_grupos_grupo_id", table_name="atividade_tipo_grupos")
    op.drop_index("ix_atividade_tipo_grupos_tenant_id", table_name="atividade_tipo_grupos")
    op.drop_table("atividade_tipo_grupos")
    op.drop_index("uq_atividade_tipos_gira", table_name="atividade_tipos")
    op.drop_index("uq_atividade_tipos_tenant_nome_ativo", table_name="atividade_tipos")
    op.drop_index("ix_atividade_tipos_tenant_id", table_name="atividade_tipos")
    op.drop_table("atividade_tipos")
