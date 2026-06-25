"""Models for Contas a Pagar / Contas a Receber."""
from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Date,
    Enum as SQLEnum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import SoftDeleteModel


class TipoContaFinanceira(str, enum.Enum):
    PAGAR = "pagar"
    RECEBER = "receber"


class StatusContaFinanceira(str, enum.Enum):
    PENDENTE = "pendente"
    PAGO = "pago"
    VENCIDO = "vencido"
    CANCELADO = "cancelado"


class RecorrenciaConta(str, enum.Enum):
    UNICA = "unica"
    MENSAL = "mensal"
    ANUAL = "anual"


class CategoriaFinanceira(SoftDeleteModel):
    """User-defined categories for financial entries (per tenant)."""

    __tablename__ = "categorias_financeiras"
    __table_args__ = (Index("ix_categorias_financeiras_tenant_id", "tenant_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    tipo: Mapped[str] = mapped_column(String(10), nullable=False, default="ambos")  # pagar, receber, ambos
    cor: Mapped[str | None] = mapped_column(String(7), nullable=True)
    ativo: Mapped[bool] = mapped_column(default=True, nullable=False, server_default="true")

    tenant = relationship("Tenant", foreign_keys=[tenant_id])

    def __repr__(self) -> str:
        return f"<CategoriaFinanceira(id={self.id}, nome='{self.nome}')>"


class ContaBancaria(SoftDeleteModel):
    """Bank accounts / cash accounts for recording payment destination."""

    __tablename__ = "contas_bancarias"
    __table_args__ = (Index("ix_contas_bancarias_tenant_id", "tenant_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    banco: Mapped[str | None] = mapped_column(String(100), nullable=True)
    saldo_inicial: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0, server_default="0")
    ativo: Mapped[bool] = mapped_column(default=True, nullable=False, server_default="true")

    tenant = relationship("Tenant", foreign_keys=[tenant_id])

    def __repr__(self) -> str:
        return f"<ContaBancaria(id={self.id}, nome='{self.nome}')>"


class ContaFinanceira(SoftDeleteModel):
    """A single accounts-payable or accounts-receivable entry."""

    __tablename__ = "contas_financeiras"
    __table_args__ = (
        Index("ix_contas_financeiras_tenant_id", "tenant_id"),
        Index("ix_contas_financeiras_tipo", "tipo"),
        Index("ix_contas_financeiras_status", "status"),
        Index("ix_contas_financeiras_data_vencimento", "data_vencimento"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    descricao: Mapped[str] = mapped_column(String(255), nullable=False)
    valor: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    data_vencimento: Mapped[str] = mapped_column(Date, nullable=False)
    data_competencia: Mapped[str | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pendente", server_default="pendente"
    )
    data_pagamento: Mapped[str | None] = mapped_column(Date, nullable=True)
    valor_pago: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    categoria_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categorias_financeiras.id", ondelete="SET NULL"), nullable=True
    )
    conta_bancaria_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contas_bancarias.id", ondelete="SET NULL"), nullable=True
    )
    recorrencia: Mapped[str | None] = mapped_column(String(20), nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    comprovante_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    external_ref: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    criado_por: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    tenant = relationship("Tenant", foreign_keys=[tenant_id])
    categoria = relationship("CategoriaFinanceira", foreign_keys=[categoria_id])
    conta_bancaria = relationship("ContaBancaria", foreign_keys=[conta_bancaria_id])

    def __repr__(self) -> str:
        return f"<ContaFinanceira(id={self.id}, tipo='{self.tipo}', descricao='{self.descricao}')>"
