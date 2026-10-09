"""Pagamentos do plano por PIX mês a mês ($-04, migração 090).

A conta Stripe BR só aceita Pix como pagamento avulso (Checkout `mode=payment`), então o
"PIX mês a mês" não é uma assinatura da Stripe: cada Checkout pago libera 30 dias do plano
(`services/assinatura_pix.py`). Esta tabela guarda cada pagamento confirmado:

- idempotência: `checkout_session_id` é único — o mesmo pagamento nunca libera dois meses,
  mesmo que chegue `checkout.session.completed` (pago) e `async_payment_succeeded`;
- histórico do painel ("PIX — mês pago até DD/MM") e referência para o suporte;
- `aplicado=False`: pagamento confirmado que NÃO virou mês de plano (ex.: o terreiro assinou
  com cartão/boleto entre abrir o PIX e pagar) — fica registrado para o suporte devolver.

O estado vigente fica na própria `subscriptions`: `collection_method="pix_mensal"` e
`current_period_end` = pago até.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.tz import utc_now
from .base import Base


class AssinaturaPixPagamento(Base):
    __tablename__ = "assinatura_pix_pagamentos"
    __table_args__ = (Index("ix_assinatura_pix_pagamentos_tenant_id", "tenant_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    checkout_session_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    payment_intent_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    plan: Mapped[str] = mapped_column(String(20), nullable=False)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    aplicado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    period_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    period_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
