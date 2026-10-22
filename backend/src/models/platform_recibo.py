"""Recibos que a GiraHub emite para terreiros (migração 097).

Tabela da PLATAFORMA: só o super-admin emite e lê (`/api/v1/platform/recibos`). Uso típico:
terreiro bonificado que paga um valor avulso e precisa de recibo.

- `numero`/`ano`: sequência por ano (recibo nº 0001/2026), única por ano. A próxima é calculada
  sob `pg_advisory_xact_lock` em `api/v1/platform/recibos.py`.
- Dados do emissor e o nome do terreiro são gravados no recibo (snapshot): a 2ª via sai igual à
  1ª mesmo que a configuração ou o nome do terreiro mudem.
- `tenant_id` com `ON DELETE SET NULL`: recibo é registro financeiro, sobrevive à exclusão
  definitiva do terreiro (fica com `tenant_nome`).
- Recibo não se apaga: cancela (`cancelado_em` + motivo) e o PDF sai com a marca CANCELADO.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.tz import utc_now
from .base import Base

FORMAS_PAGAMENTO = ("pix", "transferencia", "dinheiro", "cartao", "boleto", "outro")
FORMA_LABELS = {
    "pix": "Pix",
    "transferencia": "transferência bancária",
    "dinheiro": "dinheiro",
    "cartao": "cartão",
    "boleto": "boleto",
    "outro": "outro meio",
}

PAGADOR_MAX = 160
DOCUMENTO_MAX = 20
REFERENTE_MAX = 300
MOTIVO_MAX = 300


class PlatformRecibo(Base):
    __tablename__ = "platform_recibos"
    __table_args__ = (
        UniqueConstraint("ano", "numero", name="uq_platform_recibos_ano_numero"),
        Index("ix_platform_recibos_tenant_created", "tenant_id", "created_at"),
        CheckConstraint("valor > 0", name="ck_platform_recibos_valor_positivo"),
        CheckConstraint(
            "forma_pagamento IS NULL OR forma_pagamento IN ("
            + ", ".join(f"'{f}'" for f in FORMAS_PAGAMENTO)
            + ")",
            name="ck_platform_recibos_forma",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ano: Mapped[int] = mapped_column(Integer, nullable=False)
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True
    )
    tenant_nome: Mapped[str] = mapped_column(String(255), nullable=False)
    pagador_nome: Mapped[str] = mapped_column(String(PAGADOR_MAX), nullable=False)
    pagador_documento: Mapped[Optional[str]] = mapped_column(String(DOCUMENTO_MAX), nullable=True)
    valor: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    referente: Mapped[str] = mapped_column(String(REFERENTE_MAX), nullable=False)
    forma_pagamento: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    data_pagamento: Mapped[date] = mapped_column(Date, nullable=False)
    emissor_nome: Mapped[str] = mapped_column(String(160), nullable=False)
    emissor_empresa: Mapped[str] = mapped_column(String(200), nullable=False)
    emissor_cnpj: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    emissor_cidade: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    emitido_por: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    cancelado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    motivo_cancelamento: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False
    )

    @property
    def numero_formatado(self) -> str:
        return f"{self.numero:04d}/{self.ano}"

    def __repr__(self) -> str:
        return f"<PlatformRecibo({self.numero_formatado}, tenant={self.tenant_id})>"
