"""Unit tests for admin billing Stripe endpoints (billing_stripe.py).

Covers: get_billing_info, create_checkout_session, change_plan,
        cancel_subscription, reactivate_subscription.
"""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from src.models import UserRole
from src.models.subscriptions import PlanType, SubscriptionStatus
from tests.conftest import TENANT_ID, USER_ID


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SUB_ID = uuid.UUID("00000000-0000-0000-0000-000000000099")
STRIPE_SUB_ID = "sub_test_123"
STRIPE_CUSTOMER_ID = "cus_test_456"


def _admin_user():
    user = MagicMock()
    user.id = USER_ID
    user.tenant_id = TENANT_ID
    user.role = UserRole.ADMIN
    user.email = "admin@test.com"
    return user


def _operator_user():
    user = MagicMock()
    user.id = USER_ID
    user.tenant_id = TENANT_ID
    user.role = UserRole.OPERATOR
    return user


def _make_sub(
    *,
    plan: PlanType = PlanType.PRO,
    status: SubscriptionStatus = SubscriptionStatus.ACTIVE,
    stripe_subscription_id: str | None = STRIPE_SUB_ID,
    stripe_customer_id: str | None = STRIPE_CUSTOMER_ID,
    cancel_at_period_end: bool = False,
    is_bonus: bool = False,
    current_period_end: datetime | None = None,
    is_trial: bool = False,
    trial_ends_at: datetime | None = None,
):
    sub = MagicMock()
    sub.id = SUB_ID
    sub.tenant_id = TENANT_ID
    sub.plan = plan
    sub.status = status
    sub.stripe_subscription_id = stripe_subscription_id
    sub.stripe_customer_id = stripe_customer_id
    sub.cancel_at_period_end = cancel_at_period_end
    sub.is_bonus = is_bonus
    sub.current_period_end = current_period_end or datetime(2026, 5, 9, tzinfo=timezone.utc)
    sub.monthly_price = 79.0
    sub.currency = "brl"
    sub.is_trial = is_trial
    sub.trial_ends_at = trial_ends_at
    return sub


# ---------------------------------------------------------------------------
# _require_admin dependency
# ---------------------------------------------------------------------------

class TestRequireAdmin:
    async def test_admin_passes(self):
        from src.api.v1.admin.billing_stripe import _require_admin
        result = _require_admin(_admin_user())
        assert result.role == UserRole.ADMIN

    async def test_operator_raises_403(self):
        from src.api.v1.admin.billing_stripe import _require_admin
        with pytest.raises(HTTPException) as exc:
            _require_admin(_operator_user())
        assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# GET /billing
# ---------------------------------------------------------------------------

class TestGetBillingInfo:
    @patch("src.api.v1.admin.billing_stripe.SubscriptionRepository")
    async def test_returns_billing_info(self, MockRepo):
        from src.api.v1.admin.billing_stripe import get_billing_info

        repo = AsyncMock()
        repo.get_by_tenant.return_value = _make_sub()
        MockRepo.return_value = repo

        result = await get_billing_info(_admin_user(), AsyncMock())

        assert result.plan == "pro"
        assert result.status == "active"
        assert result.cancel_at_period_end is False
        assert result.is_bonus is False
        assert result.monthly_price == 79.0

    @patch("src.api.v1.admin.billing_stripe.SubscriptionRepository")
    async def test_raises_404_when_no_subscription(self, MockRepo):
        from src.api.v1.admin.billing_stripe import get_billing_info
        from src.core.errors import NotFoundError

        repo = AsyncMock()
        repo.get_by_tenant.return_value = None
        MockRepo.return_value = repo

        with pytest.raises(NotFoundError):
            await get_billing_info(_admin_user(), AsyncMock())


# ---------------------------------------------------------------------------
# POST /billing/checkout
# ---------------------------------------------------------------------------

class TestCreateCheckoutSession:
    @patch("src.api.v1.admin.billing_stripe.stripe_service")
    @patch("src.api.v1.admin.billing_stripe.SubscriptionRepository")
    async def test_success_creates_checkout_url(self, MockRepo, mock_stripe):
        from src.api.v1.admin.billing_stripe import (
            create_checkout_session, CreateCheckoutRequest,
        )

        sub = _make_sub(plan=PlanType.FREE, stripe_subscription_id=None, stripe_customer_id=None)
        repo = AsyncMock()
        repo.get_by_tenant.return_value = sub
        MockRepo.return_value = repo

        tenant = MagicMock()
        tenant.name = "Terreiro Test"
        db_result = MagicMock()
        db_result.scalar_one_or_none.return_value = tenant
        db = AsyncMock()
        db.execute.return_value = db_result

        mock_stripe.get_or_create_customer = AsyncMock(return_value=STRIPE_CUSTOMER_ID)
        mock_stripe.create_checkout_session = AsyncMock(return_value="https://checkout.stripe.com/test")

        result = await create_checkout_session(
            CreateCheckoutRequest(plan="basic"), _admin_user(), db
        )

        assert result.checkout_url == "https://checkout.stripe.com/test"
        mock_stripe.create_checkout_session.assert_called_once()

    @patch("src.api.v1.admin.billing_stripe.SubscriptionRepository")
    async def test_invalid_plan_raises_400(self, MockRepo):
        from src.api.v1.admin.billing_stripe import (
            create_checkout_session, CreateCheckoutRequest,
        )

        repo = AsyncMock()
        repo.get_by_tenant.return_value = _make_sub(plan=PlanType.FREE, stripe_subscription_id=None)
        MockRepo.return_value = repo

        with pytest.raises(HTTPException) as exc:
            await create_checkout_session(
                CreateCheckoutRequest(plan="ultra"), _admin_user(), AsyncMock()
            )
        assert exc.value.status_code == 400

    @patch("src.api.v1.admin.billing_stripe.SubscriptionRepository")
    async def test_bonus_tenant_raises_400(self, MockRepo):
        from src.api.v1.admin.billing_stripe import (
            create_checkout_session, CreateCheckoutRequest,
        )

        repo = AsyncMock()
        repo.get_by_tenant.return_value = _make_sub(is_bonus=True)
        MockRepo.return_value = repo

        with pytest.raises(HTTPException) as exc:
            await create_checkout_session(
                CreateCheckoutRequest(plan="basic"), _admin_user(), AsyncMock()
            )
        assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# POST /billing/change-plan
# ---------------------------------------------------------------------------

class TestChangePlan:
    @patch("src.api.v1.admin.billing_stripe.AuditLogRepository")
    @patch("src.api.v1.admin.billing_stripe.stripe_service")
    @patch("src.api.v1.admin.billing_stripe.SubscriptionRepository")
    async def test_success_changes_plan(self, MockRepo, mock_stripe, MockAudit):
        from src.api.v1.admin.billing_stripe import change_plan, ChangePlanRequest

        sub = _make_sub(plan=PlanType.BASIC)
        repo = AsyncMock()
        repo.get_by_tenant.return_value = sub
        MockRepo.return_value = repo
        mock_stripe.update_subscription = AsyncMock(return_value={})
        audit = AsyncMock()
        MockAudit.return_value = audit
        db = AsyncMock()

        result = await change_plan(ChangePlanRequest(plan="pro"), _admin_user(), db)

        assert "pro" in result["detail"]
        assert sub.plan == PlanType.PRO
        mock_stripe.update_subscription.assert_called_once_with(STRIPE_SUB_ID, "pro")
        db.commit.assert_called_once()

    @patch("src.api.v1.admin.billing_stripe.SubscriptionRepository")
    async def test_no_stripe_sub_raises_400(self, MockRepo):
        from src.api.v1.admin.billing_stripe import change_plan, ChangePlanRequest

        repo = AsyncMock()
        repo.get_by_tenant.return_value = _make_sub(stripe_subscription_id=None)
        MockRepo.return_value = repo

        with pytest.raises(HTTPException) as exc:
            await change_plan(ChangePlanRequest(plan="pro"), _admin_user(), AsyncMock())
        assert exc.value.status_code == 400

    @patch("src.api.v1.admin.billing_stripe.SubscriptionRepository")
    async def test_bonus_tenant_raises_400(self, MockRepo):
        from src.api.v1.admin.billing_stripe import change_plan, ChangePlanRequest

        repo = AsyncMock()
        repo.get_by_tenant.return_value = _make_sub(is_bonus=True)
        MockRepo.return_value = repo

        with pytest.raises(HTTPException) as exc:
            await change_plan(ChangePlanRequest(plan="pro"), _admin_user(), AsyncMock())
        assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# POST /billing/cancel
# ---------------------------------------------------------------------------

class TestCancelSubscription:
    @patch("src.api.v1.admin.billing_stripe.stripe_service")
    @patch("src.api.v1.admin.billing_stripe.SubscriptionRepository")
    async def test_success_schedules_cancel(self, MockRepo, mock_stripe):
        from src.api.v1.admin.billing_stripe import cancel_subscription

        sub = _make_sub()
        repo = AsyncMock()
        repo.get_by_tenant.return_value = sub
        MockRepo.return_value = repo
        mock_stripe.cancel_subscription = AsyncMock(return_value={})
        db = AsyncMock()

        result = await cancel_subscription(_admin_user(), db)

        assert sub.cancel_at_period_end is True
        mock_stripe.cancel_subscription.assert_called_once_with(STRIPE_SUB_ID)
        db.commit.assert_called_once()

    @patch("src.api.v1.admin.billing_stripe.SubscriptionRepository")
    async def test_no_stripe_sub_raises_400(self, MockRepo):
        from src.api.v1.admin.billing_stripe import cancel_subscription

        repo = AsyncMock()
        repo.get_by_tenant.return_value = _make_sub(stripe_subscription_id=None)
        MockRepo.return_value = repo

        with pytest.raises(HTTPException) as exc:
            await cancel_subscription(_admin_user(), AsyncMock())
        assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# POST /billing/reactivate
# ---------------------------------------------------------------------------

class TestReactivateSubscription:
    @patch("src.api.v1.admin.billing_stripe.AuditLogRepository")
    @patch("src.api.v1.admin.billing_stripe.stripe_service")
    @patch("src.api.v1.admin.billing_stripe.SubscriptionRepository")
    async def test_success_removes_cancel_schedule(self, MockRepo, mock_stripe, MockAudit):
        from src.api.v1.admin.billing_stripe import reactivate_subscription

        sub = _make_sub(cancel_at_period_end=True)
        repo = AsyncMock()
        repo.get_by_tenant.return_value = sub
        MockRepo.return_value = repo
        mock_stripe.reactivate_subscription = AsyncMock(return_value={})
        audit = AsyncMock()
        MockAudit.return_value = audit
        db = AsyncMock()

        result = await reactivate_subscription(_admin_user(), db)

        assert sub.cancel_at_period_end is False
        mock_stripe.reactivate_subscription.assert_called_once_with(STRIPE_SUB_ID)
        audit.create.assert_called_once()
        db.commit.assert_called_once()
        assert "reativada" in result["detail"]

    @patch("src.api.v1.admin.billing_stripe.SubscriptionRepository")
    async def test_no_stripe_sub_raises_400(self, MockRepo):
        from src.api.v1.admin.billing_stripe import reactivate_subscription

        repo = AsyncMock()
        repo.get_by_tenant.return_value = _make_sub(
            stripe_subscription_id=None, cancel_at_period_end=True
        )
        MockRepo.return_value = repo

        with pytest.raises(HTTPException) as exc:
            await reactivate_subscription(_admin_user(), AsyncMock())
        assert exc.value.status_code == 400

    @patch("src.api.v1.admin.billing_stripe.SubscriptionRepository")
    async def test_not_scheduled_for_cancel_raises_400(self, MockRepo):
        from src.api.v1.admin.billing_stripe import reactivate_subscription

        repo = AsyncMock()
        repo.get_by_tenant.return_value = _make_sub(cancel_at_period_end=False)
        MockRepo.return_value = repo

        with pytest.raises(HTTPException) as exc:
            await reactivate_subscription(_admin_user(), AsyncMock())
        assert exc.value.status_code == 400

    @patch("src.api.v1.admin.billing_stripe.SubscriptionRepository")
    async def test_bonus_tenant_raises_400(self, MockRepo):
        from src.api.v1.admin.billing_stripe import reactivate_subscription

        repo = AsyncMock()
        repo.get_by_tenant.return_value = _make_sub(is_bonus=True, cancel_at_period_end=True)
        MockRepo.return_value = repo

        with pytest.raises(HTTPException) as exc:
            await reactivate_subscription(_admin_user(), AsyncMock())
        assert exc.value.status_code == 400

    async def test_operator_blocked_by_require_admin(self):
        from src.api.v1.admin.billing_stripe import _require_admin

        with pytest.raises(HTTPException) as exc:
            _require_admin(_operator_user())
        assert exc.value.status_code == 403
