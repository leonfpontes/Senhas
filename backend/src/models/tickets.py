"""Ticket model - senha (password/ticket emitted) - CORE (T015)."""
from sqlalchemy import Column, String, ForeignKey, Integer, Index, Text, DateTime, Enum as SQLEnum, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
import enum

from .base import SoftDeleteModel


class TicketStatus(str, enum.Enum):
    """Ticket status enumeration."""
    
    EMITTED = "emitted"      # Newly emitted
    CALLED = "called"        # Consulente was called
    COMPLETED = "completed"  # Consultation finished
    CANCELLED = "cancelled"  # Cancelled before consultation
    NO_SHOW = "no_show"      # Consulente didn't show up


class Ticket(SoftDeleteModel):
    """Ticket model - CORE model representing an emitted senha.
    
    A Ticket (Senha) is the core entity of the system. It represents
    a password/number issued to a consulente for a consultation.
    
    MULIT-TENANT: Tickets are isolated by tenant_id.
    ATOMICITY: SenhaControl ensures atomic emission (no duplicates).
    AUDIT: All ticket operations are logged to audit_logs.
    """
    
    __tablename__ = "tickets"
    __table_args__ = (
        Index("ix_tickets_tenant_id", "tenant_id"),
        Index("ix_tickets_gira_id", "gira_id"),
        Index("ix_tickets_consulente_id", "consulente_id"),
        Index("ix_tickets_status", "status"),
        Index("ix_tickets_numero", "numero"),
        Index("ix_tickets_created_at", "created_at"),
    )
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    gira_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("giras.id", ondelete="CASCADE"), nullable=False)
    consulente_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("consulentes.id", ondelete="CASCADE"), nullable=False)
    emitido_por_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    numero: Mapped[int] = mapped_column(Integer, nullable=False)  # Sequential ticket number
    status: Mapped[TicketStatus] = mapped_column(
        SQLEnum(TicketStatus, values_callable=lambda e: [x.value for x in e]),
        default=TicketStatus.EMITTED, nullable=False,
    )
    chamado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finalizado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Sponsor flag
    is_sponsor: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    is_walk_in: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    
    # Door control fields (Visão da Porta)
    checkin_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    atendido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    medium_nome: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cambone_nome: Mapped[str | None] = mapped_column(String(255), nullable=True)
    atendimento_descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="tickets")
    gira = relationship("Gira", back_populates="tickets")
    consulente = relationship("Consulente", back_populates="tickets")
    emitido_por = relationship("User", foreign_keys=[emitido_por_id])
    
    def __repr__(self) -> str:
        return f"<Ticket(id={self.id}, numero={self.numero}, status={self.status.value}, tenant_id={self.tenant_id})>"
    
    @property
    def is_active(self) -> bool:
        """Check if ticket is still active (not completed or cancelled)."""
        return self.status in (TicketStatus.EMITTED, TicketStatus.CALLED)
