from __future__ import annotations

from datetime import datetime, date
from decimal import Decimal
import uuid
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Index,
    UniqueConstraint,
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import UUID, BYTEA
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import SoftDeleteModel, TimestampedModel
from .mensalidades import MensalidadeStatus


class CursoPresencial(SoftDeleteModel):
    
    __tablename__ = "cursos_presenciais"
    __table_args__ = (
        Index("ix_cursos_presenciais_tenant_id", "tenant_id"),
        Index("ix_cursos_presenciais_data_inicio", "data_inicio"),
        Index("ix_cursos_presenciais_is_active", "is_active"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    ementa: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    data_inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    data_fim: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    max_participantes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    valor_mensalidade_padrao: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    local: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    gerar_mensalidade: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    participants: Mapped[list["CursoParticipante"]] = relationship(
        "CursoParticipante", back_populates="curso", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return (
            f"<CursoPresencial(id={self.id}, titulo='{self.titulo}', "
            f"tenant_id={self.tenant_id})>"
        )


class CursoParticipante(SoftDeleteModel):

    __tablename__ = "curso_participantes"
    __table_args__ = (
        Index("ix_curso_participantes_tenant_id", "tenant_id"),
        Index("ix_curso_participantes_curso_id", "curso_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    curso_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cursos_presenciais.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    data_nascimento: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    celular: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    valor_mensalidade: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    pago: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    valor_pago: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    data_pagamento: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    curso: Mapped["CursoPresencial"] = relationship(
        "CursoPresencial", back_populates="participants"
    )
    pagamentos: Mapped[list["CursoParticipantePagamento"]] = relationship(
        "CursoParticipantePagamento", back_populates="participante", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return (
            f"<CursoParticipante(id={self.id}, nome='{self.nome}', "
            f"curso_id={self.curso_id}, tenant_id={self.tenant_id})>"
        )


class CursoParticipantePagamento(TimestampedModel):
    """Registro de pagamento de mensalidade individual por aluno por mês."""

    __tablename__ = "curso_participante_pagamentos"
    __table_args__ = (
        UniqueConstraint("participante_id", "mes_referencia", name="uq_curso_participante_mes"),
        Index("ix_curso_participante_pagamentos_tenant_mes", "tenant_id", "mes_referencia"),
        Index("ix_curso_participante_pagamentos_participante_id", "participante_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    participante_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("curso_participantes.id", ondelete="CASCADE"),
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

    participante = relationship("CursoParticipante", back_populates="pagamentos")

    def __repr__(self) -> str:
        return (
            f"<CursoParticipantePagamento(participante_id={self.participante_id}, "
            f"mes={self.mes_referencia}, status={self.status})>"
        )