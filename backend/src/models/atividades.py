"""Atividades da casa (AM-08): tipos configuráveis, funções da corrente e atividades internas.

Tudo o que a corrente faz junto vira uma **atividade** (§8 do plano da Área do Médium):

- `atividade_tipos`: os tipos da casa (Gira, Faxina, Ritual coletivo...). Livres por terreiro:
  o admin renomeia, muda ícone e cor, cria e arquiva. O tipo de `natureza = 'gira'` é de
  sistema — um por terreiro (`uq_atividade_tipos_gira`), pode ser renomeado mas nunca
  arquivado (`ck_atividade_tipos_gira_nao_arquiva`) e é o único que corresponde ao que vai ao
  site (a gira de verdade, tabela `giras`). Opções de presença, confirmação, justificativa,
  check-in, quem é elegível, convocação, modo de escala, horário e visibilidade padrão.
- `atividade_tipo_grupos`: os grupos da corrente (AM-23) elegíveis quando `elegiveis = 'grupos'`.
- `funcoes_corrente`: funções da casa (Cambone, Porteiro, Ogã/Atabaque...) para a escala de
  gira (AM-18). Nome único entre as não arquivadas.
- `atividades`: as atividades internas (D-03: tabela própria, fora do limite de giras/mês, do
  site, da agenda pública e do sitemap) e a **âncora** de uma gira (`gira_id`, uma por gira,
  criada por `services/atividades.atividade_da_gira` quando a escala/presença precisar — AM-17).
  A âncora não copia nome, data nem local: lê da gira.

- `atividade_participacoes` (AM-17, migração 079): uma linha por médium por atividade — a
  convocação (de onde veio), a resposta (vou/não vou), a justificativa e a presença. Escala e
  presença são a MESMA linha (§8.1): não há o que sincronizar. Única por (`atividade_id`,
  `medium_id`), o que também segura a corrida entre o "Cheguei" e a chamada.

- `participacao_trocas` (AM-27, migração 086): troca de escala entre médiuns (pedido → aceito
  pelo colega → aprovado pela direção, ou direto sem aprovação; recusado/cancelado).

- `escala_planos` / `escala_plano_dias` (AM-25, migração 080): o planejador da faxina — um
  plano por tipo (modo "grupos por dia") e mês, rascunho ou publicado, e os dias × grupo × horário.
  Publicar cria uma atividade por dia e grupo (`origem = 'plano_escala'`) e grava o id dela em
  `escala_plano_dias.atividade_id` (o vínculo forte, com FK). `atividades.escala_plano_dia_id`
  fica só como referência, SEM FK de propósito (FK nos dois sentidos seria um ciclo): o serviço
  limpa a coluna quando o dia sai do plano.

Colunas "enum" são texto com CHECK e valores minúsculos (como `comunicados.publico`): crescem
sem `ALTER TYPE`.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, time
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.tz import utc_now
from .base import Base
from .corrente_grupos import CORES_GRUPO

# ── Valores fechados (espelho em frontend/src/constants/atividades.ts) ──────
NATUREZA_GIRA = "gira"
NATUREZA_ATIVIDADE = "atividade"
NATUREZAS = (NATUREZA_GIRA, NATUREZA_ATIVIDADE)

# Ícones: nomes semânticos que o front traduz (lib/icons.ts → ICONES_ATIVIDADE).
ICONES_ATIVIDADE = (
    "gira",
    "faxina",
    "vela",
    "flor",
    "organizacao",
    "curso",
    "desenvolvimento",
    "reuniao",
    "atabaque",
    "cozinha",
    "estudo",
    "estrela",
    "folha",
    "agua",
)
# Cores: a mesma paleta fechada dos grupos da corrente (contraste AA com texto branco).
# `cor` null = cor do terreiro (padrão do tipo Gira).
CORES_TIPO = CORES_GRUPO

ELEGIVEIS = ("todos", "atendimento", "cambones", "grupos")
CONVOCACOES = ("todos_elegiveis", "so_escalados")
MODOS_ESCALA = ("nenhuma", "grupos_por_dia", "funcoes")
VISIBILIDADES = ("corrente", "convocados")
ORIGENS_ATIVIDADE = ("manual", "plano_escala", "gira")
# Planejador da faxina (AM-25).
STATUS_PLANO = ("rascunho", "publicado")

# Presença (AM-17/AM-28, D-11). Modo: confiança (a confirmação "vou" basta), "Cheguei" pelo app
# na janela do tipo, ou "Cheguei" com o QR do dia. `atividade_tipos.presenca_modo` null = o
# padrão da casa (`tenant_configs.presenca_modo_padrao`).
MODOS_PRESENCA = ("confianca", "app", "qr")
# `troca` (AM-27): a linha nasceu de uma troca aprovada — o substituto no lugar de quem pediu.
ORIGENS_PARTICIPACAO = ("elegivel", "grupo", "funcao", "rodizio", "manual", "avulso", "troca")
RESPOSTAS = ("sem_resposta", "vou", "nao_vou")
PRESENCAS = ("nao_registrada", "presente", "ausente")
# `confianca`: presente no encerramento porque confirmou "vou" no modo confiança.
PRESENCA_ORIGENS = ("checkin_medium", "chamada", "encerramento", "confianca")
JUSTIFICATIVA_MAX = 500
# Abono da justificativa (AM-27): null = ainda não avaliada (vale como justificada), `aceita` ou
# `recusada` (recusada conta como falta sem justificativa no relatório de assiduidade).
AVALIACOES_JUSTIFICATIVA = ("aceita", "recusada")

# Troca de escala (AM-27): pedido → (colega aceita) aceito → (direção aprova) aprovado; ou
# recusado / cancelado. Sem aprovação da casa, o aceite do colega já aprova.
TROCA_PEDIDO = "pedido"
TROCA_ACEITO = "aceito"
TROCA_APROVADO = "aprovado"
TROCA_RECUSADO = "recusado"
TROCA_CANCELADO = "cancelado"
STATUS_TROCA = (TROCA_PEDIDO, TROCA_ACEITO, TROCA_APROVADO, TROCA_RECUSADO, TROCA_CANCELADO)
STATUS_TROCA_ABERTOS = (TROCA_PEDIDO, TROCA_ACEITO)
# Quem fechou a troca (recusou, cancelou ou aprovou).
FECHADA_POR = ("solicitante", "substituto", "direcao")
RECADO_MAX = 200

NOME_MAX = 60
DESCRICAO_FUNCAO_MAX = 300
TITULO_MAX = 120
LOCAL_MAX = 200
MOTIVO_MAX = 300
CHECKIN_MAX_MIN = 24 * 60
DURACAO_MIN_MIN = 15
DURACAO_MAX_MIN = 24 * 60

# Janela padrão do "Cheguei" (D-11): de 60 min antes a 180 min depois do início.
CHECKIN_ANTES_PADRAO = 60
CHECKIN_DEPOIS_PADRAO = 180


def _in(coluna: str, valores: tuple[str, ...]) -> str:
    return f"{coluna} IN (" + ", ".join(f"'{v}'" for v in valores) + ")"


class AtividadeTipo(Base):
    __tablename__ = "atividade_tipos"
    __table_args__ = (
        Index("ix_atividade_tipos_tenant_id", "tenant_id"),
        Index(
            "uq_atividade_tipos_tenant_nome_ativo",
            "tenant_id",
            text("lower(nome)"),
            unique=True,
            postgresql_where=text("arquivado_em IS NULL"),
            sqlite_where=text("arquivado_em IS NULL"),
        ),
        Index(
            "uq_atividade_tipos_gira",
            "tenant_id",
            unique=True,
            postgresql_where=text("natureza = 'gira'"),
            sqlite_where=text("natureza = 'gira'"),
        ),
        CheckConstraint(_in("natureza", NATUREZAS), name="ck_atividade_tipos_natureza"),
        CheckConstraint(_in("icone", ICONES_ATIVIDADE), name="ck_atividade_tipos_icone"),
        CheckConstraint("cor IS NULL OR " + _in("cor", CORES_TIPO), name="ck_atividade_tipos_cor"),
        CheckConstraint(_in("elegiveis", ELEGIVEIS), name="ck_atividade_tipos_elegiveis"),
        CheckConstraint(_in("convocacao_padrao", CONVOCACOES), name="ck_atividade_tipos_convocacao"),
        CheckConstraint(_in("modo_escala", MODOS_ESCALA), name="ck_atividade_tipos_modo_escala"),
        CheckConstraint(_in("visibilidade_padrao", VISIBILIDADES), name="ck_atividade_tipos_visibilidade"),
        CheckConstraint(
            f"checkin_antes_min BETWEEN 0 AND {CHECKIN_MAX_MIN} AND checkin_depois_min BETWEEN 0 AND {CHECKIN_MAX_MIN}",
            name="ck_atividade_tipos_janela_checkin",
        ),
        CheckConstraint(
            f"duracao_min IS NULL OR duracao_min BETWEEN {DURACAO_MIN_MIN} AND {DURACAO_MAX_MIN}",
            name="ck_atividade_tipos_duracao",
        ),
        CheckConstraint("natureza <> 'gira' OR arquivado_em IS NULL", name="ck_atividade_tipos_gira_nao_arquiva"),
        CheckConstraint(
            "presenca_modo IS NULL OR " + _in("presenca_modo", MODOS_PRESENCA), name="ck_atividade_tipos_presenca_modo"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(NOME_MAX), nullable=False)
    natureza: Mapped[str] = mapped_column(String(20), nullable=False, default=NATUREZA_ATIVIDADE)
    icone: Mapped[str] = mapped_column(String(30), nullable=False, default="estrela")
    cor: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    controla_presenca: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    pede_confirmacao: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    exige_justificativa: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    checkin_pelo_medium: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    checkin_antes_min: Mapped[int] = mapped_column(Integer, nullable=False, default=CHECKIN_ANTES_PADRAO)
    checkin_depois_min: Mapped[int] = mapped_column(Integer, nullable=False, default=CHECKIN_DEPOIS_PADRAO)
    # AM-28: modo de presença do tipo; null = padrão da casa. `checkin_pelo_medium` (AM-08) fica
    # em sincronia (modo app/qr) por compatibilidade, mas a regra lê só o modo efetivo.
    presenca_modo: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    elegiveis: Mapped[str] = mapped_column(String(20), nullable=False, default="todos")
    convocacao_padrao: Mapped[str] = mapped_column(String(20), nullable=False, default="todos_elegiveis")
    modo_escala: Mapped[str] = mapped_column(String(20), nullable=False, default="nenhuma")
    hora_padrao: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    duracao_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    visibilidade_padrao: Mapped[str] = mapped_column(String(20), nullable=False, default="corrente")
    is_sistema: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    arquivado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    @property
    def is_gira(self) -> bool:
        return self.natureza == NATUREZA_GIRA

    def __repr__(self) -> str:
        return f"<AtividadeTipo(id={self.id}, nome={self.nome!r}, natureza={self.natureza})>"


class AtividadeTipoGrupo(Base):
    __tablename__ = "atividade_tipo_grupos"
    __table_args__ = (
        Index("ix_atividade_tipo_grupos_tenant_id", "tenant_id"),
        Index("ix_atividade_tipo_grupos_grupo_id", "grupo_id"),
    )

    tipo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("atividade_tipos.id", ondelete="CASCADE"), primary_key=True
    )
    grupo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("corrente_grupos.id", ondelete="CASCADE"), primary_key=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )

    def __repr__(self) -> str:
        return f"<AtividadeTipoGrupo(tipo_id={self.tipo_id}, grupo_id={self.grupo_id})>"


class FuncaoCorrente(Base):
    __tablename__ = "funcoes_corrente"
    __table_args__ = (
        Index("ix_funcoes_corrente_tenant_id", "tenant_id"),
        Index(
            "uq_funcoes_corrente_tenant_nome_ativo",
            "tenant_id",
            text("lower(nome)"),
            unique=True,
            postgresql_where=text("arquivado_em IS NULL"),
            sqlite_where=text("arquivado_em IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(NOME_MAX), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(String(DESCRICAO_FUNCAO_MAX), nullable=True)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    arquivado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    def __repr__(self) -> str:
        return f"<FuncaoCorrente(id={self.id}, nome={self.nome!r})>"


class Atividade(Base):
    __tablename__ = "atividades"
    __table_args__ = (
        Index("ix_atividades_tenant_id", "tenant_id"),
        Index("ix_atividades_tenant_inicio", "tenant_id", "inicio"),
        Index("ix_atividades_tipo_id", "tipo_id"),
        Index(
            "uq_atividades_gira_id",
            "gira_id",
            unique=True,
            postgresql_where=text("gira_id IS NOT NULL"),
            sqlite_where=text("gira_id IS NOT NULL"),
        ),
        CheckConstraint(
            "gira_id IS NOT NULL OR (titulo IS NOT NULL AND inicio IS NOT NULL)",
            name="ck_atividades_gira_ou_titulo_inicio",
        ),
        CheckConstraint("fim IS NULL OR inicio IS NULL OR fim > inicio", name="ck_atividades_fim_depois_do_inicio"),
        CheckConstraint(_in("visibilidade", VISIBILIDADES), name="ck_atividades_visibilidade"),
        CheckConstraint(_in("origem", ORIGENS_ATIVIDADE), name="ck_atividades_origem"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    tipo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("atividade_tipos.id"), nullable=False
    )
    gira_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("giras.id", ondelete="CASCADE"), nullable=True
    )
    titulo: Mapped[Optional[str]] = mapped_column(String(TITULO_MAX), nullable=True)
    inicio: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    fim: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    local: Mapped[Optional[str]] = mapped_column(String(LOCAL_MAX), nullable=True)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    orientacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    visibilidade: Mapped[str] = mapped_column(String(20), nullable=False, default="corrente")
    origem: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    # Dia do planejador que gerou a atividade (AM-25). Sem FK de propósito: o vínculo com FK é
    # `escala_plano_dias.atividade_id` (FK nos dois sentidos seria um ciclo).
    escala_plano_dia_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    cancelada_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelamento_motivo: Mapped[Optional[str]] = mapped_column(String(MOTIVO_MAX), nullable=True)
    chamada_encerrada_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    chamada_encerrada_por: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<Atividade(id={self.id}, titulo={self.titulo!r}, gira_id={self.gira_id})>"


class AtividadeParticipacao(Base):
    """Médium numa atividade: convocação, resposta, justificativa e presença (§8.3 a §8.5).

    A situação mostrada na tela é derivada (`services/presenca.situacao`). O `tenant_id` é sempre
    o da atividade (que é o da gira âncora); o serviço confere os três.
    """

    __tablename__ = "atividade_participacoes"
    __table_args__ = (
        UniqueConstraint("atividade_id", "medium_id", name="uq_atividade_participacoes_atividade_medium"),
        Index("ix_atividade_participacoes_tenant_medium", "tenant_id", "medium_id"),
        Index("ix_atividade_participacoes_tenant_atividade", "tenant_id", "atividade_id"),
        CheckConstraint(_in("origem", ORIGENS_PARTICIPACAO), name="ck_atividade_participacoes_origem"),
        CheckConstraint(_in("resposta", RESPOSTAS), name="ck_atividade_participacoes_resposta"),
        CheckConstraint(_in("presenca", PRESENCAS), name="ck_atividade_participacoes_presenca"),
        CheckConstraint(
            "presenca_origem IS NULL OR " + _in("presenca_origem", PRESENCA_ORIGENS),
            name="ck_atividade_participacoes_presenca_origem",
        ),
        CheckConstraint(
            "justificativa_avaliacao IS NULL OR " + _in("justificativa_avaliacao", AVALIACOES_JUSTIFICATIVA),
            name="ck_atividade_participacoes_justificativa_avaliacao",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    atividade_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("atividades.id", ondelete="CASCADE"), nullable=False
    )
    medium_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mediuns.id", ondelete="CASCADE"), nullable=False
    )
    convocado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    origem: Mapped[str] = mapped_column(String(20), nullable=False, default="elegivel")
    grupo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("corrente_grupos.id", ondelete="SET NULL"), nullable=True
    )
    funcao_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("funcoes_corrente.id", ondelete="SET NULL"), nullable=True
    )
    resposta: Mapped[str] = mapped_column(String(20), nullable=False, default="sem_resposta")
    respondido_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Pode conter dado de saúde (§6.8): só para quem tem ESCALAS:view; nunca em e-mail, push,
    # auditoria ou exportação.
    justificativa: Mapped[Optional[str]] = mapped_column(String(JUSTIFICATIVA_MAX), nullable=True)
    justificativa_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    presenca: Mapped[str] = mapped_column(String(20), nullable=False, default="nao_registrada")
    presenca_origem: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    presenca_registrada_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    presenca_registrada_por: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Abono (AM-27): a direção aceita ou recusa a justificativa. Null = não avaliada (vale).
    justificativa_avaliacao: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    justificativa_avaliada_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    justificativa_avaliada_por: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    dispensado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Troca de escala (AM-27): a linha do substituto (situação "Substituído").
    substituida_por_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("atividade_participacoes.id", ondelete="SET NULL"), nullable=True
    )
    lembrete_enviado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    def __repr__(self) -> str:
        return f"<AtividadeParticipacao(atividade_id={self.atividade_id}, medium_id={self.medium_id})>"


class ParticipacaoTroca(Base):
    """Troca de escala (AM-27, migração 086): um médium pede que um colega vá no lugar dele.

    `participacao_id` é a linha de quem pede (escala de gira com função, faxina ou atividade "só
    escalados"); `substituto_id` null = "a direção escolhe" (ninguém aceitou aparecer para os
    colegas ou o médium preferiu assim). Aprovada: a linha original ganha `substituida_por_id` e
    nasce (ou volta) a do substituto (`nova_participacao_id`, origem `troca`, mesma função/grupo).
    Só uma troca aberta (pedido/aceito) por participação (`uq_participacao_trocas_aberta`).
    """

    __tablename__ = "participacao_trocas"
    __table_args__ = (
        Index("ix_participacao_trocas_tenant_status", "tenant_id", "status"),
        Index("ix_participacao_trocas_tenant_atividade", "tenant_id", "atividade_id"),
        Index("ix_participacao_trocas_solicitante", "solicitante_id"),
        Index("ix_participacao_trocas_substituto", "substituto_id"),
        Index(
            "uq_participacao_trocas_aberta",
            "participacao_id",
            unique=True,
            postgresql_where=text("status IN ('pedido', 'aceito')"),
            sqlite_where=text("status IN ('pedido', 'aceito')"),
        ),
        CheckConstraint(_in("status", STATUS_TROCA), name="ck_participacao_trocas_status"),
        CheckConstraint("fechada_por IS NULL OR " + _in("fechada_por", FECHADA_POR), name="ck_participacao_trocas_fechada_por"),
        CheckConstraint(
            "substituto_id IS NULL OR substituto_id <> solicitante_id", name="ck_participacao_trocas_outro_medium"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    atividade_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("atividades.id", ondelete="CASCADE"), nullable=False
    )
    participacao_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("atividade_participacoes.id", ondelete="CASCADE"), nullable=False
    )
    solicitante_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mediuns.id", ondelete="CASCADE"), nullable=False
    )
    substituto_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mediuns.id", ondelete="CASCADE"), nullable=True
    )
    # A direção escolheu o substituto (pedido "a direção escolhe"): o nome dele só aparece para
    # quem pediu se ele aceitou mostrar o primeiro nome aos colegas (D-07).
    indicado_pela_direcao: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=TROCA_PEDIDO)
    # Recado curto de quem pede (texto simples). Não é motivo de saúde: a tela pede só um recado.
    recado: Mapped[Optional[str]] = mapped_column(String(RECADO_MAX), nullable=True)
    respondido_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    fechada_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    fechada_por: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Usuário do painel que aprovou, recusou ou cancelou.
    decidido_por: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    nova_participacao_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("atividade_participacoes.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    @property
    def aberta(self) -> bool:
        return self.status in STATUS_TROCA_ABERTOS

    def __repr__(self) -> str:
        return f"<ParticipacaoTroca(id={self.id}, status={self.status})>"


class EscalaPlano(Base):
    """Planejador do mês (AM-25, §8.7): um plano por tipo de atividade (modo "grupos por dia") e mês.

    `mes` é sempre o 1º dia do mês. `status`: `rascunho` (o médium não vê nada) ou `publicado`
    (já gerou as atividades; mexer depois deixa "mudanças por publicar" até publicar de novo).
    """

    __tablename__ = "escala_planos"
    __table_args__ = (
        UniqueConstraint("tenant_id", "tipo_id", "mes", name="uq_escala_planos_tenant_tipo_mes"),
        Index("ix_escala_planos_tenant_id", "tenant_id"),
        CheckConstraint(_in("status", STATUS_PLANO), name="ck_escala_planos_status"),
        # `ck_escala_planos_mes_dia_1` (EXTRACT(DAY FROM mes) = 1) só na migração 080: a sintaxe
        # não existe no SQLite dos testes de API (create_all).
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    tipo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("atividade_tipos.id", ondelete="CASCADE"), nullable=False
    )
    mes: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="rascunho")
    publicado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    publicado_por: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    def __repr__(self) -> str:
        return f"<EscalaPlano(id={self.id}, tipo_id={self.tipo_id}, mes={self.mes}, status={self.status})>"


class EscalaPlanoDia(Base):
    """Um grupo num dia do plano (um dia pode ter mais de um grupo), com o horário.

    `atividade_id`: a atividade gerada ao publicar (null = ainda não publicado). `removido`: o dia
    foi tirado do rascunho depois de publicado — a linha fica até a próxima publicação, que
    cancela (ou reaproveita, na troca de grupo) a atividade e então apaga a linha.
    """

    __tablename__ = "escala_plano_dias"
    __table_args__ = (
        UniqueConstraint("plano_id", "data", "grupo_id", name="uq_escala_plano_dias_plano_data_grupo"),
        Index("ix_escala_plano_dias_tenant_id", "tenant_id"),
        Index("ix_escala_plano_dias_atividade_id", "atividade_id"),
        CheckConstraint("hora_fim IS NULL OR hora_fim > hora_inicio", name="ck_escala_plano_dias_horario"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    plano_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("escala_planos.id", ondelete="CASCADE"), nullable=False
    )
    data: Mapped[date] = mapped_column(Date, nullable=False)
    grupo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("corrente_grupos.id", ondelete="CASCADE"), nullable=False
    )
    hora_inicio: Mapped[time] = mapped_column(Time, nullable=False)
    hora_fim: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    atividade_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("atividades.id", ondelete="SET NULL"), nullable=True
    )
    removido: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    def __repr__(self) -> str:
        return f"<EscalaPlanoDia(plano_id={self.plano_id}, data={self.data}, grupo_id={self.grupo_id})>"
