"""Regressão: handlers do webhook Stripe usam `.get()` estilo dict, mas o
payload real do evento é um `stripe.StripeObject` (Subscription, Session,
Invoice) — não um dict puro. Versões recentes do stripe-python removeram o
suporte a `.get()` desses objetos, e como `pyproject.toml` fixava
`stripe>=8.0.0` (sem teto), um rebuild silenciosamente puxou uma versão que
quebrou `_handle_subscription_updated` em produção (webhooks 500 por 2
semanas, Sentry PYTHON-FASTAPI-6).

Testes com dict puro não pegam essa classe de bug — por isso aqui construímos
um `stripe.Event` de verdade via `stripe.Event.construct_from`, igual ao que
`stripe.Webhook.construct_event` devolve, para exercitar o mesmo tipo
StripeObject que quebrou em produção.
"""
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
import stripe

from src.api.v1.webhooks import _handle_subscription_updated
from src.models.subscriptions import PlanType, SubscriptionStatus


def _subscription_updated_event() -> dict:
    """dict já convertido — é isso que `stripe_webhook()` deve produzir a
    partir de `event["data"]["object"].to_dict()` antes de despachar."""
    payload = {
        "id": "evt_test_1",
        "object": "event",
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": "sub_test_1",
                "object": "subscription",
                "customer": "cus_test_1",
                "status": "active",
                "cancel_at_period_end": False,
                "current_period_end": 1999999999,
                "trial_end": None,
                "items": {
                    "object": "list",
                    "data": [{"id": "si_1", "price": {"id": "price_pro_test"}}],
                },
            }
        },
    }
    event = stripe.Event.construct_from(payload, "sk_test_dummy")
    # Espelha exatamente a conversão feita em stripe_webhook() (webhooks.py).
    return event["data"]["object"].to_dict()


class TestStripeObjectToDictConversion:
    def test_event_data_object_is_not_plain_dict_before_conversion(self):
        """Documenta a causa raiz: o objeto cru do SDK não é um dict."""
        payload = {
            "id": "evt_x", "object": "event", "type": "customer.subscription.updated",
            "data": {"object": {"id": "sub_x", "object": "subscription", "customer": "cus_x"}},
        }
        event = stripe.Event.construct_from(payload, "sk_test_dummy")
        raw = event["data"]["object"]
        assert not isinstance(raw, dict)
        with pytest.raises(AttributeError):
            raw.get("customer")

    def test_to_dict_conversion_supports_get(self):
        data = _subscription_updated_event()
        assert isinstance(data, dict)
        assert data.get("customer") == "cus_test_1"


class TestHandleSubscriptionUpdatedWithRealStripeObject:
    """_handle_subscription_updated não deve levantar exceção ao processar
    um payload construído do jeito que o SDK real entrega (via .to_dict())."""

    @pytest.fixture
    def local_sub(self):
        sub = MagicMock()
        sub.id = uuid.uuid4()
        sub.tenant_id = uuid.uuid4()
        sub.plan = PlanType.BASIC
        sub.status = SubscriptionStatus.ACTIVE
        sub.stripe_customer_id = "cus_test_1"
        return sub

    @pytest.mark.asyncio
    async def test_syncs_plan_without_raising(self, monkeypatch, local_sub):
        data = _subscription_updated_event()

        async def fake_get_sub(customer_id, db):
            assert customer_id == "cus_test_1"
            return local_sub

        monkeypatch.setattr(
            "src.api.v1.webhooks._get_subscription_by_customer", fake_get_sub
        )
        monkeypatch.setattr(
            "src.api.v1.webhooks._get_price_plan_map",
            lambda: {
                "price_pro_test": {
                    "plan": PlanType.PRO,
                    "max_users": 10,
                    "max_giras_per_month": 20,
                    "max_mediuns": 30,
                    "monthly_price": 99.0,
                }
            },
        )

        db = AsyncMock()
        await _handle_subscription_updated(data, db)

        assert local_sub.plan == PlanType.PRO
        assert local_sub.stripe_price_id == "price_pro_test"
        assert local_sub.status == SubscriptionStatus.ACTIVE
        assert local_sub.is_trial is False
        db.commit.assert_awaited_once()
