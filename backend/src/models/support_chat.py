"""SupportConversation / SupportMessage models — chat de suporte tenant ↔ superadmin.

Cada usuário autenticado do tenant tem UMA conversa 1:1 com o suporte da
plataforma (UNIQUE tenant_id+owner_user_id). O ADMIN do tenant pode ver
todas as conversas do seu terreiro, mas não responde em nome de outros
usuários — só o dono da conversa ou o suporte (SUPER_ADMIN) enviam mensagem
nela. sender/owner name são "congelados" (snapshot) no momento do
envio/criação porque sender_user_id usa ON DELETE SET NULL: se o usuário for
removido, o histórico da conversa continua legível.
"""
from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
import enum

from .base import TimestampedModel


class SupportConversationStatus(str, enum.Enum):
    """Status de triagem da conversa, usado pela inbox do superadmin."""

    OPEN = "open"
    RESOLVED = "resolved"


class SupportConversation(TimestampedModel):
    """Conversa de suporte 1:1 entre um usuário do tenant e a plataforma."""

    __tablename__ = "support_conversations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "owner_user_id", name="uq_support_conversations_tenant_owner"),
        Index("ix_support_conversations_tenant_id", "tenant_id"),
        Index("ix_support_conversations_owner_user_id", "owner_user_id"),
        Index("ix_support_conversations_status_last_message", "status", "last_message_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    owner_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[SupportConversationStatus] = mapped_column(
        SQLEnum(SupportConversationStatus, name="support_conversation_status", create_constraint=False,
                values_callable=lambda x: [e.value for e in x]),
        default=SupportConversationStatus.OPEN, nullable=False,
    )
    owner_last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    support_last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tenant = relationship("Tenant")
    owner = relationship("User", foreign_keys=[owner_user_id])
    messages = relationship(
        "SupportMessage", back_populates="conversation",
        cascade="all, delete-orphan", order_by="SupportMessage.created_at",
    )

    def __repr__(self) -> str:
        return f"<SupportConversation(tenant_id={self.tenant_id}, owner_user_id={self.owner_user_id}, status={self.status.value})>"


class SupportMessage(TimestampedModel):
    """Uma mensagem dentro de uma SupportConversation."""

    __tablename__ = "support_messages"
    __table_args__ = (
        Index("ix_support_messages_tenant_id", "tenant_id"),
        Index("ix_support_messages_conversation_id", "conversation_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("support_conversations.id", ondelete="CASCADE"), nullable=False)
    sender_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    sender_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    is_from_support: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    tenant = relationship("Tenant")
    conversation = relationship("SupportConversation", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_user_id])

    def __repr__(self) -> str:
        return f"<SupportMessage(conversation_id={self.conversation_id}, is_from_support={self.is_from_support})>"
