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

Colunas "enum" são texto com CHECK e valores minúsculos (como `comunicados.publico`): crescem
sem `ALTER TYPE`. As participações (`atividade_participacoes`, AM-17) e o planejador da faxina
(`escala_planos`/`escala_plano_dias`, AM-25) chegam nos próximos cards; `escala_plano_dia_id`
já existe aqui, sem FK, e ganha a FK com a tabela do AM-25.
"""
from __future__ import annotations

import uuid
from datetime import datetime, time
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
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
    # FK para escala_plano_dias chega com a tabela (AM-25).
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
