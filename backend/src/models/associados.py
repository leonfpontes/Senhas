"""Associado model - registered members eligible for associado tickets."""
from sqlalchemy import Boolean, String, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid

from .base import SoftDeleteModel


class Associado(SoftDeleteModel):
    """Associado (member) model.

    Stores the list of registered associados per tenant.  When the tenant
    config flag ``validate_associado_on_emit`` is true, only e-mails
    present in this table may issue associado tickets.
    """

    __tablename__ = "associados"
    __table_args__ = (
        UniqueConstraint("tenant_id", "email_normalized", name="uq_associados_tenant_email"),
        Index("ix_associados_tenant_id", "tenant_id"),
        Index("ix_associados_email_normalized", "email_normalized"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    email_normalized: Mapped[str] = mapped_column(String(255), nullable=False)
    telefone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    mensalidade_isento: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)

    # Relationships
    tenant = relationship("Tenant", backref="associados")

    def __repr__(self) -> str:
        return f"<Associado(id={self.id}, nome='{self.nome}', tenant_id={self.tenant_id})>"
