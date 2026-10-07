"""T066: Admin Exports - GET /api/v1/admin/giras/{gira_id}/export-listagem

Listagem completa das senhas de uma gira, base do botão "Exportar PDF" da tela
de Senhas (o PDF é montado no navegador — `frontend/src/lib/pdf/`). Substituiu
o antigo `export-csv` em out/2026. Os rótulos (status, prioridade, tipo) e os
horários de Brasília saem prontos daqui para o PDF não reimplementar regra.
Gate de plano `export_csv` (Pro+) e de grupo TICKETS ou RELATORIO_GIRA (view) —
o mesmo critério que o frontend usa para mostrar o botão.
"""
from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from uuid import UUID
from datetime import datetime
import logging

from src.core.database import get_db
from src.core.tz import APP_TZ
from src.models import User, Ticket, Gira, PermissionFeature
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


class ListagemSenha(BaseModel):
    senha: str
    nome: str
    email: str
    telefone: str
    tipo: str
    prioridade: str
    status: str
    status_label: str
    emitida_em: str
    chegou_em: str
    finalizada_em: str
    medium: str
    cambone: str
    observacoes: str


class ListagemGira(BaseModel):
    nome: str
    data_inicio: datetime | None


class ListagemSenhasResponse(BaseModel):
    gira: ListagemGira
    items: list[ListagemSenha]


def _tipo(ticket: Ticket) -> str:
    if ticket.is_acompanhante:
        return "Acompanhante"
    if ticket.is_walk_in:
        return "Sem senha"
    if ticket.is_sponsor:
        return "Associado"
    return "Comum"


@router.get(
    "/giras/{gira_id}/export-listagem",
    response_model=ListagemSenhasResponse,
    dependencies=[
        Depends(require_plan_feature("export_csv")),
        Depends(
            require_any_group_permission(
                PermissionFeature.TICKETS, PermissionFeature.RELATORIO_GIRA, action="view"
            )
        ),
    ],
)
async def export_listagem_senhas(
    gira_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Todas as senhas da gira (associados primeiro, depois por número).

    Plano com `export_csv` (gate único, vale também para admin) + TICKETS ou RELATORIO_GIRA:view.
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    gira = (
        await db.execute(
            select(Gira).where(
                and_(
                    Gira.tenant_id == current_user.tenant_id,
                    Gira.id == gira_id,
                    Gira.deleted_at.is_(None),
                )
            )
        )
    ).scalar_one_or_none()
    if gira is None:
        raise NotFoundError("Gira não encontrada")

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
    tickets = (await db.execute(stmt)).scalars().all()

    items: list[ListagemSenha] = []
    for ticket in tickets:
        status_value = ticket.status.value if hasattr(ticket.status, "value") else str(ticket.status)
        consulente = ticket.consulente
        items.append(ListagemSenha(
            senha=f"P{ticket.numero:03d}" if ticket.is_sponsor else f"{ticket.numero:04d}",
            nome=(consulente.nome if consulente else "") or "",
            email=(consulente.email if consulente else "") or "",
            telefone=(consulente.telefone if consulente else "") or "",
            tipo=_tipo(ticket),
            prioridade=_PRIORITY_LABELS.get(ticket.priority_category, "") if ticket.priority_category else "",
            status=status_value,
            status_label=_STATUS_LABELS.get(status_value, status_value),
            emitida_em=_local(ticket.created_at),
            chegou_em=_local(ticket.checkin_em),
            finalizada_em=_local(ticket.finalizado_em),
            medium=ticket.medium_nome or "",
            cambone=ticket.cambone_nome or "",
            observacoes=ticket.atendimento_descricao or "",
        ))

    return ListagemSenhasResponse(
        gira=ListagemGira(nome=gira.nome, data_inicio=gira.data_inicio),
        items=items,
    )
