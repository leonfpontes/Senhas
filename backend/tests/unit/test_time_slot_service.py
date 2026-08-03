"""Unit tests for time_slot_service — tenant gate + vagas computation."""
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.models.gira_time_slots import GiraTimeSlot
from src.services import time_slot_service


def _mock_db():
    db = AsyncMock()
    db.execute = AsyncMock()
    return db


def _mock_result_scalar(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _make_slot(capacidade_maxima=25, total_emitido=0, slots_returned=0) -> GiraTimeSlot:
    s = GiraTimeSlot()
    s.id = uuid4()
    s.tenant_id = uuid4()
    s.gira_id = uuid4()
    s.capacidade_maxima = capacidade_maxima
    s.total_emitido = total_emitido
    s.slots_returned = slots_returned
    return s


class TestTimeSlotSchedulingEnabledForTenant:
    async def test_false_when_no_tenant_config(self):
        db = _mock_db()
        db.execute.return_value = _mock_result_scalar(None)
        assert await time_slot_service.time_slot_scheduling_enabled_for_tenant(db, uuid4()) is False

    async def test_false_when_toggle_off(self):
        db = _mock_db()
        tc = MagicMock()
        tc.enable_time_slot_scheduling = False
        db.execute.return_value = _mock_result_scalar(tc)
        assert await time_slot_service.time_slot_scheduling_enabled_for_tenant(db, uuid4()) is False

    async def test_true_when_toggle_on(self):
        db = _mock_db()
        tc = MagicMock()
        tc.enable_time_slot_scheduling = True
        db.execute.return_value = _mock_result_scalar(tc)
        assert await time_slot_service.time_slot_scheduling_enabled_for_tenant(db, uuid4()) is True


class TestListAvailableSlots:
    async def test_computes_vagas_disponiveis(self):
        db = _mock_db()
        slot = _make_slot(capacidade_maxima=25, total_emitido=10)
        with patch("src.services.time_slot_service.GiraTimeSlotRepository") as MockRepo:
            repo_inst = MockRepo.return_value
            repo_inst.list_by_gira = AsyncMock(return_value=[slot])
            result = await time_slot_service.list_available_slots(db, uuid4(), uuid4())
        assert len(result) == 1
        assert result[0].slot is slot
        assert result[0].vagas_disponiveis == 15

    async def test_full_slot_has_zero_vagas(self):
        db = _mock_db()
        slot = _make_slot(capacidade_maxima=25, total_emitido=25)
        with patch("src.services.time_slot_service.GiraTimeSlotRepository") as MockRepo:
            repo_inst = MockRepo.return_value
            repo_inst.list_by_gira = AsyncMock(return_value=[slot])
            result = await time_slot_service.list_available_slots(db, uuid4(), uuid4())
        assert result[0].vagas_disponiveis == 0

    async def test_slots_returned_reopens_vagas(self):
        db = _mock_db()
        slot = _make_slot(capacidade_maxima=25, total_emitido=25, slots_returned=3)
        with patch("src.services.time_slot_service.GiraTimeSlotRepository") as MockRepo:
            repo_inst = MockRepo.return_value
            repo_inst.list_by_gira = AsyncMock(return_value=[slot])
            result = await time_slot_service.list_available_slots(db, uuid4(), uuid4())
        assert result[0].vagas_disponiveis == 3

    async def test_never_negative(self):
        """Defensive: even if net_emitido somehow exceeds capacity, vagas floors at 0."""
        db = _mock_db()
        slot = _make_slot(capacidade_maxima=10, total_emitido=50, slots_returned=0)
        with patch("src.services.time_slot_service.GiraTimeSlotRepository") as MockRepo:
            repo_inst = MockRepo.return_value
            repo_inst.list_by_gira = AsyncMock(return_value=[slot])
            result = await time_slot_service.list_available_slots(db, uuid4(), uuid4())
        assert result[0].vagas_disponiveis == 0

    async def test_empty_list(self):
        db = _mock_db()
        with patch("src.services.time_slot_service.GiraTimeSlotRepository") as MockRepo:
            repo_inst = MockRepo.return_value
            repo_inst.list_by_gira = AsyncMock(return_value=[])
            result = await time_slot_service.list_available_slots(db, uuid4(), uuid4())
        assert result == []
