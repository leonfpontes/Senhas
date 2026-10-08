"""Estudos e documentos da casa (AM-21). Na tela é **"Estudos e documentos"** (painel) e
**"Estudos"** (Área do Médium); tabelas e API seguem `materiais`.

- `materiais_corrente`: o material que a casa libera para a corrente. Três tipos:
  - `link` — endereço http(s) (Google Drive, YouTube, site); `texto` vira uma descrição opcional;
  - `texto` — estudo escrito na própria tela (texto simples, quebras de linha preservadas, sem HTML);
  - `ponto` — ponto cantado: letra (`texto`) e, se houver, link do áudio/vídeo (`url`).
  **Não há upload de arquivo** neste card: o banco tem limite de 8 GB e as imagens já ficam em
  BYTEA. PDF entra como link do Drive; upload espera armazenamento de objetos.
  `categoria` é texto livre (sugestões na tela: Estudos, Pontos cantados, Fundamentos, Rezas,
  Avisos gerais), `publico` segue os avisos (`todos | atendimento | cambones | grupos`, texto com
  CHECK), `ordem` (a casa arruma a lista), `publicado` (rascunho não aparece na Área) e
  `arquivado_em` (excluir no painel arquiva; some da Área e da lista).
- `material_grupos`: para quais grupos da corrente (AM-23) vai um material com `publico = 'grupos'`.

Limites (medidos no teste): título 120, categoria 60, endereço 500 e texto 15 000 caracteres; até
300 materiais ativos por terreiro — no pior caso ~4,5 MB de texto por casa.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.tz import utc_now
from .base import Base


class MaterialTipo(str, enum.Enum):
    LINK = "link"
    TEXTO = "texto"
    PONTO = "ponto"


TIPOS = tuple(t.value for t in MaterialTipo)
TITULO_MAX = 120
CATEGORIA_MAX = 60
URL_MAX = 500
TEXTO_MAX = 15000
MATERIAIS_MAX = 300
CATEGORIA_PADRAO = "Estudos"
CATEGORIAS_SUGERIDAS = ("Estudos", "Pontos cantados", "Fundamentos", "Rezas", "Avisos gerais")

_CHECK_TIPO = "tipo IN (" + ", ".join(f"'{t}'" for t in TIPOS) + ")"


class MaterialCorrente(Base):
    __tablename__ = "materiais_corrente"
    __table_args__ = (
        Index("ix_materiais_corrente_tenant_id", "tenant_id"),
        Index("ix_materiais_corrente_tenant_ordem", "tenant_id", "ordem"),
        CheckConstraint(_CHECK_TIPO, name="ck_materiais_corrente_tipo"),
        CheckConstraint(
            "publico IN ('todos', 'atendimento', 'cambones', 'grupos')", name="ck_materiais_corrente_publico"
        ),
        # Defesa em profundidade: só http(s) no banco (a API já valida e recusa javascript: etc.).
        CheckConstraint("url IS NULL OR url ~* '^https?://'", name="ck_materiais_corrente_url"),
        CheckConstraint("tipo <> 'link' OR url IS NOT NULL", name="ck_materiais_corrente_link_url"),
        CheckConstraint("tipo = 'link' OR texto IS NOT NULL", name="ck_materiais_corrente_texto"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    titulo: Mapped[str] = mapped_column(String(TITULO_MAX), nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    url: Mapped[Optional[str]] = mapped_column(String(URL_MAX), nullable=True)
    texto: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    categoria: Mapped[str] = mapped_column(
        String(CATEGORIA_MAX), nullable=False, default=CATEGORIA_PADRAO, server_default=CATEGORIA_PADRAO
    )
    publico: Mapped[str] = mapped_column(String(20), nullable=False, default="todos", server_default="todos")
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    publicado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )
    arquivado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<MaterialCorrente(id={self.id}, titulo={self.titulo!r})>"


class MaterialGrupo(Base):
    __tablename__ = "material_grupos"
    __table_args__ = (
        Index("ix_material_grupos_tenant_id", "tenant_id"),
        Index("ix_material_grupos_grupo_id", "grupo_id"),
    )

    material_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("materiais_corrente.id", ondelete="CASCADE"), primary_key=True
    )
    grupo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("corrente_grupos.id", ondelete="CASCADE"), primary_key=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )

    def __repr__(self) -> str:
        return f"<MaterialGrupo(material_id={self.material_id}, grupo_id={self.grupo_id})>"
