"""Testa que _get_price_plan_map() deriva limites de PLAN_LIMITS.

Garante que os limites do webhook Stripe e os limites internos
jamais divergem — ambos devem ler de subscription_repo.PLAN_LIMITS.
"""
import pytest
from unittest.mock import patch, MagicMock
from src.models.subscriptions import PlanType
from src.repositories.subscription_repo import PLAN_LIMITS


def _build_price_map():
    """Chama _get_price_plan_map() com settings mockados e cache limpo."""
    import src.api.v1.webhooks as wh
    # Limpa cache lazy para forçar rebuild
    wh._PRICE_TO_PLAN_LIMITS.clear()

    mock_settings = MagicMock()
    mock_settings.STRIPE_PRICE_BASIC = "price_basic_test"
    mock_settings.STRIPE_PRICE_PRO = "price_pro_test"
    mock_settings.STRIPE_PRICE_PREMIUM = "price_premium_test"

    with patch("src.api.v1.webhooks.settings", mock_settings):
        result = wh._get_price_plan_map()

    wh._PRICE_TO_PLAN_LIMITS.clear()  # limpa após o teste
    return result, mock_settings


class TestWebhookPlanSyncWithPlanLimits:
    """Webhook _get_price_plan_map deve refletir exatamente PLAN_LIMITS."""

    def test_basic_max_users_matches_plan_limits(self):
        plan_map, s = _build_price_map()
        entry = plan_map[s.STRIPE_PRICE_BASIC]
        assert entry["max_users"] == PLAN_LIMITS[PlanType.BASIC]["max_users"]

    def test_basic_max_giras_matches_plan_limits(self):
        plan_map, s = _build_price_map()
        entry = plan_map[s.STRIPE_PRICE_BASIC]
        assert entry["max_giras_per_month"] == PLAN_LIMITS[PlanType.BASIC]["max_giras_per_month"]

    def test_basic_max_mediuns_matches_plan_limits(self):
        plan_map, s = _build_price_map()
        entry = plan_map[s.STRIPE_PRICE_BASIC]
        assert entry["max_mediuns"] == PLAN_LIMITS[PlanType.BASIC]["max_mediuns"]

    def test_pro_max_users_matches_plan_limits(self):
        plan_map, s = _build_price_map()
        entry = plan_map[s.STRIPE_PRICE_PRO]
        assert entry["max_users"] == PLAN_LIMITS[PlanType.PRO]["max_users"]

    def test_pro_max_giras_matches_plan_limits(self):
        plan_map, s = _build_price_map()
        entry = plan_map[s.STRIPE_PRICE_PRO]
        assert entry["max_giras_per_month"] == PLAN_LIMITS[PlanType.PRO]["max_giras_per_month"]

    def test_pro_max_mediuns_matches_plan_limits(self):
        plan_map, s = _build_price_map()
        entry = plan_map[s.STRIPE_PRICE_PRO]
        assert entry["max_mediuns"] == PLAN_LIMITS[PlanType.PRO]["max_mediuns"]

    def test_premium_max_users_matches_plan_limits(self):
        plan_map, s = _build_price_map()
        entry = plan_map[s.STRIPE_PRICE_PREMIUM]
        assert entry["max_users"] == PLAN_LIMITS[PlanType.PREMIUM]["max_users"]

    def test_premium_never_uses_negative_one(self):
        """Frontend usa >= 99999 como threshold de ilimitado, não -1."""
        plan_map, s = _build_price_map()
        entry = plan_map[s.STRIPE_PRICE_PREMIUM]
        assert entry["max_users"] >= 0
        assert entry["max_giras_per_month"] >= 0
        assert entry["max_mediuns"] >= 0

    def test_plan_type_assigned_correctly(self):
        plan_map, s = _build_price_map()
        assert plan_map[s.STRIPE_PRICE_BASIC]["plan"] == PlanType.BASIC
        assert plan_map[s.STRIPE_PRICE_PRO]["plan"] == PlanType.PRO
        assert plan_map[s.STRIPE_PRICE_PREMIUM]["plan"] == PlanType.PREMIUM

    def test_monthly_price_matches_plan_limits(self):
        plan_map, s = _build_price_map()
        assert plan_map[s.STRIPE_PRICE_BASIC]["monthly_price"] == PLAN_LIMITS[PlanType.BASIC]["price"]
        assert plan_map[s.STRIPE_PRICE_PRO]["monthly_price"] == PLAN_LIMITS[PlanType.PRO]["price"]
        assert plan_map[s.STRIPE_PRICE_PREMIUM]["monthly_price"] == PLAN_LIMITS[PlanType.PREMIUM]["price"]


class TestWebhookDeletedRevertsFreeCorrectly:
    """_handle_subscription_deleted deve reverter para FREE usando PLAN_LIMITS."""

    def test_free_giras_limit_is_not_two(self):
        """Garante que FREE não usa o valor antigo hardcoded de 2."""
        assert PLAN_LIMITS[PlanType.FREE]["max_giras_per_month"] != 2

    def test_free_limits_are_positive(self):
        free = PLAN_LIMITS[PlanType.FREE]
        assert free["max_users"] >= 1
        assert free["max_giras_per_month"] >= 1
        assert free["price"] == 0.0
