"""Unit tests for TenantRepository, UserRepository, GiraRepository."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime


# ─── Helpers ────────────────────────────────────────────────────
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


# ═══════════════════════════════════════════════════════════
# TenantRepository
# ═══════════════════════════════════════════════════════════
class TestTenantRepository:

    @pytest.fixture
    def repo(self):
        from src.repositories.tenant_repo import TenantRepository
        db = _mock_db()
        r = TenantRepository(db)
        return r, db

    # get_by_slug
    async def test_get_by_slug_found(self, repo):
        r, db = repo
        tenant = MagicMock()
        db.execute.return_value = _mock_result_scalar(tenant)
        result = await r.get_by_slug("my-slug")
        assert result is tenant
        db.execute.assert_awaited_once()

    async def test_get_by_slug_none(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.get_by_slug("no-slug")
        assert result is None

    # search
    async def test_search_no_filters(self, repo):
        r, db = repo
        items = [MagicMock(), MagicMock()]
        db.execute.return_value = _mock_result_scalars(items)
        result = await r.search()
        assert len(result) == 2

    async def test_search_with_query(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalars([MagicMock()])
        result = await r.search(query="test")
        assert len(result) == 1

    async def test_search_with_is_active(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalars([])
        result = await r.search(is_active=True)
        assert result == []

    async def test_search_with_pagination(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalars([])
        result = await r.search(skip=10, limit=5)
        assert result == []

    # count_all
    async def test_count_all_no_filter(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(42)
        result = await r.count_all()
        assert result == 42

    async def test_count_all_with_active_filter(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(10)
        result = await r.count_all(is_active=True)
        assert result == 10

    async def test_count_all_returns_zero_on_none(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.count_all()
        assert result == 0

    # create
    async def test_create_tenant(self, repo):
        r, db = repo
        result = await r.create(name="Test", slug="test")
        db.add.assert_called_once()
        db.flush.assert_awaited_once()
        db.refresh.assert_awaited_once()
        assert result is not None

    # update
    async def test_update_found(self, repo):
        r, db = repo
        tenant = MagicMock()
        tenant.name = "Old"
        db.execute.return_value = _mock_result_scalar(tenant)
        tid = uuid4()
        result = await r.update(tid, name="New")
        assert result is not None
        db.flush.assert_awaited()
        db.refresh.assert_awaited()

    async def test_update_not_found(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.update(uuid4(), name="X")
        assert result is None

    # soft_delete
    async def test_soft_delete_found(self, repo):
        r, db = repo
        tenant = MagicMock()
        db.execute.return_value = _mock_result_scalar(tenant)
        result = await r.soft_delete(uuid4())
        tenant.soft_delete.assert_called_once()
        db.flush.assert_awaited()
        db.refresh.assert_awaited()
        assert result is tenant

    async def test_soft_delete_not_found(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.soft_delete(uuid4())
        assert result is None


# ═══════════════════════════════════════════════════════════
# UserRepository
# ═══════════════════════════════════════════════════════════
class TestUserRepository:

    @pytest.fixture
    def repo(self):
        from src.repositories.user_repo import UserRepository
        db = _mock_db()
        r = UserRepository(db)
        return r, db

    async def test_create_user(self, repo):
        r, db = repo
        tid = uuid4()
        result = await r.create(tid, email="a@b.com", username="usr")
        db.add.assert_called_once()
        db.flush.assert_awaited()
        db.refresh.assert_awaited()

    async def test_get_by_email_found(self, repo):
        r, db = repo
        user = MagicMock()
        db.execute.return_value = _mock_result_scalar(user)
        result = await r.get_by_email(uuid4(), "a@b.com")
        assert result is user

    async def test_get_by_email_none(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.get_by_email(uuid4(), "x@y.com")
        assert result is None

    async def test_get_admins(self, repo):
        r, db = repo
        users = [MagicMock(), MagicMock()]
        db.execute.return_value = _mock_result_scalars(users)
        result = await r.get_admins(uuid4())
        assert len(result) == 2

    async def test_get_by_role(self, repo):
        from src.models import UserRole
        r, db = repo
        db.execute.return_value = _mock_result_scalars([MagicMock()])
        result = await r.get_by_role(uuid4(), UserRole.ADMIN)
        assert len(result) == 1

    async def test_get_by_role_pagination(self, repo):
        from src.models import UserRole
        r, db = repo
        db.execute.return_value = _mock_result_scalars([])
        result = await r.get_by_role(uuid4(), UserRole.OPERATOR, skip=5, limit=10)
        assert result == []

    async def test_get_active_users(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalars([MagicMock()])
        result = await r.get_active_users(uuid4())
        assert len(result) == 1

    async def test_deactivate_found(self, repo):
        r, db = repo
        user = MagicMock()
        r.get_by_id = AsyncMock(return_value=user)
        result = await r.deactivate(uuid4(), uuid4())
        assert result is True
        assert user.is_active is False

    async def test_deactivate_not_found(self, repo):
        r, db = repo
        r.get_by_id = AsyncMock(return_value=None)
        result = await r.deactivate(uuid4(), uuid4())
        assert result is False

    async def test_activate_found(self, repo):
        r, db = repo
        user = MagicMock()
        r.get_by_id = AsyncMock(return_value=user)
        result = await r.activate(uuid4(), uuid4())
        assert result is True
        assert user.is_active is True

    async def test_activate_not_found(self, repo):
        r, db = repo
        r.get_by_id = AsyncMock(return_value=None)
        result = await r.activate(uuid4(), uuid4())
        assert result is False

    async def test_update_role_found(self, repo):
        from src.models import UserRole
        r, db = repo
        user = MagicMock()
        r.get_by_id = AsyncMock(return_value=user)
        result = await r.update_role(uuid4(), uuid4(), UserRole.ADMIN)
        assert result is user
        db.flush.assert_awaited()
        db.refresh.assert_awaited()

    async def test_update_role_not_found(self, repo):
        from src.models import UserRole
        r, db = repo
        r.get_by_id = AsyncMock(return_value=None)
        result = await r.update_role(uuid4(), uuid4(), UserRole.ADMIN)
        assert result is None

    async def test_delete_soft_found(self, repo):
        r, db = repo
        user = MagicMock()
        r.get_by_id = AsyncMock(return_value=user)
        result = await r.delete_soft(uuid4(), uuid4())
        assert result is True
        user.soft_delete.assert_called_once()

    async def test_delete_soft_not_found(self, repo):
        r, db = repo
        r.get_by_id = AsyncMock(return_value=None)
        result = await r.delete_soft(uuid4(), uuid4())
        assert result is False


# ═══════════════════════════════════════════════════════════
# GiraRepository
# ═══════════════════════════════════════════════════════════
class TestGiraRepository:

    @pytest.fixture
    def repo(self):
        from src.repositories.gira_repo import GiraRepository
        db = _mock_db()
        r = GiraRepository(db)
        return r, db

    async def test_create_gira(self, repo):
        r, db = repo
        result = await r.create(uuid4(), nome="Gira1")
        db.add.assert_called_once()
        db.flush.assert_awaited()
        db.refresh.assert_awaited()

    async def test_get_active_giras(self, repo):
        r, db = repo
        items = [MagicMock(), MagicMock()]
        db.execute.return_value = _mock_result_scalars(items)
        result = await r.get_active_giras(uuid4())
        assert len(result) == 2

    async def test_get_active_giras_with_limit(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalars([])
        result = await r.get_active_giras(uuid4(), limit=5)
        assert result == []

    async def test_get_upcoming_giras(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalars([MagicMock()])
        result = await r.get_upcoming_giras(uuid4())
        assert len(result) == 1

    async def test_get_ticket_count(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(5)
        result = await r.get_ticket_count(uuid4(), uuid4())
        assert result == 5

    async def test_filter_by_date_range(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalars([MagicMock()])
        result = await r.filter_by_date_range(uuid4(), datetime(2024, 1, 1), datetime(2024, 12, 31))
        assert len(result) == 1

    async def test_filter_by_date_range_pagination(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalars([])
        result = await r.filter_by_date_range(uuid4(), datetime(2024, 1, 1), datetime(2024, 12, 31), skip=5, limit=10)
        assert result == []

    async def test_update_found(self, repo):
        r, db = repo
        gira = MagicMock()
        r.get_by_id = AsyncMock(return_value=gira)
        result = await r.update(uuid4(), uuid4(), nome="Updated")
        db.add.assert_called()
        db.flush.assert_awaited()
        db.refresh.assert_awaited()
        assert result is gira

    async def test_update_not_found(self, repo):
        r, db = repo
        r.get_by_id = AsyncMock(return_value=None)
        result = await r.update(uuid4(), uuid4(), nome="X")
        assert result is None

    async def test_delete_soft_found(self, repo):
        r, db = repo
        gira = MagicMock()
        r.get_by_id = AsyncMock(return_value=gira)
        result = await r.delete_soft(uuid4(), uuid4())
        assert result is True
        gira.soft_delete.assert_called_once()

    async def test_delete_soft_not_found(self, repo):
        r, db = repo
        r.get_by_id = AsyncMock(return_value=None)
        result = await r.delete_soft(uuid4(), uuid4())
        assert result is False
