"""Door Control API - Visão da Porta endpoints for gira queue management."""
from fastapi import APIRouter, Depends, Path, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, case, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone
import json
import logging

from src.core.database import get_db
from src.models import User, Ticket, TicketStatus, Consulente, TenantConfig, Gira, PermissionFeature
from src.models.tickets import PriorityCategory, PRIORITY_ORDER
from src.api.dependencies import get_current_user, require_group_permission, require_any_group_permission
from src.core.errors import InsufficientPermissionsError, NotFoundError
from src.repositories.consulente_repo import ConsulenteRepository
from src.repositories.senha_control_repo import SenhaControlRepository
from src.repositories.ticket_repo import TicketRepository

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
    priority_category: Optional[str] = None
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


def _validate_priority_category_value(v: Optional[str]) -> Optional[str]:
    """Validate that priority_category is one of the allowed PriorityCategory values."""
    if v is None:
        return None
    allowed = {cat.value for cat in PriorityCategory}
    if v not in allowed:
        raise ValueError(
            f"Categoria de prioridade inválida: '{v}'. "
            f"Valores aceitos: {', '.join(sorted(allowed))}"
        )
    return v


class WalkInRequest(BaseModel):
    """Create a walk-in ticket from the door view."""
    nome: str = Field(..., min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    telefone: Optional[str] = Field(None, max_length=20)
    priority_category: Optional[str] = None
    # DEPRECATED: use priority_category instead. Kept for backward compatibility.
    preferencial: bool = False

    @field_validator("priority_category")
    @classmethod
    def validate_priority_category(cls, v: Optional[str]) -> Optional[str]:
        return _validate_priority_category_value(v)


class WalkInUpdateRequest(BaseModel):
    """Edit walk-in basic information from the door view.

    priority_category=None means "do not change" (preserve existing value).
    To explicitly clear priority, this is not currently supported by design.
    """
    nome: str = Field(..., min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    telefone: Optional[str] = Field(None, max_length=20)
    priority_category: Optional[str] = None
    # DEPRECATED: use priority_category instead. Kept for backward compatibility.
    preferencial: bool = False

    @field_validator("priority_category")
    @classmethod
    def validate_priority_category(cls, v: Optional[str]) -> Optional[str]:
        return _validate_priority_category_value(v)


# ── Helper ───────────────────────────────────────────────────────────────

def _parse_preferencial(observacoes: Optional[str]) -> bool:
    if not observacoes:
        return False
    try:
        obs = json.loads(observacoes)
        return obs.get("preferencial", False)
    except (json.JSONDecodeError, TypeError):
        return False


def _build_observacoes(
    *,
    priority_category: Optional[str] = None,
    is_sponsor: bool = False,
    # DEPRECATED param kept for backward compatibility in callers
    preferencial: bool = False,
) -> Optional[str]:
    """Build the observacoes JSON payload.

    preferencial=True is treated as a fallback: if priority_category is None
    and preferencial is True, the JSON will still record preferencial=True for
    backward compatibility. Callers should prefer passing priority_category.
    """
    payload = {}
    is_pref = priority_category is not None or preferencial
    if is_pref:
        payload["preferencial"] = True
    if is_sponsor:
        payload["patrocinador"] = True
    return json.dumps(payload) if payload else None


def _ticket_to_queue_item(t: Ticket) -> QueueItemResponse:
    is_sponsor = getattr(t, "is_sponsor", False)
    is_walk_in = getattr(t, "is_walk_in", False)
    numero_fmt = f"P{t.numero:03d}" if is_sponsor else f"{t.numero:04d}"
    priority_category = getattr(t, "priority_category", None)
    # preferencial=True if category is set OR if the legacy JSON flag is set
    is_preferencial = (priority_category is not None) or _parse_preferencial(t.observacoes)
    return QueueItemResponse(
        id=t.id,
        numero=t.numero,
        numero_formatado=numero_fmt,
        status=t.status.value if hasattr(t.status, "value") else t.status,
        consulente_nome=t.consulente.nome if t.consulente else None,
        consulente_email=t.consulente.email if t.consulente else None,
        consulente_telefone=t.consulente.telefone if t.consulente else None,
        preferencial=is_preferencial,
        priority_category=priority_category,
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

@router.get("/giras/{gira_id}/door/stats", response_model=DoorStatsResponse, dependencies=[Depends(require_any_group_permission(PermissionFeature.PORTA, PermissionFeature.RELATORIO_GIRA, action="view"))])
async def get_door_stats(
    gira_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DoorStatsResponse:
    """Get real-time stats for the door view big numbers."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin ou operador necessário")

    base = and_(Ticket.tenant_id == current_user.tenant_id, Ticket.gira_id == gira_id)

    stmt = select(
        func.count(Ticket.id).label("total"),
        func.count(Ticket.id).filter(Ticket.checkin_em.isnot(None)).label("checked_in"),
        func.count(Ticket.id).filter(Ticket.checkin_em.is_(None), Ticket.status == TicketStatus.EMITTED).label("awaiting"),
        func.count(Ticket.id).filter(Ticket.status == TicketStatus.CALLED).label("in_progress"),
        func.count(Ticket.id).filter(Ticket.status == TicketStatus.COMPLETED).label("completed"),
        func.count(Ticket.id).filter(Ticket.status == TicketStatus.NO_SHOW).label("no_show"),
        func.count(Ticket.id).filter(Ticket.is_walk_in.is_(True)).label("walk_in"),
        func.count(Ticket.id).filter(Ticket.priority_category.isnot(None)).label("preferenciais"),
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


@router.get("/giras/{gira_id}/door/queue", response_model=DoorQueueResponse, dependencies=[Depends(require_group_permission(PermissionFeature.PORTA, "view"))])
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
    if not current_user.is_operator_or_admin:
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

    def _interleave(a: list, b: list) -> list:
        """Round-robin merge two lists: a0, b0, a1, b1, ..."""
        result = []
        ai, bi = 0, 0
        while ai < len(a) or bi < len(b):
            if ai < len(a):
                result.append(a[ai])
                ai += 1
            if bi < len(b):
                result.append(b[bi])
                bi += 1
        return result

    # Build ordered list from priority categories (items already ordered by numero via query)
    sorted_items: list = []
    for cat in PRIORITY_ORDER:
        assoc_cat = [i for i in items if i.is_sponsor and i.priority_category == cat]
        noassoc_cat = [i for i in items if not i.is_sponsor and i.priority_category == cat]
        if sponsor_mode == "interleave":
            sorted_items.extend(_interleave(assoc_cat, noassoc_cat))
        else:
            sorted_items.extend(assoc_cat + noassoc_cat)

    # Legacy fallback: preferenciais without a category (old JSON-only tickets)
    assoc_legacy_pref = [
        i for i in items
        if i.is_sponsor and i.preferencial and i.priority_category is None
    ]
    noassoc_legacy_pref = [
        i for i in items
        if not i.is_sponsor and i.preferencial and i.priority_category is None
    ]
    if sponsor_mode == "interleave":
        sorted_items.extend(_interleave(assoc_legacy_pref, noassoc_legacy_pref))
    else:
        sorted_items.extend(assoc_legacy_pref + noassoc_legacy_pref)

    # Non-preferencial tickets
    assoc_reg = [i for i in items if i.is_sponsor and not i.preferencial]
    regular = [i for i in items if not i.is_sponsor and not i.preferencial]
    if sponsor_mode == "interleave":
        sorted_items.extend(_interleave(assoc_reg, regular))
    else:
        sorted_items.extend(assoc_reg + regular)

    return DoorQueueResponse(items=sorted_items, total=len(sorted_items))


@router.post("/giras/{gira_id}/door/walk-in", response_model=QueueItemResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_group_permission(PermissionFeature.PORTA, "insert"))])
async def create_walk_in_ticket(
    body: WalkInRequest,
    gira_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueueItemResponse:
    """Create a walk-in ticket from the door view.

    Walk-ins bypass the gira max_tickets cap and are automatically marked as present.
    """
    if not current_user.is_operator_or_admin:
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

    # Resolve priority_category: new field takes precedence; fallback from deprecated preferencial
    walk_in_priority = body.priority_category
    if walk_in_priority is None and body.preferencial:
        walk_in_priority = PriorityCategory.ELDERLY.value

    ticket = await ticket_repo.create_ticket(
        session=db,
        tenant_id=current_user.tenant_id,
        gira_id=gira_id,
        consulente_id=consulente.id,
        numero=next_number,
        status=TicketStatus.EMITTED,
        observacoes=_build_observacoes(priority_category=walk_in_priority),
        priority_category=walk_in_priority,
        is_walk_in=True,
        emitido_por_id=current_user.id,
        checkin_em=datetime.now(timezone.utc),
    )

    await db.commit()
    await db.refresh(ticket, ["consulente"])

    return _ticket_to_queue_item(ticket)


@router.patch("/door/tickets/{ticket_id}/walk-in", response_model=QueueItemResponse, dependencies=[Depends(require_group_permission(PermissionFeature.PORTA, "edit"))])
async def update_walk_in_ticket(
    body: WalkInUpdateRequest,
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueueItemResponse:
    """Edit walk-in information from the door view."""
    if not current_user.is_operator_or_admin:
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

    # priority_category=None in body means "do not change" — preserve existing value
    update_priority = body.priority_category
    if update_priority is None and body.preferencial:
        # Deprecated preferencial=True: map to ELDERLY if no category currently set
        if ticket.priority_category is None:
            update_priority = PriorityCategory.ELDERLY.value
        else:
            update_priority = ticket.priority_category
    elif update_priority is None:
        # Neither new field nor deprecated field sent: preserve existing
        update_priority = ticket.priority_category

    ticket.priority_category = update_priority
    ticket.observacoes = _build_observacoes(
        priority_category=update_priority,
        is_sponsor=ticket.is_sponsor,
    )

    await db.commit()
    await db.refresh(ticket, ["consulente"])

    return _ticket_to_queue_item(ticket)


@router.patch("/door/tickets/{ticket_id}/checkin", response_model=QueueItemResponse, dependencies=[Depends(require_group_permission(PermissionFeature.PORTA, "edit"))])
async def checkin_ticket(
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueueItemResponse:
    """Mark a ticket as checked-in (consulente arrived at the door)."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin ou operador necessário")

    ticket = await _get_ticket(db, ticket_id, current_user.tenant_id)

    if ticket.status != TicketStatus.EMITTED:
        raise NotFoundError("Ticket precisa estar no status 'emitido' para check-in")

    ticket.checkin_em = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(ticket, ["consulente"])

    return _ticket_to_queue_item(ticket)


@router.delete("/door/tickets/{ticket_id}/checkin", response_model=QueueItemResponse, dependencies=[Depends(require_group_permission(PermissionFeature.PORTA, "edit"))])
async def undo_checkin(
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueueItemResponse:
    """Undo check-in (remove arrival mark)."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin ou operador necessário")

    ticket = await _get_ticket(db, ticket_id, current_user.tenant_id)

    if ticket.status != TicketStatus.EMITTED or ticket.checkin_em is None:
        raise NotFoundError("Ticket precisa estar com check-in para desfazer")

    ticket.checkin_em = None
    await db.commit()
    await db.refresh(ticket, ["consulente"])

    return _ticket_to_queue_item(ticket)


@router.patch("/door/tickets/{ticket_id}/attend", response_model=QueueItemResponse, dependencies=[Depends(require_group_permission(PermissionFeature.PORTA, "edit"))])
async def attend_ticket(
    body: AttendRequest,
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueueItemResponse:
    """Mark a ticket as attended and completed in one step."""
    if not current_user.is_operator_or_admin:
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

    return _ticket_to_queue_item(ticket)


@router.patch("/door/tickets/{ticket_id}/attend-info", response_model=QueueItemResponse, dependencies=[Depends(require_group_permission(PermissionFeature.PORTA, "edit"))])
async def edit_attend_info(
    body: AttendRequest,
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueueItemResponse:
    """Edit attendance info (medium, cambone, description) on a completed ticket."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin ou operador necessário")

    ticket = await _get_ticket(db, ticket_id, current_user.tenant_id)

    if ticket.status != TicketStatus.COMPLETED:
        raise NotFoundError("Só é possível editar informações de tickets já atendidos")

    ticket.medium_nome = body.medium_nome
    ticket.cambone_nome = body.cambone_nome
    ticket.atendimento_descricao = body.atendimento_descricao

    await db.commit()
    await db.refresh(ticket, ["consulente"])

    return _ticket_to_queue_item(ticket)


@router.patch("/door/tickets/{ticket_id}/complete", response_model=QueueItemResponse, dependencies=[Depends(require_group_permission(PermissionFeature.PORTA, "edit"))])
async def complete_ticket(
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueueItemResponse:
    """Mark a ticket as completed (consultation finished)."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin ou operador necessário")

    ticket = await _get_ticket(db, ticket_id, current_user.tenant_id)

    if ticket.status != TicketStatus.CALLED:
        raise NotFoundError("Ticket precisa estar em atendimento para completar")

    ticket.status = TicketStatus.COMPLETED
    ticket.finalizado_em = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(ticket, ["consulente"])

    return _ticket_to_queue_item(ticket)


@router.patch("/door/tickets/{ticket_id}/no-show", response_model=QueueItemResponse, dependencies=[Depends(require_group_permission(PermissionFeature.PORTA, "edit"))])
async def no_show_ticket(
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueueItemResponse:
    """Mark a ticket as no-show (consulente didn't appear)."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin ou operador necessário")

    ticket = await _get_ticket(db, ticket_id, current_user.tenant_id)

    if ticket.status not in (TicketStatus.EMITTED, TicketStatus.CALLED):
        raise NotFoundError("Ticket precisa estar ativo para marcar como não compareceu")

    ticket.status = TicketStatus.NO_SHOW
    ticket.finalizado_em = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(ticket, ["consulente"])

    return _ticket_to_queue_item(ticket)


@router.patch("/door/tickets/{ticket_id}/undo", response_model=QueueItemResponse, dependencies=[Depends(require_group_permission(PermissionFeature.PORTA, "edit"))])
async def undo_ticket_action(
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueueItemResponse:
    """Undo last action — revert to EMITTED status.
    
    Works for: CALLED → EMITTED, COMPLETED → EMITTED, NO_SHOW → EMITTED.
    Clears all door control fields.
    """
    if not current_user.is_operator_or_admin:
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

    return _ticket_to_queue_item(ticket)
