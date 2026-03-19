"""Public image-serving endpoints (no auth required).

Serves tenant logos and user profile photos stored as BYTEA in PostgreSQL.
These endpoints are public because <img src> tags cannot send Authorization headers.
"""
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.core.database import get_db
from src.models import TenantConfig, User

router = APIRouter(prefix="/api/v1/public", tags=["public-images"])
logger = logging.getLogger(__name__)

CACHE_CONTROL = "public, max-age=300"


@router.get("/tenant/{tenant_id}/logo")
async def get_tenant_logo(
    tenant_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Serve tenant logo from database."""
    stmt = select(
        TenantConfig.logo_data,
        TenantConfig.logo_content_type,
    ).where(TenantConfig.tenant_id == tenant_id)

    result = await db.execute(stmt)
    row = result.one_or_none()

    if row is None or row.logo_data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Logo não encontrado")

    return Response(
        content=row.logo_data,
        media_type=row.logo_content_type or "image/png",
        headers={"Cache-Control": CACHE_CONTROL},
    )


@router.get("/user/{user_id}/photo")
async def get_user_photo(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Serve user profile photo from database."""
    stmt = select(
        User.profile_photo_data,
        User.profile_photo_content_type,
    ).where(User.id == user_id)

    result = await db.execute(stmt)
    row = result.one_or_none()

    if row is None or row.profile_photo_data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Foto não encontrada")

    return Response(
        content=row.profile_photo_data,
        media_type=row.profile_photo_content_type or "image/png",
        headers={"Cache-Control": CACHE_CONTROL},
    )
