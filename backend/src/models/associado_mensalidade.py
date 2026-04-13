"""AssociadoMensalidadePagamento model — monthly dues for associados (PRO+ feature)."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, BYTEA
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import TimestampedModel
from .mensalidades import MensalidadeStatus


class AssociadoMensalidadePagamento(TimestampedModel):
    """Individual mensalidade record per associado per month.

    Hard-delete only — soft-delete would violate the UNIQUE(associado_id, mes_referencia)
    constraint when re-registering an already-deleted entry.

    Multi-tenant isolation: all queries must filter by tenant_id.
    Before insert, associado.tenant_id must equal the caller's tenant_id.
    """

    __tablename__ = "associado_mensalidade_pagamentos"
    __table_args__ = (
        UniqueConstraint("associado_id", "mes_referencia", name="uq_assoc_mensalidade_assoc_mes"),
        Index("ix_assoc_mensalidade_pagamentos_tenant_mes", "tenant_id", "mes_referencia"),
        Index("ix_assoc_mensalidade_pagamentos_associado_id", "associado_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    associado_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("associados.id", ondelete="CASCADE"),
        nullable=False,
    )
    mes_referencia: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[MensalidadeStatus] = mapped_column(
        SAEnum(MensalidadeStatus, name="mensalidade_status"),
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

    associado = relationship("Associado", backref="mensalidade_pagamentos")

    def __repr__(self) -> str:
        return (
            f"<AssociadoMensalidadePagamento(associado_id={self.associado_id}, "
            f"mes={self.mes_referencia}, status={self.status})>"
        )
