"""Unit tests for PlatformUserRepository, TicketAnalyticsRepository."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime, timedelta


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


def _mock_result_rows(rows):
    result = MagicMock()
    result.all.return_value = rows
    return result


def _mock_select(*args, **kwargs):
    """Return a mock select that supports chaining."""
    mock_stmt = MagicMock()
    mock_stmt.where.return_value = mock_stmt
    mock_stmt.options.return_value = mock_stmt
    mock_stmt.order_by.return_value = mock_stmt
    mock_stmt.limit.return_value = mock_stmt
    mock_stmt.offset.return_value = mock_stmt
    mock_stmt.join.return_value = mock_stmt
    mock_stmt.group_by.return_value = mock_stmt
    mock_stmt.label.return_value = mock_stmt
    return mock_stmt


# ═══════════════════════════════════════════════════════════
# PlatformUserRepository
# ═══════════════════════════════════════════════════════════
class TestPlatformUserRepository:

    @pytest.fixture
    def repo(self):
        from src.repositories.platform_user_repo import PlatformUserRepository
        db = _mock_db()
        r = PlatformUserRepository(db)
        return r, db

    async def test_get_by_id_found(self, repo):
        r, db = repo
        user = MagicMock()
        db.execute.return_value = _mock_result_scalar(user)
        result = await r.get_by_id(uuid4())
        assert result is user

    async def test_get_by_id_none(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.get_by_id(uuid4())
        assert result is None

    async def test_get_by_email_found(self, repo):
        r, db = repo
        user = MagicMock()
        db.execute.return_value = _mock_result_scalar(user)
        result = await r.get_by_email("admin@platform.com")
        assert result is user

    async def test_get_by_email_none(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.get_by_email("ghost@x.com")
        assert result is None

    async def test_list_all(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalars([MagicMock(), MagicMock()])
        result = await r.list_all()
        assert len(result) == 2

    async def test_list_all_pagination(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalars([])
        result = await r.list_all(skip=5, limit=10)
        assert result == []

    async def test_count_all(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(3)
        result = await r.count_all()
        assert result == 3

    async def test_count_all_none(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.count_all()
        assert result == 0

    async def test_create(self, repo):
        r, db = repo
        result = await r.create("admin@x.com", "admin", "hashed_pw")
        db.add.assert_called_once()
        db.flush.assert_awaited()
        db.refresh.assert_awaited()

    async def test_create_inactive(self, repo):
        r, db = repo
        result = await r.create("admin@x.com", "admin", "hashed_pw", is_active=False)
        db.add.assert_called_once()

    async def test_update_found(self, repo):
        r, db = repo
        user = MagicMock()
        user.email = "old@x.com"
        db.execute.return_value = _mock_result_scalar(user)
        result = await r.update(uuid4(), email="new@x.com")
        assert result is user
        db.flush.assert_awaited()

    async def test_update_not_found(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.update(uuid4(), email="new@x.com")
        assert result is None

    async def test_update_strips_role_and_tenant(self, repo):
        r, db = repo
        user = MagicMock()
        db.execute.return_value = _mock_result_scalar(user)
        result = await r.update(uuid4(), role="admin", tenant_id=uuid4(), email="a@b.com")
        assert result is user

    async def test_soft_delete_found(self, repo):
        r, db = repo
        user = MagicMock()
        db.execute.return_value = _mock_result_scalar(user)
        result = await r.soft_delete(uuid4())
        user.soft_delete.assert_called_once()
        db.flush.assert_awaited()

    async def test_soft_delete_not_found(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.soft_delete(uuid4())
        assert result is None


# ═══════════════════════════════════════════════════════════
# TicketAnalyticsRepository
# ═══════════════════════════════════════════════════════════
class TestTicketAnalyticsRepository:

    @pytest.fixture
    def repo(self):
        from src.repositories.ticket_analytics_repo import TicketAnalyticsRepository
        db = _mock_db()
        r = TicketAnalyticsRepository(db)
        return r, db

    async def test_get_total_stats(self, repo):
        r, db = repo
        # Two execute calls: total_emitted, total_used
        db.execute.side_effect = [
            _mock_result_scalar(100),  # total_emitted
            _mock_result_scalar(80),   # total_used
        ]
        result = await r.get_total_stats(uuid4())
        assert result["total_emitted"] == 100
        assert result["total_used"] == 80
        assert result["total_cancelled"] == 20
        assert result["usage_rate"] == 80.0

    async def test_get_total_stats_zero(self, repo):
        r, db = repo
        db.execute.side_effect = [
            _mock_result_scalar(0),
            _mock_result_scalar(0),
        ]
        result = await r.get_total_stats(uuid4())
        assert result["usage_rate"] == 0

    async def test_get_total_stats_with_gira(self, repo):
        r, db = repo
        db.execute.side_effect = [
            _mock_result_scalar(50),
            _mock_result_scalar(25),
        ]
        result = await r.get_total_stats(uuid4(), gira_id=uuid4())
        assert result["total_emitted"] == 50

    @patch("src.repositories.ticket_analytics_repo.select", _mock_select)
    @patch("src.repositories.ticket_analytics_repo.and_", lambda *a, **kw: MagicMock())
    @patch("src.repositories.ticket_analytics_repo.func", MagicMock())
    async def test_get_daily_distribution(self, repo):
        from datetime import date
        r, db = repo
        mock_date = MagicMock()
        mock_date.isoformat.return_value = "2024-06-01"
        row = (mock_date, 10, 5, 6, 2, 2)  # date, total, completed, common, sponsor, walk_in
        db.execute.return_value = _mock_result_rows([row])
        result = await r.get_daily_distribution(uuid4())
        assert len(result) == 1
        assert result[0]["total"] == 10
        assert result[0]["completed"] == 5

    @patch("src.repositories.ticket_analytics_repo.select", _mock_select)
    @patch("src.repositories.ticket_analytics_repo.and_", lambda *a, **kw: MagicMock())
    @patch("src.repositories.ticket_analytics_repo.func", MagicMock())
    async def test_get_daily_distribution_empty(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_rows([])
        result = await r.get_daily_distribution(uuid4(), days=7)
        assert result == []

    @patch("src.repositories.ticket_analytics_repo.select", _mock_select)
    @patch("src.repositories.ticket_analytics_repo.and_", lambda *a, **kw: MagicMock())
    @patch("src.repositories.ticket_analytics_repo.func", MagicMock())
    async def test_get_daily_distribution_none_date(self, repo):
        r, db = repo
        row = (None, 3, 1, 1, 0, 0)  # date, total, completed, common, sponsor, walk_in
        db.execute.return_value = _mock_result_rows([row])
        result = await r.get_daily_distribution(uuid4())
        assert result[0]["date"] is None

    async def test_get_today_stats(self, repo):
        r, db = repo
        db.execute.side_effect = [
            _mock_result_scalar(15),  # emitted today
            _mock_result_scalar(10),  # used today
        ]
        result = await r.get_today_stats(uuid4())
        assert result["emitted_today"] == 15
        assert result["used_today"] == 10

    async def test_get_today_stats_with_gira(self, repo):
        r, db = repo
        db.execute.side_effect = [
            _mock_result_scalar(5),
            _mock_result_scalar(3),
        ]
        result = await r.get_today_stats(uuid4(), gira_id=uuid4())
        assert result["emitted_today"] == 5

    async def test_get_resend_stats(self, repo):
        r, db = repo
        result = await r.get_resend_stats(uuid4())
        assert result["total_resends"] == 0
        assert result["avg_resends_per_ticket"] == 0

    async def test_get_gira_progress(self, repo):
        from src.models import TicketStatus
        r, db = repo
        rows = [
            (TicketStatus.EMITTED, 20),
            (TicketStatus.COMPLETED, 15),
            (TicketStatus.CANCELLED, 5),
        ]
        db.execute.return_value = _mock_result_rows(rows)
        result = await r.get_gira_progress(uuid4(), uuid4())
        assert result["emitted"] == 20
        assert result["completed"] == 15
        assert result["cancelled"] == 5

    async def test_get_gira_progress_empty(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_rows([])
        result = await r.get_gira_progress(uuid4(), uuid4())
        assert result["emitted"] == 0
        assert result["completed"] == 0

    async def test_get_peak_hours(self, repo):
        r, db = repo
        rows = [(14, 100), (9, 80), (17, 60)]
        db.execute.return_value = _mock_result_rows(rows)
        result = await r.get_peak_hours(uuid4())
        assert len(result) == 3
        assert result[0]["hour"] == 14
        assert result[0]["count"] == 100

    async def test_get_peak_hours_empty(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_rows([])
        result = await r.get_peak_hours(uuid4(), days=3)
        assert result == []

    async def test_get_peak_hours_with_gira(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_rows([(10, 50)])
        result = await r.get_peak_hours(uuid4(), gira_id=uuid4())
        assert len(result) == 1

    async def test_get_peak_hours_none_hour(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_rows([(None, 5)])
        result = await r.get_peak_hours(uuid4())
        assert result[0]["hour"] == 0
