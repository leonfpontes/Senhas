"""Sites publicados para o sitemap (T-03).

``GET /api/v1/public/sitemap/sites`` → slug e data de atualização de cada site PUBLICADO de terreiro
ativo. Consumido pelo ``frontend/src/pages/sitemap.xml.tsx`` (SSR). Lista pública intencional,
cross-tenant: só o que já é público em ``/{slug}`` — isenção justificada no
``scripts/audit_tenant_isolation.py``.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.limiter import limiter
from src.models.site import SiteStatus, TenantSite
from src.models.tenants import Tenant

router = APIRouter(prefix="/api/v1/public/sitemap", tags=["public"])


class SitemapSite(BaseModel):
    slug: str
    updated_at: datetime


async def _published_sites(db: AsyncSession) -> list[SitemapSite]:
    rows = await db.execute(
        select(TenantSite.slug, TenantSite.updated_at)
        .join(Tenant, Tenant.id == TenantSite.tenant_id)
        .where(
            TenantSite.status == SiteStatus.PUBLISHED,
            Tenant.deleted_at.is_(None),
            Tenant.is_active.is_(True),
            Tenant.self_deactivated_at.is_(None),
        )
        .order_by(TenantSite.slug)
    )
    return [SitemapSite(slug=slug, updated_at=updated_at) for slug, updated_at in rows.all()]


@router.get("/sites", response_model=list[SitemapSite])
@limiter.limit("30/minute")
async def list_sitemap_sites(request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> list[SitemapSite]:
    response.headers["Cache-Control"] = "public, max-age=3600"
    return await _published_sites(db)
