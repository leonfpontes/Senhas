"""Grupos da corrente (AM-23): G1, G2, "Ogãs", "Desenvolvimento"...

Um conceito só para o público de avisos (`comunicado_grupos`) e, nos próximos cards, para a
escala de faxina, a escala de gira e a elegibilidade dos tipos de atividade (AM-08/AM-25).

- `corrente_grupos`: `nome` (até 60), `cor` (paleta fechada `CORES_GRUPO`, contraste AA com
  texto branco — o espelho com o hex fica em `frontend/src/constants/correnteGrupos.ts`),
  `descricao` e `arquivado_em` (arquivar tira o grupo das telas e do público dos avisos; os
  membros ficam gravados). Nome único por terreiro sem diferenciar maiúsculas, só entre os
  não arquivados (`uq_corrente_grupos_tenant_nome_ativo`).
- `corrente_grupo_membros`: quem está no grupo e desde quando. PK (`grupo_id`, `medium_id`).
  Só médium ativo do terreiro entra; inativar ou excluir o médium tira ele de todos os grupos.
- `comunicado_grupos`: para quais grupos vai um aviso com `publico = 'grupos'`.

O médium vê só o nome (e a cor) dos próprios grupos, nunca quem mais está neles (D-07).
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.tz import utc_now
from .base import Base

# Paleta fechada (chaves). Ordem = ordem de sugestão na tela. Hex e teste de contraste no front.
CORES_GRUPO = ("ambar", "petroleo", "violeta", "azul", "verde", "vinho", "terra", "grafite")
COR_PADRAO = CORES_GRUPO[0]
NOME_MAX = 60
DESCRICAO_MAX = 300

_CHECK_COR = "cor IN (" + ", ".join(f"'{c}'" for c in CORES_GRUPO) + ")"


class CorrenteGrupo(Base):
    __tablename__ = "corrente_grupos"
    __table_args__ = (
        Index("ix_corrente_grupos_tenant_id", "tenant_id"),
        Index(
            "uq_corrente_grupos_tenant_nome_ativo",
            "tenant_id",
            text("lower(nome)"),
            unique=True,
            postgresql_where=text("arquivado_em IS NULL"),
            sqlite_where=text("arquivado_em IS NULL"),
        ),
        CheckConstraint(_CHECK_COR, name="ck_corrente_grupos_cor"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(NOME_MAX), nullable=False)
    cor: Mapped[str] = mapped_column(String(20), nullable=False, default=COR_PADRAO, server_default=COR_PADRAO)
    descricao: Mapped[Optional[str]] = mapped_column(String(DESCRICAO_MAX), nullable=True)
    arquivado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    def __repr__(self) -> str:
        return f"<CorrenteGrupo(id={self.id}, nome={self.nome!r})>"


class CorrenteGrupoMembro(Base):
    __tablename__ = "corrente_grupo_membros"
    __table_args__ = (
        Index("ix_corrente_grupo_membros_tenant_id", "tenant_id"),
        Index("ix_corrente_grupo_membros_medium_id", "medium_id"),
    )

    grupo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("corrente_grupos.id", ondelete="CASCADE"), primary_key=True
    )
    medium_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mediuns.id", ondelete="CASCADE"), primary_key=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    desde: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self) -> str:
        return f"<CorrenteGrupoMembro(grupo_id={self.grupo_id}, medium_id={self.medium_id})>"


class ComunicadoGrupo(Base):
    __tablename__ = "comunicado_grupos"
    __table_args__ = (
        Index("ix_comunicado_grupos_tenant_id", "tenant_id"),
        Index("ix_comunicado_grupos_grupo_id", "grupo_id"),
    )

    comunicado_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("comunicados.id", ondelete="CASCADE"), primary_key=True
    )
    grupo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("corrente_grupos.id", ondelete="CASCADE"), primary_key=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )

    def __repr__(self) -> str:
        return f"<ComunicadoGrupo(comunicado_id={self.comunicado_id}, grupo_id={self.grupo_id})>"
