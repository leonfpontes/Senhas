"""T059: Admin Tickets List - GET /api/v1/admin/giras/{gira_id}/tickets (pagination)"""
from fastapi import APIRouter, HTTPException, Depends, status, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field
from typing import List, Optional
from uuid import UUID
from datetime import datetime
import json
import logging

from src.core.config import settings
from src.core.database import get_db
from src.core.tz import APP_TZ
from src.models import User, Ticket, TicketStatus, Consulente, PermissionFeature
from src.models.giras import Gira
from src.models.tenants import Tenant
from src.models.tenant_config import TenantConfig
from src.models.senha_controls import SenhaControl
from src.api.dependencies import get_current_user, require_group_permission, require_any_group_permission
from src.core.errors import (
    InsufficientPermissionsError,
    NotFoundError,
)
from src.repositories.senha_control_repo import SenhaControlRepository
from src.repositories.gira_time_slot_repo import GiraTimeSlotRepository
from src.services.audit_service import AuditService
from src.services import waitlist_service
from src.services.email.base import EmailMessage
from src.services.email.email_queue import email_queue, EmailQueueItem
from src.services.email.templates.waitlist import (
    generate_waitlist_promotion_html,
    generate_waitlist_promotion_text,
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin-tickets"])
logger = logging.getLogger(__name__)


class TicketResponse(BaseModel):
    """Ticket response model."""
    id: UUID
    numero: int
    status: str
    consulente_nome: Optional[str] = None
    consulente_email: Optional[str] = None
    consulente_telefone: Optional[str] = None
    preferencial: bool = False
    is_sponsor: bool = False
    is_walk_in: bool = False
    observacoes: Optional[str] = None
    checkin_em: Optional[datetime] = None
    chamado_em: Optional[datetime] = None
    finalizado_em: Optional[datetime] = None
    medium_nome: Optional[str] = None
    cambone_nome: Optional[str] = None
    atendimento_descricao: Optional[str] = None
    created_at: datetime
    resend_email_id: Optional[str] = None
    email_sent_at: Optional[datetime] = None
    email_provider: Optional[str] = None

    class Config:
        from_attributes = True


class UpdateAttendInfoRequest(BaseModel):
    """Request body for editing attendance info."""
    medium_nome: Optional[str] = Field(None, max_length=255)
    cambone_nome: Optional[str] = Field(None, max_length=255)
    atendimento_descricao: Optional[str] = None


class TicketListResponse(BaseModel):
    """Paginated ticket list response."""
    total: int
    skip: int
    limit: int
    items: List[TicketResponse]


@router.get("/giras/{gira_id}/tickets", response_model=TicketListResponse, dependencies=[Depends(require_any_group_permission(PermissionFeature.TICKETS, PermissionFeature.RELATORIO_GIRA, action="view"))])
async def list_gira_tickets(
    gira_id: UUID = Path(...),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    status_filter: Optional[TicketStatus] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TicketListResponse:
    """List tickets for a gira with pagination.
    
    Requires admin role.
    
    Query parameters:
    - skip: Offset for pagination
    - limit: Max results (1-500)
    - status_filter: Filter by ticket status (optional)
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")
    
    # Build query
    where_clause = and_(
        Ticket.tenant_id == current_user.tenant_id,
        Ticket.gira_id == gira_id,
    )
    
    if status_filter:
        where_clause = and_(where_clause, Ticket.status == status_filter)
    
    # Count total
    count_stmt = select(Ticket).where(where_clause)
    count_result = await db.execute(count_stmt)
    total = len(count_result.scalars().all())
    
    # Fetch paginated results with consulente data
    stmt = (
        select(Ticket)
        .options(selectinload(Ticket.consulente))
        .where(where_clause)
        .offset(skip)
        .limit(limit)
        .order_by(Ticket.numero)
    )
    result = await db.execute(stmt)
    tickets = result.scalars().all()
    
    items = []
    for t in tickets:
        preferencial = False
        if t.observacoes:
            try:
                obs = json.loads(t.observacoes)
                preferencial = obs.get("preferencial", False)
            except (json.JSONDecodeError, TypeError):
                pass
        items.append(TicketResponse(
            id=t.id,
            numero=t.numero,
            status=t.status.value if hasattr(t.status, 'value') else t.status,
            consulente_nome=t.consulente.nome if t.consulente else None,
            consulente_email=t.consulente.email if t.consulente else None,
            consulente_telefone=t.consulente.telefone if t.consulente else None,
            preferencial=preferencial,
            is_sponsor=t.is_sponsor,
            is_walk_in=t.is_walk_in,
            observacoes=t.observacoes if t.observacoes and not preferencial else None,
            chamado_em=t.chamado_em,
            finalizado_em=t.finalizado_em,
            checkin_em=t.checkin_em,
            medium_nome=t.medium_nome,
            cambone_nome=t.cambone_nome,
            atendimento_descricao=t.atendimento_descricao,
            created_at=t.created_at,
            resend_email_id=t.resend_email_id,
            email_sent_at=t.email_sent_at,
            email_provider=t.email_provider,
        ))
    
    return TicketListResponse(
        total=total,
        skip=skip,
        limit=limit,
        items=items,
    )


@router.get("/tickets/{ticket_id}", response_model=TicketResponse, dependencies=[Depends(require_group_permission(PermissionFeature.TICKETS, "view"))])
async def get_ticket(
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TicketResponse:
    """Get specific ticket.
    
    Requires admin role.
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")
    
    stmt = select(Ticket).where(
        and_(
            Ticket.id == ticket_id,
            Ticket.tenant_id == current_user.tenant_id,
        )
    )
    
    result = await db.execute(stmt)
    ticket = result.scalar_one_or_none()
    
    if not ticket:
        raise NotFoundError("Ticket não encontrado")
    
    # Load consulente
    await db.refresh(ticket, ["consulente"])
    
    preferencial = False
    if ticket.observacoes:
        try:
            obs = json.loads(ticket.observacoes)
            preferencial = obs.get("preferencial", False)
        except (json.JSONDecodeError, TypeError):
            pass
    
    return TicketResponse(
        id=ticket.id,
        numero=ticket.numero,
        status=ticket.status.value if hasattr(ticket.status, 'value') else ticket.status,
        consulente_nome=ticket.consulente.nome if ticket.consulente else None,
        consulente_email=ticket.consulente.email if ticket.consulente else None,
        consulente_telefone=ticket.consulente.telefone if ticket.consulente else None,
        preferencial=preferencial,
        is_sponsor=ticket.is_sponsor,
        is_walk_in=ticket.is_walk_in,
        observacoes=ticket.observacoes if ticket.observacoes and not preferencial else None,
        chamado_em=ticket.chamado_em,
        finalizado_em=ticket.finalizado_em,
        medium_nome=ticket.medium_nome,
        cambone_nome=ticket.cambone_nome,
        atendimento_descricao=ticket.atendimento_descricao,
        created_at=ticket.created_at,
        resend_email_id=ticket.resend_email_id,
        email_sent_at=ticket.email_sent_at,
        email_provider=ticket.email_provider,
    )


@router.patch("/tickets/{ticket_id}/attend-info", response_model=TicketResponse, dependencies=[Depends(require_group_permission(PermissionFeature.TICKETS, "edit"))])
async def update_attend_info(
    body: UpdateAttendInfoRequest,
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TicketResponse:
    """Edit attendance info (medium, cambone, description) on a ticket.

    Requires admin role. Enforces multi-tenant isolation.
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    stmt = select(Ticket).where(
        and_(
            Ticket.id == ticket_id,
            Ticket.tenant_id == current_user.tenant_id,
        )
    )
    result = await db.execute(stmt)
    ticket = result.scalar_one_or_none()

    if not ticket:
        raise NotFoundError("Ticket não encontrado")

    ticket.medium_nome = body.medium_nome
    ticket.cambone_nome = body.cambone_nome
    ticket.atendimento_descricao = body.atendimento_descricao

    audit = AuditService(db)
    await audit.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="Ticket",
        resource_id=ticket.id,
        new_state={
            "medium_nome": body.medium_nome,
            "cambone_nome": body.cambone_nome,
            "atendimento_descricao": body.atendimento_descricao,
        },
    )

    await db.commit()
    await db.refresh(ticket, ["consulente"])

    preferencial = False
    if ticket.observacoes:
        try:
            obs = json.loads(ticket.observacoes)
            preferencial = obs.get("preferencial", False)
        except (json.JSONDecodeError, TypeError):
            pass

    return TicketResponse(
        id=ticket.id,
        numero=ticket.numero,
        status=ticket.status.value if hasattr(ticket.status, 'value') else ticket.status,
        consulente_nome=ticket.consulente.nome if ticket.consulente else None,
        consulente_email=ticket.consulente.email if ticket.consulente else None,
        consulente_telefone=ticket.consulente.telefone if ticket.consulente else None,
        preferencial=preferencial,
        is_sponsor=ticket.is_sponsor,
        is_walk_in=ticket.is_walk_in,
        observacoes=ticket.observacoes if ticket.observacoes and not preferencial else None,
        chamado_em=ticket.chamado_em,
        finalizado_em=ticket.finalizado_em,
        medium_nome=ticket.medium_nome,
        cambone_nome=ticket.cambone_nome,
        atendimento_descricao=ticket.atendimento_descricao,
        created_at=ticket.created_at,
    )


async def _send_waitlist_promotion_email(
    db: AsyncSession,
    tenant_id,
    ticket: Ticket,
    gira_obj: Gira,
) -> None:
    """Compose and enqueue the 'a vaga é sua' email for a just-promoted ticket."""
    if not ticket.consulente:
        await db.refresh(ticket, ["consulente"])

    tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    tc_result = await db.execute(select(TenantConfig).where(TenantConfig.tenant_id == tenant_id))
    tenant_config = tc_result.scalar_one_or_none()

    tenant_name = tenant.name if tenant else ""
    tenant_address = (tenant_config.endereco or "") if tenant_config else ""
    primary_color = (tenant_config.primary_color or "#2E7D32") if tenant_config else "#2E7D32"
    secondary_color = (tenant_config.secondary_color or primary_color) if tenant_config else primary_color
    tenant_logo_url = ""
    if tenant_config and tenant_config.logo_data:
        tenant_logo_url = f"{settings.FRONTEND_URL.rstrip('/')}/api/v1/public/tenant/{tenant_id}/logo"
    elif tenant_config and tenant_config.logo_url:
        tenant_logo_url = tenant_config.logo_url

    ticket_number_formatted = f"P{ticket.numero:03d}" if ticket.is_sponsor else f"{ticket.numero:04d}"
    gira_date_str = gira_obj.data_inicio.astimezone(APP_TZ).strftime("%d/%m/%Y às %H:%M") if gira_obj.data_inicio else ""
    confirmation_hours = gira_obj.waitlist_confirmation_hours or waitlist_service.DEFAULT_CONFIRMATION_HOURS
    confirm_link = f"{settings.FRONTEND_URL.rstrip('/')}/public/waitlist/{ticket.id}/confirm"

    html_body = generate_waitlist_promotion_html(
        ticket_number=ticket_number_formatted,
        consulente_name=ticket.consulente.nome,
        gira_name=gira_obj.nome,
        gira_date=gira_date_str,
        gira_location=gira_obj.local or "",
        confirm_link=confirm_link,
        confirmation_hours=confirmation_hours,
        tenant_name=tenant_name,
        tenant_address=tenant_address,
        tenant_logo_url=tenant_logo_url,
        primary_color=primary_color,
        secondary_color=secondary_color,
    )
    text_body = generate_waitlist_promotion_text(
        ticket_number=ticket_number_formatted,
        consulente_name=ticket.consulente.nome,
        gira_name=gira_obj.nome,
        gira_date=gira_date_str,
        gira_location=gira_obj.local or "",
        confirm_link=confirm_link,
        confirmation_hours=confirmation_hours,
        tenant_name=tenant_name,
        tenant_address=tenant_address,
    )
    message = EmailMessage(
        to_email=ticket.consulente.email,
        subject=f"Uma vaga abriu para você! - {gira_obj.nome} - {tenant_name}",
        html_body=html_body,
        text_body=text_body,
    )
    email_queue.enqueue(EmailQueueItem(message=message, ticket_id=str(ticket.id)))


@router.delete("/giras/{gira_id}/tickets/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_group_permission(PermissionFeature.TICKETS, "delete"))])
async def delete_ticket(
    gira_id: UUID = Path(...),
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Excluir uma senha emitida, devolvendo a vaga ao range da gira.

    A senha é marcada como CANCELLED (soft delete) para preservar histórico
    e analytics. O campo slots_returned do SenhaControl é incrementado
    atomicamente para que a próxima emissão pública possa usar a vaga liberada.

    Restrições:
    - Somente ADMIN ou SUPER_ADMIN.
    - Ticket deve pertencer ao tenant e à gira informados na URL.
    - Apenas status EMITTED ou CALLED podem ser excluídos.
      COMPLETED e NO_SHOW são registros históricos imutáveis.
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    stmt = (
        select(Ticket)
        .options(selectinload(Ticket.consulente))
        .where(
            and_(
                Ticket.id == ticket_id,
                Ticket.tenant_id == current_user.tenant_id,
                Ticket.gira_id == gira_id,
            )
        )
    )
    result = await db.execute(stmt)
    ticket = result.scalar_one_or_none()

    if not ticket:
        raise NotFoundError("Ticket não encontrado")

    deletable_statuses = {TicketStatus.EMITTED, TicketStatus.CALLED}
    current_status = ticket.status if isinstance(ticket.status, TicketStatus) else TicketStatus(ticket.status)
    if current_status not in deletable_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Não é possível excluir uma senha com status '{current_status.value}'. "
                   "Somente senhas com status 'emitted' ou 'called' podem ser excluídas.",
        )

    consulente_email = ticket.consulente.email if ticket.consulente else None

    # Soft cancel + free up the slot atomically inside the same transaction
    ticket.status = TicketStatus.CANCELLED

    # If the waitlist feature is enabled for this tenant, the freed slot goes
    # first to whoever is next in line (respecting priority) instead of being
    # reopened to the general public. Only slots nobody in the queue could
    # take fall back to the old slots_returned behavior.
    unfilled_slots = 1
    promoted_tickets: list[Ticket] = []
    if await waitlist_service.waitlist_enabled_for_tenant(db, current_user.tenant_id):
        gira_result = await db.execute(
            select(Gira).where(and_(Gira.id == gira_id, Gira.tenant_id == current_user.tenant_id))
        )
        gira_obj = gira_result.scalar_one_or_none()
        if gira_obj:
            promoted_tickets, unfilled_slots = await waitlist_service.reconcile_and_fill(
                session=db,
                tenant_id=current_user.tenant_id,
                gira_id=gira_id,
                is_sponsor=ticket.is_sponsor,
                gira=gira_obj,
                extra_slots=1,
            )
            for promoted in promoted_tickets:
                await _send_waitlist_promotion_email(db, current_user.tenant_id, promoted, gira_obj)

    if unfilled_slots > 0:
        senha_control_repo = SenhaControlRepository(db, SenhaControl)
        for _ in range(unfilled_slots):
            try:
                await senha_control_repo.increment_slots_returned(
                    session=db,
                    tenant_id=current_user.tenant_id,
                    gira_id=gira_id,
                    is_sponsor=ticket.is_sponsor,
                )
            except ValueError:
                # SenhaControl missing (edge case: walk-in or legacy ticket) — proceed without slot return
                logger.warning(
                    "SenhaControl not found for gira=%s is_sponsor=%s during ticket delete "
                    "(ticket=%s). Slot not returned.",
                    gira_id,
                    ticket.is_sponsor,
                    ticket_id,
                )

    if ticket.time_slot_id is not None:
        time_slot_repo = GiraTimeSlotRepository(db)
        try:
            await time_slot_repo.increment_slots_returned(db, current_user.tenant_id, ticket.time_slot_id)
        except ValueError:
            logger.warning(
                "GiraTimeSlot not found (slot=%s) during ticket delete (ticket=%s). Slot not returned.",
                ticket.time_slot_id,
                ticket_id,
            )

    audit = AuditService(db)
    await audit.log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="Ticket",
        resource_id=ticket.id,
        previous_state={
            "numero": ticket.numero,
            "status": current_status.value,
            "consulente_email": consulente_email,
            "gira_id": str(gira_id),
            "is_sponsor": ticket.is_sponsor,
        },
    )

    await db.commit()


# ========== WAITLIST (FILA DE ESPERA) ENDPOINTS ==========


class WaitlistItemResponse(BaseModel):
    """A single waitlist entry with its computed queue state."""
    id: UUID
    numero: int
    consulente_nome: Optional[str] = None
    consulente_email: Optional[str] = None
    is_sponsor: bool = False
    priority_category: Optional[str] = None
    status: str  # "aguardando" | "aguardando_confirmacao" | "expirado"
    position: Optional[int] = None
    promoted_at: Optional[datetime] = None
    confirmation_expires_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


@router.get(
    "/giras/{gira_id}/waitlist",
    response_model=List[WaitlistItemResponse],
    dependencies=[Depends(require_group_permission(PermissionFeature.TICKETS, "view"))],
)
async def list_gira_waitlist(
    gira_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[WaitlistItemResponse]:
    """List the waitlist (fila de espera) for a gira, both regular and sponsor lines.

    Lazily expires lapsed promotions and cascades to the next candidate before
    returning, so the view is always up to date without a background job.
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    gira_result = await db.execute(
        select(Gira).where(and_(Gira.id == gira_id, Gira.tenant_id == current_user.tenant_id))
    )
    gira_obj = gira_result.scalar_one_or_none()
    if not gira_obj:
        raise NotFoundError("Gira não encontrada")

    if await waitlist_service.waitlist_enabled_for_tenant(db, current_user.tenant_id):
        for is_sponsor in (False, True):
            promoted, _ = await waitlist_service.reconcile_and_fill(
                session=db,
                tenant_id=current_user.tenant_id,
                gira_id=gira_id,
                is_sponsor=is_sponsor,
                gira=gira_obj,
                extra_slots=0,
            )
            for promoted_ticket in promoted:
                await _send_waitlist_promotion_email(db, current_user.tenant_id, promoted_ticket, gira_obj)
        await db.commit()

    stmt = (
        select(Ticket)
        .options(selectinload(Ticket.consulente))
        .where(
            and_(
                Ticket.tenant_id == current_user.tenant_id,
                Ticket.gira_id == gira_id,
                Ticket.status.in_([TicketStatus.WAITLISTED, TicketStatus.WAITLIST_EXPIRED]),
            )
        )
    )
    result = await db.execute(stmt)
    tickets = list(result.scalars().all())

    # Compute position among not-yet-promoted entries per line (regular / sponsor)
    positions: dict[UUID, int] = {}
    for is_sponsor in (False, True):
        pending = sorted(
            [t for t in tickets if t.is_sponsor == is_sponsor and t.status == TicketStatus.WAITLISTED and t.promoted_at is None],
            key=lambda t: (waitlist_service.priority_rank(t.priority_category), t.numero),
        )
        for idx, t in enumerate(pending, start=1):
            positions[t.id] = idx

    tickets.sort(key=lambda t: (t.is_sponsor, waitlist_service.priority_rank(t.priority_category), t.numero))

    items = []
    for t in tickets:
        if t.status == TicketStatus.WAITLIST_EXPIRED:
            item_status = "expirado"
        elif t.promoted_at is not None:
            item_status = "aguardando_confirmacao"
        else:
            item_status = "aguardando"
        items.append(WaitlistItemResponse(
            id=t.id,
            numero=t.numero,
            consulente_nome=t.consulente.nome if t.consulente else None,
            consulente_email=t.consulente.email if t.consulente else None,
            is_sponsor=t.is_sponsor,
            priority_category=t.priority_category,
            status=item_status,
            position=positions.get(t.id),
            promoted_at=t.promoted_at,
            confirmation_expires_at=t.confirmation_expires_at,
            created_at=t.created_at,
        ))
    return items


class WaitlistPromoteRequest(BaseModel):
    """Body for the manual waitlist promotion action.

    require_confirmation=True (default): reserves the slot and sends the
    "sua vaga abriu" email — the consulente must confirm within the window.
    require_confirmation=False: releases the senha immediately as EMITTED,
    no confirmation needed, sending the standard ticket-emission email —
    for when the operator wants full autonomy over who gets in and when.
    """
    require_confirmation: bool = True


@router.post(
    "/giras/{gira_id}/waitlist/{ticket_id}/promote",
    response_model=WaitlistItemResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.TICKETS, "edit"))],
)
async def promote_waitlist_ticket(
    body: WaitlistPromoteRequest = WaitlistPromoteRequest(),
    gira_id: UUID = Path(...),
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WaitlistItemResponse:
    """Manually promote a specific waitlisted ticket out of order.

    Bumps SenhaControl.slots_returned by one (the admin is explicitly opening
    one extra slot for this person) then either reserves it pending consulente
    confirmation, or — when require_confirmation=False — releases the senha
    immediately, at the operator's discretion.
    """
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    if not await waitlist_service.waitlist_enabled_for_tenant(db, current_user.tenant_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fila de espera não está habilitada para este tenant")

    gira_result = await db.execute(
        select(Gira).where(and_(Gira.id == gira_id, Gira.tenant_id == current_user.tenant_id))
    )
    gira_obj = gira_result.scalar_one_or_none()
    if not gira_obj:
        raise NotFoundError("Gira não encontrada")

    stmt = (
        select(Ticket)
        .options(selectinload(Ticket.consulente))
        .where(
            and_(
                Ticket.id == ticket_id,
                Ticket.tenant_id == current_user.tenant_id,
                Ticket.gira_id == gira_id,
                Ticket.status == TicketStatus.WAITLISTED,
            )
        )
    )
    result = await db.execute(stmt)
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise NotFoundError("Senha não encontrada na fila de espera")
    if ticket.promoted_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Esta senha já foi promovida")

    senha_control_repo = SenhaControlRepository(db, SenhaControl)
    try:
        await senha_control_repo.increment_slots_returned(
            session=db,
            tenant_id=current_user.tenant_id,
            gira_id=gira_id,
            is_sponsor=ticket.is_sponsor,
        )
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Controle de senhas não encontrado para esta gira")

    if body.require_confirmation:
        waitlist_service.promote_ticket(ticket, gira_obj)
        await db.flush()
        await _send_waitlist_promotion_email(db, current_user.tenant_id, ticket, gira_obj)
        audit_action = "manual_promote"
        response_status = "aguardando_confirmacao"
    else:
        ticket.status = TicketStatus.EMITTED
        await db.flush()
        await waitlist_service.send_confirmed_ticket_email(db, ticket)
        audit_action = "manual_release_no_confirmation"
        response_status = "emitido"

    audit = AuditService(db)
    await audit.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="TicketWaitlist",
        resource_id=ticket.id,
        new_state={"action": audit_action, "numero": ticket.numero},
    )
    await db.commit()

    return WaitlistItemResponse(
        id=ticket.id,
        numero=ticket.numero,
        consulente_nome=ticket.consulente.nome if ticket.consulente else None,
        consulente_email=ticket.consulente.email if ticket.consulente else None,
        is_sponsor=ticket.is_sponsor,
        priority_category=ticket.priority_category,
        status=response_status,
        position=None,
        promoted_at=ticket.promoted_at,
        confirmation_expires_at=ticket.confirmation_expires_at,
        created_at=ticket.created_at,
    )


@router.delete(
    "/giras/{gira_id}/waitlist/{ticket_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_group_permission(PermissionFeature.TICKETS, "delete"))],
)
async def remove_waitlist_ticket(
    gira_id: UUID = Path(...),
    ticket_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a consulente from the waitlist (e.g. no longer interested)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Admin required")

    stmt = select(Ticket).where(
        and_(
            Ticket.id == ticket_id,
            Ticket.tenant_id == current_user.tenant_id,
            Ticket.gira_id == gira_id,
            Ticket.status == TicketStatus.WAITLISTED,
        )
    )
    result = await db.execute(stmt)
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise NotFoundError("Senha não encontrada na fila de espera")

    ticket.status = TicketStatus.CANCELLED

    audit = AuditService(db)
    await audit.log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="TicketWaitlist",
        resource_id=ticket.id,
        previous_state={"numero": ticket.numero, "gira_id": str(gira_id)},
    )
    await db.commit()
