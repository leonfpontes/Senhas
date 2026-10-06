"""Admin Site Builder endpoints (PRO+ feature).

Routes:
  GET  /api/v1/admin/sites              — Get or create tenant site config + sections
  PUT  /api/v1/admin/sites              — Update site meta (title, description, template); slug segue o tenant
  GET  /api/v1/admin/sites/sections     — List sections (real DB UUIDs)
  PUT  /api/v1/admin/sites/sections     — Replace all sections atomically (optimistic lock)
  POST /api/v1/admin/sites/publish      — Publish site
  POST /api/v1/admin/sites/unpublish    — Unpublish site
  GET  /api/v1/admin/sites/images       — List images
  POST /api/v1/admin/sites/images       — Upload image (max 5MB, max 50/tenant; no limite,
                                          limpa antes as imagens que nada mais usa)
  DELETE /api/v1/admin/sites/images/{image_id}  — Delete image (409 se ainda está no site)
  GET  /api/v1/admin/sites/versions     — List version history (sem o snapshot)
  POST /api/v1/admin/sites/versions/{version_id}/restore  — Restore a version

Histórico de versões (cada versão = estado ANTES da operação, máx. 10):
  - "Publicado": ao publicar (estado que foi ao ar) e a cada salvamento com o site no
    ar (o conteúdo que estava publicado e foi substituído).
  - "Rascunho": salvamento com o site fora do ar, no máximo um a cada
    DRAFT_SNAPSHOT_INTERVAL (o salvamento automático roda a cada 1,5 s de edição).
  - "Antes de restaurar": sempre, antes de aplicar uma versão antiga.
  Snapshot idêntico ao da versão mais recente não é gravado de novo.

Lock otimista: o cliente manda ``site_version`` = ``updated_at`` do site como recebeu
na última resposta (GET/PUT /sections, PUT /sites, publish, unpublish, restore — todas
devolvem o valor novo). A comparação é por instante (UTC), não por texto.
"""
import io
import logging
import uuid
from datetime import datetime, timedelta, timezone
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
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user, require_group_permission, require_plan_feature
from src.core.database import get_db
from src.models import User, PermissionFeature
from src.models.site import SiteStatus, SiteSectionType, TenantSite
from src.models.tenants import Tenant
from src.repositories.site_repo import SiteRepository
from src.repositories.site_image_repo import (
    SiteImageRepository,
    MAX_IMAGES_PER_TENANT,
    MAX_IMAGE_SIZE_BYTES,
    ALLOWED_MIMETYPES,
    referenced_image_ids,
)
from src.repositories.site_version_repo import SiteVersionRepository

router = APIRouter(
    prefix="/api/v1/admin/sites",
    tags=["admin-site-builder"],
    dependencies=[
        # Gate de plano único (P-05): plano com site_builder E assinatura em dia.
        Depends(require_plan_feature("site_builder")),
        Depends(require_group_permission(PermissionFeature.CURSOS_PRESENCIAIS, "view")),
    ],
)
logger = logging.getLogger(__name__)

# Histórico: no máximo um snapshot "Rascunho" por intervalo (autosave roda a cada 1,5 s).
DRAFT_SNAPSHOT_INTERVAL = timedelta(minutes=10)
LABEL_RASCUNHO = "Rascunho"
LABEL_PUBLICADO = "Publicado"
LABEL_ANTES_RESTAURAR = "Antes de restaurar"

# Imagem recém-enviada ainda não salva nas seções não pode ser limpa como órfã.
IMAGE_GC_GRACE = timedelta(hours=1)


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
    # Ignorado: o endereço do site é sempre o slug do tenant (o botão "Retirar senha"
    # monta /{slug}/... com ele). Mantido no schema só para não quebrar clientes antigos.
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
    # Sem o snapshot: a lista do histórico só mostra rótulo e data; o conteúdo é
    # aplicado no servidor pelo POST /versions/{id}/restore.
    id: str
    label: Optional[str]
    created_by: Optional[str]
    created_at: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _as_utc(dt: datetime) -> datetime:
    """Naive = UTC (o projeto grava ``utcnow()``); aware é convertido para UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _iso_utc(dt: datetime) -> str:
    """ISO sempre com offset. Antes, o objeto em memória logo após publish/PUT /sites
    saía naive ("...123456") e o relido do banco com "+00:00" — textos diferentes
    para o mesmo instante, e o lock otimista devolvia 409 falso."""
    return _as_utc(dt).isoformat()


def _same_version(client_version: str, db_updated_at: datetime) -> bool:
    try:
        parsed = datetime.fromisoformat(client_version.strip().replace("Z", "+00:00"))
    except ValueError:
        return False
    return _as_utc(parsed) == _as_utc(db_updated_at)


async def _sync_slug_with_tenant(db: AsyncSession, site: TenantSite) -> None:
    """O endereço do site é o slug do tenant (read-only na UI).

    Corrige sites antigos cujo slug foi editado para outro valor (o link "Retirar
    senha" usa o slug do site como slug do terreiro e quebrava). A checagem de
    unicidade é global por design: slug do site público é único entre tenants.
    """
    tenant_slug = (
        await db.execute(select(Tenant.slug).where(Tenant.id == site.tenant_id))
    ).scalar_one_or_none()
    if not tenant_slug or tenant_slug == site.slug:
        return
    taken = await db.execute(
        select(TenantSite.id).where(and_(TenantSite.slug == tenant_slug, TenantSite.id != site.id))
    )
    if taken.scalar_one_or_none():
        logger.warning("Slug do tenant %s já usado por outro site; mantendo %s", site.tenant_id, site.slug)
        return
    site.slug = tenant_slug


async def _prune_unreferenced_images(db: AsyncSession, site: TenantSite) -> int:
    """Apaga imagens do site que nada mais usa. Devolve quantas apagou.

    Referência = qualquer UUID nas seções atuais (o site publicado É o conjunto
    atual de seções — não existe cópia separada do publicado) OU em qualquer versão
    do histórico (restaurar uma versão não pode trazer imagem quebrada). Imagens
    com menos de IMAGE_GC_GRACE ficam: podem ter acabado de ser enviadas e ainda
    não ter chegado ao salvamento.
    """
    image_repo = SiteImageRepository(db)
    version_repo = SiteVersionRepository(db)
    configs: list[Any] = [s.config for s in site.sections]
    for v in await version_repo.list(site.id, site.tenant_id):
        configs.append(v.snapshot)
    referenced = referenced_image_ids(configs)
    cutoff = datetime.now(timezone.utc) - IMAGE_GC_GRACE
    orphans = [
        image_id
        for image_id, created_at in await image_repo.list_ids_by_site(site.id, site.tenant_id)
        if str(image_id).lower() not in referenced and _as_utc(created_at) < cutoff
    ]
    return await image_repo.delete_ids(orphans, site.tenant_id)


def _site_to_response(site) -> SiteResponse:
    return SiteResponse(
        id=str(site.id),
        tenant_id=str(site.tenant_id),
        slug=site.slug,
        status=site.status.value,
        template=site.template,
        meta_title=site.meta_title,
        meta_description=site.meta_description,
        updated_at=_iso_utc(site.updated_at),
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
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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
    repo = SiteRepository(db)
    site = await repo.get_by_tenant(current_user.tenant_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site não encontrado.")

    # Só os campos enviados (null explícito limpa); slug é ignorado e segue o tenant.
    fields = body.model_dump(exclude_unset=True, exclude={"slug"})
    await _sync_slug_with_tenant(db, site)
    site = await repo.update_site(site, **fields)
    await db.commit()
    return _site_to_response(site)


# ── Sections endpoints ────────────────────────────────────────────────────────

@router.get("/sections", response_model=SectionsResponse, dependencies=[Depends(require_group_permission(PermissionFeature.CURSOS_PRESENCIAIS, "view"))])
async def get_sections(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = SiteRepository(db)
    site = await repo.get_by_tenant(current_user.tenant_id)
    if not site:
        return SectionsResponse(sections=[], site_updated_at="")

    sections = sorted(site.sections, key=lambda s: s.order_index)
    return SectionsResponse(
        sections=[_section_to_response(s) for s in sections],
        site_updated_at=_iso_utc(site.updated_at),
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
    repo = SiteRepository(db)
    version_repo = SiteVersionRepository(db)

    site = await repo.get_by_tenant(current_user.tenant_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site não encontrado.")

    # Optimistic locking check (Gap #6)
    if body.site_version:
        if not _same_version(body.site_version, site.updated_at):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="O site foi alterado por outro usuário. Recarregue a página para ver as mudanças.",
            )

    # Validate all sections
    for section in body.sections:
        _validate_section_type(section.section_type)
        _validate_section(section)

    # Snapshot do estado ANTES de sobrescrever. Com o site no ar, o conteúdo que sai é
    # uma versão publicada: sempre guarda. Fora do ar, o autosave roda a cada 1,5 s —
    # guarda um "Rascunho" no máximo a cada DRAFT_SNAPSHOT_INTERVAL.
    if site.status == SiteStatus.PUBLISHED:
        await version_repo.create(site, created_by=current_user.id, label=LABEL_PUBLICADO)
    else:
        latest = await version_repo.latest(site.id, site.tenant_id)
        if latest is None or _as_utc(latest.created_at) <= datetime.now(timezone.utc) - DRAFT_SNAPSHOT_INTERVAL:
            await version_repo.create(site, created_by=current_user.id, label=LABEL_RASCUNHO)

    # Save
    sections_data = [
        {"section_type": s.section_type, "config": s.config}
        for s in body.sections
    ]
    await repo.save_sections(site, sections_data)
    await db.commit()

    # Re-fetch to return real DB UUIDs (Gap #12). A sessão não expira no commit
    # (expire_on_commit=False): sem o expire, o select devolveria o objeto em memória
    # com a coleção de seções antiga e o updated_at naive.
    db.expire(site)
    site = await repo.get_by_tenant(current_user.tenant_id)
    sections = sorted(site.sections, key=lambda s: s.order_index)
    return SectionsResponse(
        sections=[_section_to_response(s) for s in sections],
        site_updated_at=_iso_utc(site.updated_at),
    )


# ── Publish / Unpublish ───────────────────────────────────────────────────────

@router.post("/publish", response_model=SiteResponse, dependencies=[Depends(require_group_permission(PermissionFeature.CURSOS_PRESENCIAIS, "edit"))])
async def publish_site(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = SiteRepository(db)
    site = await repo.get_by_tenant(current_user.tenant_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site não encontrado.")
    # Registra no histórico o conteúdo que está indo ao ar.
    await SiteVersionRepository(db).create(site, created_by=current_user.id, label=LABEL_PUBLICADO)
    await _sync_slug_with_tenant(db, site)
    site = await repo.publish(site)
    await db.commit()
    return _site_to_response(site)


@router.post("/unpublish", response_model=SiteResponse, dependencies=[Depends(require_group_permission(PermissionFeature.CURSOS_PRESENCIAIS, "edit"))])
async def unpublish_site(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Imagem muito grande. Máximo: {MAX_IMAGE_SIZE_BYTES // (1024 * 1024)}MB.",
        )

    site_repo = SiteRepository(db)
    image_repo = SiteImageRepository(db)

    site = await site_repo.get_by_tenant(current_user.tenant_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site não encontrado. Acesse Meu Site primeiro.")

    # Validate tenant image limit (Gap #3). O editor não apaga a imagem antiga ao
    # trocar/remover (ela pode estar no histórico de versões) — então, no limite,
    # primeiro limpa as que nada mais referencia e só então recusa.
    count = await image_repo.count_by_tenant(current_user.tenant_id)
    if count >= MAX_IMAGES_PER_TENANT:
        removed = await _prune_unreferenced_images(db, site)
        if removed:
            logger.info("Site %s: %d imagem(ns) órfã(s) removida(s) no upload", site.id, removed)
            count = await image_repo.count_by_tenant(current_user.tenant_id)
    if count >= MAX_IMAGES_PER_TENANT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Limite de {MAX_IMAGES_PER_TENANT} imagens por site atingido. "
                "Todas estão em uso no site ou no histórico de versões."
            ),
        )

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
    """Delete an image. 409 se a imagem ainda aparece nas seções do site (que são o
    conteúdo publicado) — apagar deixaria a página pública com imagem quebrada."""
    image_repo = SiteImageRepository(db)
    image = await image_repo.get(image_id, current_user.tenant_id)
    if not image:
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")
    site = await SiteRepository(db).get_by_tenant(current_user.tenant_id)
    if site and str(image.id).lower() in referenced_image_ids(s.config for s in site.sections):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esta imagem está em uso no site. Remova-a das seções antes de excluir.",
        )
    await image_repo.delete(image)
    await db.commit()


# ── Version history ───────────────────────────────────────────────────────────

@router.get("/versions", response_model=list[VersionResponse], dependencies=[Depends(require_group_permission(PermissionFeature.CURSOS_PRESENCIAIS, "view"))])
async def list_versions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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
            created_by=str(v.created_by) if v.created_by else None,
            created_at=_iso_utc(v.created_at),
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
    site_repo = SiteRepository(db)
    version_repo = SiteVersionRepository(db)

    site = await site_repo.get_by_tenant(current_user.tenant_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site não encontrado.")

    version = await version_repo.get(version_id, current_user.tenant_id)
    if not version:
        raise HTTPException(status_code=404, detail="Versão não encontrada.")

    sections_data = await version_repo.restore(version, site)
    # Guarda o estado atual antes de sobrescrever: restaurar também é desfazível.
    await version_repo.create(site, created_by=current_user.id, label=LABEL_ANTES_RESTAURAR)
    await site_repo.save_sections(site, sections_data)
    await db.commit()

    # Re-fetch (ver save_sections: expira para reler as seções novas)
    db.expire(site)
    site = await site_repo.get_by_tenant(current_user.tenant_id)
    sections = sorted(site.sections, key=lambda s: s.order_index)
    return SectionsResponse(
        sections=[_section_to_response(s) for s in sections],
        site_updated_at=_iso_utc(site.updated_at),
    )
