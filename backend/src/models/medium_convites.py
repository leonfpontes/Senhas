"""MediumConvite — convite da casa para o médium entrar na Área do Médium (AM-03).

O vínculo `mediuns.user_id` só nasce no aceite do convite: quem abre o link prova que
recebe o e-mail (ou o WhatsApp) do cadastro. O token é opaco (`secrets.token_urlsafe(32)`)
e só o sha256 fica no banco — mesmo padrão do reset de senha. Vale 7 dias, é de uso
único e há no máximo UM convite em aberto por médium (índice único parcial): reenviar
revoga o anterior.
"""
from datetime import datetime
import uuid

from sqlalchemy import DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class MediumConvite(Base):
    __tablename__ = "medium_convites"
    __table_args__ = (
        Index("ix_medium_convites_tenant_id", "tenant_id"),
        Index("ix_medium_convites_medium_id", "medium_id"),
        # Um convite em aberto por médium (sqlite_where espelha o predicado nos testes em SQLite).
        Index(
            "uq_medium_convites_aberto",
            "medium_id",
            unique=True,
            postgresql_where=text("usado_em IS NULL AND revogado_em IS NULL"),
            sqlite_where=text("usado_em IS NULL AND revogado_em IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    medium_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mediuns.id", ondelete="CASCADE"), nullable=False
    )
    # E-mail do cadastro no momento do convite (minúsculas). Se o cadastro mudar de
    # e-mail, o convite deixa de valer (o aceite confere os dois).
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    # sha256 (hex) do token; o token em claro só existe no link enviado.
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    usado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revogado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    criado_por: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self) -> str:
        return f"<MediumConvite(id={self.id}, medium_id={self.medium_id}, expira_em={self.expira_em})>"
