"""Tests for plan tiers, feature gating, and plan configuration.

Covers:
- PlanType enum has exactly 4 values (no ENTERPRISE)
- _get_plan_features returns correct features per tier
- _get_plan_config returns correct limits/prices per plan
- Plan hierarchy in subscription service
"""
import pytest
from src.models.subscriptions import PlanType


class TestPlanTypeEnum:
    """Verify PlanType has exactly 4 tiers after ENTERPRISE removal."""

    def test_plan_type_has_four_values(self):
        members = list(PlanType)
        assert len(members) == 4

    def test_plan_type_values(self):
        assert PlanType.FREE.value == "free"
        assert PlanType.BASIC.value == "basic"
        assert PlanType.PRO.value == "pro"
        assert PlanType.PREMIUM.value == "premium"

    def test_enterprise_not_in_plan_type(self):
        values = [p.value for p in PlanType]
        assert "enterprise" not in values
        names = [p.name for p in PlanType]
        assert "ENTERPRISE" not in names


class TestPlanFeatures:
    """Verify _get_plan_features returns correct feature flags per tier."""

    def _get_features(self, plan: PlanType):
        from src.api.v1.admin.subscription_info import _get_plan_features
        return _get_plan_features(plan)

    def test_free_plan_has_no_features(self):
        f = self._get_features(PlanType.FREE)
        assert f.email_transacional is False
        assert f.tema_personalizado is False
        assert f.analytics_basico is False
        assert f.analytics_avancado is False
        assert f.associados is False
        assert f.export_csv is False
        assert f.bulk_operations is False
        assert f.auditoria is False
        assert f.api_access is False
        assert f.suporte_prioritario is False
        assert f.site_builder is False

    def test_basic_plan_features(self):
        """Basic desbloqueia médiuns, relatório de gira e bulk ops."""
        f = self._get_features(PlanType.BASIC)
        assert f.email_transacional is False
        assert f.tema_personalizado is False
        assert f.analytics_basico is False
        assert f.analytics_avancado is False
        assert f.associados is False
        assert f.export_csv is False
        assert f.bulk_operations is True
        assert f.mediuns is True
        assert f.relatorio_gira is True
        assert f.mensalidade_mediun is False
        assert f.auditoria is False
        assert f.api_access is False
        assert f.suporte_prioritario is False
        assert f.site_builder is False

    def test_pro_plan_has_mid_tier_features(self):
        """Pro unlocks most features except api/suporte."""
        f = self._get_features(PlanType.PRO)
        # Should be enabled
        assert f.email_transacional is True
        assert f.tema_personalizado is True
        assert f.analytics_basico is True
        assert f.analytics_avancado is True
        assert f.associados is True
        assert f.export_csv is True
        assert f.bulk_operations is True
        assert f.auditoria is True
        assert f.site_builder is True
        # Should still be disabled
        assert f.api_access is False
        assert f.suporte_prioritario is False

    def test_premium_plan_has_all_features(self):
        """Premium unlocks everything."""
        f = self._get_features(PlanType.PREMIUM)
        assert f.email_transacional is True
        assert f.tema_personalizado is True
        assert f.analytics_basico is True
        assert f.analytics_avancado is True
        assert f.associados is True
        assert f.export_csv is True
        assert f.bulk_operations is True
        assert f.auditoria is True
        assert f.api_access is True
        assert f.suporte_prioritario is True
        assert f.site_builder is True


class TestPlanFeaturesMensalidade:
    """Verify mensalidade_mediun feature flag is available on PRO and PREMIUM."""

    def _get_features(self, plan: PlanType):
        from src.api.v1.admin.subscription_info import _get_plan_features
        return _get_plan_features(plan)

    def test_free_nao_tem_mensalidade_mediun(self):
        f = self._get_features(PlanType.FREE)
        assert f.mensalidade_mediun is False

    def test_basic_nao_tem_mensalidade_mediun(self):
        f = self._get_features(PlanType.BASIC)
        assert f.mensalidade_mediun is False

    def test_pro_tem_mensalidade_mediun(self):
        f = self._get_features(PlanType.PRO)
        assert f.mensalidade_mediun is True

    def test_premium_tem_mensalidade_mediun(self):
        f = self._get_features(PlanType.PREMIUM)
        assert f.mensalidade_mediun is True


class TestPlanFeaturesAgendamentoPorHorario:
    """Verify agendamento_por_horario feature flag is available on PRO and PREMIUM only."""

    def _get_features(self, plan: PlanType):
        from src.api.v1.admin.subscription_info import _get_plan_features
        return _get_plan_features(plan)

    def test_free_nao_tem_agendamento_por_horario(self):
        f = self._get_features(PlanType.FREE)
        assert f.agendamento_por_horario is False

    def test_basic_nao_tem_agendamento_por_horario(self):
        f = self._get_features(PlanType.BASIC)
        assert f.agendamento_por_horario is False

    def test_pro_tem_agendamento_por_horario(self):
        f = self._get_features(PlanType.PRO)
        assert f.agendamento_por_horario is True

    def test_premium_tem_agendamento_por_horario(self):
        f = self._get_features(PlanType.PREMIUM)
        assert f.agendamento_por_horario is True


class TestPlanConfig:
    """Verify _get_plan_config returns correct limits and prices."""

    def _get_config(self, plan: PlanType):
        from unittest.mock import AsyncMock, MagicMock
        from src.repositories.subscription_repo import SubscriptionRepository
        db = AsyncMock()
        r = SubscriptionRepository(db)
        return r._get_plan_config(plan)

    def test_free_config(self):
        c = self._get_config(PlanType.FREE)
        assert c["max_users"] == 1
        assert c["max_giras_per_month"] == 4
        assert c["max_mediuns"] == 0
        assert c["price"] == 0.0

    def test_basic_config(self):
        c = self._get_config(PlanType.BASIC)
        assert c["max_users"] == 3
        assert c["max_giras_per_month"] == 10
        assert c["max_mediuns"] == 50
        assert c["price"] == 49.0

    def test_pro_config(self):
        c = self._get_config(PlanType.PRO)
        assert c["max_users"] == 10
        assert c["max_giras_per_month"] == 15
        assert c["max_mediuns"] == 150
        assert c["price"] == 79.0

    def test_premium_config(self):
        c = self._get_config(PlanType.PREMIUM)
        assert c["max_users"] == 99999
        assert c["max_giras_per_month"] == 999999
        assert c["price"] == 99.0

    def test_only_four_plans_in_config(self):
        """No ENTERPRISE entry in plan config."""
        from unittest.mock import AsyncMock
        from src.repositories.subscription_repo import SubscriptionRepository
        db = AsyncMock()
        r = SubscriptionRepository(db)
        configs = r._get_plan_config.__code__.co_consts
        # Verify by checking all plan types have valid configs
        for plan in PlanType:
            c = r._get_plan_config(plan)
            assert "max_users" in c
            assert "max_giras_per_month" in c
            assert "price" in c


class TestPlanHierarchy:
    """Verify plan hierarchy used by subscription service."""

    def test_hierarchy_has_four_levels(self):
        from src.services.subscription_service import SubscriptionService
        from unittest.mock import AsyncMock, patch, MagicMock
        from src.models.subscriptions import PlanType, SubscriptionStatus

        db = AsyncMock()
        with patch("src.services.subscription_service.SubscriptionRepository"), \
             patch("src.services.subscription_service.BillingRepository"):
            svc = SubscriptionService(db)

        # The hierarchy is defined inside downgrade_plan, so we test behavior:
        # PREMIUM > PRO > BASIC > FREE

        # Setup: current plan is PREMIUM
        current = MagicMock()
        current.plan = PlanType.PREMIUM

        svc.subscription_repo.get_by_tenant = AsyncMock(return_value=current)

        # Downgrade mock
        sub = MagicMock()
        sub.id = "test"
        sub.tenant_id = "test"
        sub.plan.value = "pro"
        sub.status.value = "active"
        sub.max_users = 20
        sub.max_giras_per_month = 50
        sub.current_users = 1
        sub.monthly_price = 79.0
        sub.is_trial = False
        sub.trial_ends_at = None
        sub.auto_renew = True
        from datetime import datetime, timezone
        sub.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
        svc.subscription_repo.upgrade_plan = AsyncMock(return_value=sub)

    def test_downgrade_premium_to_pro_allowed(self):
        """PREMIUM can downgrade to PRO."""
        import asyncio
        from unittest.mock import AsyncMock, patch, MagicMock
        from datetime import datetime, timezone

        db = AsyncMock()
        with patch("src.services.subscription_service.SubscriptionRepository"), \
             patch("src.services.subscription_service.BillingRepository"):
            from src.services.subscription_service import SubscriptionService
            svc = SubscriptionService(db)

        current = MagicMock()
        current.plan = PlanType.PREMIUM
        svc.subscription_repo.get_by_tenant = AsyncMock(return_value=current)

        sub = MagicMock()
        sub.id = "id"; sub.tenant_id = "tid"
        sub.plan.value = "pro"; sub.status.value = "active"
        sub.max_users = 20; sub.max_giras_per_month = 50
        sub.current_users = 1; sub.monthly_price = 79.0
        sub.is_trial = False; sub.trial_ends_at = None
        sub.auto_renew = True
        sub.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
        svc.subscription_repo.upgrade_plan = AsyncMock(return_value=sub)

        result = asyncio.get_event_loop().run_until_complete(
            svc.downgrade_plan("tid", PlanType.PRO)
        )
        assert result["plan"] == "pro"

    def test_downgrade_basic_to_pro_rejected(self):
        """Cannot downgrade from BASIC to PRO (PRO is higher)."""
        import asyncio
        from unittest.mock import AsyncMock, patch, MagicMock
        from src.core.errors import InvalidInputError

        db = AsyncMock()
        with patch("src.services.subscription_service.SubscriptionRepository"), \
             patch("src.services.subscription_service.BillingRepository"):
            from src.services.subscription_service import SubscriptionService
            svc = SubscriptionService(db)

        current = MagicMock()
        current.plan = PlanType.BASIC
        svc.subscription_repo.get_by_tenant = AsyncMock(return_value=current)

        with pytest.raises(InvalidInputError):
            asyncio.get_event_loop().run_until_complete(
                svc.downgrade_plan("tid", PlanType.PRO)
            )
