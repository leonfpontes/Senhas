"""Admin Dashboard Summary — aggregated endpoint for the dashboard home."""
import logging
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.models import User
from src.models.giras import Gira
from src.models.senha_controls import SenhaControl
from src.models.subscriptions import PlanType
from src.api.dependencies import get_current_user
from src.core.errors import InsufficientPermissionsError
from src.repositories.ticket_analytics_repo import TicketAnalyticsRepository
from src.repositories.gira_repo import GiraRepository
from src.repositories.subscription_repo import SubscriptionRepository

router = APIRouter(prefix="/api/v1/admin", tags=["admin-dashboard"])
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Plan tier — reused from subscription_info
# ---------------------------------------------------------------------------
_PLAN_TIER = {
    PlanType.FREE: 0,
    PlanType.BASIC: 1,
    PlanType.PRO: 2,
    PlanType.PREMIUM: 3,
}


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------
class UpcomingGiraItem(BaseModel):
    id: str
    nome: str
    data_inicio: str
    max_tickets: Optional[int] = None
    current_count: int = 0
    sponsor_count: int = 0
    is_open: bool = False


class TicketStats(BaseModel):
    total_emitted: int = 0
    total_used: int = 0
    total_cancelled: int = 0
    usage_rate: float = 0.0
    emitted_today: int = 0
    used_today: int = 0
    walk_in_total: int = 0


class DailyDistItem(BaseModel):
    date: str
    total: int = 0
    common: int = 0
    sponsor: int = 0
    walk_in: int = 0


class PeakHourItem(BaseModel):
    hour: int
    count: int = 0


class EstoqueAlertItem(BaseModel):
    item_id: str
    item_nome: str
    grupo_nome: Optional[str] = None
    unidade_medida: str = "UN"
    saldo: int = 0
    estoque_minimo: int = 0
    status: str = "ok"


class EstoqueSummary(BaseModel):
    total_itens: int = 0
    total_grupos: int = 0
    itens_ok: int = 0
    itens_atencao: int = 0
    itens_critico: int = 0


class PlanBadge(BaseModel):
    name: str = "free"
    label: str = "Free"
    status: str = "active"


class DashboardSummaryResponse(BaseModel):
    upcoming_giras: List[UpcomingGiraItem] = []
    ticket_stats: TicketStats = TicketStats()
    daily_distribution: List[DailyDistItem] = []
    peak_hours: List[PeakHourItem] = []
    estoque_alerts: List[EstoqueAlertItem] = []
    estoque_summary: Optional[EstoqueSummary] = None
    plan: PlanBadge = PlanBadge()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _get_upcoming_giras(
    db: AsyncSession, tenant_id: UUID, limit: int = 3
) -> List[UpcomingGiraItem]:
    """Get next upcoming giras with their ticket counts."""
    gira_repo = GiraRepository(db)
    giras = await gira_repo.get_upcoming_giras(tenant_id, limit=limit)

    if not giras:
        return []

    # Fetch current ticket counts: regular (non-sponsor) and sponsor
    gira_ids = [g.id for g in giras]
    stmt = (
        select(SenhaControl.gira_id, SenhaControl.total_emitido, SenhaControl.slots_returned, SenhaControl.is_sponsor)
        .where(
            and_(
                SenhaControl.tenant_id == tenant_id,
                SenhaControl.gira_id.in_(gira_ids),
            )
        )
    )
    rows = (await db.execute(stmt)).all()
    count_map: Dict[UUID, int] = {}
    sponsor_map: Dict[UUID, int] = {}
    for row in rows:
        net_count = max(0, row.total_emitido - row.slots_returned)
        if row.is_sponsor:
            sponsor_map[row.gira_id] = sponsor_map.get(row.gira_id, 0) + net_count
        else:
            count_map[row.gira_id] = count_map.get(row.gira_id, 0) + net_count

    now = datetime.now(timezone.utc)
    result = []
    for g in giras:
        is_open = False
        if g.release_start_at and g.release_end_at:
            is_open = g.release_start_at <= now <= g.release_end_at
        result.append(
            UpcomingGiraItem(
                id=str(g.id),
                nome=g.nome,
                data_inicio=g.data_inicio.isoformat(),
                max_tickets=g.max_tickets,
                current_count=count_map.get(g.id, 0),
                sponsor_count=sponsor_map.get(g.id, 0),
                is_open=is_open,
            )
        )
    return result


async def _get_estoque_data(
    db: AsyncSession, tenant_id: UUID, has_estoque: bool
) -> tuple[List[EstoqueAlertItem], Optional[EstoqueSummary]]:
    """Get stock alerts and summary. Returns empty if feature is not enabled."""
    if not has_estoque:
        return [], None

    # Lazy import to avoid circular deps when estoque module is not used
    from src.repositories.estoque_repo import (
        EstoqueGrupoRepository,
        EstoqueMovimentacaoRepository,
    )

    mov_repo = EstoqueMovimentacaoRepository(db)
    grupo_repo = EstoqueGrupoRepository(db)

    posicao = await mov_repo.get_posicao_estoque(tenant_id)
    grupos = await grupo_repo.list_all(tenant_id)

    alerts: List[EstoqueAlertItem] = []
    ok_count = atencao_count = critico_count = 0

    for row in posicao:
        item = row["item"]
        saldo = row["saldo"]
        minimo = item.estoque_minimo or 0

        if minimo > 0 and saldo <= 0:
            status = "critico"
            critico_count += 1
        elif minimo > 0 and saldo <= minimo:
            status = "atencao"
            atencao_count += 1
        else:
            status = "ok"
            ok_count += 1

        if status in ("critico", "atencao"):
            alerts.append(
                EstoqueAlertItem(
                    item_id=str(item.id),
                    item_nome=item.nome,
                    grupo_nome=item.grupo.nome if item.grupo else None,
                    unidade_medida=item.unidade_medida or "UN",
                    saldo=saldo,
                    estoque_minimo=minimo,
                    status=status,
                )
            )

    summary = EstoqueSummary(
        total_itens=len(posicao),
        total_grupos=len(grupos),
        itens_ok=ok_count,
        itens_atencao=atencao_count,
        itens_critico=critico_count,
    )

    # Sort: critico first, then atencao
    alerts.sort(key=lambda a: (0 if a.status == "critico" else 1, a.item_nome))

    return alerts, summary


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.get("/dashboard-summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardSummaryResponse:
    """Aggregated dashboard data for the admin home page.

    Returns upcoming giras, ticket KPIs, daily distribution (7 days),
    peak hours, stock alerts, and plan badge — all in a single request.
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    tenant_id = current_user.tenant_id
    analytics_repo = TicketAnalyticsRepository(db)
    sub_repo = SubscriptionRepository(db)

    step = "get_subscription"
    try:
        # Determine plan info + feature flags
        sub = await sub_repo.get_by_tenant(tenant_id)
        plan_type = sub.plan if sub else PlanType.FREE
        tier = _PLAN_TIER.get(plan_type, 0)
        has_estoque = tier >= 2

        plan_badge = PlanBadge(
            name=plan_type.value if hasattr(plan_type, "value") else str(plan_type),
            label={"free": "Free", "basic": "Basic", "pro": "Pro", "premium": "Premium"}.get(
                plan_type.value if hasattr(plan_type, "value") else "free", "Free"
            ),
            status=sub.status.value if sub else "active",
        )

        step = "get_upcoming_giras"
        upcoming_giras = await _get_upcoming_giras(db, tenant_id, limit=3)

        step = "get_total_stats"
        total_stats = await analytics_repo.get_total_stats(tenant_id=tenant_id)

        step = "get_today_stats"
        today_stats = await analytics_repo.get_today_stats(tenant_id=tenant_id)

        step = "get_daily_distribution"
        daily_dist = await analytics_repo.get_daily_distribution(tenant_id=tenant_id, days=7)

        step = "get_category_breakdown"
        category_bkdn = await analytics_repo.get_category_breakdown(tenant_id=tenant_id)

        step = "get_peak_hours"
        peak_hours = await analytics_repo.get_peak_hours(tenant_id=tenant_id, days=7)

        step = "get_estoque_data"
        estoque_result = await _get_estoque_data(db, tenant_id, has_estoque)
        estoque_alerts, estoque_summary = estoque_result

        ticket_stats = TicketStats(
            total_emitted=total_stats["total_emitted"],
            total_used=total_stats["total_used"],
            total_cancelled=total_stats["total_cancelled"],
            usage_rate=total_stats["usage_rate"],
            emitted_today=today_stats["emitted_today"],
            used_today=today_stats["used_today"],
            walk_in_total=category_bkdn.get("walk_in", 0),
        )

        return DashboardSummaryResponse(
            upcoming_giras=upcoming_giras,
            ticket_stats=ticket_stats,
            daily_distribution=[DailyDistItem(**d) for d in daily_dist],
            peak_hours=[PeakHourItem(**h) for h in peak_hours[:5]],
            estoque_alerts=estoque_alerts,
            estoque_summary=estoque_summary,
            plan=plan_badge,
        )

    except Exception as exc:
        tb = traceback.format_exc()
        logger.error("dashboard-summary FAILED at step=%s | %s\n%s", step, exc, tb)
        raise
