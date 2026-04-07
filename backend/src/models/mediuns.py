"""Medium model - registered mediums and cambones for the terreiro."""
from datetime import date
from typing import Optional

from sqlalchemy import Date, String, ForeignKey, Boolean, Index, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid

from .base import SoftDeleteModel


class Medium(SoftDeleteModel):
    """Medium/Cambone model.

    Stores the registered spiritual workers per tenant.
    - ``is_atendimento=True``: médium de atendimento — pode ser selecionado
      como médium OU como cambone.
    - ``is_atendimento=False``: apenas cambone — só pode ser selecionado como cambone.
    """

    __tablename__ = "mediuns"
    __table_args__ = (
        Index("ix_mediuns_tenant_id", "tenant_id"),
        Index("ix_mediuns_is_active", "is_active"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    is_atendimento: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    mensalidade_isento: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    # Dados de contato / ficha pessoal
    telefone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    data_nascimento: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # Endereço estruturado (via CEP)
    cep: Mapped[Optional[str]] = mapped_column(String(9), nullable=True)
    logradouro: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    numero: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    bairro: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    cidade: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    tenant = relationship("Tenant", backref="mediuns")

    def __repr__(self) -> str:
        return f"<Medium(id={self.id}, nome='{self.nome}', tenant_id={self.tenant_id})>"
