"""Tests for admin gira_time_slots endpoints (template + per-gira agendamento por horário)."""
from datetime import time
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.api.v1.admin.gira_time_slots import (
    TimeSlotItem,
    TimeSlotTemplateUpdateRequest,
    GiraTimeSlotsConfigRequest,
    list_time_slot_templates,
    update_time_slot_templates,
    get_gira_time_slots,
    update_gira_time_slots,
)
from src.core.errors import NotFoundError
from src.services.time_slot_service import SlotAvailability
from tests.conftest import TENANT_ID, USER_ID, GIRA_ID


def _mock_db():
    db = AsyncMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    return db


def _mock_result_scalars(items):
    result = MagicMock()
    scalars = MagicMock()
    scalars.all.return_value = items
    result.scalars.return_value = scalars
    return result


def _user():
    u = MagicMock()
    u.id = USER_ID
    u.tenant_id = TENANT_ID
    return u


def _mock_template(horario, capacidade_maxima, ordem=0):
    t = MagicMock()
    t.id = uuid4()
    t.horario = horario
    t.capacidade_maxima = capacidade_maxima
    t.ordem = ordem
    return t


def _mock_gira(use_time_slots=False):
    g = MagicMock()
    g.id = GIRA_ID
    g.tenant_id = TENANT_ID
    g.use_time_slots = use_time_slots
    return g


def _mock_slot(horario, capacidade_maxima=25, total_emitido=0):
    s = MagicMock()
    s.id = uuid4()
    s.horario = horario
    s.capacidade_maxima = capacidade_maxima
    s.total_emitido = total_emitido
    return s


class TestListTimeSlotTemplates:
    async def test_success(self):
        db = _mock_db()
        templates = [_mock_template(time(20, 0), 25, 0), _mock_template(time(20, 30), 25, 1)]
        db.execute.return_value = _mock_result_scalars(templates)
        result = await list_time_slot_templates(_user(), db)
        assert len(result) == 2
        assert result[0].capacidade_maxima == 25


class TestUpdateTimeSlotTemplates:
    async def test_replaces_wholesale(self):
        db = _mock_db()
        existing = [_mock_template(time(19, 0), 10)]
        db.execute.return_value = _mock_result_scalars(existing)

        async def _refresh(obj):
            obj.id = uuid4()

        db.refresh.side_effect = _refresh

        body = TimeSlotTemplateUpdateRequest(slots=[
            TimeSlotItem(horario=time(20, 0), capacidade_maxima=25),
            TimeSlotItem(horario=time(20, 30), capacidade_maxima=25),
        ])

        result = await update_time_slot_templates(body, _user(), db)

        existing[0].soft_delete.assert_called_once()
        assert len(result) == 2
        assert {r.horario for r in result} == {time(20, 0), time(20, 30)}
        assert db.add.call_count == 2
        db.commit.assert_awaited_once()

    async def test_duplicate_horarios_rejected(self):
        from fastapi import HTTPException
        db = _mock_db()
        body = TimeSlotTemplateUpdateRequest(slots=[
            TimeSlotItem(horario=time(20, 0), capacidade_maxima=25),
            TimeSlotItem(horario=time(20, 0), capacidade_maxima=10),
        ])
        with pytest.raises(HTTPException) as exc_info:
            await update_time_slot_templates(body, _user(), db)
        assert exc_info.value.status_code == 400


class TestGetGiraTimeSlots:
    @patch("src.api.v1.admin.gira_time_slots.GiraRepository")
    async def test_success(self, MockGiraRepo):
        db = _mock_db()
        gira_repo_inst = AsyncMock()
        gira_repo_inst.get_by_id.return_value = _mock_gira(use_time_slots=True)
        MockGiraRepo.return_value = gira_repo_inst

        availabilities = [SlotAvailability(slot=_mock_slot(time(20, 0)), vagas_disponiveis=15)]
        with patch(
            "src.api.v1.admin.gira_time_slots.time_slot_service.list_available_slots",
            AsyncMock(return_value=availabilities),
        ):
            result = await get_gira_time_slots(GIRA_ID, _user(), db)

        assert result.use_time_slots is True
        assert len(result.slots) == 1
        assert result.slots[0].vagas_disponiveis == 15

    @patch("src.api.v1.admin.gira_time_slots.GiraRepository")
    async def test_not_found(self, MockGiraRepo):
        db = _mock_db()
        gira_repo_inst = AsyncMock()
        gira_repo_inst.get_by_id.return_value = None
        MockGiraRepo.return_value = gira_repo_inst

        with pytest.raises(NotFoundError):
            await get_gira_time_slots(GIRA_ID, _user(), db)


class TestUpdateGiraTimeSlots:
    @patch("src.api.v1.admin.gira_time_slots.GiraTimeSlotRepository")
    @patch("src.api.v1.admin.gira_time_slots.GiraRepository")
    async def test_enable_requires_tenant_toggle(self, MockGiraRepo, MockSlotRepo):
        from fastapi import HTTPException
        db = _mock_db()
        gira_repo_inst = AsyncMock()
        gira_repo_inst.get_by_id.return_value = _mock_gira()
        MockGiraRepo.return_value = gira_repo_inst

        body = GiraTimeSlotsConfigRequest(use_time_slots=True, slots=[
            TimeSlotItem(horario=time(20, 0), capacidade_maxima=25),
        ])
        with patch(
            "src.api.v1.admin.gira_time_slots.time_slot_service.time_slot_scheduling_enabled_for_tenant",
            AsyncMock(return_value=False),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await update_gira_time_slots(body, GIRA_ID, _user(), db)
        assert exc_info.value.status_code == 400

    @patch("src.api.v1.admin.gira_time_slots.GiraTimeSlotRepository")
    @patch("src.api.v1.admin.gira_time_slots.GiraRepository")
    async def test_enable_requires_nonempty_slots(self, MockGiraRepo, MockSlotRepo):
        from fastapi import HTTPException
        db = _mock_db()
        gira_repo_inst = AsyncMock()
        gira_repo_inst.get_by_id.return_value = _mock_gira()
        MockGiraRepo.return_value = gira_repo_inst

        body = GiraTimeSlotsConfigRequest(use_time_slots=True, slots=[])
        with patch(
            "src.api.v1.admin.gira_time_slots.time_slot_service.time_slot_scheduling_enabled_for_tenant",
            AsyncMock(return_value=True),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await update_gira_time_slots(body, GIRA_ID, _user(), db)
        assert exc_info.value.status_code == 400

    async def test_duplicate_horarios_rejected(self):
        from fastapi import HTTPException
        db = _mock_db()
        body = GiraTimeSlotsConfigRequest(use_time_slots=False, slots=[
            TimeSlotItem(horario=time(20, 0), capacidade_maxima=25),
            TimeSlotItem(horario=time(20, 0), capacidade_maxima=10),
        ])
        with patch("src.api.v1.admin.gira_time_slots.GiraRepository") as MockGiraRepo:
            gira_repo_inst = AsyncMock()
            gira_repo_inst.get_by_id.return_value = _mock_gira()
            MockGiraRepo.return_value = gira_repo_inst
            with pytest.raises(HTTPException) as exc_info:
                await update_gira_time_slots(body, GIRA_ID, _user(), db)
        assert exc_info.value.status_code == 400

    @patch("src.api.v1.admin.gira_time_slots.GiraTimeSlotRepository")
    @patch("src.api.v1.admin.gira_time_slots.GiraRepository")
    async def test_success_enable(self, MockGiraRepo, MockSlotRepo):
        db = _mock_db()
        gira_repo_inst = AsyncMock()
        gira_repo_inst.get_by_id.return_value = _mock_gira()
        gira_repo_inst.update = AsyncMock()
        MockGiraRepo.return_value = gira_repo_inst

        slot_repo_inst = AsyncMock()
        slot_repo_inst.replace_slots_for_gira = AsyncMock(return_value=[])
        MockSlotRepo.return_value = slot_repo_inst

        body = GiraTimeSlotsConfigRequest(use_time_slots=True, slots=[
            TimeSlotItem(horario=time(20, 0), capacidade_maxima=25),
            TimeSlotItem(horario=time(20, 30), capacidade_maxima=25),
        ])
        with patch(
            "src.api.v1.admin.gira_time_slots.time_slot_service.time_slot_scheduling_enabled_for_tenant",
            AsyncMock(return_value=True),
        ), patch(
            "src.api.v1.admin.gira_time_slots.time_slot_service.list_available_slots",
            AsyncMock(return_value=[]),
        ):
            result = await update_gira_time_slots(body, GIRA_ID, _user(), db)

        slot_repo_inst.replace_slots_for_gira.assert_awaited_once()
        gira_repo_inst.update.assert_awaited_once_with(GIRA_ID, TENANT_ID, use_time_slots=True)
        db.commit.assert_awaited_once()
        assert result.use_time_slots is True

    @patch("src.api.v1.admin.gira_time_slots.GiraTimeSlotRepository")
    @patch("src.api.v1.admin.gira_time_slots.GiraRepository")
    async def test_success_disable_clears_slots(self, MockGiraRepo, MockSlotRepo):
        db = _mock_db()
        gira_repo_inst = AsyncMock()
        gira_repo_inst.get_by_id.return_value = _mock_gira(use_time_slots=True)
        gira_repo_inst.update = AsyncMock()
        MockGiraRepo.return_value = gira_repo_inst

        slot_repo_inst = AsyncMock()
        slot_repo_inst.replace_slots_for_gira = AsyncMock(return_value=[])
        MockSlotRepo.return_value = slot_repo_inst

        body = GiraTimeSlotsConfigRequest(use_time_slots=False, slots=[])
        with patch(
            "src.api.v1.admin.gira_time_slots.time_slot_service.list_available_slots",
            AsyncMock(return_value=[]),
        ):
            result = await update_gira_time_slots(body, GIRA_ID, _user(), db)

        slot_repo_inst.replace_slots_for_gira.assert_awaited_once_with(db, TENANT_ID, GIRA_ID, [])
        gira_repo_inst.update.assert_awaited_once_with(GIRA_ID, TENANT_ID, use_time_slots=False)
        assert result.use_time_slots is False

    @patch("src.api.v1.admin.gira_time_slots.GiraRepository")
    async def test_gira_not_found(self, MockGiraRepo):
        db = _mock_db()
        gira_repo_inst = AsyncMock()
        gira_repo_inst.get_by_id.return_value = None
        MockGiraRepo.return_value = gira_repo_inst

        body = GiraTimeSlotsConfigRequest(use_time_slots=False, slots=[])
        with pytest.raises(NotFoundError):
            await update_gira_time_slots(body, GIRA_ID, _user(), db)
