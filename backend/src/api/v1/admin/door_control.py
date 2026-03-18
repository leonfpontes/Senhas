"""Door Control API - Visão da Porta endpoints for gira queue management."""
from fastapi import APIRouter, Depends, Path, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, case, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone
import json
import logging

from src.core.database import get_db
from src.models import User, Ticket, TicketStatus, Consulente, TenantConfig, Gira
from src.api.dependencies import get_current_user
from src.core.errors import InsufficientPermissionsError, NotFoundError
from src.repositories.consulente_repo import ConsulenteRepository
from src.repositories.senha_control_repo import SenhaControlRepository
from src.repositories.ticket_repo import TicketRepository
from .door_ws import broadcast_to_gira

router = APIRouter(prefix="/api/v1/admin", tags=["door-control"])
logger = logging.getLogger(__name__)


# ── Pydantic Models ──────────────────────────────────────────────────────

class DoorStatsResponse(BaseModel):
    """Real-time stats for the door view header."""
    total: int
    checked_in: int
    awaiting: int
    in_progress: int
    completed: int
    no_show: int
    walk_in: int
    preferenciais: int
    patrocinados: int


class QueueItemResponse(BaseModel):
    """Single ticket in the door queue."""
    id: UUID
    numero: int
    numero_formatado: str = ""
    status: str
    consulente_nome: Optional[str] = None
    consulente_email: Optional[str] = None
    consulente_telefone: Optional[str] = None
    preferencial: bool = False
    is_sponsor: bool = False
    is_walk_in: bool = False
    checkin_em: Optional[datetime] = None
    atendido_em: Optional[datetime] = None
    chamado_em: Optional[datetime] = None
    finalizado_em: Optional[datetime] = None
    medium_nome: Optional[str] = None
    cambone_nome: Optional[str] = None
    atendimento_descricao: Optional[str] = None

    class Config:
        from_attributes = True


class DoorQueueResponse(BaseModel):
    """Full queue for the door view."""
    items: List[QueueItemResponse]
    total: int


class AttendRequest(BaseModel):
    """Request body for marking a ticket as being attended."""
    medium_nome: str = Field(..., min_length=1, max_length=255)
    cambone_nome: Optional[str] = Field(None, max_length=255)
    atendimento_descricao: Optional[str] = None


class WalkInRequest(BaseModel):
    """Create a walk-in ticket from the door view."""
    nome: str = Field(..., min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    telefone: Optional[str] = Field(None, max_length=20)
    preferencial: bool = False


class WalkInUpdateRequest(BaseModel):
    """Edit walk-in basic information from the door view."""
    nome: str = Field(..., min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    telefone: Optional[str] = Field(None, max_length=20)
    preferencial: bool = False


# ── Helper ───────────────────────────────────────────────────────────────

def _parse_preferencial(observacoes: Optional[str]) -> bool:
    if not observacoes:
        return False
    try:
        obs = json.loads(observacoes)
        return obs.get("preferencial", False)
    except (json.JSONDecodeError, TypeError):
        return False


def _build_observacoes(*, preferencial: bool, is_sponsor: bool = False) -> Optional[str]:
    payload = {}
    if preferencial:
        payload["preferencial"] = True
    if is_sponsor:
        payload["patrocinador"] = True
    return json.dumps(payload) if payload else None


def _ticket_to_queue_item(t: Ticket) -> QueueItemResponse:
    is_sponsor = getattr(t, "is_sponsor", False)
    is_walk_in = getattr(t, "is_walk_in", False)
    numero_fmt = f"P{t.numero:03d}" if is_sponsor else f"{t.numero:04d}"
    return QueueItemResponse(
        id=t.id,
        numero=t.numero,
        numero_formatado=numero_fmt,
        status=t.status.value if hasattr(t.status, "value") else t.status,
        consulente_nome=t.consulente.nome if t.consulente else None,
        consulente_email=t.consulente.email if t.consulente else None,
        consulente_telefone=t.consulente.telefone if t.consulente else None,
        preferencial=_parse_preferencial(t.observacoes),
        is_sponsor=is_sponsor,
        is_walk_in=is_walk_in,
        checkin_em=t.checkin_em,
        atendido_em=t.atendido_em,
        chamado_em=t.chamado_em,
        finalizado_em=t.finalizado_em,
        medium_nome=t.medium_nome,
        cambone_nome=t.cambone_nome,
        atendimento_descricao=t.atendimento_descricao,
    )


async def _get_ticket(db: AsyncSession, ticket_id: UUID, tenant_id: UUID) -> Ticket:
    """Fetch a ticket ensuring tenant isolation."""
    stmt = (
        select(Ticket)
        .options(selectinload(Ticket.consulente))
        .where(and_(Ticket.id == ticket_id, Ticket.tenant_id == tenant_id))
    )
    result = await db.execute(stmt)
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise NotFoundError("Ticket não encontrado")
    return ticket


async def _get_tenant_config(db: AsyncSession, tenant_id: UUID) -> Optional[TenantConfig]:
    stmt = select(TenantConfig).where(TenantConfig.tenant_id == tenant_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("/giras/{gira_id}/door/stats", response_model=DoorStatsResponse)
async def get_door_stats(
    gira_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DoorStatsResponse:
    """Get real-time stats for the door view big numbers."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin ou operador necessário")

    base = and_(Ticket.tenant_id == current_user.tenant_id, Ticket.gira_id == gira_id)

    stmt = select(
        func.count(Ticket.id).label("total"),
        func.count(Ticket.id).filter(Ticket.checkin_em.isnot(None), Ticket.status == TicketStatus.EMITTED).label("checked_in"),
        func.count(Ticket.id).filter(Ticket.checkin_em.is_(None), Ticket.status == TicketStatus.EMITTED).label("awaiting"),
        func.count(Ticket.id).filter(Ticket.status == TicketStatus.CALLED).label("in_progress"),
        func.count(Ticket.id).filter(Ticket.status == TicketStatus.COMPLETED).label("completed"),
        func.count(Ticket.id).filter(Ticket.status == TicketStatus.NO_SHOW).label("no_show"),
        func.count(Ticket.id).filter(Ticket.is_walk_in.is_(True)).label("walk_in"),
        func.count(Ticket.id).filter(Ticket.observacoes.ilike('%"preferencial"%')).label("preferenciais"),
        func.count(Ticket.id).filter(Ticket.is_sponsor.is_(True)).label("patrocinados"),
    ).where(base)

    result = await db.execute(stmt)
    row = result.one()

    return DoorStatsResponse(
        total=row.total,
        checked_in=row.checked_in,
        awaiting=row.awaiting,
        in_progress=row.in_progress,
        completed=row.completed,
        no_show=row.no_show,
        walk_in=row.walk_in,
        preferenciais=row.preferenciais,
        patrocinados=row.patrocinados,
    )


@router.get("/giras/{gira_id}/door/queue", response_model=DoorQueueResponse)
async def get_door_queue(
    gira_id: UUID = Path(...),
    search: Optional[str] = Query(None, max_length=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DoorQueueResponse:
    """Get ordered queue for the door view.
    
    Order: preferenciais first (by numero), then regular (by numero).
    Includes search by consulente name.
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin ou operador necessário")

    where_clause = and_(
        Ticket.tenant_id == current_user.tenant_id,
        Ticket.gira_id == gira_id,
    )

    stmt = (
        select(Ticket)
        .options(selectinload(Ticket.consulente))
        .where(where_clause)
        .order_by(Ticket.numero)
    )

    # Search by consulente name via join
    if search:
        stmt = stmt.join(Ticket.consulente).where(
            Consulente.nome.ilike(f"%{search}%")
        )

    result = await db.execute(stmt)
    tickets = result.scalars().all()

    # Build queue items
    items = []
    for t in tickets:
        items.append(_ticket_to_queue_item(t))

    # Fetch tenant config for sponsor priority mode
    tenant_config = await _get_tenant_config(db, current_user.tenant_id)
    sponsor_mode = tenant_config.sponsor_priority_mode if tenant_config else "first"

    sponsors = [i for i in items if i.is_sponsor]
    pref = [i for i in items if i.preferencial and not i.is_sponsor]
    regular = [i for i in items if not i.preferencial and not i.is_sponsor]

    if sponsor_mode == "interleave":
        # Interleave: merge sponsors among others round-robin style
        non_sponsor = pref + regular
        sorted_items = []
        si, ni = 0, 0
        while si < len(sponsors) or ni < len(non_sponsor):
            if si < len(sponsors):
                sorted_items.append(sponsors[si])
                si += 1
            if ni < len(non_sponsor):
                sorted_items.append(non_sponsor[ni])
                ni += 1
    else:
        # Default 'first': sponsors → preferenciais → regulares
        sorted_items = sponsors + pref + regular

    return DoorQueueResponse(items=sorted_items, total=len(sorted_items))


@router.post("/giras/{gira_id}/door/walk-in", response_model=QueueItemResponse, status_code=status.HTTP_201_CREATED)
async def create_walk_in_ticket(
    body: WalkInRequest,
    gira_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueueItemResponse:
    """Create a walk-in ticket from the door view.

    Walk-ins bypass the gira max_tickets cap and are automatically marked as present.
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin ou operador necessário")

    tenant_config = await _get_tenant_config(db, current_user.tenant_id)
    if not tenant_config or not tenant_config.enable_walk_in:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Walk-in desabilitado para este terreiro",
        )

    gira_stmt = select(Gira).where(
        and_(
            Gira.id == gira_id,
            Gira.tenant_id == current_user.tenant_id,
        )
    )
    gira_result = await db.execute(gira_stmt)
    gira = gira_result.scalar_one_or_none()
    if not gira:
        raise NotFoundError("Gira não encontrada")

    from src.models.consulentes import Consulente as ConsulenteModel
    from src.models.senha_controls import SenhaControl
    consulente_repo = ConsulenteRepository(db, ConsulenteModel)
    senha_control_repo = SenhaControlRepository(db, SenhaControl)
    ticket_repo = TicketRepository(db, Ticket)

    try:
        consulente = await consulente_repo.create_walk_in_consulente(
            session=db,
            tenant_id=current_user.tenant_id,
            name=body.nome.strip(),
            email=body.email,
            phone=body.telefone,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await senha_control_repo.get_or_create_for_gira(
        session=db,
        tenant_id=current_user.tenant_id,
        gira_id=gira_id,
        initial_number=0,
        is_sponsor=False,
    )
    next_number = await senha_control_repo.increment_atomic(
        session=db,
        tenant_id=current_user.tenant_id,
        gira_id=gira_id,
        is_sponsor=False,
    )

    ticket = await ticket_repo.create_ticket(
        session=db,
        tenant_id=current_user.tenant_id,
        gira_id=gira_id,
        consulente_id=consulente.id,
        numero=next_number,
        status=TicketStatus.EMITTED,
        observacoes=_build_observacoes(preferencial=body.preferencial),
        is_walk_in=True,
        emitido_por_id=current_user.id,
        checkin_em=datetime.now(timezone.utc),
    )

    await db.commit()
    await db.refresh(ticket, ["consulente"])

    await broadcast_to_gira(str(gira_id), "queue_updated")
    await broadcast_to_gira(str(gira_id), "stats_updated")
    return _ticket_to_queue_item(ticket)


@router.patch("/door/tickets/{ticket_id}/walk-in", response_model=QueueItemResponse)
async def update_walk_in_ticket(
    body: WalkInUpdateRequest,
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueueItemResponse:
    """Edit walk-in information from the door view."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin ou operador necessário")

    ticket = await _get_ticket(db, ticket_id, current_user.tenant_id)
    if not ticket.is_walk_in:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Somente senhas Walk-in podem ser editadas por este endpoint",
        )

    if ticket.status == TicketStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Senha cancelada não pode ser editada",
        )

    from src.models.consulentes import Consulente as ConsulenteModel
    consulente_repo = ConsulenteRepository(db, ConsulenteModel)

    try:
        await consulente_repo.update_basic_info(
            session=db,
            consulente=ticket.consulente,
            name=body.nome.strip(),
            email=body.email,
            phone=body.telefone,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    ticket.observacoes = _build_observacoes(
        preferencial=body.preferencial,
        is_sponsor=ticket.is_sponsor,
    )

    await db.commit()
    await db.refresh(ticket, ["consulente"])

    await broadcast_to_gira(str(ticket.gira_id), "queue_updated")
    await broadcast_to_gira(str(ticket.gira_id), "stats_updated")
    return _ticket_to_queue_item(ticket)


@router.patch("/door/tickets/{ticket_id}/checkin", response_model=QueueItemResponse)
async def checkin_ticket(
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueueItemResponse:
    """Mark a ticket as checked-in (consulente arrived at the door)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin ou operador necessário")

    ticket = await _get_ticket(db, ticket_id, current_user.tenant_id)

    if ticket.status != TicketStatus.EMITTED:
        raise NotFoundError("Ticket precisa estar no status 'emitido' para check-in")

    ticket.checkin_em = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(ticket, ["consulente"])

    await broadcast_to_gira(str(ticket.gira_id), "queue_updated")
    return _ticket_to_queue_item(ticket)


@router.delete("/door/tickets/{ticket_id}/checkin", response_model=QueueItemResponse)
async def undo_checkin(
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueueItemResponse:
    """Undo check-in (remove arrival mark)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin ou operador necessário")

    ticket = await _get_ticket(db, ticket_id, current_user.tenant_id)

    if ticket.status != TicketStatus.EMITTED or ticket.checkin_em is None:
        raise NotFoundError("Ticket precisa estar com check-in para desfazer")

    ticket.checkin_em = None
    await db.commit()
    await db.refresh(ticket, ["consulente"])

    await broadcast_to_gira(str(ticket.gira_id), "queue_updated")
    return _ticket_to_queue_item(ticket)


@router.patch("/door/tickets/{ticket_id}/attend", response_model=QueueItemResponse)
async def attend_ticket(
    body: AttendRequest,
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueueItemResponse:
    """Mark a ticket as attended and completed in one step."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin ou operador necessário")

    ticket = await _get_ticket(db, ticket_id, current_user.tenant_id)

    if ticket.status != TicketStatus.EMITTED:
        raise NotFoundError("Ticket precisa estar no status 'emitido' para iniciar atendimento")

    now = datetime.now(timezone.utc)
    ticket.status = TicketStatus.COMPLETED
    ticket.chamado_em = now
    ticket.atendido_em = now
    ticket.finalizado_em = now
    ticket.medium_nome = body.medium_nome
    ticket.cambone_nome = body.cambone_nome
    ticket.atendimento_descricao = body.atendimento_descricao

    await db.commit()
    await db.refresh(ticket, ["consulente"])

    await broadcast_to_gira(str(ticket.gira_id), "queue_updated")
    return _ticket_to_queue_item(ticket)


@router.patch("/door/tickets/{ticket_id}/attend-info", response_model=QueueItemResponse)
async def edit_attend_info(
    body: AttendRequest,
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueueItemResponse:
    """Edit attendance info (medium, cambone, description) on a completed ticket."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin ou operador necessário")

    ticket = await _get_ticket(db, ticket_id, current_user.tenant_id)

    if ticket.status != TicketStatus.COMPLETED:
        raise NotFoundError("Só é possível editar informações de tickets já atendidos")

    ticket.medium_nome = body.medium_nome
    ticket.cambone_nome = body.cambone_nome
    ticket.atendimento_descricao = body.atendimento_descricao

    await db.commit()
    await db.refresh(ticket, ["consulente"])

    await broadcast_to_gira(str(ticket.gira_id), "queue_updated")
    return _ticket_to_queue_item(ticket)


@router.patch("/door/tickets/{ticket_id}/complete", response_model=QueueItemResponse)
async def complete_ticket(
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueueItemResponse:
    """Mark a ticket as completed (consultation finished)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin ou operador necessário")

    ticket = await _get_ticket(db, ticket_id, current_user.tenant_id)

    if ticket.status != TicketStatus.CALLED:
        raise NotFoundError("Ticket precisa estar em atendimento para completar")

    ticket.status = TicketStatus.COMPLETED
    ticket.finalizado_em = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(ticket, ["consulente"])

    await broadcast_to_gira(str(ticket.gira_id), "queue_updated")
    return _ticket_to_queue_item(ticket)


@router.patch("/door/tickets/{ticket_id}/no-show", response_model=QueueItemResponse)
async def no_show_ticket(
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueueItemResponse:
    """Mark a ticket as no-show (consulente didn't appear)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin ou operador necessário")

    ticket = await _get_ticket(db, ticket_id, current_user.tenant_id)

    if ticket.status not in (TicketStatus.EMITTED, TicketStatus.CALLED):
        raise NotFoundError("Ticket precisa estar ativo para marcar como não compareceu")

    ticket.status = TicketStatus.NO_SHOW
    ticket.finalizado_em = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(ticket, ["consulente"])

    await broadcast_to_gira(str(ticket.gira_id), "queue_updated")
    return _ticket_to_queue_item(ticket)


@router.patch("/door/tickets/{ticket_id}/undo", response_model=QueueItemResponse)
async def undo_ticket_action(
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueueItemResponse:
    """Undo last action — revert to EMITTED status.
    
    Works for: CALLED → EMITTED, COMPLETED → EMITTED, NO_SHOW → EMITTED.
    Clears all door control fields.
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin ou operador necessário")

    ticket = await _get_ticket(db, ticket_id, current_user.tenant_id)

    if ticket.status == TicketStatus.EMITTED:
        raise NotFoundError("Ticket já está no status emitido")
    if ticket.status == TicketStatus.CANCELLED:
        raise NotFoundError("Ticket cancelado não pode ser revertido")

    ticket.status = TicketStatus.EMITTED
    ticket.chamado_em = None
    ticket.finalizado_em = None
    ticket.atendido_em = None
    ticket.medium_nome = None
    ticket.cambone_nome = None
    ticket.atendimento_descricao = None

    await db.commit()
    await db.refresh(ticket, ["consulente"])

    await broadcast_to_gira(str(ticket.gira_id), "queue_updated")
    return _ticket_to_queue_item(ticket)
