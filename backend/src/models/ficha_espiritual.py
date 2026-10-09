"""Ficha espiritual do médium (F-05, migração 089) e caminhada na Área (AM-19).

Dado religioso — sensível na LGPD (art. 11). Regras que valem para todo código que toca estas
tabelas:
- só sai pelo painel com `PermissionFeature.FICHA_ESPIRITUAL` (separada de `MEDIUNS`, sem acesso
  no grupo padrão) e pela Área do Médium para o PRÓPRIO médium (campos e marcos visíveis a ele);
- gravar exige o consentimento explícito do médium (`mediuns.consentimento_dado_religioso_*`),
  nunca inferido; revogado, os valores ficam inacessíveis até a direção apagá-los;
- valores nunca vão para auditoria (só ids), exportação, CSV ou e-mail.

- `ficha_campos`: campos que a casa configura (chave, rótulo, tipo, tradição, ordem, visível ao
  médium, médium pode sugerir, arquivado). Modelos de Umbanda e Candomblé em
  `services/ficha_espiritual.MODELOS`.
- `ficha_valores`: o valor de um campo para um médium (texto; data em ISO; sim/não em "sim"/"nao").
- `medium_marcos`: linha do tempo da caminhada (entrada, batismo, obrigação, coroação, outro).
- `ficha_sugestoes`: sugestão do médium para um campo; só entra na ficha quando a direção aceita.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Optional

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
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.tz import utc_now
from .base import Base

TIPO_TEXTO = "texto"
TIPO_DATA = "data"
TIPO_LISTA = "lista"
TIPO_SIM_NAO = "sim_nao"
TIPOS_CAMPO = (TIPO_TEXTO, TIPO_DATA, TIPO_LISTA, TIPO_SIM_NAO)

TRADICOES = ("umbanda", "candomble", "outra")

TIPOS_MARCO = ("entrada", "batismo", "obrigacao", "coroacao", "outro")

SUGESTAO_PENDENTE = "pendente"
SUGESTAO_ACEITA = "aceita"
SUGESTAO_RECUSADA = "recusada"
STATUS_SUGESTAO = (SUGESTAO_PENDENTE, SUGESTAO_ACEITA, SUGESTAO_RECUSADA)

CHAVE_MAX = 60
ROTULO_MAX = 80
VALOR_MAX = 500
OPCAO_MAX = 60
OPCOES_MAX = 30
MARCO_TITULO_MAX = 120
MARCO_OBSERVACAO_MAX = 300


def _in(coluna: str, valores: tuple[str, ...]) -> str:
    return f"{coluna} IN (" + ", ".join(f"'{v}'" for v in valores) + ")"


class FichaCampo(Base):
    __tablename__ = "ficha_campos"
    __table_args__ = (
        UniqueConstraint("tenant_id", "chave", name="uq_ficha_campos_tenant_chave"),
        Index("ix_ficha_campos_tenant_id", "tenant_id"),
        CheckConstraint(_in("tipo", TIPOS_CAMPO), name="ck_ficha_campos_tipo"),
        CheckConstraint(_in("tradicao", TRADICOES), name="ck_ficha_campos_tradicao"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    chave: Mapped[str] = mapped_column(String(CHAVE_MAX), nullable=False)
    rotulo: Mapped[str] = mapped_column(String(ROTULO_MAX), nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, default=TIPO_TEXTO, server_default=TIPO_TEXTO)
    opcoes: Mapped[Optional[list[Any]]] = mapped_column(JSONB, nullable=True)
    tradicao: Mapped[str] = mapped_column(String(20), nullable=False, default="outra", server_default="outra")
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    visivel_ao_medium: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    medium_pode_sugerir: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    arquivado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    def __repr__(self) -> str:
        return f"<FichaCampo(id={self.id}, chave={self.chave!r})>"


class FichaValor(Base):
    __tablename__ = "ficha_valores"
    __table_args__ = (
        UniqueConstraint("medium_id", "campo_id", name="uq_ficha_valores_medium_campo"),
        Index("ix_ficha_valores_tenant_id", "tenant_id"),
        Index("ix_ficha_valores_campo_id", "campo_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    medium_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mediuns.id", ondelete="CASCADE"), nullable=False
    )
    campo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ficha_campos.id", ondelete="CASCADE"), nullable=False
    )
    valor: Mapped[str] = mapped_column(Text, nullable=False)
    atualizado_por: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    def __repr__(self) -> str:  # sem o valor (dado sensível)
        return f"<FichaValor(id={self.id}, campo_id={self.campo_id})>"


class MediumMarco(Base):
    __tablename__ = "medium_marcos"
    __table_args__ = (
        Index("ix_medium_marcos_tenant_id", "tenant_id"),
        Index("ix_medium_marcos_medium_id", "medium_id"),
        CheckConstraint(_in("tipo", TIPOS_MARCO), name="ck_medium_marcos_tipo"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    medium_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mediuns.id", ondelete="CASCADE"), nullable=False
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    titulo: Mapped[str] = mapped_column(String(MARCO_TITULO_MAX), nullable=False)
    data: Mapped[date] = mapped_column(Date, nullable=False)
    observacao: Mapped[Optional[str]] = mapped_column(String(MARCO_OBSERVACAO_MAX), nullable=True)
    visivel_ao_medium: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    registrado_por: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    def __repr__(self) -> str:
        return f"<MediumMarco(id={self.id})>"


class FichaSugestao(Base):
    __tablename__ = "ficha_sugestoes"
    __table_args__ = (
        Index("ix_ficha_sugestoes_tenant_id", "tenant_id"),
        Index("ix_ficha_sugestoes_medium_id", "medium_id"),
        Index(
            "uq_ficha_sugestoes_pendente",
            "medium_id",
            "campo_id",
            unique=True,
            postgresql_where=text("status = 'pendente'"),
            sqlite_where=text("status = 'pendente'"),
        ),
        CheckConstraint(_in("status", STATUS_SUGESTAO), name="ck_ficha_sugestoes_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    medium_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mediuns.id", ondelete="CASCADE"), nullable=False
    )
    campo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ficha_campos.id", ondelete="CASCADE"), nullable=False
    )
    valor_sugerido: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SUGESTAO_PENDENTE, server_default=SUGESTAO_PENDENTE
    )
    decidido_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    decidido_por: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    def __repr__(self) -> str:
        return f"<FichaSugestao(id={self.id}, status={self.status})>"
