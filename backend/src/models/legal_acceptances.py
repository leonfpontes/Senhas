"""LegalAcceptance — prova do aceite dos Termos de Uso e da Política de Privacidade.

Uma linha por documento e versão aceitos por um usuário (LGPD, art. 8º, §2º: cabe ao
controlador provar o consentimento). Só acréscimo: uma versão nova do documento gera uma
linha nova, a antiga fica como histórico. Grava data, IP e navegador de quem aceitou.
"""
from datetime import datetime
import uuid

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class LegalAcceptance(Base):
    __tablename__ = "legal_acceptances"
    __table_args__ = (
        UniqueConstraint("user_id", "document", "version", name="uq_legal_acceptances_user_document_version"),
        Index("ix_legal_acceptances_tenant_id", "tenant_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # "termos" | "privacidade" (src/core/legal_versions.py)
    document: Mapped[str] = mapped_column(String(20), nullable=False)
    version: Mapped[str] = mapped_column(String(20), nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)

    def __repr__(self) -> str:
        return f"<LegalAcceptance(user_id={self.user_id}, document='{self.document}', version='{self.version}')>"
