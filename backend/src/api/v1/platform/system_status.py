"""Platform API - Public system status endpoint.

Returns real-time health of each service component plus a 90-day
operational history derived from audit_logs activity.

No authentication required — intended for the public /status page.
"""
import time
from datetime import datetime, timezone, timedelta, date
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select, func, and_, text, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.models.audit_logs import AuditLog
from src.models.tickets import Ticket

router = APIRouter(prefix="/api/v1/platform/status", tags=["platform-status"])

# How many history bars (days) to show
HISTORY_DAYS = 90


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _date_range(days: int) -> list[date]:
    today = datetime.now(timezone.utc).date()
    return [today - timedelta(days=i) for i in range(days - 1, -1, -1)]


async def _check_db(db: AsyncSession) -> dict[str, Any]:
    """Real-time DB health check with latency."""
    try:
        t0 = time.monotonic()
        await db.execute(text("SELECT 1"))
        latency_ms = round((time.monotonic() - t0) * 1000, 2)
        if latency_ms > 500:
            return {"status": "degraded", "latency_ms": latency_ms}
        return {"status": "operational", "latency_ms": latency_ms}
    except Exception:
        return {"status": "outage", "latency_ms": None}


async def _audit_log_days(db: AsyncSession) -> set[date]:
    """Return set of dates that have at least one audit_log entry (system was active)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=HISTORY_DAYS)
    result = await db.execute(
        select(func.date(AuditLog.created_at).label("day"))
        .where(AuditLog.created_at >= cutoff)
        .distinct()
    )
    return {row.day for row in result}


async def _ticket_days(db: AsyncSession) -> set[date]:
    """Return set of dates that have at least one ticket emitted (public API was active)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=HISTORY_DAYS)
    result = await db.execute(
        select(func.date(Ticket.created_at).label("day"))
        .where(
            and_(
                Ticket.created_at >= cutoff,
                Ticket.deleted_at.is_(None),
            )
        )
        .distinct()
    )
    return {row.day for row in result}


def _build_history(active_days: set[date], all_days: list[date]) -> list[dict[str, str]]:
    """Map each day to operational/unknown status."""
    today = datetime.now(timezone.utc).date()
    history = []
    for d in all_days:
        if d > today:
            status = "unknown"
        elif d in active_days:
            status = "operational"
        else:
            status = "unknown"
        history.append({"date": d.isoformat(), "status": status})
    return history


def _uptime_pct(history: list[dict], days: int = 30) -> float:
    """Calculate uptime % over the last `days` entries."""
    window = history[-days:]
    operational = sum(1 for h in window if h["status"] == "operational")
    denom = sum(1 for h in window if h["status"] != "unknown")
    if denom == 0:
        return 100.0
    return round(operational / denom * 100, 2)


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.get("")
async def get_status(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Return public system status for all components.

    History is derived from audit_logs and tickets activity:
    - A day with any audit_log entry → operational
    - A day with any ticket emitted → public API operational
    - Days with no recorded activity → unknown (grey)
    """
    all_days = _date_range(HISTORY_DAYS)

    # Sequential — asyncpg does not support concurrent ops on the same connection
    db_health = await _check_db(db)
    audit_days = await _audit_log_days(db)
    ticket_days = await _ticket_days(db)

    # API history: union of audit + ticket days (if we got any request, system was up)
    api_active = audit_days | ticket_days
    api_history = _build_history(api_active, all_days)

    # DB history: same signal (if DB was used, it was operational)
    db_history = _build_history(audit_days | ticket_days, all_days)

    # Public API (emissão) history: based on ticket activity only
    emission_history = _build_history(ticket_days, all_days)

    components = [
        {
            "name": "API",
            "description": "Endpoints de autenticação, admin e platform",
            "status": "operational",
            "uptime_30d": _uptime_pct(api_history, 30),
            "uptime_90d": _uptime_pct(api_history, 90),
            "history": api_history,
        },
        {
            "name": "Banco de Dados",
            "description": "PostgreSQL — armazenamento principal",
            "status": db_health["status"],
            "latency_ms": db_health.get("latency_ms"),
            "uptime_30d": _uptime_pct(db_history, 30),
            "uptime_90d": _uptime_pct(db_history, 90),
            "history": db_history,
        },
        {
            "name": "Emissão de Senhas",
            "description": "API pública de emissão e reenvio de senhas",
            "status": "operational",
            "uptime_30d": _uptime_pct(emission_history, 30),
            "uptime_90d": _uptime_pct(emission_history, 90),
            "history": emission_history,
        },
    ]

    # Overall status: degraded if any component is degraded/outage
    statuses = {c["status"] for c in components}
    if "outage" in statuses:
        overall = "outage"
    elif "degraded" in statuses:
        overall = "degraded"
    else:
        overall = "operational"

    return {
        "overall": overall,
        "components": components,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
