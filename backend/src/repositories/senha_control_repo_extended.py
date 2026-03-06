"""T055: SenhaControlRepository Extensions - Bulk operations."""
from typing import List, Dict, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, and_

from ..models import SenhaControl, Ticket, TicketStatus
from .senha_control_repo import SenhaControlRepository as BaseSenhaControlRepository


class SenhaControlRepositoryExtended(BaseSenhaControlRepository):
    """Extended SenhaControl repository with bulk operations.
    
    Provides:
    - Bulk reset of counters
    - Bulk ticket status updates
    - Batch operations
    """
    
    async def bulk_mark_used(
        self,
        ticket_ids: List[UUID],
        tenant_id: UUID,
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        """Bulk mark tickets as used/completed.
        
        Args:
            ticket_ids: List of ticket IDs
            tenant_id: Tenant ID (for verification)
            dry_run: If True, don't commit changes
            
        Returns:
            Dict with modified count, failed count, errors
        """
        results = {
            "modified": 0,
            "failed": 0,
            "errors": [],
        }
        
        if not ticket_ids:
            return results
        
        # Verify all tickets belong to tenant
        stmt = select(Ticket).where(
            and_(
                Ticket.tenant_id == tenant_id,
                Ticket.id.in_(ticket_ids),
            )
        )
        
        result = await self.db.execute(stmt)
        tickets = result.scalars().all()
        
        if len(tickets) != len(ticket_ids):
            results["failed"] += len(ticket_ids) - len(tickets)
            results["errors"].append("Some tickets not found or belong to different tenant")
        
        # Update tickets
        for ticket in tickets:
            try:
                if ticket.status == TicketStatus.EMITTED or ticket.status == TicketStatus.CALLED:
                    ticket.status = TicketStatus.COMPLETED
                    from datetime import datetime
                    ticket.finalizado_em = datetime.utcnow()
                    self.db.add(ticket)
                    results["modified"] += 1
            except Exception as e:
                results["failed"] += 1
                results["errors"].append(f"Error marking ticket {ticket.id}: {str(e)}")
        
        if not dry_run:
            await self.db.flush()
        
        return results
    
    async def bulk_cancel(
        self,
        ticket_ids: List[UUID],
        tenant_id: UUID,
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        """Bulk cancel tickets.
        
        Args:
            ticket_ids: List of ticket IDs
            tenant_id: Tenant ID (for verification)
            dry_run: If True, don't commit changes
            
        Returns:
            Dict with modified count, failed count, errors
        """
        results = {
            "modified": 0,
            "failed": 0,
            "errors": [],
        }
        
        if not ticket_ids:
            return results
        
        # Verify all tickets belong to tenant
        stmt = select(Ticket).where(
            and_(
                Ticket.tenant_id == tenant_id,
                Ticket.id.in_(ticket_ids),
            )
        )
        
        result = await self.db.execute(stmt)
        tickets = result.scalars().all()
        
        if len(tickets) != len(ticket_ids):
            results["failed"] += len(ticket_ids) - len(ticket_ids)
            results["errors"].append("Some tickets not found or belong to different tenant")
        
        # Update tickets
        for ticket in tickets:
            try:
                if ticket.status in [TicketStatus.EMITTED, TicketStatus.CALLED]:
                    ticket.status = TicketStatus.CANCELLED
                    self.db.add(ticket)
                    results["modified"] += 1
            except Exception as e:
                results["failed"] += 1
                results["errors"].append(f"Error cancelling ticket {ticket.id}: {str(e)}")
        
        if not dry_run:
            await self.db.flush()
        
        return results
    
    async def bulk_reset_gira_counter(
        self,
        gira_id: UUID,
        tenant_id: UUID,
    ) -> bool:
        """Reset ticket counter for a gira.
        
        Args:
            gira_id: Gira ID
            tenant_id: Tenant ID
            
        Returns:
            True if reset, False if not found
        """
        senha_control = await self.get_by_gira(gira_id, tenant_id)
        if not senha_control:
            return False
        
        senha_control.current_numero = 0
        self.db.add(senha_control)
        await self.db.flush()
        return True
    
    async def get_bulk_stats(
        self,
        gira_id: UUID,
        tenant_id: UUID,
    ) -> Dict[str, Any]:
        """Get bulk operation stats for a gira.
        
        Args:
            gira_id: Gira ID
            tenant_id: Tenant ID
            
        Returns:
            Dict with counters and statistics
        """
        # Get senha control
        senha_control = await self.get_by_gira(gira_id, tenant_id)
        
        if not senha_control:
            return {
                "total_capacity": 0,
                "current_number": 0,
                "remaining": 0,
                "usage_percent": 0,
            }
        
        # Get ticket counts
        stmt = select(
            func.count(Ticket.id),
        ).where(
            and_(
                Ticket.tenant_id == tenant_id,
                Ticket.gira_id == gira_id,
            )
        )
        
        result = await self.db.execute(stmt)
        total_emitted = result.scalar_one() or 0
        
        usage_percent = 0
        if senha_control.max_numero > 0:
            usage_percent = (total_emitted / senha_control.max_numero) * 100
        
        return {
            "total_capacity": senha_control.max_numero,
            "current_number": senha_control.current_numero,
            "total_emitted": total_emitted,
            "remaining": max(0, senha_control.max_numero - total_emitted),
            "usage_percent": round(usage_percent, 2),
        }


# Import func for aggregations
from sqlalchemy import func
