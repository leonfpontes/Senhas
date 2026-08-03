"""GiraTimeSlotRepository - atomic capacity control for agendamento por horário.

Mirrors SenhaControlRepository's optimistic/row-lock pattern (see
senha_control_repo.py) but capacity is checked and enforced inside
increment_atomic itself: unlike gira-wide emission, a full time slot has no
waitlist fallback (product decision — a full slot is just hidden/disabled in
the UI and the consulente picks a different horário), so there is no reason
to let total_emitido exceed capacity the way SenhaControl does.
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.gira_time_slots import GiraTimeSlot
from src.repositories.base import BaseRepository


class TimeSlotFullError(Exception):
    """Raised by increment_atomic when the slot has no vagas left."""


class GiraTimeSlotRepository(BaseRepository[GiraTimeSlot]):
    """Multi-tenant repository for per-gira attendance time slots."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, GiraTimeSlot)

    async def list_by_gira(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        gira_id: UUID,
    ) -> List[GiraTimeSlot]:
        """All slots for a gira, ordered by horário."""
        query = (
            select(GiraTimeSlot)
            .where(
                and_(
                    GiraTimeSlot.tenant_id == tenant_id,
                    GiraTimeSlot.gira_id == gira_id,
                    GiraTimeSlot.deleted_at.is_(None),
                )
            )
            .order_by(GiraTimeSlot.horario.asc())
        )
        result = await session.execute(query)
        return list(result.scalars().all())

    async def get_by_id_for_gira(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        gira_id: UUID,
        slot_id: UUID,
    ) -> Optional[GiraTimeSlot]:
        query = select(GiraTimeSlot).where(
            and_(
                GiraTimeSlot.tenant_id == tenant_id,
                GiraTimeSlot.gira_id == gira_id,
                GiraTimeSlot.id == slot_id,
                GiraTimeSlot.deleted_at.is_(None),
            )
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()

    async def replace_slots_for_gira(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        gira_id: UUID,
        slots: list[dict],
    ) -> List[GiraTimeSlot]:
        """Replace a gira's slot list wholesale (used by the admin editor and
        when copying the tenant template into a newly-enabled gira).

        Existing slots are soft-deleted rather than hard-deleted so tickets
        that already reference them (time_slot_id) keep a valid FK — the
        column has ondelete=SET NULL but a soft delete is preferable here
        since we're replacing config, not removing the gira/ticket history.

        `slots` items: {"horario": time, "capacidade_maxima": int}
        """
        existing = await self.list_by_gira(session, tenant_id, gira_id)
        for slot in existing:
            slot.soft_delete()

        created: list[GiraTimeSlot] = []
        for item in slots:
            new_slot = GiraTimeSlot(
                tenant_id=tenant_id,
                gira_id=gira_id,
                horario=item["horario"],
                capacidade_maxima=item["capacidade_maxima"],
            )
            session.add(new_slot)
            created.append(new_slot)

        await session.flush()
        for slot in created:
            await session.refresh(slot)
        return created

    async def increment_atomic(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        gira_id: UUID,
        slot_id: UUID,
    ) -> int:
        """Atomically claim one vaga in the slot, or raise if full.

        Uses SELECT FOR UPDATE to lock the row, checks net capacity
        (capacidade_maxima - (total_emitido - slots_returned)) before
        incrementing so total_emitido never exceeds capacity.

        Raises:
            ValueError: slot not found for this tenant/gira.
            TimeSlotFullError: slot has no vagas left.
        """
        query = (
            select(GiraTimeSlot)
            .where(
                and_(
                    GiraTimeSlot.tenant_id == tenant_id,
                    GiraTimeSlot.gira_id == gira_id,
                    GiraTimeSlot.id == slot_id,
                    GiraTimeSlot.deleted_at.is_(None),
                )
            )
            .with_for_update()
        )
        result = await session.execute(query)
        slot = result.scalar_one_or_none()

        if not slot:
            raise ValueError(
                f"GiraTimeSlot not found for tenant={tenant_id}, gira={gira_id}, slot={slot_id}"
            )

        net_emitido = slot.total_emitido - slot.slots_returned
        if net_emitido >= slot.capacidade_maxima:
            raise TimeSlotFullError(f"Horário {slot.horario} sem vagas disponíveis")

        slot.total_emitido += 1
        await session.flush()
        return slot.total_emitido

    async def increment_slots_returned(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        slot_id: UUID,
    ) -> int:
        """Free one vaga back into the slot (called when a ticket that held
        this slot is cancelled). Best-effort: unlike SenhaControl this isn't
        wired into waitlist reconciliation (time slots have no waitlist
        fallback), so it's a plain increment.

        Raises:
            ValueError: slot not found for this tenant.
        """
        query = (
            select(GiraTimeSlot)
            .where(
                and_(
                    GiraTimeSlot.tenant_id == tenant_id,
                    GiraTimeSlot.id == slot_id,
                )
            )
            .with_for_update()
        )
        result = await session.execute(query)
        slot = result.scalar_one_or_none()

        if not slot:
            raise ValueError(f"GiraTimeSlot not found for tenant={tenant_id}, slot={slot_id}")

        slot.slots_returned += 1
        await session.flush()
        return slot.slots_returned
