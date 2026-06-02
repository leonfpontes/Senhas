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
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import SoftDeleteModel


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

    def __repr__(self) -> str:
        return (
            f"<CursoParticipante(id={self.id}, nome='{self.nome}', "
            f"curso_id={self.curso_id}, tenant_id={self.tenant_id})>"
        )