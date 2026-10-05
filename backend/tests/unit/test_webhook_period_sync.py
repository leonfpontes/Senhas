"""Regressão: `current_period_end` não era atualizado nas renovações.

A partir da API Stripe 2025-03-31 (clover), `current_period_start/end`
saíram do objeto Subscription e vivem em `items.data[].current_period_end`.
Os handlers liam só o campo do topo, recebiam None e deixavam o campo no
banco congelado na data do checkout (produção: Stripe em 10/09..10/10,
banco em 10/06). `_extract_period_end_ts` cobre os dois formatos.
"""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
import stripe

from src.api.v1.webhooks import _extract_period_end_ts, _handle_subscription_updated
from src.models.subscriptions import PlanType, SubscriptionStatus

NEW_PERIOD_END = 1791590400  # 2026-10-10T00:00:00Z


def _sub_payload(*, period_on_item: bool) -> dict:
    item = {"id": "si_1", "price": {"id": "price_pro_test"}}
    obj = {
        "id": "sub_test_1",
        "object": "subscription",
        "customer": "cus_test_1",
        "status": "active",
        "cancel_at_period_end": False,
        "trial_end": None,
        "items": {"object": "list", "data": [item]},
    }
    if period_on_item:
        item["current_period_start"] = NEW_PERIOD_END - 30 * 86400
        item["current_period_end"] = NEW_PERIOD_END
    else:
        obj["current_period_end"] = NEW_PERIOD_END
    event = stripe.Event.construct_from(
        {"id": "evt_1", "object": "event", "type": "customer.subscription.updated", "data": {"object": obj}},
        "sk_test_dummy",
    )
    return event["data"]["object"].to_dict()


class TestExtractPeriodEnd:
    def test_legacy_top_level_field(self):
        assert _extract_period_end_ts(_sub_payload(period_on_item=False)) == NEW_PERIOD_END

    def test_clover_item_level_field(self):
        assert _extract_period_end_ts(_sub_payload(period_on_item=True)) == NEW_PERIOD_END

    def test_top_level_wins_when_both_present(self):
        data = _sub_payload(period_on_item=True)
        data["current_period_end"] = NEW_PERIOD_END + 1
        assert _extract_period_end_ts(data) == NEW_PERIOD_END + 1

    def test_none_when_absent_everywhere(self):
        assert _extract_period_end_ts({"items": {"data": [{"price": {"id": "p"}}]}}) is None
        assert _extract_period_end_ts({"items": {"data": []}}) is None
        assert _extract_period_end_ts({}) is None


class TestSubscriptionUpdatedSyncsPeriod:
    @pytest.fixture
    def local_sub(self):
        sub = MagicMock()
        sub.id = uuid.uuid4()
        sub.tenant_id = uuid.uuid4()
        sub.plan = PlanType.PRO
        sub.status = SubscriptionStatus.ACTIVE
        sub.stripe_customer_id = "cus_test_1"
        sub.current_period_end = datetime(2026, 6, 10, tzinfo=timezone.utc)  # congelado
        return sub

    @pytest.fixture(autouse=True)
    def _patch_lookups(self, monkeypatch, local_sub):
        async def fake_get_sub(customer_id, db):
            return local_sub

        monkeypatch.setattr("src.api.v1.webhooks._get_subscription_by_customer", fake_get_sub)
        monkeypatch.setattr(
            "src.api.v1.webhooks._get_price_plan_map",
            lambda: {
                "price_pro_test": {
                    "plan": PlanType.PRO, "max_users": 10, "max_giras_per_month": 15,
                    "max_mediuns": 150, "monthly_price": 79.0,
                }
            },
        )

    @pytest.mark.asyncio
    async def test_renewal_with_period_on_item_updates_db(self, local_sub):
        db = AsyncMock()
        await _handle_subscription_updated(_sub_payload(period_on_item=True), db)
        assert local_sub.current_period_end == datetime.fromtimestamp(NEW_PERIOD_END, tz=timezone.utc)
        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_legacy_payload_still_updates_db(self, local_sub):
        db = AsyncMock()
        await _handle_subscription_updated(_sub_payload(period_on_item=False), db)
        assert local_sub.current_period_end == datetime.fromtimestamp(NEW_PERIOD_END, tz=timezone.utc)
