"""GiraTimeSlot / GiraTimeSlotTemplate models — horários de atendimento agendados.

Optional feature (off by default, gated by TenantConfig.enable_time_slot_scheduling
+ Gira.use_time_slots) that splits a gira's capacity into named time windows
(ex: 20h, 20h30, 21h) so consulentes pick when they intend to be attended,
spreading arrivals instead of everyone queuing at the door at once.
"""
from sqlalchemy import ForeignKey, Integer, Time, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import time
import uuid

from .base import SoftDeleteModel


class GiraTimeSlotTemplate(SoftDeleteModel):
    """Tenant-wide default set of attendance time slots.

    Copied into a Gira's own GiraTimeSlot rows when the gira enables
    use_time_slots, so the terreiro doesn't have to re-enter the same
    horários (ex: 20h, 20h30, 21h) for every gira. Editable per-gira
    afterwards without touching the template.
    """

    __tablename__ = "gira_time_slot_templates"
    __table_args__ = (
        Index("ix_gira_time_slot_templates_tenant_id", "tenant_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    horario: Mapped[time] = mapped_column(Time, nullable=False)
    capacidade_maxima: Mapped[int] = mapped_column(Integer, nullable=False)
    ordem: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    tenant = relationship("Tenant")

    def __repr__(self) -> str:
        return f"<GiraTimeSlotTemplate(tenant_id={self.tenant_id}, horario={self.horario})>"


class GiraTimeSlot(SoftDeleteModel):
    """A single attendance time window (horário de atendimento) for one Gira.

    Capacity is a single pool shared between regular and associado/sponsor
    tickets — the goal is limiting how many PEOPLE arrive at that time, not
    segmenting by ticket type (unlike SenhaControl, which keeps separate
    regular/sponsor counters). Uses the same optimistic-locking +
    total_emitido/slots_returned pattern as SenhaControl so vaga math stays
    consistent with the rest of the codebase — see
    GiraTimeSlotRepository and SenhaControl.
    """

    __tablename__ = "gira_time_slots"
    __table_args__ = (
        UniqueConstraint("tenant_id", "gira_id", "horario", name="uq_gira_time_slot_tenant_gira_horario"),
        Index("ix_gira_time_slots_tenant_id", "tenant_id"),
        Index("ix_gira_time_slots_gira_id", "gira_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    gira_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("giras.id", ondelete="CASCADE"), nullable=False)

    horario: Mapped[time] = mapped_column(Time, nullable=False)
    capacidade_maxima: Mapped[int] = mapped_column(Integer, nullable=False)

    # Atomic counter (mirrors SenhaControl): total_emitido never decreases,
    # slots_returned tracks capacity freed by cancellations. Vagas disponíveis
    # = capacidade_maxima - max(0, total_emitido - slots_returned).
    total_emitido: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    slots_returned: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    tenant = relationship("Tenant")
    gira = relationship("Gira", back_populates="time_slots")

    def __repr__(self) -> str:
        return f"<GiraTimeSlot(gira_id={self.gira_id}, horario={self.horario}, capacidade_maxima={self.capacidade_maxima})>"
