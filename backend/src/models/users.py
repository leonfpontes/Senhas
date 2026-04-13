"""User model - auth and RBAC (T012)."""
from sqlalchemy import Column, String, ForeignKey, Boolean, Index, LargeBinary, UniqueConstraint, Enum as SQLEnum, DateTime
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
        UniqueConstraint("email", name="uq_users_email"),
        Index("ix_users_tenant_id", "tenant_id"),
        Index("ix_users_is_active", "is_active"),
        Index("ix_users_email", "email"),
        Index("ix_users_reset_token_hash", "reset_token_hash"),
    )
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=True,  # NULL for SUPER_ADMIN users (global admins)
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    profile_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    profile_photo_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    profile_photo_content_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole, name="user_role", create_constraint=False),
        default=UserRole.OPERATOR, nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reset_token_hash: Mapped[str | None] = mapped_column(String(255), nullable=True, repr=False)
    reset_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, repr=False)

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

    @property
    def is_operator_or_admin(self) -> bool:
        """Check if user can access most admin routes (admin or operator)."""
        return self.role in (UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.OPERATOR)
