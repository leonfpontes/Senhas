"""SenhaControl model - atomic ticket emission control (T016)."""
from sqlalchemy import Column, ForeignKey, Integer, Index, UniqueConstraint, BigInteger, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from .base import SoftDeleteModel


class SenhaControl(SoftDeleteModel):
    """SenhaControl model - ensures atomic ticket emission (no race conditions).
    
    This model prevents race conditions when emitting senhas (tickets).
    It uses optimistic locking with a version column to ensure
    atomic incrementing of ticket numbers per gira.
    
    CRITICAL FOR CONCURRENCY: Multiple API instances can safely emit
    tickets concurrently without number collisions.
    """
    
    __tablename__ = "senha_controls"
    __table_args__ = (
        UniqueConstraint("tenant_id", "gira_id", "is_sponsor", name="uq_senha_control_tenant_gira_sponsor"),
        Index("ix_senha_controls_tenant_id", "tenant_id"),
        Index("ix_senha_controls_gira_id", "gira_id"),
    )
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    gira_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("giras.id", ondelete="CASCADE"), nullable=False)
    
    # Sponsor flag: True for sponsor ticket counters
    is_sponsor: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    
    # Atomic counter: last issued ticket number for this gira
    proximo_numero: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    
    # Optimistic locking: increment on every update
    version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # Total tickets emitted for this gira (informational)
    total_emitido: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="senha_controls")
    gira = relationship("Gira")
    
    def __repr__(self) -> str:
        return f"<SenhaControl(tenant_id={self.tenant_id}, gira_id={self.gira_id}, proximo_numero={self.proximo_numero})>"
