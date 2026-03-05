"""Tenant model - organization/terreiro (T011)."""
from sqlalchemy import Column, String, Boolean, Index, UniqueConstraint
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
    
    # Relationships
    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    giras = relationship("Gira", back_populates="tenant", cascade="all, delete-orphan")
    consulentes = relationship("Consulente", back_populates="tenant", cascade="all, delete-orphan")
    tickets = relationship("Ticket", back_populates="tenant", cascade="all, delete-orphan")
    senha_controls = relationship("SenhaControl", back_populates="tenant", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="tenant")
    config = relationship("TenantConfig", back_populates="tenant", cascade="all, delete-orphan", uselist=False)
    
    def __repr__(self) -> str:
        return f"<Tenant(id={self.id}, name='{self.name}', slug='{self.slug}')>"
