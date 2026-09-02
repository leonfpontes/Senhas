"""Gira model - spiritual event (T013)."""
from sqlalchemy import Column, String, ForeignKey, Boolean, DateTime, Index, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from .base import SoftDeleteModel


class Gira(SoftDeleteModel):
    """Gira model - represents a spiritual event/session.
    
    A Gira is a spiritual gathering in Terreiros where consultations happen.
    Senhas (tickets) are emitted for consultations during a Gira.
    """
    
    __tablename__ = "giras"
    __table_args__ = (
        Index("ix_giras_tenant_id", "tenant_id"),
        Index("ix_giras_data_inicio", "data_inicio"),
        Index("ix_giras_is_active", "is_active"),
    )
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    data_fim: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    local: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Texto livre opcional (investimento, itens de doação, avisos) incluído no
    # email de emissão de senha quando preenchido. Ver ticket_emission.py.
    recados: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Senha emission control fields
    max_tickets: Mapped[int | None] = mapped_column(Integer, nullable=True)
    release_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    release_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Sponsor senha emission control
    sponsor_max_tickets: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sponsor_release_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sponsor_release_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Waitlist: hours a promoted ticket has to confirm before the slot cascades
    # to the next person in line. Only relevant when tenant_config.enable_waitlist.
    waitlist_confirmation_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Agendamento por horário: quando True, o consulente escolhe um GiraTimeSlot
    # ao emitir a senha em vez de disputar a capacidade geral da gira. Só tem
    # efeito quando tenant_config.enable_time_slot_scheduling também está ligado.
    use_time_slots: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)

    # Acompanhantes: quando True, o titular pode emitir senhas extras para até
    # max_acompanhantes acompanhantes na mesma emissão. Cada acompanhante recebe
    # um número próprio da mesma sequência da gira (consome max_tickets).
    allow_acompanhantes: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    max_acompanhantes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Relationships
    tenant = relationship("Tenant", back_populates="giras")
    tickets = relationship("Ticket", back_populates="gira", cascade="all, delete-orphan")
    senha_controls = relationship("SenhaControl", back_populates="gira", cascade="all, delete-orphan")
    time_slots = relationship("GiraTimeSlot", back_populates="gira", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<Gira(id={self.id}, nome='{self.nome}', tenant_id={self.tenant_id})>"
