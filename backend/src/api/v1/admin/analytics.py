"""T064: Admin Analytics - GET /api/v1/admin/analytics (emissões/dia, taxa sucesso, etc)"""
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import date, datetime, timedelta

from src.core.database import get_db
from src.models import User, PermissionFeature
from src.repositories.ticket_analytics_repo import TicketAnalyticsRepository
from src.api.dependencies import get_current_user, require_group_permission
from src.core.errors import InsufficientPermissionsError

router = APIRouter(prefix="/api/v1/admin", tags=["admin-analytics"])


class AnalyticsDayData(BaseModel):
    """Daily analytics data."""
    date: str
    total: int
    completed: int
    common: int = 0
    sponsor: int = 0
    walk_in: int = 0


class CategoryBreakdown(BaseModel):
    common: int = 0
    sponsor: int = 0
    walk_in: int = 0


class AnalyticsResponse(BaseModel):
    """Analytics response."""
    total_emitted: int
    total_used: int
    total_cancelled: int
    usage_rate: float
    emitted_today: int
    used_today: int
    walk_in_total: int
    daily_distribution: List[AnalyticsDayData]
    peak_hours: List[Dict[str, Any]]
    category_breakdown: CategoryBreakdown


@router.get("/analytics", response_model=AnalyticsResponse, dependencies=[Depends(require_group_permission(PermissionFeature.ANALYTICS, "view"))])
async def get_analytics(
    date_from: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    gira_id: Optional[UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalyticsResponse:
    """Get analytics dashboard data.
    
    Requires admin role.
    
    Query parameters:
    - date_from: Start date (defaults to 30 days ago)
    - date_to: End date (defaults to today)
    - gira_id: Optional gira filter
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")
    
    repo = TicketAnalyticsRepository(db)
    
    # Default to last 30 days
    if date_to is None:
        date_to = date.today()
    if date_from is None:
        date_from = date_to - timedelta(days=30)
    
    dt_from = datetime.combine(date_from, datetime.min.time())
    dt_to = datetime.combine(date_to, datetime.max.time())
    
    # Get statistics
    total_stats = await repo.get_total_stats(
        tenant_id=current_user.tenant_id,
        gira_id=gira_id,
        date_from=dt_from,
        date_to=dt_to,
    )
    
    today_stats = await repo.get_today_stats(
        tenant_id=current_user.tenant_id,
        gira_id=gira_id,
    )
    
    daily_distribution = await repo.get_daily_distribution(
        tenant_id=current_user.tenant_id,
        gira_id=gira_id,
        date_from=dt_from,
        date_to=dt_to,
    )

    category_breakdown = await repo.get_category_breakdown(
        tenant_id=current_user.tenant_id,
        gira_id=gira_id,
        date_from=dt_from,
        date_to=dt_to,
    )
    
    peak_hours = await repo.get_peak_hours(
        tenant_id=current_user.tenant_id,
        gira_id=gira_id,
        date_from=dt_from,
        date_to=dt_to,
    )
    
    return AnalyticsResponse(
        total_emitted=total_stats["total_emitted"],
        total_used=total_stats["total_used"],
        total_cancelled=total_stats["total_cancelled"],
        usage_rate=total_stats["usage_rate"],
        emitted_today=today_stats["emitted_today"],
        used_today=today_stats["used_today"],
        walk_in_total=category_breakdown["walk_in"],
        daily_distribution=[
            AnalyticsDayData(**d) for d in daily_distribution
        ],
        peak_hours=peak_hours,
        category_breakdown=CategoryBreakdown(**category_breakdown),
    )
