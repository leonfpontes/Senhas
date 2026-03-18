"""ConsolidatedAuditService - Cross-tenant audit aggregation and reporting (T103)."""
from typing import Dict, Any, List, Optional
from uuid import UUID
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from ..repositories.consolidated_audit_repo import ConsolidatedAuditRepository


class ConsolidatedAuditService:
    """Service for platform-wide audit log queries.
    
    Handles:
    - Cross-tenant audit aggregation
    - Summary statistics
    - Compliance reporting
    - Activity trends
    - SUPER_ADMIN reporting
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = ConsolidatedAuditRepository(db)
    
    async def get_audit_summary(
        self,
        start_date: datetime,
        end_date: datetime,
    ) -> Dict[str, Any]:
        """Get consolidated audit summary for date range.
        
        Args:
            start_date: Start datetime
            end_date: End datetime
            
        Returns:
            Summary dict with aggregated statistics
        """
        summary = await self.repo.get_summary(start_date, end_date)
        
        return {
            "total": summary["total"],
            "by_tenant": self._format_tenant_stats(summary["by_tenant"]),
            "by_action": summary["by_action"],
            "by_user": self._format_user_stats(summary["by_user"]),
            "period": summary["period"],
            "statistics": {
                "avg_logs_per_tenant": self._calculate_avg_per_tenant(summary["by_tenant"]),
                "most_active_tenant": self._get_most_active(summary["by_tenant"]),
                "most_common_action": self._get_most_common_action(summary["by_action"]),
            },
        }
    
    async def get_tenant_activity(
        self,
        tenant_id: UUID,
        start_date: datetime,
        end_date: datetime,
        skip: int = 0,
        limit: int = 1000,
    ) -> Dict[str, Any]:
        """Get audit activity for specific tenant.
        
        Args:
            tenant_id: Tenant ID
            start_date: Start datetime
            end_date: End datetime
            skip: Pagination offset
            limit: Pagination limit
            
        Returns:
            Audit logs and stats
        """
        logs = await self.repo.get_range(start_date, end_date, skip, limit)
        
        # Filter to tenant
        tenant_logs = [log for log in logs if log.tenant_id == tenant_id]
        
        return {
            "tenant_id": str(tenant_id),
            "total": len(tenant_logs),
            "logs": [self._audit_log_to_dict(log) for log in tenant_logs],
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
        }
    
    async def get_user_activity(
        self,
        user_id: UUID,
        start_date: datetime,
        end_date: datetime,
        skip: int = 0,
        limit: int = 1000,
    ) -> Dict[str, Any]:
        """Get audit logs for specific user across all tenants.
        
        Args:
            user_id: User ID
            start_date: Start datetime
            end_date: End datetime
            skip: Pagination offset
            limit: Pagination limit
            
        Returns:
            Audit logs for user
        """
        logs = await self.repo.get_range(start_date, end_date, skip, limit)
        
        # Filter to user
        user_logs = [log for log in logs if log.user_id == user_id]
        
        return {
            "user_id": str(user_id),
            "total": len(user_logs),
            "logs": [self._audit_log_to_dict(log) for log in user_logs],
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
        }
    
    async def get_action_trends(
        self,
        start_date: datetime,
        end_date: datetime,
    ) -> Dict[str, Any]:
        """Get trends by action type.
        
        Args:
            start_date: Start datetime
            end_date: End datetime
            
        Returns:
            Action trends
        """
        by_action = await self.repo.count_by_action(start_date, end_date)
        
        return {
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
            "by_action": by_action,
            "top_actions": sorted(
                by_action.items(),
                key=lambda x: x[1],
                reverse=True,
            )[:10],
        }
    
    async def get_tenant_trends(
        self,
        start_date: datetime,
        end_date: datetime,
    ) -> Dict[str, Any]:
        """Get trends by tenant.
        
        Args:
            start_date: Start datetime
            end_date: End datetime
            
        Returns:
            Tenant trends
        """
        by_tenant = await self.repo.count_by_tenant(start_date, end_date)
        
        return {
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
            "total_tenants": len(by_tenant),
            "by_tenant": {str(k): v for k, v in by_tenant.items()},
            "top_tenants": sorted(
                [(str(k), v) for k, v in by_tenant.items()],
                key=lambda x: x[1],
                reverse=True,
            )[:10],
        }
    
    async def export_audit_logs(
        self,
        start_date: datetime,
        end_date: datetime,
        format_type: str = "json",
    ) -> List[Dict[str, Any]]:
        """Export audit logs for compliance/archiving.
        
        Args:
            start_date: Start datetime
            end_date: End datetime
            format_type: Export format (json, csv - currently json only)
            
        Returns:
            List of audit logs as dicts
        """
        logs = await self.repo.get_range(
            start_date,
            end_date,
            skip=0,
            limit=999999,
        )
        
        return [self._audit_log_to_dict(log) for log in logs]
    
    def _format_tenant_stats(self, by_tenant: Dict) -> Dict[str, int]:
        """Format tenant statistics with string keys.
        
        Args:
            by_tenant: Dict with UUID keys
            
        Returns:
            Dict with string UUID keys
        """
        return {str(k): v for k, v in by_tenant.items()}
    
    def _format_user_stats(self, by_user: Dict) -> Dict[str, int]:
        """Format user statistics with string keys.
        
        Args:
            by_user: Dict with UUID keys
            
        Returns:
            Dict with string UUID keys
        """
        return {str(k): v for k, v in by_user.items()}
    
    def _calculate_avg_per_tenant(self, by_tenant: Dict) -> float:
        """Calculate average logs per tenant.
        
        Args:
            by_tenant: Dict of counts by tenant
            
        Returns:
            Average count
        """
        if not by_tenant:
            return 0.0
        return sum(by_tenant.values()) / len(by_tenant)
    
    def _get_most_active(self, by_tenant: Dict) -> Optional[tuple]:
        """Get most active tenant.
        
        Args:
            by_tenant: Dict of counts by tenant
            
        Returns:
            Tuple of (tenant_id_str, count) or None
        """
        if not by_tenant:
            return None
        max_tenant = max(by_tenant.items(), key=lambda x: x[1])
        return (str(max_tenant[0]), max_tenant[1])
    
    def _get_most_common_action(self, by_action: Dict) -> Optional[tuple]:
        """Get most common action.
        
        Args:
            by_action: Dict of counts by action
            
        Returns:
            Tuple of (action, count) or None
        """
        if not by_action:
            return None
        return max(by_action.items(), key=lambda x: x[1])
    
    def _audit_log_to_dict(self, log) -> Dict[str, Any]:
        """Convert audit log to dict.
        
        Args:
            log: AuditLog object
            
        Returns:
            Dict representation
        """
        return {
            "id": str(log.id),
            "tenant_id": str(log.tenant_id) if log.tenant_id else None,
            "user_id": str(log.user_id) if log.user_id else None,
            "action": log.action.value,
            "resource_type": log.resource_type,
            "resource_id": str(log.resource_id) if log.resource_id else None,
            "details": log.details,
            "created_at": log.created_at.isoformat(),
        }
