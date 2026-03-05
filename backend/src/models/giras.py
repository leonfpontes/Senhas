"""Gira model - spiritual event (T013)."""
from sqlalchemy import Column, String, ForeignKey, Boolean, DateTime, Index, Text
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
    
    # Relationships
    tenant = relationship("Tenant", back_populates="giras")
    tickets = relationship("Ticket", back_populates="gira", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<Gira(id={self.id}, nome='{self.nome}', tenant_id={self.tenant_id})>"
