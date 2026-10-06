"""SiteRepository — CRUD and business logic for tenant site builder."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import and_, delete, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.tz import APP_TZ
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

        # Fetch upcoming giras for this tenant (server-side, for SEO).
        upcoming_giras = await self.list_upcoming_giras(site.tenant_id, limit=limit_giras)

        return {
            "site": site,
            "upcoming_giras": upcoming_giras,
        }

    async def list_upcoming_giras(self, tenant_id: UUID, limit: int = 10) -> list[Gira]:
        """Próximas giras ativas do terreiro — calendário do site e agenda pública.

        A gira do próprio dia continua na lista mesmo depois de data_inicio
        passar: ela some só quando o dia vira em Brasília (não em UTC — às 21h
        de Brasília o dia UTC já virou e a gira da noite sumia), a gira termina
        (data_fim) e a janela de emissão fecha (release_end_at). Gira inativa
        (is_active=False, "desativada" pelo admin) não aparece.
        """
        now = datetime.now(timezone.utc)
        today_start = datetime.now(APP_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
        stmt = (
            select(Gira)
            .where(
                and_(
                    Gira.tenant_id == tenant_id,
                    Gira.is_active.is_(True),
                    or_(
                        Gira.data_inicio >= today_start,
                        Gira.data_fim >= now,
                        Gira.release_end_at >= now,
                    ),
                    Gira.deleted_at.is_(None),
                )
            )
            .order_by(Gira.data_inicio)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

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

    async def update_site(self, site: TenantSite, **fields: Any) -> TenantSite:
        """Atualização parcial das configurações do site.

        Só mexe nas chaves presentes em ``fields`` (o endpoint passa
        ``model_dump(exclude_unset=True)``): chave presente com ``None`` LIMPA o
        campo (ex.: apagar o título SEO). ``template`` não aceita ``None`` (coluna
        obrigatória). ``slug`` não é editável — segue o slug do tenant (ver
        ``sites._sync_slug_with_tenant``).
        """
        if "meta_title" in fields:
            site.meta_title = fields["meta_title"] or None
        if "meta_description" in fields:
            site.meta_description = fields["meta_description"] or None
        if fields.get("template"):
            site.template = fields["template"]
        site.updated_at = datetime.now(timezone.utc)
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
            delete(TenantSiteSection).where(
                TenantSiteSection.site_id == site.id,
                TenantSiteSection.tenant_id == site.tenant_id,
            )
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

        site.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return new_sections

    async def publish(self, site: TenantSite) -> TenantSite:
        site.status = SiteStatus.PUBLISHED
        site.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return site

    async def unpublish(self, site: TenantSite) -> TenantSite:
        site.status = SiteStatus.UNPUBLISHED
        site.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return site
