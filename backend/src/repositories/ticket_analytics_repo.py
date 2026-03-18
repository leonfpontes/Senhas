"""T054: TicketAnalyticsRepository - Aggregations and analytics queries."""
from typing import Dict, List, Optional
from uuid import UUID
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc, Integer, case
from sqlalchemy.sql import text

from ..models import Ticket, TicketStatus, Gira


class TicketAnalyticsRepository:
    """Repository for ticket analytics and aggregations.
    
    Provides statistical queries:
    - Total emitted/used counts
    - Daily distribution
    - Success rates
    - Performance metrics
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db

    def _build_conditions(
        self,
        tenant_id: Optional[UUID] = None,
        gira_id: Optional[UUID] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ):
        conditions = []
        if tenant_id is not None:
            conditions.append(Ticket.tenant_id == tenant_id)
        if gira_id:
            conditions.append(Ticket.gira_id == gira_id)
        if date_from:
            conditions.append(Ticket.created_at >= date_from)
        if date_to:
            conditions.append(Ticket.created_at <= date_to)
        return conditions
    
    async def get_total_stats(self, tenant_id: Optional[UUID] = None, gira_id: Optional[UUID] = None, date_from: Optional[datetime] = None, date_to: Optional[datetime] = None) -> Dict:
        """Get overall ticket statistics.
        
        Args:
            tenant_id: Tenant ID (None for cross-tenant/SUPER_ADMIN)
            gira_id: Optional gira filter
            date_from: Optional start date filter
            date_to: Optional end date filter
            
        Returns:
            Dict with total_emitted, total_used, usage_rate, etc.
        """
        conditions = self._build_conditions(tenant_id, gira_id, date_from, date_to)
        where_clause = and_(*conditions) if conditions else True
        
        # Count total emitted
        stmt_emitted = select(func.count(Ticket.id)).where(where_clause)
        result_emitted = await self.db.execute(stmt_emitted)
        total_emitted = result_emitted.scalar_one() or 0
        
        # Count completed/used tickets
        stmt_used = select(func.count(Ticket.id)).where(
            and_(
                where_clause,
                Ticket.status.in_([TicketStatus.COMPLETED, TicketStatus.CALLED]),
            )
        )
        result_used = await self.db.execute(stmt_used)
        total_used = result_used.scalar_one() or 0
        
        # Calculate usage rate
        usage_rate = (total_used / total_emitted * 100) if total_emitted > 0 else 0
        
        return {
            "total_emitted": total_emitted,
            "total_used": total_used,
            "total_cancelled": total_emitted - total_used,
            "usage_rate": round(usage_rate, 2),
        }

    async def get_category_breakdown(
        self,
        tenant_id: Optional[UUID] = None,
        gira_id: Optional[UUID] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> Dict:
        """Get total emitted split by category."""
        where_clause = and_(*self._build_conditions(tenant_id, gira_id, date_from, date_to))
        stmt = select(
            func.count(Ticket.id).filter(and_(Ticket.is_sponsor.is_(False), Ticket.is_walk_in.is_(False))).label("common"),
            func.count(Ticket.id).filter(Ticket.is_sponsor.is_(True)).label("sponsor"),
            func.count(Ticket.id).filter(Ticket.is_walk_in.is_(True)).label("walk_in"),
        ).where(where_clause)
        result = await self.db.execute(stmt)
        row = result.one()
        return {
            "common": row.common or 0,
            "sponsor": row.sponsor or 0,
            "walk_in": row.walk_in or 0,
        }
    
    async def get_daily_distribution(
        self,
        tenant_id: Optional[UUID] = None,
        days: int = 30,
        gira_id: Optional[UUID] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> List[Dict]:
        """Get ticket distribution by day.
        
        Args:
            tenant_id: Tenant ID (None for cross-tenant/SUPER_ADMIN)
            days: Number of days to look back (fallback if date_from not set)
            gira_id: Optional gira filter
            date_from: Optional start date filter
            date_to: Optional end date filter
            
        Returns:
            List of dicts with date, count, status_breakdown
        """
        from datetime import datetime as dt_module
        
        if date_from is None:
            start_date = dt_module.utcnow() - timedelta(days=days)
        else:
            start_date = date_from
        
        conditions = self._build_conditions(tenant_id, gira_id, start_date, date_to)
        where_clause = and_(*conditions)
        
        # Query daily breakdown
        stmt = select(
            func.date(Ticket.created_at).label("date"),
            func.count(Ticket.id).label("total"),
            func.sum(case((Ticket.status == TicketStatus.COMPLETED, 1), else_=0)).label("completed"),
            func.sum(case((and_(Ticket.is_sponsor.is_(False), Ticket.is_walk_in.is_(False)), 1), else_=0)).label("common"),
            func.sum(case((Ticket.is_sponsor.is_(True), 1), else_=0)).label("sponsor"),
            func.sum(case((Ticket.is_walk_in.is_(True), 1), else_=0)).label("walk_in"),
        ).where(where_clause).group_by(func.date(Ticket.created_at)).order_by("date")
        
        result = await self.db.execute(stmt)
        rows = result.all()
        
        return [
            {
                "date": row[0].isoformat() if row[0] else None,
                "total": row[1] or 0,
                "completed": row[2] or 0,
                "common": row[3] or 0,
                "sponsor": row[4] or 0,
                "walk_in": row[5] or 0,
            }
            for row in rows
        ]
    
    async def get_today_stats(self, tenant_id: Optional[UUID] = None, gira_id: Optional[UUID] = None) -> Dict:
        """Get today's ticket statistics.
        
        Args:
            tenant_id: Tenant ID (None for cross-tenant/SUPER_ADMIN)
            gira_id: Optional gira filter
            
        Returns:
            Dict with today's emitted, completed counts
        """
        from datetime import datetime
        
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)
        
        conditions = [
            Ticket.created_at >= today_start,
            Ticket.created_at < today_end,
        ]
        if tenant_id is not None:
            conditions.append(Ticket.tenant_id == tenant_id)
        if gira_id:
            conditions.append(Ticket.gira_id == gira_id)
        where_clause = and_(*conditions)
        
        # Count emitted today
        stmt_emitted = select(func.count(Ticket.id)).where(where_clause)
        result_emitted = await self.db.execute(stmt_emitted)
        emitted_today = result_emitted.scalar_one() or 0
        
        # Count used today
        stmt_used = select(func.count(Ticket.id)).where(
            and_(
                where_clause,
                Ticket.status == TicketStatus.COMPLETED,
            )
        )
        result_used = await self.db.execute(stmt_used)
        used_today = result_used.scalar_one() or 0
        
        return {
            "emitted_today": emitted_today,
            "used_today": used_today,
        }
    
    async def get_resend_stats(self, tenant_id: UUID, gira_id: Optional[UUID] = None) -> Dict:
        """Get email resend statistics.
        
        Args:
            tenant_id: Tenant ID
            gira_id: Optional gira filter
            
        Returns:
            Dict with resend counts and averages
        """
        # This would need a resend_count field in Ticket model
        # For now, return placeholder
        return {
            "total_resends": 0,
            "avg_resends_per_ticket": 0,
            "resend_rate": 0,
        }
    
    async def get_gira_progress(self, gira_id: UUID, tenant_id: UUID) -> Dict:
        """Get progress stats for a specific gira.
        
        Args:
            gira_id: Gira ID
            tenant_id: Tenant ID
            
        Returns:
            Dict with emitted, used, pending, cancelled
        """
        where_clause = and_(
            Ticket.tenant_id == tenant_id,
            Ticket.gira_id == gira_id,
        )
        
        # All statuses
        stmt = select(
            Ticket.status,
            func.count(Ticket.id).label("count"),
        ).where(where_clause).group_by(Ticket.status)
        
        result = await self.db.execute(stmt)
        rows = result.all()
        
        progress = {
            "emitted": 0,
            "called": 0,
            "completed": 0,
            "cancelled": 0,
            "no_show": 0,
        }
        
        for status, count in rows:
            progress[status.value] = count or 0
        
        return progress
    
    async def get_peak_hours(
        self,
        tenant_id: Optional[UUID] = None,
        gira_id: Optional[UUID] = None,
        days: int = 7,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> List[Dict]:
        """Get peak emission hours/days.
        
        Args:
            tenant_id: Tenant ID (None for cross-tenant/SUPER_ADMIN)
            gira_id: Optional gira filter
            days: Number of days to analyze (fallback if date_from not set)
            date_from: Optional start date filter
            date_to: Optional end date filter
            
        Returns:
            List of hour/count tuples sorted by count desc
        """
        if date_from is None:
            start_date = datetime.utcnow() - timedelta(days=days)
        else:
            start_date = date_from
        
        conditions = self._build_conditions(tenant_id, gira_id, start_date, date_to)
        where_clause = and_(*conditions)
        
        # Group by hour
        stmt = select(
            func.extract("hour", Ticket.created_at).label("hour"),
            func.count(Ticket.id).label("count"),
        ).where(where_clause).group_by("hour").order_by(desc("count"))
        
        result = await self.db.execute(stmt)
        rows = result.all()
        
        return [
            {
                "hour": int(row[0]) if row[0] is not None else 0,
                "count": row[1] or 0,
            }
            for row in rows
        ]
