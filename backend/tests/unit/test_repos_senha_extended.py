"""Unit tests for SenhaControlRepositoryExtended (bulk operations)."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
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


class TestSenhaControlRepositoryExtended:

    @pytest.fixture
    def repo(self):
        from src.repositories.senha_control_repo_extended import SenhaControlRepositoryExtended
        db = _mock_db()
        r = SenhaControlRepositoryExtended(db, MagicMock())
        return r, db

    # bulk_mark_used
    async def test_bulk_mark_used_empty(self, repo):
        r, db = repo
        result = await r.bulk_mark_used([], uuid4())
        assert result["modified"] == 0
        assert result["failed"] == 0
        assert result["errors"] == []

    async def test_bulk_mark_used_success(self, repo):
        from src.models import TicketStatus
        r, db = repo
        tid = uuid4()
        t1_id = uuid4()
        ticket1 = MagicMock()
        ticket1.id = t1_id
        ticket1.status = TicketStatus.EMITTED
        db.execute.return_value = _mock_result_scalars([ticket1])
        result = await r.bulk_mark_used([t1_id], tid)
        assert result["modified"] == 1
        assert ticket1.status == TicketStatus.COMPLETED
        db.flush.assert_awaited()

    async def test_bulk_mark_used_dry_run(self, repo):
        from src.models import TicketStatus
        r, db = repo
        tid = uuid4()
        ticket = MagicMock()
        ticket.id = uuid4()
        ticket.status = TicketStatus.EMITTED
        db.execute.return_value = _mock_result_scalars([ticket])
        result = await r.bulk_mark_used([ticket.id], tid, dry_run=True)
        assert result["modified"] == 1
        db.flush.assert_not_awaited()

    async def test_bulk_mark_used_missing_tickets(self, repo):
        r, db = repo
        tid = uuid4()
        id1, id2 = uuid4(), uuid4()
        ticket = MagicMock()
        ticket.id = id1
        ticket.status = MagicMock()
        # Simulate only 1 of 2 found
        db.execute.return_value = _mock_result_scalars([ticket])
        result = await r.bulk_mark_used([id1, id2], tid)
        assert result["failed"] >= 1
        assert len(result["errors"]) > 0

    # bulk_cancel
    async def test_bulk_cancel_empty(self, repo):
        r, db = repo
        result = await r.bulk_cancel([], uuid4())
        assert result["modified"] == 0

    async def test_bulk_cancel_success(self, repo):
        from src.models import TicketStatus
        r, db = repo
        tid = uuid4()
        ticket = MagicMock()
        ticket.id = uuid4()
        ticket.status = TicketStatus.EMITTED
        db.execute.return_value = _mock_result_scalars([ticket])
        result = await r.bulk_cancel([ticket.id], tid)
        assert result["modified"] == 1
        assert ticket.status == TicketStatus.CANCELLED

    async def test_bulk_cancel_dry_run(self, repo):
        from src.models import TicketStatus
        r, db = repo
        tid = uuid4()
        ticket = MagicMock()
        ticket.id = uuid4()
        ticket.status = TicketStatus.CALLED
        db.execute.return_value = _mock_result_scalars([ticket])
        result = await r.bulk_cancel([ticket.id], tid, dry_run=True)
        assert result["modified"] == 1
        db.flush.assert_not_awaited()

    # bulk_reset_gira_counter
    async def test_bulk_reset_found(self, repo):
        r, db = repo
        sc = MagicMock()
        r.get_by_gira = AsyncMock(return_value=sc)
        result = await r.bulk_reset_gira_counter(uuid4(), uuid4())
        assert result is True
        assert sc.current_numero == 0
        db.flush.assert_awaited()

    async def test_bulk_reset_not_found(self, repo):
        r, db = repo
        r.get_by_gira = AsyncMock(return_value=None)
        result = await r.bulk_reset_gira_counter(uuid4(), uuid4())
        assert result is False

    # get_bulk_stats
    async def test_get_bulk_stats_no_control(self, repo):
        r, db = repo
        r.get_by_gira = AsyncMock(return_value=None)
        result = await r.get_bulk_stats(uuid4(), uuid4())
        assert result["total_capacity"] == 0
        assert result["usage_percent"] == 0

    async def test_get_bulk_stats_with_data(self, repo):
        r, db = repo
        sc = MagicMock()
        sc.max_numero = 100
        sc.current_numero = 42
        r.get_by_gira = AsyncMock(return_value=sc)
        db.execute.return_value = _mock_result_scalar(50)
        result = await r.get_bulk_stats(uuid4(), uuid4())
        assert result["total_capacity"] == 100
        assert result["total_emitted"] == 50
        assert result["remaining"] == 50
        assert result["usage_percent"] == 50.0
