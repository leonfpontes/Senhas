"""Números de uso para a landing (V-02): só totais agregados, nunca dado de terreiro.

``GET /api/v1/public/stats`` → senhas emitidas, giras realizadas e terreiros ativos, somados
entre todos os tenants (cross-tenant intencional — isenção justificada no
``scripts/audit_tenant_isolation.py``). O tenant de demonstração ``terreiro-modelo`` fica de
fora: o seed de 6 meses dele inflaria os números. Cache em memória de 1 h por worker; o front
só exibe cada número acima de um mínimo (``frontend/src/constants/landingStats.ts``).
"""
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.limiter import limiter
from src.models.giras import Gira
from src.models.tenants import Tenant
from src.models.tickets import Ticket, TicketStatus

router = APIRouter(prefix="/api/v1/public", tags=["public"])

DEMO_TENANT_SLUG = "terreiro-modelo"
CACHE_TTL_SECONDS = 3600
# Senha que não chegou a valer: cancelada ou ainda na fila de espera.
_NAO_CONTAM = (TicketStatus.CANCELLED, TicketStatus.WAITLISTED)


class PublicStats(BaseModel):
    senhas_emitidas: int
    giras_realizadas: int
    terreiros_ativos: int


_cache: dict[str, tuple[float, PublicStats]] = {}


def _tenant_publico():
    """Terreiro que conta: não apagado, ativo, não auto-desativado e não é o demo."""
    return (
        Tenant.deleted_at.is_(None),
        Tenant.is_active.is_(True),
        Tenant.self_deactivated_at.is_(None),
        Tenant.slug != DEMO_TENANT_SLUG,
    )


async def _compute_stats(db: AsyncSession) -> PublicStats:
    senhas = await db.scalar(
        select(func.count(Ticket.id))
        .join(Tenant, Tenant.id == Ticket.tenant_id)
        .where(
            Ticket.deleted_at.is_(None),
            Ticket.is_acompanhante.is_(False),
            Ticket.status.not_in(_NAO_CONTAM),
            *_tenant_publico(),
        )
    )
    giras = await db.scalar(
        select(func.count(Gira.id))
        .join(Tenant, Tenant.id == Gira.tenant_id)
        .where(Gira.deleted_at.is_(None), Gira.data_inicio < datetime.now(timezone.utc), *_tenant_publico())
    )
    terreiros = await db.scalar(select(func.count(Tenant.id)).where(*_tenant_publico()))
    return PublicStats(senhas_emitidas=senhas or 0, giras_realizadas=giras or 0, terreiros_ativos=terreiros or 0)


@router.get("/stats", response_model=PublicStats)
@limiter.limit("60/minute")
async def get_public_stats(request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> PublicStats:
    now = time.monotonic()
    hit = _cache.get("stats")
    if hit and now - hit[0] < CACHE_TTL_SECONDS:
        stats = hit[1]
    else:
        stats = await _compute_stats(db)
        _cache["stats"] = (now, stats)
    response.headers["Cache-Control"] = f"public, max-age={CACHE_TTL_SECONDS}"
    return stats
