"""Tenant model - organization/terreiro (T011)."""
from sqlalchemy import Column, String, Boolean, DateTime, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from .base import SoftDeleteModel


class Tenant(SoftDeleteModel):
    """Multi-tenant organization model.

    Represents a Terreiro (spiritual center) that uses the system.
    All data is isolated by tenant_id.
    """

    __tablename__ = "tenants"
    __table_args__ = (
        Index("ix_tenants_slug", "slug"),
        Index("ix_tenants_is_active", "is_active"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Dedicated, unambiguous marker for the self-service "deactivate account"
    # flow (backend/src/api/v1/auth/deactivation.py) — deliberately NOT reusing
    # is_active/deleted_at alone, since those are also touched by unrelated
    # tenant states (platform suspension, hard delete). login.py and
    # reactivate_account() key off this field exclusively to decide whether a
    # tenant is eligible for self-service reactivation.
    self_deactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # CPF/CNPJ do responsável/terreiro (somente dígitos). Coletado no cadastro
    # a partir da introdução do trial gratuito de 1 mês — usado para checagem
    # de elegibilidade contra TrialGrant. Nullable pra não quebrar tenants
    # criados antes dessa mudança.
    documento: Mapped[str | None] = mapped_column(String(14), nullable=True)

    # Relationships
    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    giras = relationship("Gira", back_populates="tenant", cascade="all, delete-orphan")
    consulentes = relationship("Consulente", back_populates="tenant", cascade="all, delete-orphan")
    tickets = relationship("Ticket", back_populates="tenant", cascade="all, delete-orphan")
    senha_controls = relationship("SenhaControl", back_populates="tenant", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="tenant")
    config = relationship("TenantConfig", back_populates="tenant", cascade="all, delete-orphan", uselist=False)
    subscription = relationship("Subscription", back_populates="tenant", cascade="all, delete-orphan", uselist=False)
    invoices = relationship("Invoice", back_populates="tenant", cascade="all, delete-orphan")
    feature_flags = relationship("FeatureFlag", back_populates="tenant", cascade="all, delete-orphan")
    
    def __repr__(self) -> str:
        return f"<Tenant(id={self.id}, name='{self.name}', slug='{self.slug}')>"
