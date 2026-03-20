"""Unit tests for SubscriptionRepository, ConsolidatedAuditRepository, FeatureFlagsRepository."""
import pytest
from unittest.mock import AsyncMock, MagicMock
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


# ═══════════════════════════════════════════════════════════
# SubscriptionRepository
# ═══════════════════════════════════════════════════════════
class TestSubscriptionRepository:

    @pytest.fixture
    def repo(self):
        from src.repositories.subscription_repo import SubscriptionRepository
        db = _mock_db()
        r = SubscriptionRepository(db)
        return r, db

    async def test_get_by_tenant_found(self, repo):
        r, db = repo
        sub = MagicMock()
        db.execute.return_value = _mock_result_scalar(sub)
        result = await r.get_by_tenant(uuid4())
        assert result is sub

    async def test_get_by_tenant_none(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.get_by_tenant(uuid4())
        assert result is None

    async def test_list_by_plan(self, repo):
        from src.models import PlanType
        r, db = repo
        db.execute.return_value = _mock_result_scalars([MagicMock()])
        result = await r.list_by_plan(PlanType.PRO)
        assert len(result) == 1

    async def test_list_by_status(self, repo):
        from src.models import SubscriptionStatus
        r, db = repo
        db.execute.return_value = _mock_result_scalars([MagicMock()])
        result = await r.list_by_status(SubscriptionStatus.ACTIVE)
        assert len(result) == 1

    async def test_create_for_tenant_basic(self, repo):
        from src.models import PlanType
        r, db = repo
        result = await r.create_for_tenant(uuid4())
        db.add.assert_called_once()
        db.flush.assert_awaited()
        db.refresh.assert_awaited()

    async def test_create_for_tenant_pro(self, repo):
        from src.models import PlanType
        r, db = repo
        result = await r.create_for_tenant(uuid4(), plan=PlanType.PRO)
        db.add.assert_called_once()

    async def test_create_for_tenant_trial(self, repo):
        from src.models import PlanType
        r, db = repo
        result = await r.create_for_tenant(uuid4(), is_trial=True, trial_ends_at=datetime(2025, 1, 1))
        db.add.assert_called_once()

    async def test_upgrade_plan_found(self, repo):
        from src.models import PlanType
        r, db = repo
        sub = MagicMock()
        db.execute.return_value = _mock_result_scalar(sub)
        result = await r.upgrade_plan(uuid4(), PlanType.PREMIUM)
        assert result is sub
        assert sub.plan == PlanType.PREMIUM
        db.flush.assert_awaited()

    async def test_upgrade_plan_not_found(self, repo):
        from src.models import PlanType
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.upgrade_plan(uuid4(), PlanType.PREMIUM)
        assert result is None

    def test_get_plan_config_free(self):
        from src.repositories.subscription_repo import SubscriptionRepository
        from src.models import PlanType
        r = SubscriptionRepository(_mock_db())
        config = r._get_plan_config(PlanType.FREE)
        assert config["max_users"] == 1
        assert config["max_giras_per_month"] == 2
        assert config["price"] == 0.0

    def test_get_plan_config_basic(self):
        from src.repositories.subscription_repo import SubscriptionRepository
        from src.models import PlanType
        r = SubscriptionRepository(_mock_db())
        config = r._get_plan_config(PlanType.BASIC)
        assert config["max_users"] == 5
        assert config["price"] == 49.0

    def test_get_plan_config_pro(self):
        from src.repositories.subscription_repo import SubscriptionRepository
        from src.models import PlanType
        r = SubscriptionRepository(_mock_db())
        config = r._get_plan_config(PlanType.PRO)
        assert config["max_users"] == 20
        assert config["price"] == 79.0

    def test_get_plan_config_premium(self):
        from src.repositories.subscription_repo import SubscriptionRepository
        from src.models import PlanType
        r = SubscriptionRepository(_mock_db())
        config = r._get_plan_config(PlanType.PREMIUM)
        assert config["max_users"] == 99999

    def test_get_plan_config_enterprise(self):
        from src.repositories.subscription_repo import SubscriptionRepository
        from src.models import PlanType
        r = SubscriptionRepository(_mock_db())
        config = r._get_plan_config(PlanType.ENTERPRISE)
        assert config["max_users"] == 99999

    def test_get_plan_config_unknown(self):
        from src.repositories.subscription_repo import SubscriptionRepository
        from src.models import PlanType
        r = SubscriptionRepository(_mock_db())
        # Unknown falls back to FREE
        config = r._get_plan_config("unknown")
        assert config["max_users"] == 1


# ═══════════════════════════════════════════════════════════
# ConsolidatedAuditRepository
# ═══════════════════════════════════════════════════════════
class TestConsolidatedAuditRepository:

    @pytest.fixture
    def repo(self):
        from src.repositories.consolidated_audit_repo import ConsolidatedAuditRepository
        db = _mock_db()
        r = ConsolidatedAuditRepository(db)
        return r, db

    async def test_get_by_tenant(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalars([MagicMock()])
        result = await r.get_by_tenant(uuid4())
        assert len(result) == 1

    async def test_get_range(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalars([MagicMock(), MagicMock()])
        result = await r.get_range(datetime(2024, 1, 1), datetime(2024, 12, 31))
        assert len(result) == 2

    async def test_get_range_pagination(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalars([])
        result = await r.get_range(datetime(2024, 1, 1), datetime(2024, 12, 31), skip=10, limit=5)
        assert result == []

    async def test_count_by_tenant(self, repo):
        r, db = repo
        tid1, tid2 = uuid4(), uuid4()
        db.execute.return_value = _mock_result_rows([(tid1, 5), (tid2, 3)])
        result = await r.count_by_tenant(datetime(2024, 1, 1), datetime(2024, 12, 31))
        assert result[tid1] == 5
        assert result[tid2] == 3

    async def test_count_by_action(self, repo):
        r, db = repo
        action1 = MagicMock()
        action1.value = "CREATE"
        action2 = MagicMock()
        action2.value = "DELETE"
        db.execute.return_value = _mock_result_rows([(action1, 10), (action2, 2)])
        result = await r.count_by_action(datetime(2024, 1, 1), datetime(2024, 12, 31))
        assert result["CREATE"] == 10
        assert result["DELETE"] == 2

    async def test_count_by_user(self, repo):
        r, db = repo
        uid = uuid4()
        db.execute.return_value = _mock_result_rows([(uid, 7)])
        result = await r.count_by_user(datetime(2024, 1, 1), datetime(2024, 12, 31))
        assert result[uid] == 7

    async def test_count_total(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(42)
        result = await r._count_total(datetime(2024, 1, 1), datetime(2024, 12, 31))
        assert result == 42

    async def test_count_total_none(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r._count_total(datetime(2024, 1, 1), datetime(2024, 12, 31))
        assert result == 0

    async def test_get_summary(self, repo):
        r, db = repo
        r._count_total = AsyncMock(return_value=100)
        r.count_by_tenant = AsyncMock(return_value={uuid4(): 50})
        r.count_by_action = AsyncMock(return_value={"CREATE": 80, "DELETE": 20})
        r.count_by_user = AsyncMock(return_value={uuid4(): 100})
        start = datetime(2024, 1, 1)
        end = datetime(2024, 12, 31)
        result = await r.get_summary(start, end)
        assert result["total"] == 100
        assert "by_tenant" in result
        assert "by_action" in result
        assert "by_user" in result
        assert result["period"]["start"] == start.isoformat()
        assert result["period"]["end"] == end.isoformat()


# ═══════════════════════════════════════════════════════════
# FeatureFlagsRepository
# ═══════════════════════════════════════════════════════════
class TestFeatureFlagsRepository:

    @pytest.fixture
    def repo(self):
        from src.repositories.feature_flags_repo import FeatureFlagsRepository
        db = _mock_db()
        r = FeatureFlagsRepository(db)
        return r, db

    async def test_get_by_name_found(self, repo):
        r, db = repo
        flag = MagicMock()
        db.execute.return_value = _mock_result_scalar(flag)
        result = await r.get_by_name(uuid4(), "dark_mode")
        assert result is flag

    async def test_get_by_name_none(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.get_by_name(uuid4(), "nonexistent")
        assert result is None

    async def test_exists_enabled(self, repo):
        r, db = repo
        flag = MagicMock()
        flag.enabled = True
        flag.expires_at = None
        r.get_by_name = AsyncMock(return_value=flag)
        result = await r.exists(uuid4(), "dark_mode")
        assert result is True

    async def test_exists_disabled(self, repo):
        r, db = repo
        flag = MagicMock()
        flag.enabled = False
        r.get_by_name = AsyncMock(return_value=flag)
        result = await r.exists(uuid4(), "dark_mode")
        assert result is False

    async def test_exists_expired(self, repo):
        r, db = repo
        flag = MagicMock()
        flag.enabled = True
        flag.expires_at = datetime(2020, 1, 1)  # past
        r.get_by_name = AsyncMock(return_value=flag)
        result = await r.exists(uuid4(), "dark_mode")
        assert result is False

    async def test_exists_not_found(self, repo):
        r, db = repo
        r.get_by_name = AsyncMock(return_value=None)
        result = await r.exists(uuid4(), "dark_mode")
        assert result is False

    async def test_list_enabled(self, repo):
        r, db = repo
        f1 = MagicMock()
        f1.expires_at = None
        f2 = MagicMock()
        f2.expires_at = datetime(2030, 1, 1)  # future
        db.execute.return_value = _mock_result_scalars([f1, f2])
        result = await r.list_enabled(uuid4())
        assert len(result) == 2

    async def test_list_enabled_filters_expired(self, repo):
        r, db = repo
        f1 = MagicMock()
        f1.expires_at = datetime(2020, 1, 1)  # expired
        f2 = MagicMock()
        f2.expires_at = None
        db.execute.return_value = _mock_result_scalars([f1, f2])
        result = await r.list_enabled(uuid4())
        assert len(result) == 1

    async def test_list_all_for_tenant(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalars([MagicMock(), MagicMock()])
        result = await r.list_all_for_tenant(uuid4())
        assert len(result) == 2

    async def test_enable_existing(self, repo):
        r, db = repo
        flag = MagicMock()
        r.get_by_name = AsyncMock(return_value=flag)
        result = await r.enable(uuid4(), "dark_mode")
        assert flag.enabled is True
        db.flush.assert_awaited()
        db.refresh.assert_awaited()

    async def test_enable_new(self, repo):
        r, db = repo
        r.get_by_name = AsyncMock(return_value=None)
        result = await r.enable(uuid4(), "new_feature")
        db.add.assert_called_once()
        db.flush.assert_awaited()

    async def test_enable_with_expiry(self, repo):
        r, db = repo
        r.get_by_name = AsyncMock(return_value=None)
        expiry = datetime(2025, 12, 31)
        result = await r.enable(uuid4(), "temp_feature", expires_at=expiry)
        db.add.assert_called_once()

    async def test_disable_found(self, repo):
        r, db = repo
        flag = MagicMock()
        r.get_by_name = AsyncMock(return_value=flag)
        result = await r.disable(uuid4(), "dark_mode")
        assert flag.enabled is False
        assert flag.expires_at is None

    async def test_disable_not_found(self, repo):
        r, db = repo
        r.get_by_name = AsyncMock(return_value=None)
        result = await r.disable(uuid4(), "nonexistent")
        assert result is None

    async def test_create_or_update_existing(self, repo):
        r, db = repo
        flag = MagicMock()
        r.get_by_name = AsyncMock(return_value=flag)
        result = await r.create_or_update(uuid4(), "feature", True)
        assert flag.enabled is True
        db.flush.assert_awaited()

    async def test_create_or_update_new(self, repo):
        r, db = repo
        r.get_by_name = AsyncMock(return_value=None)
        result = await r.create_or_update(uuid4(), "new_feat", False, description="A flag")
        db.add.assert_called_once()
        db.flush.assert_awaited()

    async def test_create_or_update_with_expiry(self, repo):
        r, db = repo
        flag = MagicMock()
        r.get_by_name = AsyncMock(return_value=flag)
        expiry = datetime(2025, 6, 1)
        result = await r.create_or_update(uuid4(), "feature", True, expires_at=expiry)
        assert flag.expires_at == expiry
