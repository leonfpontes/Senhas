"""Mensalidade com baixa automática (F-02/AM-22, migração 091).

- `MensalidadeGateway`: a conta de recebimentos que a casa conectou (uma por terreiro). O
  provedor é escolhido pela casa: **Stripe** (Stripe Connect, conta Express da casa — o GiraHub
  guarda só o id `acct_...`) ou **Mercado Pago** (OAuth; tokens cifrados com `core/secret_box`,
  colunas `mp_*_enc`, usadas a partir do PR do Mercado Pago). `status`: `pendente` (cadastro no
  provedor em andamento), `ativo`, `desconectado`. `pix_disponivel`/`boleto_disponivel` vêm do
  provedor (capacidades `pix_payments`/`boleto_payments` da conta conectada no Stripe).
- `MensalidadeCobranca`: cada cobrança dinâmica criada na conta da casa para um mês de um médium.
  `external_id` é o id no provedor (PaymentIntent `pi_...` no Stripe) — único por provedor;
  `conta_externa` é a conta da casa no provedor no momento da cobrança (o webhook confere as
  duas: evento de outra conta nunca dá baixa). Paga → o mês vira PAGO em
  `mensalidade_pagamentos` com `origem = 'gateway'` (services/mensalidade_gateway.py).

Sem dado pessoal além do necessário: nada de CPF, endereço ou e-mail do médium aqui (o CPF do
boleto vai direto ao provedor e não é gravado). `raw` guarda só status/ids do provedor.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base
from ..core.tz import utc_now

PROVEDORES = ("stripe", "mercadopago")
STATUS_GATEWAY = ("pendente", "ativo", "desconectado")
METODOS = ("pix", "boleto")
STATUS_COBRANCA = ("pendente", "paga", "expirada", "cancelada", "estornada")


def _in(coluna: str, valores) -> str:
    return f"{coluna} IN (" + ", ".join(f"'{v}'" for v in valores) + ")"


class MensalidadeGateway(Base):
    __tablename__ = "mensalidade_gateways"
    __table_args__ = (
        CheckConstraint(_in("provedor", PROVEDORES), name="ck_mensalidade_gateways_provedor"),
        CheckConstraint(_in("status", STATUS_GATEWAY), name="ck_mensalidade_gateways_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    provedor: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pendente", server_default="pendente")
    pix_disponivel: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    boleto_disponivel: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    # Cadastro enviado ao provedor (Stripe: `details_submitted`) e recebimentos liberados
    # (Stripe: `charges_enabled`).
    cadastro_completo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    recebimentos_ativos: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))

    # Stripe Connect: id da conta conectada (`acct_...`). Não é segredo. Fica guardado ao
    # desconectar (reconectar reaproveita a mesma conta da casa).
    stripe_account_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True)

    # Mercado Pago (OAuth) — tokens cifrados com core/secret_box (nunca em claro).
    mp_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    mp_access_token_enc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mp_refresh_token_enc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mp_token_expira_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    conectado_por: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    conectado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    desconectado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    def __repr__(self) -> str:
        return f"<MensalidadeGateway(tenant_id={self.tenant_id}, provedor={self.provedor}, status={self.status})>"


class MensalidadeCobranca(Base):
    __tablename__ = "mensalidade_cobrancas"
    __table_args__ = (
        CheckConstraint(_in("provedor", PROVEDORES), name="ck_mensalidade_cobrancas_provedor"),
        CheckConstraint(_in("metodo", METODOS), name="ck_mensalidade_cobrancas_metodo"),
        CheckConstraint(_in("status", STATUS_COBRANCA), name="ck_mensalidade_cobrancas_status"),
        UniqueConstraint("provedor", "external_id", name="uq_mensalidade_cobrancas_provedor_external"),
        Index("ix_mensalidade_cobrancas_tenant_mes", "tenant_id", "mes_referencia"),
        Index("ix_mensalidade_cobrancas_mediun_mes", "mediun_id", "mes_referencia"),
        # Uma cobrança em aberto por médium, mês e método (reaproveitada enquanto vale).
        Index(
            "uq_mensalidade_cobrancas_pendente",
            "mediun_id",
            "mes_referencia",
            "metodo",
            unique=True,
            postgresql_where=text("status = 'pendente'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    mediun_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mediuns.id", ondelete="CASCADE"), nullable=False
    )
    mes_referencia: Mapped[date] = mapped_column(Date, nullable=False)
    valor: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    provedor: Mapped[str] = mapped_column(String(20), nullable=False)
    conta_externa: Mapped[str] = mapped_column(String(255), nullable=False)
    external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    metodo: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pendente", server_default="pendente")
    copia_e_cola: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    boleto_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    boleto_linha_digitavel: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    expira_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    pago_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    valor_pago: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    criado_por: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Mínimo do provedor para diagnóstico (status externo, último evento) — sem dado pessoal.
    raw: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    def __repr__(self) -> str:
        return (
            f"<MensalidadeCobranca(mediun_id={self.mediun_id}, mes={self.mes_referencia}, "
            f"provedor={self.provedor}, status={self.status})>"
        )
