"""Unit tests for the PRO/Premium plan gate on TenantConfig.enable_waitlist.

Enabling the toggle must be rejected server-side for tenants below the Pro
tier, even though the frontend also hides the control — see config.tsx's
`gate: 'fila_espera'` — because the API must not trust the client alone.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from tests.conftest import TENANT_ID, USER_ID


def _admin_user():
    user = MagicMock()
    user.id = USER_ID
    user.tenant_id = TENANT_ID
    user.is_admin = True
    user.is_operator_or_admin = True
    return user


def _mock_tenant_config():
    config = MagicMock()
    config.logo_url = None
    config.logo_data = None
    config.primary_color = "#1976d2"
    config.secondary_color = "#dc004e"
    config.endereco = None
    config.tenant_nome = None
    config.reply_to_email = None
    config.email_signature = None
    config.enable_bulk_operations = True
    config.enable_analytics = True
    config.enable_walk_in = False
    config.custom_settings = None
    config.sponsor_priority_mode = "first"
    config.validate_associado_on_emit = False
    config.enable_estoque_log = True
    config.enable_mensalidade_associado = False
    config.enable_waitlist = False
    return config


class TestEnableWaitlistPlanGate:
    @patch("src.repositories.subscription_repo.SubscriptionRepository")
    @patch("src.api.v1.admin.config.AuditService")
    @patch("src.api.v1.admin.config.TenantConfigRepository")
    async def test_rejects_on_basic_plan(self, MockRepo, MockAudit, MockSubRepo):
        from src.models.subscriptions import PlanType, SubscriptionStatus
        from src.api.v1.admin.config import update_tenant_config, TenantConfigUpdate

        repo_inst = AsyncMock()
        repo_inst.get_by_tenant.return_value = _mock_tenant_config()
        MockRepo.return_value = repo_inst
        MockAudit.return_value = AsyncMock()

        sub = MagicMock(plan=PlanType.BASIC, status=SubscriptionStatus.ACTIVE)
        MockSubRepo.return_value.get_by_tenant = AsyncMock(return_value=sub)

        with pytest.raises(HTTPException) as exc_info:
            await update_tenant_config(
                TenantConfigUpdate(enable_waitlist=True), MagicMock(), _admin_user(), AsyncMock(),
            )
        assert exc_info.value.status_code == 403
        repo_inst.toggle_feature.assert_not_called()

    @patch("src.repositories.subscription_repo.SubscriptionRepository")
    @patch("src.api.v1.admin.config.AuditService")
    @patch("src.api.v1.admin.config.TenantConfigRepository")
    async def test_rejects_when_no_subscription(self, MockRepo, MockAudit, MockSubRepo):
        from src.api.v1.admin.config import update_tenant_config, TenantConfigUpdate

        repo_inst = AsyncMock()
        repo_inst.get_by_tenant.return_value = _mock_tenant_config()
        MockRepo.return_value = repo_inst
        MockAudit.return_value = AsyncMock()
        MockSubRepo.return_value.get_by_tenant = AsyncMock(return_value=None)

        with pytest.raises(HTTPException) as exc_info:
            await update_tenant_config(
                TenantConfigUpdate(enable_waitlist=True), MagicMock(), _admin_user(), AsyncMock(),
            )
        assert exc_info.value.status_code == 403

    @patch("src.repositories.subscription_repo.SubscriptionRepository")
    @patch("src.api.v1.admin.config.AuditService")
    @patch("src.api.v1.admin.config.TenantConfigRepository")
    async def test_allows_on_pro_plan(self, MockRepo, MockAudit, MockSubRepo):
        from src.models.subscriptions import PlanType, SubscriptionStatus
        from src.api.v1.admin.config import update_tenant_config, TenantConfigUpdate

        repo_inst = AsyncMock()
        enabled_config = _mock_tenant_config()
        enabled_config.enable_waitlist = True
        repo_inst.get_by_tenant.return_value = enabled_config
        repo_inst.toggle_feature.return_value = enabled_config
        MockRepo.return_value = repo_inst
        MockAudit.return_value = AsyncMock()

        sub = MagicMock(plan=PlanType.PRO, status=SubscriptionStatus.ACTIVE)
        MockSubRepo.return_value.get_by_tenant = AsyncMock(return_value=sub)

        result = await update_tenant_config(
            TenantConfigUpdate(enable_waitlist=True), MagicMock(), _admin_user(), AsyncMock(),
        )
        assert result.enable_waitlist is True
        repo_inst.toggle_feature.assert_called_once_with(
            tenant_id=TENANT_ID, feature_flag="enable_waitlist", enabled=True,
        )

    @patch("src.repositories.subscription_repo.SubscriptionRepository")
    @patch("src.api.v1.admin.config.AuditService")
    @patch("src.api.v1.admin.config.TenantConfigRepository")
    async def test_disabling_never_checks_plan(self, MockRepo, MockAudit, MockSubRepo):
        """Turning the feature off must always be allowed, regardless of plan."""
        from src.api.v1.admin.config import update_tenant_config, TenantConfigUpdate

        repo_inst = AsyncMock()
        disabled_config = _mock_tenant_config()
        disabled_config.enable_waitlist = False
        repo_inst.get_by_tenant.return_value = disabled_config
        repo_inst.toggle_feature.return_value = disabled_config
        MockRepo.return_value = repo_inst
        MockAudit.return_value = AsyncMock()

        result = await update_tenant_config(
            TenantConfigUpdate(enable_waitlist=False), MagicMock(), _admin_user(), AsyncMock(),
        )
        assert result.enable_waitlist is False
        MockSubRepo.assert_not_called()
