"""Waitlist service — fila de espera de senhas.

When a gira reaches `max_tickets`, tenants with the waitlist feature enabled
(PRO+/Premium, toggle `TenantConfig.enable_waitlist`) allow further requests
to be recorded as `TicketStatus.WAITLISTED` instead of being rejected.

Queue ordering reuses the ticket's already-assigned sequential `numero` (the
same atomic counter used for regular emission) — no separate position field
is needed. Order is priority_category (see `PRIORITY_ORDER`) first, then
`numero` ascending.

A "reservation slot" is a promoted-but-unconfirmed ticket: `promoted_at` set,
`confirmation_expires_at` in the future. When it lapses without the
consulente confirming, the reservation is vacated (ticket becomes
`WAITLIST_EXPIRED`) and must cascade to the next candidate — this is handled
lazily by `reconcile_and_fill`, called from every place that touches the
waitlist (cancellation, the public confirmation endpoint, and the admin
waitlist view) rather than by a background job.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.tickets import Ticket, TicketStatus, PRIORITY_ORDER
from src.models.giras import Gira

DEFAULT_CONFIRMATION_HOURS = 24


def priority_rank(category: Optional[str]) -> int:
    """Lower rank = higher priority. No category ranks last."""
    if category is None:
        return len(PRIORITY_ORDER)
    try:
        return PRIORITY_ORDER.index(category)
    except ValueError:
        return len(PRIORITY_ORDER)


# Backward-compatible alias for internal callers within this module.
_priority_rank = priority_rank


async def waitlist_enabled_for_tenant(session: AsyncSession, tenant_id: UUID) -> bool:
    """True when the tenant toggled the feature on AND its current plan allows it.

    Both checks are enforced server-side (not just relying on the toggle) so a
    plan downgrade after the toggle was enabled disables the feature immediately.
    """
    from src.models.tenant_config import TenantConfig
    from src.models.subscriptions import SubscriptionStatus
    from src.repositories.subscription_repo import SubscriptionRepository
    from src.services.plan_features import _get_plan_features

    tc_result = await session.execute(select(TenantConfig).where(TenantConfig.tenant_id == tenant_id))
    tc = tc_result.scalar_one_or_none()
    if not tc or not tc.enable_waitlist:
        return False

    sub_repo = SubscriptionRepository(session)
    sub = await sub_repo.get_by_tenant(tenant_id)
    if not sub:
        return False

    suspended = sub.status == SubscriptionStatus.SUSPENDED
    features = _get_plan_features(sub.plan, suspended=suspended)
    return features.fila_espera


async def _get_next_in_line(
    session: AsyncSession,
    tenant_id: UUID,
    gira_id: UUID,
    is_sponsor: bool,
) -> Optional[Ticket]:
    """Highest-priority, earliest not-yet-promoted WAITLISTED ticket, if any."""
    stmt = (
        select(Ticket)
        .options(selectinload(Ticket.consulente))
        .where(
            and_(
                Ticket.tenant_id == tenant_id,
                Ticket.gira_id == gira_id,
                Ticket.is_sponsor == is_sponsor,
                Ticket.status == TicketStatus.WAITLISTED,
                Ticket.promoted_at.is_(None),
            )
        )
    )
    result = await session.execute(stmt)
    candidates = list(result.scalars().all())
    if not candidates:
        return None
    candidates.sort(key=lambda t: (_priority_rank(t.priority_category), t.numero))
    return candidates[0]


async def expire_pending_confirmations(
    session: AsyncSession,
    tenant_id: UUID,
    gira_id: UUID,
    is_sponsor: bool,
) -> list[Ticket]:
    """Flip lapsed promotions (WAITLISTED + promoted_at set + window passed) to
    WAITLIST_EXPIRED. Returns the tickets that were just expired."""
    now = datetime.now(timezone.utc)
    stmt = select(Ticket).where(
        and_(
            Ticket.tenant_id == tenant_id,
            Ticket.gira_id == gira_id,
            Ticket.is_sponsor == is_sponsor,
            Ticket.status == TicketStatus.WAITLISTED,
            Ticket.promoted_at.isnot(None),
            Ticket.confirmation_expires_at.isnot(None),
            Ticket.confirmation_expires_at < now,
        )
    )
    result = await session.execute(stmt)
    expired = list(result.scalars().all())
    for t in expired:
        t.status = TicketStatus.WAITLIST_EXPIRED
    if expired:
        await session.flush()
    return expired


def promote_ticket(ticket: Ticket, gira: Gira) -> None:
    """Mark a WAITLISTED ticket as promoted, starting its confirmation window."""
    hours = gira.waitlist_confirmation_hours or DEFAULT_CONFIRMATION_HOURS
    now = datetime.now(timezone.utc)
    ticket.promoted_at = now
    ticket.confirmation_expires_at = now + timedelta(hours=hours)


# Backward-compatible alias for internal callers within this module.
_promote = promote_ticket


async def reconcile_and_fill(
    session: AsyncSession,
    tenant_id: UUID,
    gira_id: UUID,
    is_sponsor: bool,
    gira: Gira,
    extra_slots: int = 0,
) -> tuple[list[Ticket], int]:
    """Expire lapsed reservations and fill every vacated/new slot from the queue.

    `extra_slots` is the number of *new* slots this call is responsible for
    (e.g. 1 per admin-cancelled ticket). Slots vacated by expired reservations
    are always accounted for automatically.

    Returns (promoted_tickets, unfilled_slot_count). The caller should treat
    unfilled slots as regular freed capacity (e.g. SenhaControl.slots_returned)
    since nobody in the queue could take them.
    """
    expired = await expire_pending_confirmations(session, tenant_id, gira_id, is_sponsor)
    slots_to_fill = len(expired) + extra_slots

    promoted: list[Ticket] = []
    for _ in range(slots_to_fill):
        candidate = await _get_next_in_line(session, tenant_id, gira_id, is_sponsor)
        if not candidate:
            break
        _promote(candidate, gira)
        promoted.append(candidate)

    if promoted:
        await session.flush()

    unfilled = slots_to_fill - len(promoted)
    return promoted, unfilled


async def send_confirmed_ticket_email(session: AsyncSession, ticket: Ticket) -> str:
    """Send the standard ticket-emission email for a WAITLISTED ticket that just
    became EMITTED — either via consulente confirmation or an admin releasing
    it directly. Returns the formatted ticket number.

    Expects `ticket.status` already set to EMITTED and `ticket.consulente`
    loaded by the caller.
    """
    from src.core.config import settings
    from src.core.tz import APP_TZ
    from src.models.tenants import Tenant
    from src.models.tenant_config import TenantConfig
    from src.services.email.base import EmailMessage
    from src.services.email.email_queue import email_queue, EmailQueueItem
    from src.services.email.templates.ticket_emission import (
        generate_ticket_emission_html,
        generate_plain_text_fallback,
    )

    ticket_number_formatted = f"P{ticket.numero:03d}" if ticket.is_sponsor else f"{ticket.numero:04d}"

    gira_result = await session.execute(select(Gira).where(Gira.id == ticket.gira_id))
    gira_obj = gira_result.scalar_one_or_none()
    tenant_result = await session.execute(select(Tenant).where(Tenant.id == ticket.tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    tc_result = await session.execute(select(TenantConfig).where(TenantConfig.tenant_id == ticket.tenant_id))
    tenant_config = tc_result.scalar_one_or_none()

    if not (tenant and gira_obj and ticket.consulente):
        return ticket_number_formatted

    tenant_address = (tenant_config.endereco or "") if tenant_config else ""
    primary_color = (tenant_config.primary_color or "#2E7D32") if tenant_config else "#2E7D32"
    secondary_color = (tenant_config.secondary_color or primary_color) if tenant_config else primary_color
    tenant_logo_url = ""
    if tenant_config and tenant_config.logo_data:
        tenant_logo_url = f"{settings.FRONTEND_URL.rstrip('/')}/api/v1/public/tenant/{tenant.id}/logo"
    elif tenant_config and tenant_config.logo_url:
        tenant_logo_url = tenant_config.logo_url

    rescue_link = f"{settings.FRONTEND_URL.rstrip('/')}/public/{tenant.slug}/ticket/{ticket.id}"
    gira_date_str = gira_obj.data_inicio.astimezone(APP_TZ).strftime("%d/%m/%Y às %H:%M") if gira_obj.data_inicio else ""

    html_body = generate_ticket_emission_html(
        ticket_number=ticket_number_formatted,
        consulente_name=ticket.consulente.nome,
        gira_name=gira_obj.nome,
        gira_date=gira_date_str,
        gira_location=gira_obj.local or "",
        rescue_link=rescue_link,
        tenant_name=tenant.name,
        tenant_logo_url=tenant_logo_url,
        tenant_color=primary_color,
        is_sponsor=ticket.is_sponsor,
        tenant_address=tenant_address,
        primary_color=primary_color,
        secondary_color=secondary_color,
        consulente_email=ticket.consulente.email,
        consulente_phone=ticket.consulente.telefone or "",
        priority_category=ticket.priority_category,
        recados=gira_obj.recados,
    )
    text_body = generate_plain_text_fallback(
        ticket_number=ticket_number_formatted,
        consulente_name=ticket.consulente.nome,
        gira_name=gira_obj.nome,
        gira_date=gira_date_str,
        gira_location=gira_obj.local or "",
        rescue_link=rescue_link,
        is_sponsor=ticket.is_sponsor,
        tenant_address=tenant_address,
        tenant_name=tenant.name,
        consulente_email=ticket.consulente.email,
        consulente_phone=ticket.consulente.telefone or "",
        priority_category=ticket.priority_category,
        recados=gira_obj.recados,
    )
    message = EmailMessage(
        to_email=ticket.consulente.email,
        subject=f"Sua Senha #{ticket_number_formatted} - {tenant.name}",
        html_body=html_body,
        text_body=text_body,
    )
    email_queue.enqueue(EmailQueueItem(message=message, ticket_id=str(ticket.id)))
    return ticket_number_formatted


async def compute_queue_position(
    session: AsyncSession,
    tenant_id: UUID,
    gira_id: UUID,
    is_sponsor: bool,
    ticket: Ticket,
) -> Optional[int]:
    """1-based position of a not-yet-promoted WAITLISTED ticket in the queue."""
    if ticket.status != TicketStatus.WAITLISTED or ticket.promoted_at is not None:
        return None
    stmt = select(Ticket).where(
        and_(
            Ticket.tenant_id == tenant_id,
            Ticket.gira_id == gira_id,
            Ticket.is_sponsor == is_sponsor,
            Ticket.status == TicketStatus.WAITLISTED,
            Ticket.promoted_at.is_(None),
        )
    )
    result = await session.execute(stmt)
    candidates = list(result.scalars().all())
    candidates.sort(key=lambda t: (_priority_rank(t.priority_category), t.numero))
    for idx, t in enumerate(candidates, start=1):
        if t.id == ticket.id:
            return idx
    return None
