"""Admin endpoints for agendamento por horário (time-slot scheduling).

Two concerns, same feature:
- Tenant-wide template (`gira_time_slot_templates`) — the default set of
  horários (ex: 20h, 20h30, 21h) reused across giras.
- Per-gira slots (`gira_time_slots`) — the actual instances a gira uses,
  pre-filled from the template but editable independently afterwards.
"""
from datetime import time
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.models import User, PermissionFeature
from src.models.tenant_config import TenantConfig
from src.repositories.gira_repo import GiraRepository
from src.repositories.gira_time_slot_repo import GiraTimeSlotRepository
from src.services import time_slot_service
from src.api.dependencies import get_current_user, require_group_permission
from src.core.errors import NotFoundError, InsufficientPermissionsError

router = APIRouter(prefix="/api/v1/admin", tags=["admin-gira-time-slots"])


class TimeSlotItem(BaseModel):
    """A single horário definition (input)."""
    horario: time
    capacidade_maxima: int

    @field_validator("capacidade_maxima")
    @classmethod
    def validate_capacidade(cls, v: int) -> int:
        if v < 1:
            raise ValueError("capacidade_maxima deve ser >= 1")
        return v


def _validate_no_duplicate_horarios(slots: List[TimeSlotItem]) -> None:
    horarios = [s.horario for s in slots]
    if len(horarios) != len(set(horarios)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Horários duplicados não são permitidos",
        )


# ========== TENANT TEMPLATE ==========


class TimeSlotTemplateResponse(TimeSlotItem):
    id: UUID
    ordem: int

    class Config:
        from_attributes = True


class TimeSlotTemplateUpdateRequest(BaseModel):
    slots: List[TimeSlotItem] = []


@router.get(
    "/config/time-slot-templates",
    response_model=List[TimeSlotTemplateResponse],
    dependencies=[Depends(require_group_permission(PermissionFeature.CONFIGURACOES, "view"))],
)
async def list_time_slot_templates(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[TimeSlotTemplateResponse]:
    """Tenant-wide default horários, used to pre-fill new giras."""
    from src.models.gira_time_slots import GiraTimeSlotTemplate

    stmt = (
        select(GiraTimeSlotTemplate)
        .where(
            GiraTimeSlotTemplate.tenant_id == current_user.tenant_id,
            GiraTimeSlotTemplate.deleted_at.is_(None),
        )
        .order_by(GiraTimeSlotTemplate.ordem.asc(), GiraTimeSlotTemplate.horario.asc())
    )
    result = await db.execute(stmt)
    templates = result.scalars().all()
    return [TimeSlotTemplateResponse.from_orm(t) for t in templates]


@router.put(
    "/config/time-slot-templates",
    response_model=List[TimeSlotTemplateResponse],
    dependencies=[Depends(require_group_permission(PermissionFeature.CONFIGURACOES, "edit"))],
)
async def update_time_slot_templates(
    body: TimeSlotTemplateUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[TimeSlotTemplateResponse]:
    """Replace the tenant's default horário template wholesale."""
    from src.models.gira_time_slots import GiraTimeSlotTemplate

    _validate_no_duplicate_horarios(body.slots)

    stmt = select(GiraTimeSlotTemplate).where(
        GiraTimeSlotTemplate.tenant_id == current_user.tenant_id,
        GiraTimeSlotTemplate.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    for existing in result.scalars().all():
        existing.soft_delete()

    created = []
    for idx, item in enumerate(body.slots):
        new_template = GiraTimeSlotTemplate(
            tenant_id=current_user.tenant_id,
            horario=item.horario,
            capacidade_maxima=item.capacidade_maxima,
            ordem=idx,
        )
        db.add(new_template)
        created.append(new_template)

    await db.commit()
    for t in created:
        await db.refresh(t)

    return [TimeSlotTemplateResponse.from_orm(t) for t in created]


# ========== PER-GIRA SLOTS ==========


class GiraTimeSlotResponse(TimeSlotItem):
    id: UUID
    total_emitido: int
    vagas_disponiveis: int

    class Config:
        from_attributes = True


class GiraTimeSlotsConfigResponse(BaseModel):
    use_time_slots: bool
    slots: List[GiraTimeSlotResponse]


class GiraTimeSlotsConfigRequest(BaseModel):
    use_time_slots: bool
    slots: List[TimeSlotItem] = []


async def _build_slots_response(db: AsyncSession, tenant_id: UUID, gira_id: UUID, use_time_slots: bool) -> GiraTimeSlotsConfigResponse:
    availabilities = await time_slot_service.list_available_slots(db, tenant_id, gira_id)
    return GiraTimeSlotsConfigResponse(
        use_time_slots=use_time_slots,
        slots=[
            GiraTimeSlotResponse(
                id=a.slot.id,
                horario=a.slot.horario,
                capacidade_maxima=a.slot.capacidade_maxima,
                total_emitido=a.slot.total_emitido,
                vagas_disponiveis=a.vagas_disponiveis,
            )
            for a in availabilities
        ],
    )


@router.get(
    "/giras/{gira_id}/time-slots",
    response_model=GiraTimeSlotsConfigResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.GIRAS, "view"))],
)
async def get_gira_time_slots(
    gira_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GiraTimeSlotsConfigResponse:
    """Current horário config + live vagas for a gira."""
    gira_repo = GiraRepository(db)
    gira = await gira_repo.get_by_id(gira_id, current_user.tenant_id)
    if not gira:
        raise NotFoundError("Gira não encontrada")

    return await _build_slots_response(db, current_user.tenant_id, gira_id, gira.use_time_slots)


@router.put(
    "/giras/{gira_id}/time-slots",
    response_model=GiraTimeSlotsConfigResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.GIRAS, "edit"))],
)
async def update_gira_time_slots(
    body: GiraTimeSlotsConfigRequest,
    gira_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GiraTimeSlotsConfigResponse:
    """Enable/disable agendamento por horário for a gira and replace its slots.

    Enabling requires the tenant-wide toggle (TenantConfig.enable_time_slot_scheduling)
    to already be on — mirrors the enable_waitlist gate pattern (server-side
    enforced, not just trusted from the frontend).
    """
    gira_repo = GiraRepository(db)
    gira = await gira_repo.get_by_id(gira_id, current_user.tenant_id)
    if not gira:
        raise NotFoundError("Gira não encontrada")

    if body.use_time_slots:
        if not await time_slot_service.time_slot_scheduling_enabled_for_tenant(db, current_user.tenant_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Habilite o agendamento por horário em Configurações antes de usá-lo em uma gira",
            )
        if not body.slots:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Informe ao menos um horário de atendimento",
            )

    _validate_no_duplicate_horarios(body.slots)

    slot_repo = GiraTimeSlotRepository(db)
    await slot_repo.replace_slots_for_gira(
        db,
        current_user.tenant_id,
        gira_id,
        [{"horario": s.horario, "capacidade_maxima": s.capacidade_maxima} for s in body.slots],
    )

    await gira_repo.update(gira_id, current_user.tenant_id, use_time_slots=body.use_time_slots)
    await db.commit()

    return await _build_slots_response(db, current_user.tenant_id, gira_id, body.use_time_slots)
