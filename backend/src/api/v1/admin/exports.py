"""T066: Admin Exports - GET /api/v1/admin/giras/{gira_id}/export-csv"""
from fastapi import APIRouter, Depends, Path, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import Optional
from uuid import UUID
import csv
import io
import logging

from src.core.database import get_db
from src.models import User, Ticket
from src.api.dependencies import get_current_user
from src.core.errors import InsufficientPermissionsError, NotFoundError

router = APIRouter(prefix="/api/v1/admin", tags=["admin-exports"])
logger = logging.getLogger(__name__)


@router.get("/giras/{gira_id}/export-csv")
async def export_tickets_csv(
    gira_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export gira tickets to CSV.
    
    Requires admin role.
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")
    
    # Fetch tickets
    stmt = select(Ticket).where(
        and_(
            Ticket.tenant_id == current_user.tenant_id,
            Ticket.gira_id == gira_id,
        )
    ).order_by(Ticket.numero)
    
    result = await db.execute(stmt)
    tickets = result.scalars().all()
    
    if not tickets:
        raise NotFoundError("Nenhum ticket encontrado para esta gira")
    
    # Generate CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Headers
    writer.writerow([
        "ID",
        "Número",
        "Status",
        "Email",
        "Nome",
        "Data Emissão",
        "Chamado Em",
        "Finalizado Em",
    ])
    
    # Rows
    for ticket in tickets:
        writer.writerow([
            str(ticket.id),
            ticket.numero,
            ticket.status.value,
            ticket.consulente.email if ticket.consulente else "",
            ticket.consulente.nome if ticket.consulente else "",
            ticket.created_at.isoformat() if ticket.created_at else "",
            ticket.chamado_em.isoformat() if ticket.chamado_em else "",
            ticket.finalizado_em.isoformat() if ticket.finalizado_em else "",
        ])
    
    # Return as attachment
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=tickets_{gira_id}.csv"
        },
    )
