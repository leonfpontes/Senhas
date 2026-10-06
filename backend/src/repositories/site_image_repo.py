"""SiteImageRepository — BYTEA image storage for site builder."""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from typing import Any, Iterable, Optional
from uuid import UUID

from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.site import SiteImage

MAX_IMAGES_PER_TENANT = 50
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5MB
ALLOWED_MIMETYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}

_UUID_RE = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")


def referenced_image_ids(configs: Iterable[Any]) -> set[str]:
    """UUIDs citados em qualquer valor das configs (``bg_image``, ``logo_image``,
    ``image`` guardam o id; ``*_url`` guardam ``/api/v1/public/sites/images/{id}``).

    Conservador de propósito: qualquer UUID em qualquer string conta como referência
    — melhor manter uma imagem órfã do que apagar uma que está no ar.
    """
    found: set[str] = set()
    for config in configs:
        found.update(m.lower() for m in _UUID_RE.findall(json.dumps(config, default=str)))
    return found


class SiteImageRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def count_by_tenant(self, tenant_id: UUID) -> int:
        stmt = select(func.count(SiteImage.id)).where(
            SiteImage.tenant_id == tenant_id
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def create(
        self,
        site_id: UUID,
        tenant_id: UUID,
        filename: str,
        mimetype: str,
        data: bytes,
        width: Optional[int] = None,
        height: Optional[int] = None,
    ) -> SiteImage:
        image = SiteImage(
            id=uuid.uuid4(),
            site_id=site_id,
            tenant_id=tenant_id,
            filename=filename,
            mimetype=mimetype,
            size_bytes=len(data),
            width=width,
            height=height,
            data=data,
        )
        self.db.add(image)
        await self.db.flush()
        return image

    async def get(self, image_id: UUID, tenant_id: UUID) -> Optional[SiteImage]:
        stmt = select(SiteImage).where(
            and_(
                SiteImage.id == image_id,
                SiteImage.tenant_id == tenant_id,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_public(self, image_id: UUID) -> Optional[SiteImage]:
        """Fetch image without tenant filter — for public site serving.
        Only returns the binary data, no tenant secret info included.
        """
        stmt = select(SiteImage).where(SiteImage.id == image_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_site(self, site_id: UUID, tenant_id: UUID) -> list[SiteImage]:
        stmt = (
            select(SiteImage)
            .where(
                and_(
                    SiteImage.site_id == site_id,
                    SiteImage.tenant_id == tenant_id,
                )
            )
            .order_by(SiteImage.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def delete(self, image: SiteImage) -> None:
        await self.db.delete(image)
        await self.db.flush()

    async def list_ids_by_site(self, site_id: UUID, tenant_id: UUID) -> list[tuple[UUID, datetime]]:
        """(id, created_at) das imagens do site — sem carregar o BYTEA."""
        stmt = select(SiteImage.id, SiteImage.created_at).where(
            and_(SiteImage.site_id == site_id, SiteImage.tenant_id == tenant_id)
        )
        result = await self.db.execute(stmt)
        return [(row[0], row[1]) for row in result.all()]

    async def delete_ids(self, image_ids: list[UUID], tenant_id: UUID) -> int:
        if not image_ids:
            return 0
        result = await self.db.execute(
            delete(SiteImage).where(SiteImage.id.in_(image_ids), SiteImage.tenant_id == tenant_id)
        )
        await self.db.flush()
        return result.rowcount or 0

    def is_referenced_in_sections(
        self, image_id: UUID, sections_data: list[dict[str, Any]]
    ) -> bool:
        """Check if image_id is referenced in any section config (Gap #8)."""
        image_id_str = str(image_id)
        for section in sections_data:
            config = section.get("config", {})
            if self._config_references_image(config, image_id_str):
                return True
        return False

    def _config_references_image(self, config: Any, image_id_str: str) -> bool:
        if isinstance(config, dict):
            for v in config.values():
                if v == image_id_str or self._config_references_image(v, image_id_str):
                    return True
        elif isinstance(config, list):
            for item in config:
                if self._config_references_image(item, image_id_str):
                    return True
        return False
