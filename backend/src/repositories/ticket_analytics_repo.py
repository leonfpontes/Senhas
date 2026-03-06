"""T054: TicketAnalyticsRepository - Aggregations and analytics queries."""
from typing import Dict, List, Optional
from uuid import UUID
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc
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
    
    async def get_total_stats(self, tenant_id: UUID, gira_id: Optional[UUID] = None) -> Dict:
        """Get overall ticket statistics.
        
        Args:
            tenant_id: Tenant ID
            gira_id: Optional gira filter
            
        Returns:
            Dict with total_emitted, total_used, usage_rate, etc.
        """
        where_clause = Ticket.tenant_id == tenant_id
        if gira_id:
            where_clause = and_(where_clause, Ticket.gira_id == gira_id)
        
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
    
    async def get_daily_distribution(
        self,
        tenant_id: UUID,
        days: int = 30,
        gira_id: Optional[UUID] = None,
    ) -> List[Dict]:
        """Get ticket distribution by day (last N days).
        
        Args:
            tenant_id: Tenant ID
            days: Number of days to look back
            gira_id: Optional gira filter
            
        Returns:
            List of dicts with date, count, status_breakdown
        """
        from datetime import datetime
        
        start_date = datetime.utcnow() - timedelta(days=days)
        
        where_clause = and_(
            Ticket.tenant_id == tenant_id,
            Ticket.created_at >= start_date,
        )
        
        if gira_id:
            where_clause = and_(where_clause, Ticket.gira_id == gira_id)
        
        # Query daily breakdown
        stmt = select(
            func.date(Ticket.created_at).label("date"),
            func.count(Ticket.id).label("total"),
            func.sum(func.cast(Ticket.status == TicketStatus.COMPLETED, func.Integer)).label("completed"),
        ).where(where_clause).group_by(func.date(Ticket.created_at)).order_by("date")
        
        result = await self.db.execute(stmt)
        rows = result.all()
        
        return [
            {
                "date": row[0].isoformat() if row[0] else None,
                "total": row[1] or 0,
                "completed": row[2] or 0,
            }
            for row in rows
        ]
    
    async def get_today_stats(self, tenant_id: UUID, gira_id: Optional[UUID] = None) -> Dict:
        """Get today's ticket statistics.
        
        Args:
            tenant_id: Tenant ID
            gira_id: Optional gira filter
            
        Returns:
            Dict with today's emitted, completed counts
        """
        from datetime import datetime
        
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)
        
        where_clause = and_(
            Ticket.tenant_id == tenant_id,
            Ticket.created_at >= today_start,
            Ticket.created_at < today_end,
        )
        
        if gira_id:
            where_clause = and_(where_clause, Ticket.gira_id == gira_id)
        
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
        tenant_id: UUID,
        gira_id: Optional[UUID] = None,
        days: int = 7,
    ) -> List[Dict]:
        """Get peak emission hours/days.
        
        Args:
            tenant_id: Tenant ID
            gira_id: Optional gira filter
            days: Number of days to analyze
            
        Returns:
            List of hour/count tuples sorted by count desc
        """
        start_date = datetime.utcnow() - timedelta(days=days)
        
        where_clause = and_(
            Ticket.tenant_id == tenant_id,
            Ticket.created_at >= start_date,
        )
        
        if gira_id:
            where_clause = and_(where_clause, Ticket.gira_id == gira_id)
        
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
