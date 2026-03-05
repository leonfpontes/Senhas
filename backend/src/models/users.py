"""User model - auth and RBAC (T012)."""
from sqlalchemy import Column, String, ForeignKey, Boolean, Index, UniqueConstraint, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
import enum

from .base import SoftDeleteModel


class UserRole(str, enum.Enum):
    """User role enumeration for RBAC."""
    
    SUPER_ADMIN = "super_admin"  # Global admin
    ADMIN = "admin"              # Per-tenant admin
    OPERATOR = "operator"        # Read-only/operator role


class User(SoftDeleteModel):
    """User model for authentication and authorization.
    
    Supports RBAC with three role levels:
    - SUPER_ADMIN: Global platform administrator
    - ADMIN: Tenant-level administrator
    - OPERATOR: Read-only/operator role
    """
    
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),
        UniqueConstraint("tenant_id", "username", name="uq_users_tenant_username"),
        Index("ix_users_tenant_id", "tenant_id"),
        Index("ix_users_is_active", "is_active"),
        Index("ix_users_email", "email"),
    )
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=True,  # NULL for SUPER_ADMIN users (global admins)
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(SQLEnum(UserRole), default=UserRole.OPERATOR, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="users")
    audit_logs = relationship("AuditLog", back_populates="user", foreign_keys="AuditLog.user_id")
    
    def __repr__(self) -> str:
        return f"<User(id={self.id}, email='{self.email}', role={self.role.value})>"
    
    @property
    def is_super_admin(self) -> bool:
        """Check if user is super admin."""
        return self.role == UserRole.SUPER_ADMIN
    
    @property
    def is_admin(self) -> bool:
        """Check if user is admin (tenant or super)."""
        return self.role in (UserRole.SUPER_ADMIN, UserRole.ADMIN)
