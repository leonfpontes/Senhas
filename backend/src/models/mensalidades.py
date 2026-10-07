"""Mensalidade models — monthly dues control for médiuns (feature `mensalidade_mediun`, Basic+ desde out/2026)."""
from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, BYTEA
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import TimestampedModel


class MensalidadeStatus(str, enum.Enum):
    PENDENTE = "PENDENTE"
    PAGO = "PAGO"
    ISENTO = "ISENTO"


class MensalidadeConfig(TimestampedModel):
    """Per-tenant configuration for mensalidade module (1:1 with tenant)."""

    __tablename__ = "mensalidade_configs"
    __table_args__ = (
        Index("ix_mensalidade_configs_tenant_id", "tenant_id"),
        CheckConstraint(
            "pix_tipo IS NULL OR pix_tipo IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')",
            name="ck_mensalidade_configs_pix_tipo",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    valor_mensal: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00")
    )
    dia_vencimento: Mapped[int] = mapped_column(nullable=False, default=10)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    email_relatorio_ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Mensalidade de associados (Premium)
    valor_mensal_associado: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00"), server_default="0.00"
    )
    dia_vencimento_associado: Mapped[int] = mapped_column(nullable=False, default=10, server_default="10")
    # Preferred time for scheduled report email (stored only — no auto-scheduler yet)
    relatorio_hora_envio: Mapped[Optional[datetime]] = mapped_column(Time, nullable=True)

    # Chave PIX da mensalidade (AM-10, migração 067). Trocar exige FINANCEIRO:edit +
    # senha + e-mail a todos os admins (PUT /admin/financeiro/config/pix). A chave fica
    # normalizada no formato do DICT (services/pix_chave.py) e vira o BR Code
    # estático em services/pix_brcode.py.
    pix_tipo: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    pix_chave: Mapped[Optional[str]] = mapped_column(String(77), nullable=True)
    pix_nome_recebedor: Mapped[Optional[str]] = mapped_column(String(25), nullable=True)
    pix_cidade: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    pix_instrucoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pix_alterado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    tenant = relationship("Tenant", backref="mensalidade_config")

    def __repr__(self) -> str:
        return f"<MensalidadeConfig(tenant_id={self.tenant_id}, valor={self.valor_mensal})>"


class MensalidadePagamento(TimestampedModel):
    """Individual mensalidade record per médium per month.

    Hard-delete only — soft-delete would violate the UNIQUE(mediun_id, mes_referencia)
    constraint when re-registering an already-deleted entry.
    """

    __tablename__ = "mensalidade_pagamentos"
    __table_args__ = (
        UniqueConstraint("mediun_id", "mes_referencia", name="uq_mensalidade_mediun_mes"),
        Index("ix_mensalidade_pagamentos_tenant_mes", "tenant_id", "mes_referencia"),
        Index("ix_mensalidade_pagamentos_mediun_id", "mediun_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    mediun_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mediuns.id", ondelete="CASCADE"),
        nullable=False,
    )
    mes_referencia: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[MensalidadeStatus] = mapped_column(
        SAEnum(MensalidadeStatus, name="mensalidade_status", create_type=False),
        nullable=False,
        default=MensalidadeStatus.PENDENTE,
    )
    data_pagamento: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Stored at registration time — NOT derived from config (prevents retroactive changes)
    valor_vigente: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    valor_pago: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    comprovante_data: Mapped[Optional[bytes]] = mapped_column(BYTEA, nullable=True)
    comprovante_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    comprovante_mime: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    observacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    registrado_por: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    mediun = relationship("Medium", backref="mensalidade_pagamentos")

    def __repr__(self) -> str:
        return (
            f"<MensalidadePagamento(mediun_id={self.mediun_id}, "
            f"mes={self.mes_referencia}, status={self.status})>"
        )
