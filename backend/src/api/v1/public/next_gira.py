"""
T037: Public Gira Endpoints
GET /api/v1/public/next-gira - Fetch next available gira for ticket emission
GET /api/v1/public/gira/{gira_id} - Fetch specific gira by ID (for direct links)
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from src.core.database import get_db
from src.models.giras import Gira
from src.models.tenants import Tenant
from src.models.senha_controls import SenhaControl

router = APIRouter(prefix="/api/v1/public", tags=["public"])


class GiraPublicResponse(BaseModel):
    """Public gira response with emission status."""
    id: str
    nome: str
    descricao: Optional[str] = None
    data_inicio: str
    local: Optional[str] = None
    release_start_at: Optional[str] = None
    release_end_at: Optional[str] = None
    max_tickets: Optional[int] = None
    current_tickets: int = 0
    tickets_available: int = 0
    is_open: bool = False
    is_exhausted: bool = False
    is_sponsor: bool = False
    tenant_slug: str
    tenant_name: str
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None


def _build_gira_response(gira: Gira, tenant: Tenant, current_tickets: int, is_sponsor: bool = False) -> dict:
    """Build standardized public gira response dict."""
    now = datetime.now(timezone.utc)

    if is_sponsor:
        max_t = gira.sponsor_max_tickets or 0
        start = gira.sponsor_release_start_at
        end = gira.sponsor_release_end_at
    else:
        max_t = gira.max_tickets or 0
        start = gira.release_start_at
        end = gira.release_end_at

    available = max(0, max_t - current_tickets)

    is_open = False
    if start and end:
        is_open = start <= now <= end

    return {
        "id": str(gira.id),
        "nome": gira.nome,
        "descricao": gira.descricao,
        "data_inicio": gira.data_inicio.isoformat() if gira.data_inicio else None,
        "local": gira.local,
        "release_start_at": start.isoformat() if start else None,
        "release_end_at": end.isoformat() if end else None,
        "max_tickets": max_t,
        "current_tickets": current_tickets,
        "tickets_available": available,
        "is_open": is_open and available > 0,
        "is_exhausted": max_t > 0 and available <= 0,
        "is_sponsor": is_sponsor,
        "tenant_slug": tenant.slug,
        "tenant_name": tenant.name,
        "logo_url": tenant.config.logo_url if tenant.config else None,
        "primary_color": tenant.config.primary_color if tenant.config else None,
        "secondary_color": tenant.config.secondary_color if tenant.config else None,
    }


async def _get_ticket_count(session, tenant_id, gira_id, is_sponsor: bool = False) -> int:
    """Get current ticket count for a gira."""
    query = select(SenhaControl).where(
        and_(
            SenhaControl.tenant_id == tenant_id,
            SenhaControl.gira_id == gira_id,
            SenhaControl.is_sponsor == is_sponsor,
        )
    )
    result = await session.execute(query)
    sc = result.scalar_one_or_none()
    return sc.total_emitido if sc else 0


@router.get("/next-gira")
async def get_next_gira(
    tenant_slug: str,
    tipo: str = "comum",
    session: AsyncSession = Depends(get_db),
):
    """Fetch next available gira for public ticket emission.

    Public endpoint (no auth). Returns gira with senha emission configured
    that hasn't expired yet.
    """
    try:
        tenant_query = select(Tenant).options(selectinload(Tenant.config)).where(
            Tenant.slug == tenant_slug.lower().strip()
        )
        tenant_result = await session.execute(tenant_query)
        tenant = tenant_result.scalar_one_or_none()

        if not tenant:
            raise HTTPException(status_code=404, detail=f"Tenant '{tenant_slug}' not found")

        is_sponsor = tipo == "patrocinador"
        now = datetime.now(timezone.utc)

        if is_sponsor:
            gira_query = (
                select(Gira)
                .where(
                    and_(
                        Gira.tenant_id == tenant.id,
                        Gira.is_active == True,
                        Gira.sponsor_release_start_at.isnot(None),
                        Gira.sponsor_release_end_at.isnot(None),
                        Gira.sponsor_release_end_at >= now,
                    )
                )
                .order_by(Gira.sponsor_release_start_at.asc())
                .limit(1)
            )
        else:
            gira_query = (
                select(Gira)
                .where(
                    and_(
                        Gira.tenant_id == tenant.id,
                        Gira.is_active == True,
                        Gira.release_start_at.isnot(None),
                        Gira.release_end_at.isnot(None),
                        Gira.release_end_at >= now,
                    )
                )
                .order_by(Gira.release_start_at.asc())
                .limit(1)
            )
        gira_result = await session.execute(gira_query)
        gira = gira_result.scalar_one_or_none()

        if not gira:
            raise HTTPException(status_code=404, detail="No active gira scheduled for this tenant")

        current_tickets = await _get_ticket_count(session, tenant.id, gira.id, is_sponsor)
        return _build_gira_response(gira, tenant, current_tickets, is_sponsor)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/gira/{gira_id}")
async def get_gira_by_id(
    gira_id: UUID,
    tipo: str = "comum",
    session: AsyncSession = Depends(get_db),
):
    """Fetch a specific gira by ID for public display.

    Public endpoint (no auth). Used for direct links from admin dashboard.
    Returns gira info, countdown data, and ticket availability.
    """
    try:
        gira_query = select(Gira).where(
            and_(
                Gira.id == gira_id,
                Gira.is_active == True,
                Gira.deleted_at.is_(None),
            )
        )
        gira_result = await session.execute(gira_query)
        gira = gira_result.scalar_one_or_none()

        if not gira:
            raise HTTPException(status_code=404, detail="Gira not found")

        # Load tenant
        tenant_query = select(Tenant).options(selectinload(Tenant.config)).where(Tenant.id == gira.tenant_id)
        tenant_result = await session.execute(tenant_query)
        tenant = tenant_result.scalar_one_or_none()

        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")

        is_sponsor = tipo == "patrocinador"
        current_tickets = await _get_ticket_count(session, tenant.id, gira.id, is_sponsor)
        return _build_gira_response(gira, tenant, current_tickets, is_sponsor)

    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.getLogger("senhas").exception(f"get_gira_by_id error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")