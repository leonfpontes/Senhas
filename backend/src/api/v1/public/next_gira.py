"""
T037: Public Next Gira Endpoint
GET /api/v1/public/next-gira - Fetch next available gira for ticket emission
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from datetime import datetime

from src.core.database import get_db
from src.models.giras import Gira
from src.models.tenants import Tenant
from src.models.senha_controls import SenhaControl

router = APIRouter(prefix="/api/v1/public", tags=["public"])


class GiraDTO:
    """Data Transfer Object for gira information"""

    def __init__(
        self,
        id: int,
        name: str,
        location: str,
        release_start_at: str,
        release_end_at: str,
        max_tickets: int,
        current_tickets: int,
    ):
        self.id = id
        self.name = name
        self.location = location
        self.release_start_at = release_start_at
        self.release_end_at = release_end_at
        self.max_tickets = max_tickets
        self.current_tickets = current_tickets
        self.tickets_available = max_tickets - current_tickets
        self.is_open = datetime.fromisoformat(
            release_start_at.replace("Z", "+00:00")
        ) <= datetime.now(timezone=None)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "location": self.location,
            "release_start_at": self.release_start_at,
            "release_end_at": self.release_end_at,
            "max_tickets": self.max_tickets,
            "current_tickets": self.current_tickets,
            "tickets_available": self.tickets_available,
            "is_open": self.is_open,
        }


@router.get("/next-gira")
async def get_next_gira(
    tenant_slug: str,
    session: AsyncSession = Depends(get_db),
):
    """Fetch next available gira for public ticket emission

    This endpoint is PUBLIC (no auth required).
    Used to show countdown timer and form availability on frontend.

    Query Parameters:
        tenant_slug: Tenant identifier (e.g., "espiritismo-sp")

    Returns:
        {
            "id": 1,
            "name": "Gira de Cura - Março 2026",
            "location": "Centro Espírita São Paulo",
            "release_start_at": "2026-03-15T18:00:00Z",
            "release_end_at": "2026-03-15T23:59:59Z",
            "max_tickets": 500,
            "current_tickets": 342,
            "tickets_available": 158,
            "is_open": true
        }

    Errors:
        404 Not Found: Tenant not found or no gira scheduled
        429 Too Many Requests: Rate limited (future)
    """

    try:
        # Find tenant by slug
        tenant_query = select(Tenant).where(
            Tenant.slug == tenant_slug.lower().strip()
        )
        tenant_result = await session.execute(tenant_query)
        tenant = tenant_result.scalar_one_or_none()

        if not tenant:
            raise HTTPException(
                status_code=404,
                detail=f"Tenant '{tenant_slug}' not found",
            )

        # Find next active/upcoming gira
        now = datetime.utcnow()
        gira_query = (
            select(Gira)
            .where(
                and_(
                    Gira.tenant_id == tenant.id,
                    Gira.release_end_at >= now,  # Not expired
                    Gira.status == "ACTIVE",
                )
            )
            .order_by(Gira.release_start_at.asc())
            .limit(1)
        )
        gira_result = await session.execute(gira_query)
        gira = gira_result.scalar_one_or_none()

        if not gira:
            raise HTTPException(
                status_code=404,
                detail="No active gira scheduled for this tenant",
            )

        # Get current ticket count for this gira
        senha_control_query = select(SenhaControl).where(
            and_(
                SenhaControl.tenant_id == tenant.id,
                SenhaControl.gira_id == gira.id,
            )
        )
        senha_result = await session.execute(senha_control_query)
        senha_control = senha_result.scalar_one_or_none()

        current_tickets = senha_control.current_number if senha_control else 0

        # Build response
        gira_dto = GiraDTO(
            id=gira.id,
            name=gira.name,
            location=gira.location,
            release_start_at=gira.release_start_at.isoformat(),
            release_end_at=gira.release_end_at.isoformat(),
            max_tickets=gira.max_tickets,
            current_tickets=current_tickets,
        )

        return gira_dto.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}",
        )
