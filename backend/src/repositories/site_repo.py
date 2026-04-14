"""SiteRepository — CRUD and business logic for tenant site builder."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import and_, delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.giras import Gira
from src.models.site import SiteStatus, TenantSite, TenantSiteSection
from src.repositories.base import BaseRepository


class SiteRepository(BaseRepository[TenantSite]):
    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db, TenantSite)

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def get_by_tenant(self, tenant_id: UUID) -> Optional[TenantSite]:
        """Return the site for this tenant (1:1), or None if not created yet."""
        stmt = (
            select(TenantSite)
            .where(
                and_(
                    TenantSite.tenant_id == tenant_id,
                    TenantSite.deleted_at.is_(None),
                )
            )
            .options(selectinload(TenantSite.sections))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_published_by_slug(
        self, slug: str, limit_giras: int = 10
    ) -> Optional[dict[str, Any]]:
        """Return published site with sections + upcoming giras for SSR.

        Includes upcoming_giras so the public page can be fully server-side rendered
        (required for SEO indexing — Gap #19).
        """
        stmt = (
            select(TenantSite)
            .where(
                and_(
                    TenantSite.slug == slug,
                    TenantSite.status == SiteStatus.PUBLISHED,
                    TenantSite.deleted_at.is_(None),
                )
            )
            .options(selectinload(TenantSite.sections))
        )
        result = await self.db.execute(stmt)
        site = result.scalar_one_or_none()
        if site is None:
            return None

        # Fetch upcoming giras for this tenant (server-side, for SEO)
        now = datetime.utcnow()
        giras_stmt = (
            select(Gira)
            .where(
                and_(
                    Gira.tenant_id == site.tenant_id,
                    Gira.data_inicio >= now,
                    Gira.deleted_at.is_(None),
                )
            )
            .order_by(Gira.data_inicio)
            .limit(limit_giras)
        )
        giras_result = await self.db.execute(giras_stmt)
        upcoming_giras = giras_result.scalars().all()

        return {
            "site": site,
            "upcoming_giras": upcoming_giras,
        }

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    async def get_or_create(self, tenant_id: UUID, slug: str) -> TenantSite:
        """Return existing site or create a new draft for the tenant."""
        existing = await self.get_by_tenant(tenant_id)
        if existing:
            return existing
        site = TenantSite(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            slug=slug,
            status=SiteStatus.DRAFT,
            template="moderno",
        )
        self.db.add(site)
        await self.db.flush()
        return site

    async def update_site(
        self,
        site: TenantSite,
        *,
        meta_title: Optional[str] = None,
        meta_description: Optional[str] = None,
        template: Optional[str] = None,
        slug: Optional[str] = None,
    ) -> TenantSite:
        if meta_title is not None:
            site.meta_title = meta_title
        if meta_description is not None:
            site.meta_description = meta_description
        if template is not None:
            site.template = template
        if slug is not None:
            site.slug = slug
        site.updated_at = datetime.utcnow()
        await self.db.flush()
        return site

    async def save_sections(
        self,
        site: TenantSite,
        sections_data: list[dict[str, Any]],
    ) -> list[TenantSiteSection]:
        """Replace all sections atomically with renumbered order_index.

        DELETE + INSERT in a single transaction guarantees consistent order_index
        and prevents UUID desynch (Gap #12 — after save, caller must re-fetch).
        """
        # Delete existing sections
        await self.db.execute(
            delete(TenantSiteSection).where(TenantSiteSection.site_id == site.id)
        )

        # Insert new sections with sequential order_index (Gap #27 — renumber)
        new_sections: list[TenantSiteSection] = []
        for idx, data in enumerate(sections_data):
            section = TenantSiteSection(
                id=uuid.uuid4(),
                site_id=site.id,
                tenant_id=site.tenant_id,
                section_type=data["section_type"],
                order_index=idx,
                config=data.get("config", {}),
            )
            self.db.add(section)
            new_sections.append(section)

        site.updated_at = datetime.utcnow()
        await self.db.flush()
        return new_sections

    async def publish(self, site: TenantSite) -> TenantSite:
        site.status = SiteStatus.PUBLISHED
        site.updated_at = datetime.utcnow()
        await self.db.flush()
        return site

    async def unpublish(self, site: TenantSite) -> TenantSite:
        site.status = SiteStatus.UNPUBLISHED
        site.updated_at = datetime.utcnow()
        await self.db.flush()
        return site
