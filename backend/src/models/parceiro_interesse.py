"""Pedidos de interesse no Programa de Parceiros GiraHub (C-06, migração 086).

Tabela da PLATAFORMA, não do terreiro: quem pede para ser parceiro (loja de artigos religiosos,
dirigente/médium, criador de conteúdo, federação...) ainda não tem conta — não há `tenant_id`.
Só o super-admin lê e mexe (`/api/v1/platform/parceiros`), e a página pública só grava.

- `ip_hash`: HMAC-SHA256 do IP (chave derivada do `SECRET_KEY`), nunca o IP em claro — serve só
  para reconhecer rajadas do mesmo endereço sem guardar dado pessoal a mais.
- `status`: novo → em_contato → aprovado/recusado; `cupom` e `observacoes` são preenchidos pela
  equipe na plataforma (o cupom é criado à mão no Stripe até o $-05).

Colunas "enum" são texto com CHECK, minúsculas (crescem sem `ALTER TYPE`).
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.tz import utc_now
from .base import Base

# ── Tipo de parceiro ────────────────────────────────────────────────────────
TIPO_LOJA = "loja"
TIPO_DIRIGENTE_MEDIUM = "dirigente_medium"
TIPO_CRIADOR_CONTEUDO = "criador_conteudo"
TIPO_FEDERACAO = "federacao"
TIPO_OUTRO = "outro"
TIPOS_PARCEIRO = (TIPO_LOJA, TIPO_DIRIGENTE_MEDIUM, TIPO_CRIADOR_CONTEUDO, TIPO_FEDERACAO, TIPO_OUTRO)

TIPO_LABELS = {
    TIPO_LOJA: "Loja de artigos religiosos",
    TIPO_DIRIGENTE_MEDIUM: "Dirigente ou médium",
    TIPO_CRIADOR_CONTEUDO: "Criador de conteúdo",
    TIPO_FEDERACAO: "Federação ou associação",
    TIPO_OUTRO: "Outro",
}

# ── Status do pedido (andamento na plataforma) ──────────────────────────────
STATUS_NOVO = "novo"
STATUS_EM_CONTATO = "em_contato"
STATUS_APROVADO = "aprovado"
STATUS_RECUSADO = "recusado"
STATUS_PARCEIRO = (STATUS_NOVO, STATUS_EM_CONTATO, STATUS_APROVADO, STATUS_RECUSADO)

UFS = (
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
    "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
)

NOME_MAX = 120
NEGOCIO_MAX = 160
CIDADE_MAX = 100
WHATSAPP_MAX = 20
EMAIL_MAX = 255
COMO_DIVULGAR_MAX = 500
CUPOM_MAX = 40
OBSERVACOES_MAX = 2000


def _in(coluna: str, valores: tuple[str, ...]) -> str:
    return f"{coluna} IN (" + ", ".join(f"'{v}'" for v in valores) + ")"


class ParceiroInteresse(Base):
    __tablename__ = "parceiro_interesses"
    __table_args__ = (
        Index("ix_parceiro_interesses_status_created", "status", "created_at"),
        Index("ix_parceiro_interesses_email", "email"),
        CheckConstraint(_in("tipo", TIPOS_PARCEIRO), name="ck_parceiro_interesses_tipo"),
        CheckConstraint(_in("status", STATUS_PARCEIRO), name="ck_parceiro_interesses_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome: Mapped[str] = mapped_column(String(NOME_MAX), nullable=False)
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)
    nome_negocio: Mapped[Optional[str]] = mapped_column(String(NEGOCIO_MAX), nullable=True)
    cidade: Mapped[str] = mapped_column(String(CIDADE_MAX), nullable=False)
    uf: Mapped[str] = mapped_column(String(2), nullable=False)
    whatsapp: Mapped[str] = mapped_column(String(WHATSAPP_MAX), nullable=False)
    email: Mapped[str] = mapped_column(String(EMAIL_MAX), nullable=False)
    como_divulgar: Mapped[str] = mapped_column(Text, nullable=False)
    aceite_regulamento_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ip_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=STATUS_NOVO, server_default=text(f"'{STATUS_NOVO}'")
    )
    cupom: Mapped[Optional[str]] = mapped_column(String(CUPOM_MAX), nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<ParceiroInteresse(id={self.id}, status={self.status})>"
