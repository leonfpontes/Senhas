"""T-03 — sitemap só com sites publicados de terreiros ativos."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import update

from src.models.site import SiteStatus, TenantSite
from src.models.tenants import Tenant

from .factories import create_tenant


async def _site(db, tenant, status: SiteStatus) -> TenantSite:
    site = TenantSite(tenant_id=tenant.id, slug=tenant.slug, status=status)
    db.add(site)
    await db.commit()
    return site


async def test_sitemap_lista_so_sites_publicados_de_terreiros_ativos(client, db):
    publicado = await create_tenant(db, "Publicado")
    await _site(db, publicado, SiteStatus.PUBLISHED)
    rascunho = await create_tenant(db, "Rascunho")
    await _site(db, rascunho, SiteStatus.DRAFT)
    despublicado = await create_tenant(db, "Despublicado")
    await _site(db, despublicado, SiteStatus.UNPUBLISHED)
    inativo = await create_tenant(db, "Inativo")
    await _site(db, inativo, SiteStatus.PUBLISHED)
    await db.execute(update(Tenant).where(Tenant.id == inativo.id).values(is_active=False))
    apagado = await create_tenant(db, "Apagado")
    await _site(db, apagado, SiteStatus.PUBLISHED)
    await db.execute(update(Tenant).where(Tenant.id == apagado.id).values(deleted_at=datetime.now(timezone.utc)))
    await db.commit()

    r = await client.get("/api/v1/public/sitemap/sites")
    assert r.status_code == 200
    assert [s["slug"] for s in r.json()] == [publicado.slug]
    assert set(r.json()[0]) == {"slug", "updated_at"}
