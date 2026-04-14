"""Public Site Builder endpoints (no auth required).

Routes:
  GET /api/v1/public/sites/{slug}                — Get published site with sections + upcoming giras (SSR)
  GET /api/v1/public/sites/images/{image_id}     — Serve site image binary (rate-limited, cached)
"""
from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.limiter import limiter
from src.repositories.site_image_repo import SiteImageRepository
from src.repositories.site_repo import SiteRepository

router = APIRouter(prefix="/api/v1/public/sites", tags=["public-sites"])
logger = logging.getLogger(__name__)

_IMAGE_CACHE_CONTROL = "public, max-age=86400"  # 24h — immutable binary (Gap #9)


@router.get("/{slug}")
async def get_published_site(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Return a published site with all sections and upcoming giras.

    Designed for getServerSideProps — returns complete data for SSR so giras
    calendar is in the HTML and indexed by search engines (Gap #19).
    """
    repo = SiteRepository(db)
    result = await repo.get_published_by_slug(slug)

    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site não encontrado.")

    site = result["site"]
    upcoming_giras = result["upcoming_giras"]

    sections_payload = [
        {
            "id": str(s.id),
            "section_type": s.section_type.value,
            "order_index": s.order_index,
            "config": s.config,
        }
        for s in sorted(site.sections, key=lambda s: s.order_index)
    ]

    giras_payload = [
        {
            "id": str(g.id),
            "nome": g.nome,
            "data_hora": g.data_hora.isoformat() if g.data_hora else None,
            "descricao": getattr(g, "descricao", None),
        }
        for g in upcoming_giras
    ]

    return {
        "id": str(site.id),
        "slug": site.slug,
        "status": site.status.value,
        "template": site.template,
        "meta_title": site.meta_title,
        "meta_description": site.meta_description,
        "sections": sections_payload,
        "upcoming_giras": giras_payload,
    }


@router.get("/images/{image_id}")
@limiter.limit("60/minute")  # Gap #9 — rate limit on unauthenticated binary endpoint
async def get_site_image(
    request: Request,
    image_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Serve a site image by ID. Public endpoint — no tenant isolation needed (slug is public)."""
    repo = SiteImageRepository(db)
    image = await repo.get_public(image_id)

    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imagem não encontrada.")

    return Response(
        content=bytes(image.data),
        media_type=image.mimetype,
        headers={"Cache-Control": _IMAGE_CACHE_CONTROL},
    )
