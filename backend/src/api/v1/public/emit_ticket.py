"""
T038: Public Emit Ticket Endpoint - CORE MVP FUNCTIONALITY
POST /api/v1/public/emit-ticket - Issue a new senha/ticket

This is the heart of the product. Handles atomic ticket emission with:
- Consulente lookup/creation
- Atomic ticket counter increment (no race conditions)
- Email sending (Brevo + Resend fallback)
- Comprehensive error handling
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select, and_
from datetime import datetime, timezone
import json
import logging
import hashlib
import uuid
import sentry_sdk
from src.core.tz import APP_TZ

from src.core.config import settings
from src.core.database import get_db
from src.core.errors import APIException
from src.models.tenants import Tenant
from src.models.giras import Gira
from src.models.tenant_config import TenantConfig
from src.repositories.consulente_repo import ConsulenteRepository
from src.repositories.senha_control_repo import SenhaControlRepository
from src.models.tickets import TicketStatus, PriorityCategory
from src.repositories.ticket_repo import TicketRepository
from src.services.email.base import EmailMessage
from src.services.email.email_queue import email_queue, EmailQueueItem
from src.services.email.templates.ticket_emission import (
    generate_ticket_emission_html,
    generate_plain_text_fallback,
)
from src.services.email.templates.waitlist import (
    generate_waitlist_entry_html,
    generate_waitlist_entry_text,
)
from src.services import waitlist_service
from src.services.time_slot_service import time_slot_scheduling_enabled_for_tenant
from src.repositories.gira_time_slot_repo import GiraTimeSlotRepository, TimeSlotFullError
from src.core.limiter import limiter

router = APIRouter(prefix="/api/v1/public", tags=["public"])
logger = logging.getLogger(__name__)


class EmitTicketRequest(BaseModel):
    """Request body for ticket emission
    
    Fields:
        name: Consulente name (required)
        email: Consulente email (required, validated)
        phone: Phone number (optional, for contact)
        priority_category: Preferential category (optional)
        preferencial: DEPRECATED — use priority_category instead. Kept for backward compatibility.
    """

    name: str = Field(..., min_length=2, max_length=255)
    email: EmailStr
    phone: str | None = Field(None, max_length=20)
    priority_category: str | None = None
    # Agendamento por horário: obrigatório quando gira.use_time_slots está ligado.
    # Ignorado (não requerido) quando a gira não usa a feature.
    time_slot_id: uuid.UUID | None = None
    # DEPRECATED: use priority_category instead
    preferencial: bool = False
    # Acompanhantes: nomes dos acompanhantes que o titular vai levar. Só aceito
    # quando gira.allow_acompanhantes está ligado, limitado a
    # gira.max_acompanhantes. Cada acompanhante recebe uma senha própria com
    # número da mesma sequência, vinculada à do titular (parent_ticket_id).
    acompanhantes: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("acompanhantes")
    @classmethod
    def validate_acompanhantes(cls, v: list[str]) -> list[str]:
        cleaned: list[str] = []
        for nome in v:
            nome = (nome or "").strip()
            if len(nome) < 2:
                raise ValueError("Informe o nome de cada acompanhante (mínimo 2 letras)")
            if len(nome) > 255:
                raise ValueError("Nome de acompanhante muito longo (máximo 255 letras)")
            cleaned.append(nome)
        return cleaned

    @field_validator("priority_category")
    @classmethod
    def validate_priority_category(cls, v: str | None) -> str | None:
        if v is None:
            return None
        allowed = {cat.value for cat in PriorityCategory}
        if v not in allowed:
            raise ValueError(
                f"Categoria de prioridade inválida: '{v}'. "
                f"Valores aceitos: {', '.join(sorted(allowed))}"
            )
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "name": "João da Silva",
                "email": "joao@example.com",
                "phone": "+5511987654321",
                "priority_category": "ELDERLY",
            }
        }


class AcompanhanteEmitido(BaseModel):
    """Senha extra emitida para um acompanhante do titular."""

    name: str
    ticket_number: str


class EmitTicketResponse(BaseModel):
    """Response after ticket emission
    
    Fields:
        ticket_number: Formatted ticket number (e.g., "0042")
        email_sent: Whether email was sent successfully
        rescue_link: URL to redeem ticket (frontend will fill tenant)
        message: Human-readable confirmation message
    """

    ticket_number: str
    email_sent: bool
    rescue_link: str
    message: str
    waitlisted: bool = False
    waitlist_position: int | None = None
    # True when the consulente already had a ticket in this gira and this
    # request only registered their priority on it (no new ticket emitted).
    priority_upgraded: bool = False
    # Senhas extras emitidas para os acompanhantes do titular (mesma ordem do
    # request). Vazio quando a emissão não teve acompanhantes.
    acompanhantes: list[AcompanhanteEmitido] = []


async def _tenant_branding(session: AsyncSession, tenant: Tenant) -> tuple[str, str, str, str]:
    """Load (address, primary_color, secondary_color, logo_url) for emails."""
    tc_query = select(TenantConfig).where(TenantConfig.tenant_id == tenant.id)
    tc_result = await session.execute(tc_query)
    tenant_config = tc_result.scalar_one_or_none()

    tenant_address = (tenant_config.endereco or "") if tenant_config else ""
    primary_color = (tenant_config.primary_color or "#2E7D32") if tenant_config else "#2E7D32"
    secondary_color = (tenant_config.secondary_color or primary_color) if tenant_config else primary_color

    tenant_logo_url = ""
    if tenant_config and tenant_config.logo_data:
        tenant_logo_url = f"{settings.FRONTEND_URL.rstrip('/')}/api/v1/public/tenant/{tenant.id}/logo"
    elif tenant_config and tenant_config.logo_url:
        tenant_logo_url = tenant_config.logo_url

    return tenant_address, primary_color, secondary_color, tenant_logo_url


async def _upgrade_duplicate_priority(
    session: AsyncSession,
    ticket_repo: TicketRepository,
    tenant: Tenant,
    gira: Gira,
    consulente_id: uuid.UUID,
    is_sponsor: bool,
    priority_category: str,
) -> EmitTicketResponse | None:
    """Duplicate emission that carries a priority the existing ticket lacks:
    register the priority on the existing ticket and resend its email, instead
    of discarding the information with a plain 409.

    Returns None when the plain 409 should still be raised (no upgradable
    ticket: not found, already prioritized, or in a non-upgradable status).
    """
    existing = await ticket_repo.get_duplicate_in_gira(
        session=session,
        tenant_id=tenant.id,
        gira_id=gira.id,
        consulente_id=consulente_id,
        is_sponsor=is_sponsor,
    )
    if existing is None or existing.priority_category is not None:
        return None
    if existing.status not in (TicketStatus.EMITTED, TicketStatus.WAITLISTED):
        return None

    existing.priority_category = priority_category
    try:
        obs = json.loads(existing.observacoes) if existing.observacoes else {}
        if not isinstance(obs, dict):
            obs = {}
    except (json.JSONDecodeError, TypeError):
        obs = {}
    obs["preferencial"] = True
    existing.observacoes = json.dumps(obs)
    await session.commit()

    ticket_number_formatted = (
        f"P{existing.numero:03d}" if existing.is_sponsor else f"{existing.numero:04d}"
    )
    rescue_link = (
        f"{settings.FRONTEND_URL.rstrip('/')}/public/{tenant.slug}/ticket/{existing.id}"
    )

    logger.info(
        f"Ticket {ticket_number_formatted} priority upgraded to {priority_category} "
        f"on duplicate emission (tenant={tenant.slug}, gira={gira.id})"
    )

    if existing.status == TicketStatus.EMITTED:
        await waitlist_service.send_confirmed_ticket_email(session, existing)
        return EmitTicketResponse(
            ticket_number=ticket_number_formatted,
            email_sent=True,
            rescue_link=rescue_link,
            message=(
                f"Você já tinha a senha {ticket_number_formatted} para esta gira — "
                "registramos seu atendimento preferencial nela e reenviamos o "
                "e-mail de confirmação."
            ),
            priority_upgraded=True,
        )

    # WAITLISTED: the priority changes the queue ordering. When still in the
    # queue (not promoted), recompute the position and resend the entry email.
    waitlist_position: int | None = None
    email_sent = False
    if existing.promoted_at is None:
        waitlist_position = await waitlist_service.compute_queue_position(
            session=session,
            tenant_id=tenant.id,
            gira_id=gira.id,
            is_sponsor=is_sponsor,
            ticket=existing,
        )
        _, primary_color, secondary_color, tenant_logo_url = await _tenant_branding(session, tenant)
        gira_date_str = (
            gira.data_inicio.astimezone(APP_TZ).strftime("%d/%m/%Y às %H:%M")
            if gira.data_inicio else ""
        )
        html_body = generate_waitlist_entry_html(
            consulente_name=existing.consulente.nome,
            gira_name=gira.nome,
            gira_date=gira_date_str,
            position=waitlist_position or 1,
            tenant_name=tenant.name,
            tenant_logo_url=tenant_logo_url,
            primary_color=primary_color,
            secondary_color=secondary_color,
        )
        text_body = generate_waitlist_entry_text(
            consulente_name=existing.consulente.nome,
            gira_name=gira.nome,
            gira_date=gira_date_str,
            position=waitlist_position or 1,
            tenant_name=tenant.name,
        )
        message = EmailMessage(
            to_email=existing.consulente.email,
            subject=f"Você está na fila de espera - {gira.nome} - {tenant.name}",
            html_body=html_body,
            text_body=text_body,
        )
        email_queue.enqueue(EmailQueueItem(message=message, ticket_id=str(existing.id)))
        email_sent = True
        response_message = (
            "Você já estava na fila de espera desta gira — registramos seu "
            f"atendimento preferencial e sua posição agora é {waitlist_position or 1}."
        )
    else:
        response_message = (
            "Você já tem uma vaga reservada nesta gira — registramos seu "
            "atendimento preferencial. Confirme sua senha pelo e-mail que enviamos."
        )

    return EmitTicketResponse(
        ticket_number=ticket_number_formatted,
        email_sent=email_sent,
        rescue_link=rescue_link,
        message=response_message,
        waitlisted=True,
        waitlist_position=waitlist_position,
        priority_upgraded=True,
    )


@router.post("/emit-ticket", response_model=EmitTicketResponse)
@limiter.limit("30/minute")
async def emit_ticket(
    request: Request,
    tenant_slug: str,
    tipo: str = "regular",
    body: EmitTicketRequest = ...,
    session: AsyncSession = Depends(get_db),
    gira_id: uuid.UUID | None = None,
):
    """Emit a new ticket for public consultee

    This endpoint handles the complete ticket emission flow:
    1. Validate tenant exists
    2. Validate gira is active and has capacity
    3. Lookup or create consulente (with email normalization)
    4. Check for duplicates in same gira (prevent dual emission)
    5. Atomically increment ticket number
    6. Create ticket record
    7. Send email via Brevo (with Resend fallback)
    
    Public endpoint: No authentication required!

    Path Parameters:
        tenant_slug: Tenant identifier (e.g., "espiritismo-sp")
        gira_id: Optional. Pins emission to this exact gira. Always pass this
            when the caller already knows which gira it's showing (e.g. the
            direct /public/gira/{id} link) — without it, this endpoint picks
            "whichever gira has an open release window right now" for the
            tenant, which is ambiguous when two giras are open at once.

    Body:
        {
            "name": "João da Silva",
            "email": "joao@example.com",
            "phone": "+5511987654321"
        }

    Response:
        {
            "ticket_number": "0042",
            "email_sent": true,
            "rescue_link": "https://app.example.com/public/espiritismo-sp/ticket/0042",
            "message": "Ticket emitted successfully! Check your email."
        }

    Status Codes:
        200 OK: Ticket emitted successfully
        404 Not Found: Tenant or gira not found
        400 Bad Request: Invalid email, name too short, etc
        409 Conflict: Consulente already has ticket in this gira
        429 Too Many Requests: Gira capacity reached or rate limited
        500 Internal Server Error: Database/email service failure

    Error Examples:
        {
            "detail": "Tenant 'espiritismo-sp' not found"
        }
        
        {
            "detail": "No active gira available for ticket emission"
        }
        
        {
            "detail": "This email already has a ticket for this gira"
        }
        
        {
            "detail": "All tickets for this gira have been emitted"
        }
    """

    try:
        # tipo=associado: use sponsor/associado emission window (sponsor_release_*)
        # tipo=regular (default): use normal emission window (release_*)
        is_sponsor = tipo.lower() in ("associado", "patrocinador")

        # === STEP 1: Validate Tenant ===
        tenant_query = select(Tenant).where(
            Tenant.slug == tenant_slug.lower().strip()
        )
        tenant_result = await session.execute(tenant_query)
        tenant = tenant_result.scalar_one_or_none()

        if not tenant:
            raise HTTPException(
                status_code=404,
                detail="Recurso não encontrado",
            )

        # === STEP 2: Validate Gira Active and Has Capacity ===
        # gira_id pins emission to the exact gira the caller is looking at
        # (e.g. the direct /public/gira/{id} link). Without it — legacy
        # entry points that only know tenant+tipo — we fall back to
        # resolving whichever gira has an open release window right now.
        # That fallback is ambiguous when two giras are open at once, so any
        # caller that already knows the gira MUST pass gira_id.
        now = datetime.now(timezone.utc)

        gira_id_filter = [Gira.id == gira_id] if gira_id is not None else []

        if is_sponsor:
            # Sponsor: use sponsor emission window
            gira_query = (
                select(Gira)
                .where(
                    and_(
                        Gira.tenant_id == tenant.id,
                        Gira.is_active == True,
                        Gira.deleted_at.is_(None),
                        Gira.sponsor_release_start_at <= now,
                        Gira.sponsor_release_end_at >= now,
                        Gira.sponsor_max_tickets.isnot(None),
                        *gira_id_filter,
                    )
                )
                .order_by(Gira.sponsor_release_start_at.asc())
                .limit(1)
            )
        else:
            # Regular: use normal emission window
            gira_query = (
                select(Gira)
                .where(
                    and_(
                        Gira.tenant_id == tenant.id,
                        Gira.is_active == True,
                        Gira.deleted_at.is_(None),
                        Gira.release_start_at <= now,  # Has started
                        Gira.release_end_at >= now,  # Not ended
                        *gira_id_filter,
                    )
                )
                .order_by(Gira.release_start_at.asc())
                .limit(1)
            )
        gira_result = await session.execute(gira_query)
        gira = gira_result.scalar_one_or_none()

        if not gira:
            raise HTTPException(
                status_code=404,
                detail="Nenhuma gira disponível para emissão no momento",
            )

        # === STEP 2b: Validate Associado Email (if enabled) ===
        if is_sponsor:
            tc_check = select(TenantConfig).where(TenantConfig.tenant_id == tenant.id)
            tc_check_result = await session.execute(tc_check)
            tc = tc_check_result.scalar_one_or_none()
            if tc and tc.validate_associado_on_emit:
                from src.repositories.associado_repo import AssociadoRepository
                assoc_repo = AssociadoRepository(session)
                if not await assoc_repo.email_exists(tenant.id, body.email):
                    raise HTTPException(
                        status_code=422,
                        detail="E-mail de associado não encontrado. Revise as informações digitadas e tente novamente.",
                    )

        # === STEP 2c: Validate Acompanhantes (per-gira opt-in) ===
        acompanhantes_nomes = body.acompanhantes
        if acompanhantes_nomes:
            max_acompanhantes = gira.max_acompanhantes or 0
            if not gira.allow_acompanhantes or max_acompanhantes <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="Esta gira não permite acompanhantes",
                )
            if len(acompanhantes_nomes) > max_acompanhantes:
                raise HTTPException(
                    status_code=400,
                    detail=f"Esta gira permite no máximo {max_acompanhantes} acompanhante(s) por senha",
                )

        # === STEP 3: Initialize Repositories ===
        from src.models.consulentes import Consulente
        from src.models.senha_controls import SenhaControl
        from src.models.tickets import Ticket
        consulente_repo = ConsulenteRepository(session, Consulente)
        senha_control_repo = SenhaControlRepository(session, SenhaControl)
        ticket_repo = TicketRepository(session, Ticket)

        # === STEP 4: Lookup or Create Consulente ===
        try:
            consulente, is_new = await consulente_repo.upsert_consulente(
                session=session,
                tenant_id=tenant.id,
                name=body.name,
                email=body.email,
                phone=body.phone,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        # Resolve priority_category: new field takes precedence; fallback from deprecated preferencial
        priority_category = body.priority_category
        if priority_category is None and body.preferencial:
            priority_category = PriorityCategory.ELDERLY.value

        # === STEP 5: Check for Duplicate in Same Gira ===
        has_duplicate = await ticket_repo.check_duplicate_in_gira(
            session=session,
            tenant_id=tenant.id,
            gira_id=gira.id,
            consulente_id=consulente.id,
            is_sponsor=is_sponsor,
        )

        if has_duplicate:
            # Re-emission that adds a priority the existing ticket lacks
            # (consulente forgot to mark it the first time): register the
            # priority and resend the email instead of just rejecting.
            if priority_category is not None:
                upgraded = await _upgrade_duplicate_priority(
                    session=session,
                    ticket_repo=ticket_repo,
                    tenant=tenant,
                    gira=gira,
                    consulente_id=consulente.id,
                    is_sponsor=is_sponsor,
                    priority_category=priority_category,
                )
                if upgraded is not None:
                    return upgraded
            raise HTTPException(
                status_code=409,
                detail="Este e-mail já possui uma senha emitida para esta gira",
            )

        # === STEP 6: Get or Create SenhaControl (for atomic counting) ===
        await senha_control_repo.get_or_create_for_gira(
            session=session,
            tenant_id=tenant.id,
            gira_id=gira.id,
            initial_number=0,
            is_sponsor=is_sponsor,
        )

        # === STEP 7: Atomically Increment Counter ===
        try:
            ticket_number_int = await senha_control_repo.increment_atomic(
                session=session,
                tenant_id=tenant.id,
                gira_id=gira.id,
                is_sponsor=is_sponsor,
            )
        except ValueError:
            raise HTTPException(
                status_code=500,
                detail="Failed to allocate ticket number",
            )

        # Check capacity (account for admin-returned slots)
        max_cap = gira.sponsor_max_tickets if is_sponsor else gira.max_tickets
        sc = await senha_control_repo.get_by_gira(
            session=session,
            tenant_id=tenant.id,
            gira_id=gira.id,
            is_sponsor=is_sponsor,
        )
        slots_returned = sc.slots_returned if sc else 0
        is_over_capacity = ticket_number_int > max_cap + slots_returned

        waitlisted = False
        if is_over_capacity:
            # Grupo com acompanhantes não entra na fila de espera (a fila
            # promove uma vaga por vez e não garante números contíguos para o
            # grupo) — o titular pode reenviar sem acompanhantes se quiser.
            if acompanhantes_nomes:
                waitlist_available = await waitlist_service.waitlist_enabled_for_tenant(session, tenant.id)
                await session.rollback()
                detail = "Todas as senhas desta gira já foram emitidas"
                if waitlist_available:
                    detail += ". Para entrar na fila de espera, emita sem acompanhantes"
                raise HTTPException(status_code=410, detail=detail)
            waitlisted = await waitlist_service.waitlist_enabled_for_tenant(session, tenant.id)
            if not waitlisted:
                await session.rollback()
                raise HTTPException(
                    status_code=410,
                    detail="Todas as senhas desta gira já foram emitidas",
                )

        # === STEP 7b: Claim Time Slot (agendamento por horário, if enabled) ===
        # A full slot has no waitlist fallback (product decision — the UI just
        # hides/disables it), so this is a hard reject unless the gira-level
        # capacity above already routed the ticket to the waitlist, in which
        # case there's no fixed horário to hold and the claimed slot (if any)
        # is given back.
        time_slot_id_for_ticket = None
        horario_desejado_str: str | None = None
        gira_uses_time_slots = gira.use_time_slots and await time_slot_scheduling_enabled_for_tenant(
            session, tenant.id
        )
        if gira_uses_time_slots:
            if not body.time_slot_id:
                await session.rollback()
                raise HTTPException(status_code=400, detail="Selecione um horário de atendimento")

            slot_repo = GiraTimeSlotRepository(session)
            slot = await slot_repo.get_by_id_for_gira(session, tenant.id, gira.id, body.time_slot_id)
            if not slot:
                await session.rollback()
                raise HTTPException(status_code=404, detail="Horário inválido para esta gira")

            if waitlisted:
                # Ticket is going to the general waitlist (gira-level capacity
                # exhausted) — it has no fixed horário in this MVP.
                time_slot_id_for_ticket = None
            else:
                try:
                    await slot_repo.increment_atomic(session, tenant.id, gira.id, slot.id)
                    time_slot_id_for_ticket = slot.id
                    horario_desejado_str = slot.horario.strftime("%H:%M")
                except TimeSlotFullError:
                    # Nothing has been committed yet — rollback undoes the
                    # STEP 7 SenhaControl.increment_atomic too, so gira
                    # capacity accounting stays correct without extra bookkeeping.
                    await session.rollback()
                    raise HTTPException(
                        status_code=410,
                        detail="Este horário não tem mais vagas disponíveis. Escolha outro horário.",
                    )
                except ValueError:
                    # The slot was deleted between get_by_id_for_gira above and
                    # the SELECT FOR UPDATE in increment_atomic — e.g. an admin
                    # edited/removed the horário while this consulente had the
                    # form open. Same rollback rationale as above.
                    await session.rollback()
                    raise HTTPException(
                        status_code=409,
                        detail="Este horário deixou de estar disponível. Atualize a página e escolha outro horário.",
                    )

        # === STEP 7c: Allocate Acompanhante Numbers (same sequence) ===
        # O grupo inteiro precisa caber na capacidade — se não couber, a emissão
        # toda é desfeita (rollback devolve os números do STEP 7/7c e as vagas
        # de horário, que ainda não foram commitados).
        acompanhante_numeros: list[int] = []
        if acompanhantes_nomes and not waitlisted:
            for _ in acompanhantes_nomes:
                acomp_num = await senha_control_repo.increment_atomic(
                    session=session,
                    tenant_id=tenant.id,
                    gira_id=gira.id,
                    is_sponsor=is_sponsor,
                )
                if acomp_num > max_cap + slots_returned:
                    vagas_restantes = max(0, max_cap + slots_returned - ticket_number_int + 1)
                    await session.rollback()
                    raise HTTPException(
                        status_code=410,
                        detail=(
                            f"Restam apenas {vagas_restantes} senha(s) nesta gira — não é possível "
                            f"emitir para você e mais {len(acompanhantes_nomes)} acompanhante(s). "
                            "Tente com menos acompanhantes."
                        ),
                    )
                acompanhante_numeros.append(acomp_num)

            if time_slot_id_for_ticket is not None:
                # Acompanhantes ocupam o mesmo horário do titular.
                for _ in acompanhantes_nomes:
                    try:
                        await slot_repo.increment_atomic(session, tenant.id, gira.id, time_slot_id_for_ticket)
                    except (TimeSlotFullError, ValueError):
                        await session.rollback()
                        raise HTTPException(
                            status_code=410,
                            detail=(
                                "Este horário não tem vagas suficientes para você e seus "
                                "acompanhantes. Escolha outro horário."
                            ),
                        )

        # === STEP 8: Create Ticket Record ===
        ticket_number_formatted = f"P{ticket_number_int:03d}" if is_sponsor else f"{ticket_number_int:04d}"

        obs_payload: dict = {}
        if is_sponsor:
            obs_payload["patrocinador"] = True
        if priority_category is not None:
            obs_payload["preferencial"] = True
        observacoes = json.dumps(obs_payload) if obs_payload else None
        ticket = await ticket_repo.create_ticket(
            session=session,
            tenant_id=tenant.id,
            gira_id=gira.id,
            consulente_id=consulente.id,
            numero=ticket_number_int,
            status=TicketStatus.WAITLISTED if waitlisted else TicketStatus.EMITTED,
            observacoes=observacoes,
            priority_category=priority_category,
            is_sponsor=is_sponsor,
            time_slot_id=time_slot_id_for_ticket,
        )

        # Acompanhantes: cada um vira um consulente próprio (sem e-mail, mesmo
        # padrão do walk-in) com senha vinculada à do titular.
        acompanhantes_emitidos: list[tuple[str, str]] = []  # (nome, número formatado)
        for nome_acomp, numero_acomp in zip(acompanhantes_nomes, acompanhante_numeros):
            acomp_consulente = await consulente_repo.create_walk_in_consulente(
                session=session,
                tenant_id=tenant.id,
                name=nome_acomp,
            )
            await ticket_repo.create_ticket(
                session=session,
                tenant_id=tenant.id,
                gira_id=gira.id,
                consulente_id=acomp_consulente.id,
                numero=numero_acomp,
                status=TicketStatus.EMITTED,
                is_sponsor=is_sponsor,
                time_slot_id=time_slot_id_for_ticket,
                is_acompanhante=True,
                parent_ticket_id=ticket.id,
            )
            numero_acomp_formatted = f"P{numero_acomp:03d}" if is_sponsor else f"{numero_acomp:04d}"
            acompanhantes_emitidos.append((nome_acomp, numero_acomp_formatted))

        # Commit transaction
        await session.commit()

        logger.info(
            f"Ticket {ticket_number_formatted} emitted for {consulente.email} "
            f"with {len(acompanhantes_emitidos)} acompanhante(s) "
            f"(tenant={tenant.slug}, gira={gira.id})"
        )

        # === STEP 9: Send Email in Background ===
        rescue_link = (
            f"{settings.FRONTEND_URL.rstrip('/')}/public/{tenant.slug}/ticket/{ticket.id}"
        )
        cancel_link = (
            f"{settings.FRONTEND_URL.rstrip('/')}/public/ticket/{ticket.id}/cancelar"
        )

        gira_date_str = gira.data_inicio.astimezone(APP_TZ).strftime("%d/%m/%Y às %H:%M") if gira.data_inicio else ""

        # Fetch tenant config for address + colors + logo
        tenant_address, primary_color, secondary_color, tenant_logo_url = await _tenant_branding(session, tenant)

        subject_prefix = "✦ Associado — " if is_sponsor else ""

        waitlist_position: int | None = None
        if waitlisted:
            waitlist_position = await waitlist_service.compute_queue_position(
                session=session,
                tenant_id=tenant.id,
                gira_id=gira.id,
                is_sponsor=is_sponsor,
                ticket=ticket,
            )
            html_body = generate_waitlist_entry_html(
                consulente_name=consulente.nome,
                gira_name=gira.nome,
                gira_date=gira_date_str,
                position=waitlist_position or 1,
                tenant_name=tenant.name,
                tenant_logo_url=tenant_logo_url,
                primary_color=primary_color,
                secondary_color=secondary_color,
            )
            text_body = generate_waitlist_entry_text(
                consulente_name=consulente.nome,
                gira_name=gira.nome,
                gira_date=gira_date_str,
                position=waitlist_position or 1,
                tenant_name=tenant.name,
            )
            message = EmailMessage(
                to_email=consulente.email,
                subject=f"Você está na fila de espera - {gira.nome} - {tenant.name}",
                html_body=html_body,
                text_body=text_body,
            )
        else:
            html_body = generate_ticket_emission_html(
                ticket_number=ticket_number_formatted,
                consulente_name=consulente.nome,
                gira_name=gira.nome,
                gira_date=gira_date_str,
                gira_location=gira.local or "",
                rescue_link=rescue_link,
                tenant_name=tenant.name,
                tenant_logo_url=tenant_logo_url,
                tenant_color=primary_color,
                is_sponsor=is_sponsor,
                tenant_address=tenant_address,
                primary_color=primary_color,
                secondary_color=secondary_color,
                consulente_email=consulente.email,
                consulente_phone=consulente.telefone or "",
                priority_category=priority_category,
                recados=gira.recados,
                horario_desejado=horario_desejado_str,
                cancel_link=cancel_link,
                acompanhantes=acompanhantes_emitidos or None,
            )
            text_body = generate_plain_text_fallback(
                ticket_number=ticket_number_formatted,
                consulente_name=consulente.nome,
                gira_name=gira.nome,
                gira_date=gira_date_str,
                gira_location=gira.local or "",
                rescue_link=rescue_link,
                is_sponsor=is_sponsor,
                tenant_address=tenant_address,
                tenant_name=tenant.name,
                consulente_email=consulente.email,
                consulente_phone=consulente.telefone or "",
                priority_category=priority_category,
                recados=gira.recados,
                horario_desejado=horario_desejado_str,
                cancel_link=cancel_link,
                acompanhantes=acompanhantes_emitidos or None,
            )
            message = EmailMessage(
                to_email=consulente.email,
                subject=f"{subject_prefix}Sua Senha #{ticket_number_formatted} - {tenant.name}",
                html_body=html_body,
                text_body=text_body,
            )
        email_queue.enqueue(EmailQueueItem(message=message, ticket_id=str(ticket.id)))

        # === STEP 10: Return Response ===
        if waitlisted:
            return EmitTicketResponse(
                ticket_number=ticket_number_formatted,
                email_sent=True,
                rescue_link=rescue_link,
                message=f"Gira lotada — você entrou na fila de espera (posição {waitlist_position or 1}).",
                waitlisted=True,
                waitlist_position=waitlist_position,
            )

        return EmitTicketResponse(
            ticket_number=ticket_number_formatted,
            email_sent=True,  # Will be true if sent successfully
            rescue_link=rescue_link,
            message="Ticket emitted successfully! Check your email for confirmation.",
            acompanhantes=[
                AcompanhanteEmitido(name=nome, ticket_number=numero)
                for nome, numero in acompanhantes_emitidos
            ],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in emit_ticket: {e}", exc_info=True)
        # Caught here to attach a friendly HTTPException instead of a raw
        # 500 traceback — but that means it never reaches Sentry's default
        # exception-propagation capture, so it has to be sent explicitly.
        sentry_sdk.capture_exception(e)
        await session.rollback()
        raise HTTPException(
            status_code=500,
            detail="Internal server error during ticket emission",
        )
