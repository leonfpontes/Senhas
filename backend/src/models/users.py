"""User model - auth and RBAC (T012)."""
from sqlalchemy import Column, String, ForeignKey, Boolean, Index, LargeBinary, UniqueConstraint, Enum as SQLEnum, DateTime, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
import enum

from .base import SoftDeleteModel
from ..core.tz import utc_now


class UserRole(str, enum.Enum):
    """User role enumeration for RBAC."""
    
    SUPER_ADMIN = "super_admin"  # Global admin
    ADMIN = "admin"              # Per-tenant admin
    OPERATOR = "operator"        # Read-only/operator role
    # Área do Médium (AM-02): só médium, SEM acesso ao painel do terreiro. Nunca
    # passa em /api/v1/admin/* (require_backoffice) e só usa /api/v1/medium/*
    # quando há vínculo mediuns.user_id ativo (require_medium). Operador/admin
    # que também é médium mantém o próprio papel e ganha a área pelo vínculo.
    MEDIUM = "medium"


class User(SoftDeleteModel):
    """User model for authentication and authorization.
    
    Supports RBAC with three back-office role levels:
    - SUPER_ADMIN: Global platform administrator
    - ADMIN: Tenant-level administrator
    - OPERATOR: Read-only/operator role
    plus MEDIUM (Área do Médium only — no back-office access, AM-02).
    """
    
    __tablename__ = "users"
    __table_args__ = (
        # Tenant-scoped uniqueness: same email allowed in different tenants
        UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),
        Index("ix_users_tenant_id", "tenant_id"),
        Index("ix_users_is_active", "is_active"),
        Index("ix_users_email", "email"),
        Index("ix_users_reset_token_hash", "reset_token_hash"),
        # Link de confirmação da troca de e-mail (AM-13, migração 074): um token, uma conta.
        Index("uq_users_email_pendente_token_hash", "email_pendente_token_hash", unique=True),
        # Super admins (tenant_id NULL) têm e-mail globalmente único (migração 039).
        # sqlite_where espelha o predicado para os testes que compilam em SQLite.
        Index(
            "uq_users_email_superadmin",
            "email",
            unique=True,
            postgresql_where=text("tenant_id IS NULL"),
            sqlite_where=text("tenant_id IS NULL"),
        ),
    )
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=True,  # NULL for SUPER_ADMIN users (global admins)
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    profile_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    profile_photo_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    profile_photo_content_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole, name="user_role", create_constraint=False,
                values_callable=lambda x: [e.value for e in x]),
        default=UserRole.OPERATOR, nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reset_token_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reset_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Bumped on password change / "logout all devices". Access tokens issued
    # before this timestamp are rejected on their next use (see get_current_user).
    sessions_revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Troca do e-mail de login pedida pelo Perfil da Área do Médium (AM-13, migração 074): o
    # e-mail só muda depois que o link enviado ao endereço NOVO é aberto. Token opaco guardado
    # como sha256, vale 24 h, uso único (as três colunas são limpas na confirmação); pedir de
    # novo troca o token e o link anterior deixa de valer.
    email_pendente: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email_pendente_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    email_pendente_expira_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    tenant = relationship("Tenant", back_populates="users")
    audit_logs = relationship("AuditLog", back_populates="user", foreign_keys="AuditLog.user_id")
    
    def __repr__(self) -> str:
        return f"<User(id={self.id}, email='{self.email}', role={self.role.value})>"

    def soft_delete(self) -> None:
        """Exclui (soft delete) e corta o acesso na hora: desativa a conta e revoga
        toda sessão emitida até agora. Sem isso, o access token (24 h) e o refresh
        continuavam valendo — e, se o admin recriar a conta com o mesmo e-mail
        (`admin/users.py` ressuscita a linha), os tokens antigos voltariam a valer."""
        super().soft_delete()
        self.is_active = False
        self.sessions_revoked_at = utc_now()
    
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
        """Check if user can access most admin routes (admin or operator).

        Falso para MEDIUM (AM-02): o papel `medium` não tem acesso ao painel.
        """
        return self.role in (UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.OPERATOR)

    @property
    def is_medium_only(self) -> bool:
        """Papel `medium`: conta só da Área do Médium, sem back-office (AM-02)."""
        return self.role == UserRole.MEDIUM
