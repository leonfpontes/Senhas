"""Time slot scheduling service — agendamento por horário.

Optional feature (off by default, PRO+/Premium only) that lets a gira publish
named attendance windows (ex: 20h, 20h30, 21h) each with their own capacity,
so consulentes pick when they intend to show up instead of everyone queuing
at the door at once. Three things gate it: the tenant's plan tier, the
tenant-wide TenantConfig.enable_time_slot_scheduling toggle, and the
per-gira Gira.use_time_slots toggle.

Unlike the waitlist feature, a full slot has no fallback queue — it's simply
hidden/disabled in the public emission UI and the consulente picks a
different horário (product decision).
"""
from typing import NamedTuple
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.tenant_config import TenantConfig
from src.models.gira_time_slots import GiraTimeSlot
from src.repositories.gira_time_slot_repo import GiraTimeSlotRepository


class SlotAvailability(NamedTuple):
    slot: GiraTimeSlot
    vagas_disponiveis: int


async def time_slot_scheduling_enabled_for_tenant(session: AsyncSession, tenant_id: UUID) -> bool:
    """True when the tenant toggled the feature on AND its current plan allows it.

    PRO+/Premium only. Both checks are enforced server-side (not just relying
    on the toggle) so a plan downgrade after the toggle was enabled disables
    the feature immediately — mirrors waitlist_service.waitlist_enabled_for_tenant.
    """
    result = await session.execute(select(TenantConfig).where(TenantConfig.tenant_id == tenant_id))
    tc = result.scalar_one_or_none()
    if not tc or not tc.enable_time_slot_scheduling:
        return False

    from src.models.subscriptions import SubscriptionStatus
    from src.repositories.subscription_repo import SubscriptionRepository
    from src.services.plan_features import _get_plan_features

    sub_repo = SubscriptionRepository(session)
    sub = await sub_repo.get_by_tenant(tenant_id)
    if not sub:
        return False

    suspended = sub.status == SubscriptionStatus.SUSPENDED
    features = _get_plan_features(sub.plan, suspended=suspended)
    return features.agendamento_por_horario


def _vagas_disponiveis(slot: GiraTimeSlot) -> int:
    net_emitido = slot.total_emitido - slot.slots_returned
    return max(0, slot.capacidade_maxima - net_emitido)


async def list_available_slots(
    session: AsyncSession,
    tenant_id: UUID,
    gira_id: UUID,
) -> list[SlotAvailability]:
    """All horários for a gira with computed vagas_disponiveis, ordered by horário."""
    repo = GiraTimeSlotRepository(session)
    slots = await repo.list_by_gira(session, tenant_id, gira_id)
    return [SlotAvailability(slot=slot, vagas_disponiveis=_vagas_disponiveis(slot)) for slot in slots]
