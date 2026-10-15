"""Platform API - Public system status endpoint.

Returns real-time health of each service component. No authentication
required — intended for the public /status page.

Sem histórico (pentest L9): antes a página mostrava 90 dias de barras e um
"% no ar" derivados de "teve auditoria/senha emitida nesse dia" — isso não mede
disponibilidade (dia sem uso virava "sem dados" e o percentual dava sempre 100%)
e expunha publicamente o ritmo de uso da plataforma. Disponibilidade de verdade
vem do monitor externo (Sentry Uptime / .github/workflows/monitor.yml).
"""
import time
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db

router = APIRouter(prefix="/api/v1/platform/status", tags=["platform-status"])


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


@router.get("")
async def get_status(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Return the current public status of each component (no history)."""
    db_health = await _check_db(db)

    components = [
        {
            "name": "API",
            "description": "Endpoints de autenticação, admin e platform",
            "status": "operational",
        },
        {
            "name": "Banco de Dados",
            "description": "PostgreSQL — armazenamento principal",
            "status": db_health["status"],
            "latency_ms": db_health.get("latency_ms"),
        },
        {
            "name": "Emissão de Senhas",
            "description": "API pública de emissão e reenvio de senhas",
            # A emissão depende do banco: sem banco, não há senha.
            "status": "operational" if db_health["status"] != "outage" else "outage",
        },
    ]

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
