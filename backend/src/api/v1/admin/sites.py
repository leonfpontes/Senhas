"""Admin Site Builder endpoints (PRO+ feature).

Routes:
  GET  /api/v1/admin/sites              — Get or create tenant site config + sections
  PUT  /api/v1/admin/sites              — Update site meta (title, description, template, slug)
  GET  /api/v1/admin/sites/sections     — List sections (real DB UUIDs)
  PUT  /api/v1/admin/sites/sections     — Replace all sections atomically (optimistic lock)
  POST /api/v1/admin/sites/publish      — Publish site
  POST /api/v1/admin/sites/unpublish    — Unpublish site
  GET  /api/v1/admin/sites/images       — List images
  POST /api/v1/admin/sites/images       — Upload image (max 5MB, max 50/tenant)
  DELETE /api/v1/admin/sites/images/{image_id}  — Delete image
  GET  /api/v1/admin/sites/versions     — List version history
  POST /api/v1/admin/sites/versions/{version_id}/restore  — Restore a version
"""
import io
import logging
import uuid
from typing import Any, Optional
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Header,
    HTTPException,
    Path,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user, require_group_permission
from src.core.database import get_db
from src.models import User, PermissionFeature
from src.models.site import SiteStatus, SiteSectionType
from src.models.subscriptions import PlanType, SubscriptionStatus
from src.repositories.site_repo import SiteRepository
from src.repositories.site_image_repo import (
    SiteImageRepository,
    MAX_IMAGES_PER_TENANT,
    MAX_IMAGE_SIZE_BYTES,
    ALLOWED_MIMETYPES,
)
from src.repositories.site_version_repo import SiteVersionRepository
from src.repositories.subscription_repo import SubscriptionRepository
from fastapi import Depends

router = APIRouter(
    prefix="/api/v1/admin/sites",
    tags=["admin-site-builder"],
    dependencies=[Depends(require_group_permission(PermissionFeature.CURSOS_PRESENCIAIS, "view"))]
)
logger = logging.getLogger(__name__)

_PRO_OR_PREMIUM = {PlanType.PRO, PlanType.PREMIUM}


# ── Plan gate ─────────────────────────────────────────────────────────────────

async def _require_pro(current_user: User, db: AsyncSession) -> None:
    sub_repo = SubscriptionRepository(db)
    sub = await sub_repo.get_by_tenant(current_user.tenant_id)
    plan = sub.plan if sub else PlanType.FREE
    is_active = bool(sub and sub.status == SubscriptionStatus.ACTIVE)
    if plan not in _PRO_OR_PREMIUM or not is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Site Builder está disponível apenas nos planos Pro e Premium.",
        )


# ── Schemas ───────────────────────────────────────────────────────────────────

class SectionPayload(BaseModel):
    section_type: str
    config: dict[str, Any] = Field(default_factory=dict)


class SectionsUpdateRequest(BaseModel):
    sections: list[SectionPayload]
    site_version: Optional[str] = Field(
        None,
        description="ISO timestamp of site.updated_at — used for optimistic locking",
    )


class SiteUpdateRequest(BaseModel):
    meta_title: Optional[str] = Field(None, max_length=200)
    meta_description: Optional[str] = Field(None, max_length=500)
    template: Optional[str] = Field(None, max_length=50)
    slug: Optional[str] = Field(None, max_length=100)


class SiteResponse(BaseModel):
    id: str
    tenant_id: str
    slug: str
    status: str
    template: str
    meta_title: Optional[str]
    meta_description: Optional[str]
    updated_at: str


class SectionResponse(BaseModel):
    id: str
    section_type: str
    order_index: int
    config: dict[str, Any]


class SectionsResponse(BaseModel):
    sections: list[SectionResponse]
    site_updated_at: str


class ImageResponse(BaseModel):
    id: str
    filename: str
    mimetype: str
    size_bytes: int
    width: Optional[int]
    height: Optional[int]
    url: str
    created_at: str


class VersionResponse(BaseModel):
    id: str
    label: Optional[str]
    snapshot: list[dict[str, Any]]
    created_by: Optional[str]
    created_at: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _site_to_response(site) -> SiteResponse:
    return SiteResponse(
        id=str(site.id),
        tenant_id=str(site.tenant_id),
        slug=site.slug,
        status=site.status.value,
        template=site.template,
        meta_title=site.meta_title,
        meta_description=site.meta_description,
        updated_at=site.updated_at.isoformat(),
    )


def _section_to_response(s) -> SectionResponse:
    return SectionResponse(
        id=str(s.id),
        section_type=s.section_type.value,
        order_index=s.order_index,
        config=s.config,
    )


def _image_url(image_id: str) -> str:
    return f"/api/v1/public/sites/images/{image_id}"


def _validate_section_type(section_type: str) -> SiteSectionType:
    try:
        return SiteSectionType(section_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Tipo de seção inválido: '{section_type}'.",
        )


def _validate_youtube_url(url: str) -> None:
    """Validate YouTube URL format to prevent broken iframes (Gap #14)."""
    if not url:
        return
    valid_prefixes = (
        "https://www.youtube.com/embed/",
        "https://www.youtube-nocookie.com/embed/",
        "https://youtu.be/",
        "https://www.youtube.com/watch",
    )
    if not any(url.startswith(p) for p in valid_prefixes):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="URL do YouTube inválida. Use o formato de embed ou link padrão do YouTube.",
        )


def _validate_section(section: SectionPayload) -> None:
    """Validate section type-specific required fields."""
    config = section.config
    if section.section_type == "VIDEO_EMBED":
        url = config.get("youtube_url", "")
        if url:
            _validate_youtube_url(url)
    if section.section_type == "HERO":
        if not config.get("title", "").strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Seção Hero requer um título.",
            )


async def _extract_image_dimensions(data: bytes, mimetype: str) -> tuple[int | None, int | None]:
    """Extract image width/height for CLS prevention (Gap #20)."""
    try:
        from PIL import Image  # type: ignore

        img = Image.open(io.BytesIO(data))
        return img.width, img.height
    except Exception:
        return None, None


# ── Site config endpoints ─────────────────────────────────────────────────────

@router.get("", response_model=SiteResponse, dependencies=[Depends(require_group_permission(PermissionFeature.CURSOS_PRESENCIAIS, "view"))])
async def get_site(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get or auto-create the tenant's site."""
    await _require_pro(current_user, db)
    tenant_id = current_user.tenant_id
    repo = SiteRepository(db)

    # Auto-derive slug from tenant slug (to be overridden later)
    site = await repo.get_by_tenant(tenant_id)
    if not site:
        # Use the tenant's actual slug as the default site slug
        from sqlalchemy import select as sa_select
        from src.models.tenants import Tenant
        result = await db.execute(sa_select(Tenant.slug).where(Tenant.id == tenant_id))
        default_slug = result.scalar_one_or_none() or str(tenant_id).split("-")[0]
        site = await repo.get_or_create(tenant_id, default_slug)
        await db.commit()

    return _site_to_response(site)


@router.put("", response_model=SiteResponse, dependencies=[Depends(require_group_permission(PermissionFeature.CURSOS_PRESENCIAIS, "edit"))])
async def update_site(
    body: SiteUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro(current_user, db)
    repo = SiteRepository(db)
    site = await repo.get_by_tenant(current_user.tenant_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site não encontrado.")

    # Validate slug uniqueness if changed
    if body.slug and body.slug != site.slug:
        from sqlalchemy import select, and_
        from src.models.site import TenantSite
        existing = await db.execute(
            select(TenantSite).where(
                and_(TenantSite.slug == body.slug, TenantSite.id != site.id)
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Este slug já está em uso por outro site.",
            )

    site = await repo.update_site(
        site,
        meta_title=body.meta_title,
        meta_description=body.meta_description,
        template=body.template,
        slug=body.slug,
    )
    await db.commit()
    return _site_to_response(site)


# ── Sections endpoints ────────────────────────────────────────────────────────

@router.get("/sections", response_model=SectionsResponse, dependencies=[Depends(require_group_permission(PermissionFeature.CURSOS_PRESENCIAIS, "view"))])
async def get_sections(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro(current_user, db)
    repo = SiteRepository(db)
    site = await repo.get_by_tenant(current_user.tenant_id)
    if not site:
        return SectionsResponse(sections=[], site_updated_at="")

    sections = sorted(site.sections, key=lambda s: s.order_index)
    return SectionsResponse(
        sections=[_section_to_response(s) for s in sections],
        site_updated_at=site.updated_at.isoformat(),
    )


@router.put("/sections", response_model=SectionsResponse, dependencies=[Depends(require_group_permission(PermissionFeature.CURSOS_PRESENCIAIS, "edit"))])
async def save_sections(
    body: SectionsUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Replace all sections atomically.

    Implements optimistic locking via site_version field (Gap #6).
    After save, caller MUST re-fetch /sections to get real DB UUIDs (Gap #12).
    """
    await _require_pro(current_user, db)
    repo = SiteRepository(db)
    image_repo = SiteImageRepository(db)
    version_repo = SiteVersionRepository(db)

    site = await repo.get_by_tenant(current_user.tenant_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site não encontrado.")

    # Optimistic locking check (Gap #6)
    if body.site_version:
        client_version = body.site_version.rstrip("Z").replace("Z", "")
        db_version = site.updated_at.isoformat()
        if client_version != db_version:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="O site foi alterado por outro usuário. Recarregue a página para ver as mudanças.",
            )

    # Validate all sections
    for section in body.sections:
        _validate_section_type(section.section_type)
        _validate_section(section)

    # Snapshot before overwriting
    await version_repo.create(site, created_by=current_user.id)

    # Save
    sections_data = [
        {"section_type": s.section_type, "config": s.config}
        for s in body.sections
    ]
    new_sections = await repo.save_sections(site, sections_data)
    await db.commit()

    # Re-fetch to return real DB UUIDs (Gap #12)
    site = await repo.get_by_tenant(current_user.tenant_id)
    sections = sorted(site.sections, key=lambda s: s.order_index)
    return SectionsResponse(
        sections=[_section_to_response(s) for s in sections],
        site_updated_at=site.updated_at.isoformat(),
    )


# ── Publish / Unpublish ───────────────────────────────────────────────────────

@router.post("/publish", response_model=SiteResponse, dependencies=[Depends(require_group_permission(PermissionFeature.CURSOS_PRESENCIAIS, "edit"))])
async def publish_site(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro(current_user, db)
    repo = SiteRepository(db)
    site = await repo.get_by_tenant(current_user.tenant_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site não encontrado.")
    site = await repo.publish(site)
    await db.commit()
    return _site_to_response(site)


@router.post("/unpublish", response_model=SiteResponse, dependencies=[Depends(require_group_permission(PermissionFeature.CURSOS_PRESENCIAIS, "edit"))])
async def unpublish_site(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro(current_user, db)
    repo = SiteRepository(db)
    site = await repo.get_by_tenant(current_user.tenant_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site não encontrado.")
    site = await repo.unpublish(site)
    await db.commit()
    return _site_to_response(site)


# ── Image endpoints ───────────────────────────────────────────────────────────

@router.get("/images", response_model=list[ImageResponse], dependencies=[Depends(require_group_permission(PermissionFeature.CURSOS_PRESENCIAIS, "view"))])
async def list_images(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro(current_user, db)
    site_repo = SiteRepository(db)
    image_repo = SiteImageRepository(db)
    site = await site_repo.get_by_tenant(current_user.tenant_id)
    if not site:
        return []
    images = await image_repo.list_by_site(site.id, current_user.tenant_id)
    return [
        ImageResponse(
            id=str(img.id),
            filename=img.filename,
            mimetype=img.mimetype,
            size_bytes=img.size_bytes,
            width=img.width,
            height=img.height,
            url=_image_url(str(img.id)),
            created_at=img.created_at.isoformat(),
        )
        for img in images
    ]


@router.post("/images", response_model=ImageResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_group_permission(PermissionFeature.CURSOS_PRESENCIAIS, "insert"))])
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload an image for the site builder (max 5MB, max 50/tenant)."""
    await _require_pro(current_user, db)

    # Validate mimetype
    if file.content_type not in ALLOWED_MIMETYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Tipo de arquivo não suportado. Use: {', '.join(ALLOWED_MIMETYPES)}",
        )

    data = await file.read()

    # Validate size
    if len(data) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Imagem muito grande. Máximo: {MAX_IMAGE_SIZE_BYTES // (1024 * 1024)}MB.",
        )

    site_repo = SiteRepository(db)
    image_repo = SiteImageRepository(db)

    # Validate tenant image limit (Gap #3)
    count = await image_repo.count_by_tenant(current_user.tenant_id)
    if count >= MAX_IMAGES_PER_TENANT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Limite de {MAX_IMAGES_PER_TENANT} imagens por site atingido.",
        )

    site = await site_repo.get_by_tenant(current_user.tenant_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site não encontrado. Acesse Meu Site primeiro.")

    # Extract dimensions (Gap #20)
    width, height = await _extract_image_dimensions(data, file.content_type)

    image = await image_repo.create(
        site_id=site.id,
        tenant_id=current_user.tenant_id,
        filename=file.filename or "image",
        mimetype=file.content_type,
        data=data,
        width=width,
        height=height,
    )
    await db.commit()

    return ImageResponse(
        id=str(image.id),
        filename=image.filename,
        mimetype=image.mimetype,
        size_bytes=image.size_bytes,
        width=image.width,
        height=image.height,
        url=_image_url(str(image.id)),
        created_at=image.created_at.isoformat(),
    )


@router.delete("/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_group_permission(PermissionFeature.CURSOS_PRESENCIAIS, "delete"))])
async def delete_image(
    image_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an image. Does not validate JSONB references — callers should
    ensure the image is not in active use before deletion (frontend warns)."""
    await _require_pro(current_user, db)
    image_repo = SiteImageRepository(db)
    image = await image_repo.get(image_id, current_user.tenant_id)
    if not image:
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")
    await image_repo.delete(image)
    await db.commit()


# ── Version history ───────────────────────────────────────────────────────────

@router.get("/versions", response_model=list[VersionResponse], dependencies=[Depends(require_group_permission(PermissionFeature.CURSOS_PRESENCIAIS, "view"))])
async def list_versions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro(current_user, db)
    site_repo = SiteRepository(db)
    version_repo = SiteVersionRepository(db)
    site = await site_repo.get_by_tenant(current_user.tenant_id)
    if not site:
        return []
    versions = await version_repo.list(site.id, current_user.tenant_id)
    return [
        VersionResponse(
            id=str(v.id),
            label=v.label,
            snapshot=v.snapshot,
            created_by=str(v.created_by) if v.created_by else None,
            created_at=v.created_at.isoformat(),
        )
        for v in versions
    ]


@router.post("/versions/{version_id}/restore", response_model=SectionsResponse, dependencies=[Depends(require_group_permission(PermissionFeature.CURSOS_PRESENCIAIS, "edit"))])
async def restore_version(
    version_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Restore a previous version. Frontend must show a confirmation dialog (Gap #15)."""
    await _require_pro(current_user, db)
    site_repo = SiteRepository(db)
    version_repo = SiteVersionRepository(db)

    site = await site_repo.get_by_tenant(current_user.tenant_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site não encontrado.")

    version = await version_repo.get(version_id, current_user.tenant_id)
    if not version:
        raise HTTPException(status_code=404, detail="Versão não encontrada.")

    sections_data = await version_repo.restore(version, site)
    await site_repo.save_sections(site, sections_data)
    await db.commit()

    # Re-fetch
    site = await site_repo.get_by_tenant(current_user.tenant_id)
    sections = sorted(site.sections, key=lambda s: s.order_index)
    return SectionsResponse(
        sections=[_section_to_response(s) for s in sections],
        site_updated_at=site.updated_at.isoformat(),
    )
