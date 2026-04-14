"""SiteVersionRepository — version history for site builder (max 10 per site)."""
from __future__ import annotations

import uuid
from typing import Any
from uuid import UUID

from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.site import TenantSite, TenantSiteSection, SiteVersion

MAX_VERSIONS_PER_SITE = 10


class SiteVersionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        site: TenantSite,
        created_by: UUID,
        label: str | None = None,
    ) -> SiteVersion:
        """Snapshot the current sections into a version record.

        Cleanup of excess versions is done atomically via a subquery DELETE
        (Gap #4 — avoids race condition from SELECT + DELETE pattern).
        """
        # Build snapshot from current sections
        snapshot = [
            {
                "section_type": s.section_type.value,
                "order_index": s.order_index,
                "config": s.config,
            }
            for s in sorted(site.sections, key=lambda s: s.order_index)
        ]

        version = SiteVersion(
            id=uuid.uuid4(),
            site_id=site.id,
            tenant_id=site.tenant_id,
            snapshot=snapshot,
            created_by=created_by,
            label=label,
        )
        self.db.add(version)
        await self.db.flush()

        # Atomic cleanup: delete rows beyond MAX_VERSIONS_PER_SITE (oldest first)
        # Uses subquery to avoid race condition
        subq = (
            select(SiteVersion.id)
            .where(SiteVersion.site_id == site.id)
            .order_by(SiteVersion.created_at.desc())
            .offset(MAX_VERSIONS_PER_SITE)
        )
        await self.db.execute(
            delete(SiteVersion).where(SiteVersion.id.in_(subq))
        )
        await self.db.flush()
        return version

    async def list(self, site_id: UUID, tenant_id: UUID) -> list[SiteVersion]:
        stmt = (
            select(SiteVersion)
            .where(
                and_(
                    SiteVersion.site_id == site_id,
                    SiteVersion.tenant_id == tenant_id,
                )
            )
            .order_by(SiteVersion.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get(self, version_id: UUID, tenant_id: UUID) -> SiteVersion | None:
        stmt = select(SiteVersion).where(
            and_(
                SiteVersion.id == version_id,
                SiteVersion.tenant_id == tenant_id,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def restore(
        self,
        version: SiteVersion,
        site: TenantSite,
    ) -> list[dict[str, Any]]:
        """Return the sections payload from the snapshot (caller applies them via SiteRepository.save_sections)."""
        return version.snapshot
