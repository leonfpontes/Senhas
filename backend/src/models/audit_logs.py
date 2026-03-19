"""AuditLog model - immutable audit trail (T017)."""
from sqlalchemy import Column, ForeignKey, String, Index, Text, Enum as SQLEnum, event
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSON
from datetime import datetime
import uuid
import enum

from .base import TimestampedModel


class AuditAction(str, enum.Enum):
    """Audit action enumeration."""
    
    CREATE = "create"
    READ = "read"
    UPDATE = "update"
    DELETE = "delete"
    LOGIN = "login"
    LOGOUT = "logout"
    TOKEN_REFRESH = "token_refresh"


class AuditLog(TimestampedModel):
    """AuditLog model - immutable audit trail for compliance.
    
    All significant events are logged here for LGPD compliance.
    Never update or soft-delete audit logs - only hard delete per retention policy.
    
    MULTI-TENANT: Most audit logs are tenant-specific, but platform-level
    actions (logins to super admin) may have tenant_id=NULL.
    """
    
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_tenant_id", "tenant_id"),
        Index("ix_audit_logs_user_id", "user_id"),
        Index("ix_audit_logs_created_at", "created_at"),
        Index("ix_audit_logs_action", "action"),
        Index("ix_audit_logs_resource_type", "resource_type"),
    )
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=True,  # NULL for platform-level events (super admin logins)
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,  # NULL for unauthenticated events
    )
    
    action: Mapped[AuditAction] = mapped_column(
        SQLEnum(AuditAction, values_callable=lambda e: [x.value for x in e]),
        nullable=False,
    )
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False)  # User, Ticket, Gira, etc
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # Extra context
    
    # Relationships (no cascade - logs are immutable)
    tenant = relationship("Tenant", back_populates="audit_logs", foreign_keys=[tenant_id])
    user = relationship("User", back_populates="audit_logs", foreign_keys=[user_id])
    
    def __repr__(self) -> str:
        return f"<AuditLog(id={self.id}, action={self.action.value}, resource_type={self.resource_type}, tenant_id={self.tenant_id})>"
