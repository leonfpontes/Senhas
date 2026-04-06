"""Platform API - Health check endpoint (no auth required)."""
import time
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db

router = APIRouter(prefix="/api/v1/platform/health", tags=["platform-health"])


@router.get("")
async def health_check(db: AsyncSession = Depends(get_db)) -> dict:
    """Check service health status.

    No authentication required — intended for external monitoring.
    Returns database latency and overall API availability.
    """
    db_status = "ok"
    db_latency_ms: float = 0.0

    try:
        t0 = time.monotonic()
        await db.execute(text("SELECT 1"))
        db_latency_ms = round((time.monotonic() - t0) * 1000, 2)
    except Exception:
        db_status = "error"

    return {
        "database": {
            "status": db_status,
            "latency_ms": db_latency_ms,
        },
        "api": {
            "status": "ok",
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    }
