"""T066: Admin Exports - GET /api/v1/admin/giras/{gira_id}/export-csv

Planilha das senhas de uma gira, baixada pelo botão "Exportar CSV" da tela de
Senhas. Gate de plano `export_csv` (Pro+) e de grupo TICKETS ou RELATORIO_GIRA
(view) — o mesmo critério que o frontend usa para mostrar o botão.
"""
from fastapi import APIRouter, Depends, Path
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from uuid import UUID
import csv
import io
import logging

from src.core.database import get_db
from src.core.tz import APP_TZ
from src.models import User, Ticket, PermissionFeature
from src.models.tickets import PriorityCategory
from src.api.dependencies import get_current_user, require_any_group_permission, require_plan_feature
from src.core.errors import InsufficientPermissionsError, NotFoundError

router = APIRouter(prefix="/api/v1/admin", tags=["admin-exports"])
logger = logging.getLogger(__name__)

# Status no vocabulário das telas (Senhas/Porta).
_STATUS_LABELS = {
    "emitted": "Aguardando",
    "called": "Aguardando",  # legado: o app não grava mais CALLED
    "completed": "Atendida",
    "cancelled": "Cancelada",
    "no_show": "Não veio",
    "waitlisted": "Lista de espera",
    "waitlist_expired": "Espera expirada",
}

_PRIORITY_LABELS = {
    PriorityCategory.ELDERLY.value: "Idoso (60+)",
    PriorityCategory.DISABILITY_OR_AUTISM.value: "PcD / TEA",
    PriorityCategory.PREGNANT_LACTATING_OR_INFANT.value: "Gestante, lactante ou criança de colo",
    PriorityCategory.REDUCED_MOBILITY.value: "Mobilidade reduzida",
}


def _local(dt) -> str:
    """Data/hora em horário de Brasília (dd/mm/aaaa hh:mm), ou vazio."""
    if not dt:
        return ""
    return dt.astimezone(APP_TZ).strftime("%d/%m/%Y %H:%M")


@router.get(
    "/giras/{gira_id}/export-csv",
    dependencies=[
        Depends(require_plan_feature("export_csv")),
        Depends(
            require_any_group_permission(
                PermissionFeature.TICKETS, PermissionFeature.RELATORIO_GIRA, action="view"
            )
        ),
    ],
)
async def export_tickets_csv(
    gira_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export gira tickets to CSV (UTF-8 com BOM, abre certo no Excel).

    Requires admin role.
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    # selectinload: sem ele o acesso a ticket.consulente fazia lazy load fora do
    # greenlet e a exportação quebrava com 500.
    stmt = (
        select(Ticket)
        .options(selectinload(Ticket.consulente))
        .where(
            and_(
                Ticket.tenant_id == current_user.tenant_id,
                Ticket.gira_id == gira_id,
            )
        )
        .order_by(Ticket.is_sponsor.desc(), Ticket.numero)
    )

    result = await db.execute(stmt)
    tickets = result.scalars().all()

    if not tickets:
        raise NotFoundError("Nenhuma senha encontrada para esta gira")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Senha",
        "Nome",
        "E-mail",
        "Telefone",
        "Tipo",
        "Prioridade",
        "Status",
        "Emitida em",
        "Chegou em",
        "Finalizada em",
        "Médium",
        "Cambone",
        "Observações do atendimento",
    ])

    for ticket in tickets:
        status_value = ticket.status.value if hasattr(ticket.status, "value") else str(ticket.status)
        consulente = ticket.consulente
        if ticket.is_acompanhante:
            tipo = "Acompanhante"
        elif ticket.is_walk_in:
            tipo = "Sem senha"
        elif ticket.is_sponsor:
            tipo = "Associado"
        else:
            tipo = "Comum"
        writer.writerow([
            f"P{ticket.numero:03d}" if ticket.is_sponsor else f"{ticket.numero:04d}",
            consulente.nome if consulente else "",
            consulente.email if consulente else "",
            consulente.telefone if consulente else "",
            tipo,
            _PRIORITY_LABELS.get(ticket.priority_category, "") if ticket.priority_category else "",
            _STATUS_LABELS.get(status_value, status_value),
            _local(ticket.created_at),
            _local(ticket.checkin_em),
            _local(ticket.finalizado_em),
            ticket.medium_nome or "",
            ticket.cambone_nome or "",
            ticket.atendimento_descricao or "",
        ])

    return StreamingResponse(
        iter(["﻿" + output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=senhas_{gira_id}.csv"},
    )
