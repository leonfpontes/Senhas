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
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID, BYTEA
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampedModel
from ..core.tz import utc_now


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

    # Chave PIX da mensalidade (AM-10, migração 068). Trocar exige FINANCEIRO:edit +
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
        # Fila "Comprovantes para conferir" do painel (AM-12, migração 072).
        CheckConstraint(
            "origem IS NULL OR origem IN ('direcao', 'gateway')",
            name="ck_mensalidade_pagamentos_origem",
        ),
        Index(
            "ix_mensalidade_pagamentos_conferir",
            "tenant_id",
            "comprovante_enviado_em",
            postgresql_where=text("comprovante_enviado_em IS NOT NULL AND status = 'PENDENTE'"),
        ),
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
    # Comprovante enviado pelo próprio médium na Área (AM-12, migração 072). O status
    # continua PENDENTE até a casa confirmar; "em conferência"/"não confirmada" saem
    # destas colunas (services/medium_inicio.situacao_mensalidade). Comprovante anexado
    # pelo painel não preenche `comprovante_enviado_em`.
    comprovante_enviado_em: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    comprovante_enviado_por: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            ondelete="SET NULL",
            name="fk_mensalidade_pagamentos_comprovante_enviado_por",
        ),
        nullable=True,
    )
    # A casa não confirmou o comprovante: o médium vê o motivo e pode reenviar
    # (o reenvio limpa os dois campos).
    recusa_motivo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recusado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Quem deu a baixa (migração 091, F-02/AM-22): `gateway` = pago pela cobrança dinâmica (PIX/
    # boleto na conta da casa, webhook do provedor); `direcao` = registrado/confirmado no painel.
    # NULL em registros antigos (antes da 091) — a tela trata como "pela direção".
    origem: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    mediun = relationship("Medium", backref="mensalidade_pagamentos")

    def __repr__(self) -> str:
        return (
            f"<MensalidadePagamento(mediun_id={self.mediun_id}, "
            f"mes={self.mes_referencia}, status={self.status})>"
        )


# Pagamento parcial (migração 092): cada comprovante de um mês vira uma linha. Os campos de
# comprovante único de `mensalidade_pagamentos` ficaram só para leitura de dados antigos.
COMPROVANTE_ORIGENS = ("medium", "painel")
COMPROVANTE_EM_CONFERENCIA = "em_conferencia"
COMPROVANTE_CONFERIDO = "conferido"
COMPROVANTE_NAO_CONFIRMADO = "nao_confirmado"
COMPROVANTE_STATUS = (COMPROVANTE_EM_CONFERENCIA, COMPROVANTE_CONFERIDO, COMPROVANTE_NAO_CONFIRMADO)


def _in(coluna: str, valores) -> str:
    return f"{coluna} IN (" + ", ".join(f"'{v}'" for v in valores) + ")"


class MensalidadeComprovante(Base):
    """Um comprovante de mensalidade (pagamento parcial, migração 092).

    - `origem`: `medium` (enviado pela Área) ou `painel` (anexado no registro manual).
    - `valor_informado`: quanto o médium disse ter pago (opcional).
    - `status`: `em_conferencia` → a casa confere (`conferido` + `valor_conferido`, o que entrou
      de fato) ou não confirma (`nao_confirmado` + `motivo`, que o médium vê).
    - Recebido no mês = soma de `valor_conferido` dos conferidos + cobranças automáticas pagas
      (`services/mensalidade_parcial.py`). Anexo do painel fica `conferido` SEM valor: no
      registro manual o `valor_pago` do mês é o total.
    """

    __tablename__ = "mensalidade_comprovantes"
    __table_args__ = (
        CheckConstraint(_in("origem", COMPROVANTE_ORIGENS), name="ck_mensalidade_comprovantes_origem"),
        CheckConstraint(_in("status", COMPROVANTE_STATUS), name="ck_mensalidade_comprovantes_status"),
        CheckConstraint(
            "valor_informado IS NULL OR valor_informado > 0", name="ck_mensalidade_comprovantes_valor_informado"
        ),
        CheckConstraint(
            "valor_conferido IS NULL OR valor_conferido > 0", name="ck_mensalidade_comprovantes_valor_conferido"
        ),
        Index("ix_mensalidade_comprovantes_pagamento", "pagamento_id"),
        Index("ix_mensalidade_comprovantes_tenant_mediun", "tenant_id", "mediun_id"),
        Index(
            "ix_mensalidade_comprovantes_conferir",
            "tenant_id",
            "enviado_em",
            postgresql_where=text("status = 'em_conferencia'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    pagamento_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mensalidade_pagamentos.id", ondelete="CASCADE"), nullable=False
    )
    mediun_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mediuns.id", ondelete="CASCADE"), nullable=False
    )
    origem: Mapped[str] = mapped_column(String(10), nullable=False, default="medium", server_default="medium")
    enviado_por: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL", name="fk_mensalidade_comprovantes_enviado_por"),
        nullable=True,
    )
    enviado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    arquivo_data: Mapped[bytes] = mapped_column(BYTEA, nullable=False)
    arquivo_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    arquivo_mime: Mapped[str] = mapped_column(String(50), nullable=False)
    arquivo_tamanho: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    valor_informado: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=COMPROVANTE_EM_CONFERENCIA, server_default=COMPROVANTE_EM_CONFERENCIA
    )
    valor_conferido: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    conferido_por: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL", name="fk_mensalidade_comprovantes_conferido_por"),
        nullable=True,
    )
    conferido_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    motivo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    def __repr__(self) -> str:
        return f"<MensalidadeComprovante(pagamento_id={self.pagamento_id}, status={self.status})>"
