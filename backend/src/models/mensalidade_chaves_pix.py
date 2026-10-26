"""Chaves PIX por grupo da corrente (migração 100).

A casa pode receber a mensalidade em mais de uma conta: parte da corrente paga na conta PJ,
parte numa conta "alternativa". Cada chave extra fica aqui, ligada a uma conta bancária
(`contas_bancarias`) e aos grupos da corrente (`corrente_grupos`) que pagam nela.

- `mensalidade_chaves_pix`: a chave (mesmos campos e regras da chave do terreiro em
  `mensalidade_configs.pix_*`, normalizada por `services/pix_chave.py`), um `apelido` que a
  direção reconhece ("Conta Inter") e a `conta_bancaria_id` onde o dinheiro cai.
- `mensalidade_chave_pix_grupos`: quais grupos usam a chave. PK = `grupo_id`: um grupo tem no
  máximo uma chave.

Qual chave o médium vê (`services/mensalidade_chaves_pix.py`): a do grupo dele (grupo não
arquivado); sem grupo com chave, a do terreiro. Médium em dois grupos com chaves diferentes
fica com a chave cadastrada primeiro, e a tela de configuração aponta o conflito.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.tz import utc_now
from .base import Base

APELIDO_MAX = 60


class MensalidadeChavePix(Base):
    __tablename__ = "mensalidade_chaves_pix"
    __table_args__ = (
        Index("ix_mensalidade_chaves_pix_tenant_id", "tenant_id"),
        Index(
            "uq_mensalidade_chaves_pix_tenant_apelido",
            "tenant_id",
            text("lower(apelido)"),
            unique=True,
        ),
        CheckConstraint(
            "pix_tipo IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')",
            name="ck_mensalidade_chaves_pix_tipo",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    apelido: Mapped[str] = mapped_column(String(APELIDO_MAX), nullable=False)
    pix_tipo: Mapped[str] = mapped_column(String(10), nullable=False)
    pix_chave: Mapped[str] = mapped_column(String(77), nullable=False)
    pix_nome_recebedor: Mapped[str] = mapped_column(String(25), nullable=False)
    pix_cidade: Mapped[str] = mapped_column(String(15), nullable=False)
    pix_instrucoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Última troca da chave OU dos grupos (o médium desses grupos passou a ter outra chave):
    # a Área mostra "Chave alterada em dd/mm" e o lembrete `pix_alterado` sai por ela.
    pix_alterado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    conta_bancaria_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("contas_bancarias.id", ondelete="SET NULL", name="fk_mensalidade_chaves_pix_conta_bancaria"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    def __repr__(self) -> str:
        return f"<MensalidadeChavePix(id={self.id}, apelido={self.apelido!r})>"


class MensalidadeChavePixGrupo(Base):
    __tablename__ = "mensalidade_chave_pix_grupos"
    __table_args__ = (
        Index("ix_mensalidade_chave_pix_grupos_tenant_id", "tenant_id"),
        Index("ix_mensalidade_chave_pix_grupos_chave_id", "chave_id"),
    )

    grupo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("corrente_grupos.id", ondelete="CASCADE"), primary_key=True
    )
    chave_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mensalidade_chaves_pix.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )

    def __repr__(self) -> str:
        return f"<MensalidadeChavePixGrupo(grupo_id={self.grupo_id}, chave_id={self.chave_id})>"
