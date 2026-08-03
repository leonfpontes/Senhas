"""Unit tests for GiraTimeSlotRepository (agendamento por horário)."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import time
from uuid import uuid4


def _mock_db():
    db = AsyncMock()
    db.execute = AsyncMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    return db


def _mock_result_scalar(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    result.scalar_one.return_value = value
    result.scalar.return_value = value
    return result


def _mock_result_scalars(items):
    result = MagicMock()
    scalars = MagicMock()
    scalars.all.return_value = items
    result.scalars.return_value = scalars
    return result


def _mock_select(*args, **kwargs):
    mock_stmt = MagicMock()
    mock_stmt.where.return_value = mock_stmt
    mock_stmt.options.return_value = mock_stmt
    mock_stmt.order_by.return_value = mock_stmt
    mock_stmt.limit.return_value = mock_stmt
    mock_stmt.offset.return_value = mock_stmt
    mock_stmt.join.return_value = mock_stmt
    mock_stmt.with_for_update.return_value = mock_stmt
    return mock_stmt


def _mock_and(*args, **kwargs):
    return MagicMock()


_MockGiraTimeSlotModel = MagicMock()


class TestGiraTimeSlotRepository:

    @pytest.fixture
    def repo(self):
        from src.repositories.gira_time_slot_repo import GiraTimeSlotRepository
        db = _mock_db()
        r = GiraTimeSlotRepository(db)
        return r, db

    @patch("src.repositories.gira_time_slot_repo.GiraTimeSlot", _MockGiraTimeSlotModel)
    @patch("src.repositories.gira_time_slot_repo.select", _mock_select)
    @patch("src.repositories.gira_time_slot_repo.and_", _mock_and)
    async def test_list_by_gira(self, repo):
        r, _ = repo
        session = _mock_db()
        slots = [MagicMock(), MagicMock()]
        session.execute.return_value = _mock_result_scalars(slots)
        result = await r.list_by_gira(session, uuid4(), uuid4())
        assert result == slots

    @patch("src.repositories.gira_time_slot_repo.GiraTimeSlot", _MockGiraTimeSlotModel)
    @patch("src.repositories.gira_time_slot_repo.select", _mock_select)
    @patch("src.repositories.gira_time_slot_repo.and_", _mock_and)
    async def test_get_by_id_for_gira_found(self, repo):
        r, _ = repo
        session = _mock_db()
        slot = MagicMock()
        session.execute.return_value = _mock_result_scalar(slot)
        result = await r.get_by_id_for_gira(session, uuid4(), uuid4(), uuid4())
        assert result is slot

    @patch("src.repositories.gira_time_slot_repo.GiraTimeSlot", _MockGiraTimeSlotModel)
    @patch("src.repositories.gira_time_slot_repo.select", _mock_select)
    @patch("src.repositories.gira_time_slot_repo.and_", _mock_and)
    async def test_get_by_id_for_gira_none(self, repo):
        r, _ = repo
        session = _mock_db()
        session.execute.return_value = _mock_result_scalar(None)
        result = await r.get_by_id_for_gira(session, uuid4(), uuid4(), uuid4())
        assert result is None

    async def test_replace_slots_for_gira_soft_deletes_existing_and_creates_new(self, repo):
        r, _ = repo
        session = _mock_db()
        existing_slot = MagicMock()
        r.list_by_gira = AsyncMock(return_value=[existing_slot])
        tenant_id, gira_id = uuid4(), uuid4()

        with patch("src.repositories.gira_time_slot_repo.GiraTimeSlot") as MockModel:
            created_instances = [MagicMock(), MagicMock()]
            MockModel.side_effect = created_instances
            result = await r.replace_slots_for_gira(
                session,
                tenant_id,
                gira_id,
                [
                    {"horario": time(20, 0), "capacidade_maxima": 25},
                    {"horario": time(20, 30), "capacidade_maxima": 25},
                ],
            )

        existing_slot.soft_delete.assert_called_once()
        assert session.add.call_count == 2
        session.flush.assert_awaited()
        assert result == created_instances

    async def test_replace_slots_for_gira_empty_clears_all(self, repo):
        r, _ = repo
        session = _mock_db()
        existing_slot = MagicMock()
        r.list_by_gira = AsyncMock(return_value=[existing_slot])
        result = await r.replace_slots_for_gira(session, uuid4(), uuid4(), [])
        existing_slot.soft_delete.assert_called_once()
        session.add.assert_not_called()
        assert result == []

    @patch("src.repositories.gira_time_slot_repo.GiraTimeSlot", _MockGiraTimeSlotModel)
    @patch("src.repositories.gira_time_slot_repo.select", _mock_select)
    @patch("src.repositories.gira_time_slot_repo.and_", _mock_and)
    async def test_increment_atomic_success(self, repo):
        r, _ = repo
        session = _mock_db()
        slot = MagicMock()
        slot.total_emitido = 10
        slot.slots_returned = 0
        slot.capacidade_maxima = 25
        session.execute.return_value = _mock_result_scalar(slot)
        result = await r.increment_atomic(session, uuid4(), uuid4(), uuid4())
        assert result == 11
        assert slot.total_emitido == 11
        session.flush.assert_awaited()

    @patch("src.repositories.gira_time_slot_repo.GiraTimeSlot", _MockGiraTimeSlotModel)
    @patch("src.repositories.gira_time_slot_repo.select", _mock_select)
    @patch("src.repositories.gira_time_slot_repo.and_", _mock_and)
    async def test_increment_atomic_full_raises(self, repo):
        from src.repositories.gira_time_slot_repo import TimeSlotFullError
        r, _ = repo
        session = _mock_db()
        slot = MagicMock()
        slot.total_emitido = 25
        slot.slots_returned = 0
        slot.capacidade_maxima = 25
        slot.horario = time(20, 0)
        session.execute.return_value = _mock_result_scalar(slot)
        with pytest.raises(TimeSlotFullError):
            await r.increment_atomic(session, uuid4(), uuid4(), uuid4())
        session.flush.assert_not_awaited()

    @patch("src.repositories.gira_time_slot_repo.GiraTimeSlot", _MockGiraTimeSlotModel)
    @patch("src.repositories.gira_time_slot_repo.select", _mock_select)
    @patch("src.repositories.gira_time_slot_repo.and_", _mock_and)
    async def test_increment_atomic_respects_slots_returned(self, repo):
        """A cancelled ticket frees the slot back up even at capacity."""
        r, _ = repo
        session = _mock_db()
        slot = MagicMock()
        slot.total_emitido = 25
        slot.slots_returned = 1
        slot.capacidade_maxima = 25
        session.execute.return_value = _mock_result_scalar(slot)
        result = await r.increment_atomic(session, uuid4(), uuid4(), uuid4())
        assert result == 26

    @patch("src.repositories.gira_time_slot_repo.GiraTimeSlot", _MockGiraTimeSlotModel)
    @patch("src.repositories.gira_time_slot_repo.select", _mock_select)
    @patch("src.repositories.gira_time_slot_repo.and_", _mock_and)
    async def test_increment_atomic_not_found(self, repo):
        r, _ = repo
        session = _mock_db()
        session.execute.return_value = _mock_result_scalar(None)
        with pytest.raises(ValueError, match="GiraTimeSlot not found"):
            await r.increment_atomic(session, uuid4(), uuid4(), uuid4())

    @patch("src.repositories.gira_time_slot_repo.GiraTimeSlot", _MockGiraTimeSlotModel)
    @patch("src.repositories.gira_time_slot_repo.select", _mock_select)
    @patch("src.repositories.gira_time_slot_repo.and_", _mock_and)
    async def test_increment_slots_returned_success(self, repo):
        r, _ = repo
        session = _mock_db()
        slot = MagicMock()
        slot.slots_returned = 2
        session.execute.return_value = _mock_result_scalar(slot)
        result = await r.increment_slots_returned(session, uuid4(), uuid4())
        assert result == 3
        assert slot.slots_returned == 3
        session.flush.assert_awaited()

    @patch("src.repositories.gira_time_slot_repo.GiraTimeSlot", _MockGiraTimeSlotModel)
    @patch("src.repositories.gira_time_slot_repo.select", _mock_select)
    @patch("src.repositories.gira_time_slot_repo.and_", _mock_and)
    async def test_increment_slots_returned_not_found(self, repo):
        r, _ = repo
        session = _mock_db()
        session.execute.return_value = _mock_result_scalar(None)
        with pytest.raises(ValueError, match="GiraTimeSlot not found"):
            await r.increment_slots_returned(session, uuid4(), uuid4())
