"""Consulente model - person requesting a ticket (T014)."""
from sqlalchemy import Column, String, ForeignKey, Index, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid

from .base import SoftDeleteModel


class Consulente(SoftDeleteModel):
    """Consulente model - person requesting a senha (ticket).
    
    A Consulente is an individual who visits a Terreiro and receives a senha
    for spiritual consultation.
    """
    
    __tablename__ = "consulentes"
    __table_args__ = (
        Index("ix_consulentes_tenant_id", "tenant_id"),
        Index("ix_consulentes_email", "email"),
        Index("ix_consulentes_telefone", "telefone"),
        Index("ix_consulentes_email_normalized", "email_normalized"),
        # Unicidade de e-mail por tenant só entre consulentes ativos (migração 052).
        # sqlite_where espelha o predicado para os testes que compilam em SQLite.
        Index(
            "uq_consulentes_tenant_email_active",
            "tenant_id",
            "email_normalized",
            unique=True,
            postgresql_where=text("email_normalized IS NOT NULL AND deleted_at IS NULL"),
            sqlite_where=text("email_normalized IS NOT NULL AND deleted_at IS NULL"),
        ),
    )
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telefone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email_normalized: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone_normalized: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cpf: Mapped[str | None] = mapped_column(String(11), nullable=True)  # Without masking for uniqueness
    endereco: Mapped[str | None] = mapped_column(Text, nullable=True)
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="consulentes")
    tickets = relationship("Ticket", back_populates="consulente", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<Consulente(id={self.id}, nome='{self.nome}', tenant_id={self.tenant_id})>"
