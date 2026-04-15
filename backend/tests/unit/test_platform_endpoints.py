"""Tests for platform API endpoints (tenants, users, billing, subscriptions, feature_flags, audit)."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from src.models import UserRole
from tests.conftest import TENANT_ID, USER_ID, SUPER_ADMIN_ID


def _super_admin():
    user = MagicMock()
    user.id = SUPER_ADMIN_ID
    user.tenant_id = None
    user.role = UserRole.SUPER_ADMIN
    return user


def _regular_admin():
    user = MagicMock()
    user.id = USER_ID
    user.tenant_id = TENANT_ID
    user.role = UserRole.ADMIN
    return user


# ── tenants.py ───────────────────────────────────────────────────────────────

class TestPlatformTenants:
    async def test_require_super_admin_passes(self):
        from src.api.v1.platform.tenants import require_super_admin
        result = await require_super_admin(_super_admin())
        assert result.role == UserRole.SUPER_ADMIN

    async def test_require_super_admin_rejects_admin(self):
        from src.api.v1.platform.tenants import require_super_admin
        with pytest.raises(HTTPException) as exc_info:
            await require_super_admin(_regular_admin())
        assert exc_info.value.status_code == 403

    @patch("src.api.v1.platform.tenants.TenantService")
    async def test_create_tenant(self, MockService):
        from src.api.v1.platform.tenants import create_tenant, CreateTenantRequest
        service = AsyncMock()
        service.create_tenant.return_value = {
            "id": str(TENANT_ID), "slug": "test", "name": "Test",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "admin_user": {"id": "x", "email": "a@b.com", "username": "admin", "role": "admin"},
            "subscription": {"plan": "basic", "is_trial": False, "max_users": 10},
            "api_key": "key123", "temp_password": "pass123",
        }
        MockService.return_value = service
        db = AsyncMock()

        result = await create_tenant(
            CreateTenantRequest(slug="test", name="Test", email_admin="a@b.com"),
            _super_admin(), db,
        )
        service.create_tenant.assert_called_once()

    @patch("src.api.v1.platform.tenants.TenantRepository")
    async def test_list_tenants(self, MockRepo):
        from src.api.v1.platform.tenants import list_tenants
        repo = AsyncMock()
        repo.search.return_value = []
        MockRepo.return_value = repo

        result = await list_tenants(0, 50, None, _super_admin(), AsyncMock())
        assert isinstance(result, list)

    @patch("src.api.v1.platform.tenants.TenantRepository")
    async def test_get_tenant(self, MockRepo):
        from src.api.v1.platform.tenants import get_tenant
        repo = AsyncMock()
        tenant = MagicMock()
        tenant.id = TENANT_ID
        tenant.slug = "t"
        tenant.name = "T"
        tenant.description = None
        tenant.is_active = True
        tenant.created_at = datetime.now(timezone.utc)
        tenant.updated_at = datetime.now(timezone.utc)
        repo.get_by_id.return_value = tenant
        MockRepo.return_value = repo

        result = await get_tenant(TENANT_ID, _super_admin(), AsyncMock())
        assert result.slug == "t"

    @patch("src.api.v1.platform.tenants.TenantRepository")
    async def test_get_tenant_not_found(self, MockRepo):
        from src.api.v1.platform.tenants import get_tenant
        repo = AsyncMock()
        repo.get_by_id.return_value = None
        MockRepo.return_value = repo

        with pytest.raises(HTTPException) as exc_info:
            await get_tenant(TENANT_ID, _super_admin(), AsyncMock())
        assert exc_info.value.status_code == 404

    @patch("src.api.v1.platform.tenants.TenantService")
    async def test_delete_tenant(self, MockService):
        from src.api.v1.platform.tenants import delete_tenant
        db = AsyncMock()
        service = AsyncMock()
        service.delete_tenant.return_value = True
        MockService.return_value = service

        await delete_tenant(TENANT_ID, _super_admin(), db)
        db.commit.assert_called_once()

    @patch("src.api.v1.platform.tenants.log_security_event")
    @patch("src.api.v1.platform.tenants.hash_password")
    @patch("src.api.v1.platform.tenants.TenantRepository")
    async def test_reset_tenant_user_password_success(self, MockRepo, mock_hash, mock_log):
        from src.api.v1.platform.tenants import reset_tenant_user_password, ResetPasswordRequest
        db = AsyncMock()
        repo = AsyncMock()
        tenant = MagicMock()
        repo.get_by_id.return_value = tenant
        MockRepo.return_value = repo

        user = MagicMock()
        user.id = USER_ID
        user.tenant_id = TENANT_ID
        scalar_result = MagicMock()
        scalar_result.scalar_one_or_none.return_value = user
        db.execute.return_value = scalar_result
        mock_hash.return_value = "new_hashed"

        body = ResetPasswordRequest(new_password="V@lid1234567")
        await reset_tenant_user_password(TENANT_ID, USER_ID, body, _super_admin(), db)

        mock_hash.assert_called_once_with("V@lid1234567")
        assert user.password_hash == "new_hashed"
        db.commit.assert_called_once()
        mock_log.assert_called_once()

    @patch("src.api.v1.platform.tenants.TenantRepository")
    async def test_reset_tenant_user_password_tenant_not_found(self, MockRepo):
        from src.api.v1.platform.tenants import reset_tenant_user_password, ResetPasswordRequest
        repo = AsyncMock()
        repo.get_by_id.return_value = None
        MockRepo.return_value = repo

        body = ResetPasswordRequest(new_password="V@lid1234567")
        with pytest.raises(HTTPException) as exc_info:
            await reset_tenant_user_password(TENANT_ID, USER_ID, body, _super_admin(), AsyncMock())
        assert exc_info.value.status_code == 404

    @patch("src.api.v1.platform.tenants.TenantRepository")
    async def test_reset_tenant_user_password_user_not_found(self, MockRepo):
        from src.api.v1.platform.tenants import reset_tenant_user_password, ResetPasswordRequest
        db = AsyncMock()
        repo = AsyncMock()
        repo.get_by_id.return_value = MagicMock()
        MockRepo.return_value = repo

        scalar_result = MagicMock()
        scalar_result.scalar_one_or_none.return_value = None
        db.execute.return_value = scalar_result

        body = ResetPasswordRequest(new_password="V@lid1234567")
        with pytest.raises(HTTPException) as exc_info:
            await reset_tenant_user_password(TENANT_ID, USER_ID, body, _super_admin(), db)
        assert exc_info.value.status_code == 404

    async def test_reset_tenant_user_password_rejects_non_super_admin(self):
        from src.api.v1.platform.tenants import require_super_admin
        with pytest.raises(HTTPException) as exc_info:
            await require_super_admin(_regular_admin())
        assert exc_info.value.status_code == 403


# ── tenants_search.py ────────────────────────────────────────────────────────

class TestTenantSearch:
    @patch("src.api.v1.platform.tenants_search.TenantRepository")
    async def test_search(self, MockRepo):
        from src.api.v1.platform.tenants_search import search_tenants
        repo = AsyncMock()
        repo.search.return_value = []
        repo.count_all.return_value = 0
        MockRepo.return_value = repo

        result = await search_tenants(None, None, None, 0, 50, _super_admin(), AsyncMock())
        assert result is not None
        assert result["pagination"]["total"] == 0

    async def test_rejects_non_super_admin(self):
        from src.api.v1.platform.tenants_search import require_super_admin
        with pytest.raises(HTTPException) as exc_info:
            await require_super_admin(_regular_admin())
        assert exc_info.value.status_code == 403


# ── users_global.py ──────────────────────────────────────────────────────────

class TestPlatformUsers:
    @patch("src.api.v1.platform.users_global.hash_password")
    @patch("src.api.v1.platform.users_global.PlatformUserRepository")
    async def test_create_user(self, MockRepo, mock_hash):
        from src.api.v1.platform.users_global import create_platform_user, CreatePlatformUserRequest
        db = AsyncMock()
        repo = AsyncMock()
        repo.get_by_email.return_value = None
        repo.create.return_value = MagicMock(
            id=USER_ID, email="a@b.com", username="user", role=MagicMock(value="super_admin"),
            is_active=True, created_at=datetime.now(timezone.utc),
        )
        MockRepo.return_value = repo
        mock_hash.return_value = "hashed"

        result = await create_platform_user(
            CreatePlatformUserRequest(email="a@b.com", username="user", password="P@ss12345678"),
            _super_admin(), db,
        )
        db.commit.assert_called_once()

    @patch("src.api.v1.platform.users_global.PlatformUserRepository")
    async def test_list_users(self, MockRepo):
        from src.api.v1.platform.users_global import list_platform_users
        repo = AsyncMock()
        repo.list_all.return_value = []
        MockRepo.return_value = repo

        result = await list_platform_users(0, 50, _super_admin(), AsyncMock())
        assert isinstance(result, list)

    @patch("src.api.v1.platform.users_global.PlatformUserRepository")
    async def test_delete_user(self, MockRepo):
        from src.api.v1.platform.users_global import delete_platform_user
        db = AsyncMock()
        repo = AsyncMock()
        repo.get_by_id.return_value = MagicMock()
        repo.delete.return_value = True
        MockRepo.return_value = repo

        await delete_platform_user(USER_ID, _super_admin(), db)
        db.commit.assert_called_once()


# ── billing.py ───────────────────────────────────────────────────────────────

class TestBilling:
    @patch("src.api.v1.platform.billing.BillingRepository")
    async def test_get_tenant_invoices(self, MockRepo):
        from src.api.v1.platform.billing import get_tenant_invoices
        repo = AsyncMock()
        repo.list_by_tenant.return_value = []
        MockRepo.return_value = repo

        result = await get_tenant_invoices(TENANT_ID, 0, 50, _super_admin(), AsyncMock())
        assert isinstance(result, list)

    @patch("src.api.v1.platform.billing.BillingRepository")
    async def test_get_billing_statistics(self, MockRepo):
        from src.api.v1.platform.billing import get_billing_statistics
        repo = AsyncMock()
        repo.get_statistics.return_value = {
            "total_invoices": 100, "paid_invoices": 80,
            "total_revenue": 5000.0, "average_invoice_value": 50.0,
        }
        MockRepo.return_value = repo

        result = await get_billing_statistics(_super_admin(), AsyncMock())
        assert result is not None


# ── subscriptions.py ─────────────────────────────────────────────────────────

class TestSubscriptions:
    @patch("src.api.v1.platform.subscriptions.SubscriptionService")
    async def test_get_subscription(self, MockService):
        from src.api.v1.platform.subscriptions import get_subscription
        service = AsyncMock()
        service.get_subscription.return_value = {
            "id": str(uuid.uuid4()), "tenant_id": str(TENANT_ID),
            "plan": "basic", "status": "active", "max_users": 10,
            "max_giras_per_month": 5, "current_users": 3,
            "monthly_price": 19.90, "is_trial": False,
            "trial_ends_at": None, "auto_renew": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        MockService.return_value = service

        result = await get_subscription(TENANT_ID, _super_admin(), AsyncMock())
        assert result.plan == "basic"

    @patch("src.api.v1.platform.subscriptions.SubscriptionService")
    async def test_upgrade(self, MockService):
        from src.api.v1.platform.subscriptions import upgrade_subscription, UpgradePlanRequest
        from src.models import PlanType
        db = AsyncMock()
        service = AsyncMock()
        service.upgrade_plan.return_value = {
            "id": str(uuid.uuid4()), "tenant_id": str(TENANT_ID),
            "plan": "pro", "status": "active", "max_users": 50,
            "max_giras_per_month": 20, "current_users": 3,
            "monthly_price": 49.90, "is_trial": False,
            "trial_ends_at": None, "auto_renew": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        MockService.return_value = service

        result = await upgrade_subscription(
            TENANT_ID, UpgradePlanRequest(plan=PlanType.PRO), _super_admin(), db,
        )
        db.commit.assert_called_once()

    @patch("src.api.v1.platform.subscriptions.SubscriptionService")
    async def test_suspend(self, MockService):
        from src.api.v1.platform.subscriptions import suspend_subscription
        db = AsyncMock()
        service = AsyncMock()
        service.suspend_subscription.return_value = {
            "id": str(uuid.uuid4()), "tenant_id": str(TENANT_ID),
            "plan": "basic", "status": "suspended", "max_users": 10,
            "max_giras_per_month": 5, "current_users": 3,
            "monthly_price": 19.90, "is_trial": False,
            "trial_ends_at": None, "auto_renew": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        MockService.return_value = service

        result = await suspend_subscription(TENANT_ID, _super_admin(), db)
        db.commit.assert_called_once()


# ── feature_flags.py ─────────────────────────────────────────────────────────

class TestFeatureFlags:
    @patch("src.api.v1.platform.feature_flags.FeatureFlagsRepository")
    async def test_set_flag(self, MockRepo):
        from src.api.v1.platform.feature_flags import set_feature_flag, SetFeatureFlagRequest
        db = AsyncMock()
        repo = AsyncMock()
        flag = MagicMock()
        flag.id = uuid.uuid4()
        flag.tenant_id = TENANT_ID
        flag.feature = "dark_mode"
        flag.enabled = True
        flag.expires_at = None
        flag.description = "Enable dark mode"
        flag.created_at = datetime.now(timezone.utc)
        repo.create_or_update.return_value = flag
        MockRepo.return_value = repo

        result = await set_feature_flag(
            TENANT_ID, SetFeatureFlagRequest(feature="dark_mode", enabled=True),
            _super_admin(), db,
        )
        db.commit.assert_called_once()

    @patch("src.api.v1.platform.feature_flags.FeatureFlagsRepository")
    async def test_list_flags(self, MockRepo):
        from src.api.v1.platform.feature_flags import list_feature_flags
        repo = AsyncMock()
        repo.list_by_tenant.return_value = []
        MockRepo.return_value = repo

        result = await list_feature_flags(TENANT_ID, _super_admin(), AsyncMock())
        assert isinstance(result, list)

    @patch("src.api.v1.platform.feature_flags.FeatureFlagsRepository")
    async def test_delete_flag(self, MockRepo):
        from src.api.v1.platform.feature_flags import delete_feature_flag
        db = AsyncMock()
        repo = AsyncMock()
        repo.delete_flag.return_value = True
        MockRepo.return_value = repo

        await delete_feature_flag(TENANT_ID, "dark_mode", _super_admin(), db)
        db.commit.assert_called_once()


# ── consolidated_audit.py ────────────────────────────────────────────────────

class TestConsolidatedAudit:
    @patch("src.api.v1.platform.consolidated_audit.ConsolidatedAuditService")
    async def test_get_audit_logs(self, MockService):
        from src.api.v1.platform.consolidated_audit import get_audit_logs
        service = AsyncMock()
        service.get_audit_summary.return_value = {
            "total": 10,
            "by_tenant": {"tenant-1": 5, "tenant-2": 5},
            "by_action": {"create": 4, "delete": 6},
            "by_user": {"user-1": 10},
            "period": {"start": "2026-01-01", "end": "2026-12-31"},
            "statistics": {"avg_logs_per_tenant": 5, "most_active_tenant": "tenant-1", "most_common_action": "delete"},
        }
        MockService.return_value = service

        result = await get_audit_logs("2026-01-01", "2026-12-31", _super_admin(), AsyncMock())
        assert result.total == 10

    @patch("src.api.v1.platform.consolidated_audit.ConsolidatedAuditService")
    async def test_get_tenant_audit(self, MockService):
        from src.api.v1.platform.consolidated_audit import get_tenant_audit_logs
        service = AsyncMock()
        service.get_tenant_activity.return_value = {"items": [], "total": 0, "tenant_id": str(TENANT_ID), "period": {}}
        MockService.return_value = service

        result = await get_tenant_audit_logs(TENANT_ID, "2026-01-01", "2026-12-31", 0, 50, _super_admin(), AsyncMock())
        assert result is not None

    @patch("src.api.v1.platform.consolidated_audit.ConsolidatedAuditService")
    async def test_get_action_trends(self, MockService):
        from src.api.v1.platform.consolidated_audit import get_action_trends
        service = AsyncMock()
        service.get_action_trends.return_value = {
            "period": {"start": "2026-01-01", "end": "2026-12-31"},
            "by_action": {"create": 4}, "top_actions": [("create", 4)],
        }
        MockService.return_value = service

        result = await get_action_trends("2026-01-01", "2026-12-31", _super_admin(), AsyncMock())
        assert result is not None
