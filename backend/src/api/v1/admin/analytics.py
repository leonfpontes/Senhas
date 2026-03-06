"""T064: Admin Analytics - GET /api/v1/admin/analytics (emissões/dia, taxa sucesso, etc)"""
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from uuid import UUID

from src.core.database import get_db
from src.models import User
from src.repositories.ticket_analytics_repo import TicketAnalyticsRepository
from src.api.dependencies import get_current_user
from src.core.errors import InsufficientPermissionsError

router = APIRouter(prefix="/api/v1/admin", tags=["admin-analytics"])


class AnalyticsDayData(BaseModel):
    """Daily analytics data."""
    date: str
    total: int
    completed: int


class AnalyticsResponse(BaseModel):
    """Analytics response."""
    total_emitted: int
    total_used: int
    total_cancelled: int
    usage_rate: float
    emitted_today: int
    used_today: int
    daily_distribution: List[AnalyticsDayData]
    peak_hours: List[Dict[str, Any]]


@router.get("/analytics", response_model=AnalyticsResponse)
async def get_analytics(
    period: str = Query("week", enum=["day", "week", "month", "all"]),
    gira_id: Optional[UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalyticsResponse:
    """Get analytics dashboard data.
    
    Requires admin role.
    
    Query parameters:
    - period: day, week, month, or all
    - gira_id: Optional gira filter
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")
    
    repo = TicketAnalyticsRepository(db)
    
    # Determine lookback days
    days_map = {
        "day": 1,
        "week": 7,
        "month": 30,
        "all": 365,
    }
    days = days_map.get(period, 7)
    
    # Get statistics
    total_stats = await repo.get_total_stats(
        tenant_id=current_user.tenant_id,
        gira_id=gira_id,
    )
    
    today_stats = await repo.get_today_stats(
        tenant_id=current_user.tenant_id,
        gira_id=gira_id,
    )
    
    daily_distribution = await repo.get_daily_distribution(
        tenant_id=current_user.tenant_id,
        days=days,
        gira_id=gira_id,
    )
    
    peak_hours = await repo.get_peak_hours(
        tenant_id=current_user.tenant_id,
        gira_id=gira_id,
        days=days,
    )
    
    return AnalyticsResponse(
        total_emitted=total_stats["total_emitted"],
        total_used=total_stats["total_used"],
        total_cancelled=total_stats["total_cancelled"],
        usage_rate=total_stats["usage_rate"],
        emitted_today=today_stats["emitted_today"],
        used_today=today_stats["used_today"],
        daily_distribution=[
            AnalyticsDayData(**d) for d in daily_distribution
        ],
        peak_hours=peak_hours,
    )
