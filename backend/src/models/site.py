"""Site Builder models — tenant-owned public website (PRO+ feature)."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, BYTEA, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import TimestampedModel, Base


class SiteStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    UNPUBLISHED = "UNPUBLISHED"


class SiteSectionType(str, enum.Enum):
    HERO = "HERO"
    ABOUT = "ABOUT"
    VIDEO_EMBED = "VIDEO_EMBED"
    GIRAS_CALENDAR = "GIRAS_CALENDAR"
    SPONSOR = "SPONSOR"
    LOCATION = "LOCATION"
    CONTACT = "CONTACT"
    CUSTOM_TEXT = "CUSTOM_TEXT"


class TenantSite(TimestampedModel):
    """One site per tenant — the configurable public website."""

    __tablename__ = "tenant_sites"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_tenant_sites_slug"),
        Index("ix_tenant_sites_tenant_id", "tenant_id"),
        Index("ix_tenant_sites_slug", "slug"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[SiteStatus] = mapped_column(
        SAEnum(SiteStatus, name="site_status", create_type=False),
        nullable=False,
        default=SiteStatus.DRAFT,
        server_default="DRAFT",
    )
    template: Mapped[str] = mapped_column(String(50), nullable=False, default="moderno")
    meta_title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    meta_description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Relationships
    sections: Mapped[list[TenantSiteSection]] = relationship(
        "TenantSiteSection",
        back_populates="site",
        cascade="all, delete-orphan",
        order_by="TenantSiteSection.order_index",
    )
    images: Mapped[list[SiteImage]] = relationship(
        "SiteImage",
        back_populates="site",
        cascade="all, delete-orphan",
    )
    versions: Mapped[list[SiteVersion]] = relationship(
        "SiteVersion",
        back_populates="site",
        cascade="all, delete-orphan",
        order_by="SiteVersion.created_at.desc()",
    )


class TenantSiteSection(Base):
    """Ordered content sections for a tenant site."""

    __tablename__ = "tenant_site_sections"
    __table_args__ = (
        Index("ix_tenant_site_sections_site_id", "site_id"),
        Index("ix_tenant_site_sections_tenant_id", "tenant_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenant_sites.id", ondelete="CASCADE"),
        nullable=False,
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    section_type: Mapped[SiteSectionType] = mapped_column(
        SAEnum(SiteSectionType, name="site_section_type", create_type=False),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.utcnow(),
    )

    # Relationships
    site: Mapped[TenantSite] = relationship("TenantSite", back_populates="sections")


class SiteImage(Base):
    """Binary image storage for site builder (BYTEA, consistent with project pattern)."""

    __tablename__ = "site_images"
    __table_args__ = (
        Index("ix_site_images_site_id", "site_id"),
        Index("ix_site_images_tenant_id", "tenant_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenant_sites.id", ondelete="CASCADE"),
        nullable=False,
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mimetype: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    data: Mapped[bytes] = mapped_column(BYTEA, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.utcnow(),
    )

    # Relationships
    site: Mapped[TenantSite] = relationship("TenantSite", back_populates="images")


class SiteVersion(Base):
    """Snapshot of site sections for version history (max 10 versions per site)."""

    __tablename__ = "site_versions"
    __table_args__ = (
        Index("ix_site_versions_site_id", "site_id"),
        Index("ix_site_versions_tenant_id", "tenant_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenant_sites.id", ondelete="CASCADE"),
        nullable=False,
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    snapshot: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.utcnow(),
    )

    # Relationships
    site: Mapped[TenantSite] = relationship("TenantSite", back_populates="versions")
