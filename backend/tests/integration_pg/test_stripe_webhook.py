"""Grupo 4 do Q-01 — webhook da Stripe, assinatura e idempotência.

Requisições assinadas de verdade (HMAC com STRIPE_WEBHOOK_SECRET) passam pelo
endpoint público /api/v1/webhooks/stripe e gravam no Postgres.
"""
import asyncio
import hashlib
import hmac
import json
import os
import time
import uuid

import pytest
import stripe as _stripe
from sqlalchemy import func, select, update

from src.models.audit_logs import AuditLog
from src.models.stripe_events import StripeEventProcessed
from src.models.subscriptions import PlanType, Subscription, SubscriptionStatus

from .factories import create_tenant

SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
pytestmark = pytest.mark.skipif(not SECRET, reason="defina STRIPE_WEBHOOK_SECRET para a suíte de webhook")


def _signed(event: dict) -> tuple[bytes, dict]:
    payload = json.dumps(event).encode()
    ts = int(time.time())
    sig = hmac.new(SECRET.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    return payload, {"stripe-signature": f"t={ts},v1={sig}", "content-type": "application/json"}


def _event(event_type: str, obj: dict, event_id: str | None = None) -> dict:
    return {
        "id": event_id or f"evt_{uuid.uuid4().hex[:20]}",
        "object": "event",
        "type": event_type,
        "data": {"object": obj},
    }


async def _post(client, event: dict):
    payload, headers = _signed(event)
    return await client.post("/api/v1/webhooks/stripe", content=payload, headers=headers)


async def _paying_tenant(db, customer: str):
    tenant = await create_tenant(db, "Terreiro Pagante")
    await db.execute(
        update(Subscription).where(Subscription.tenant_id == tenant.id).values(stripe_customer_id=customer)
    )
    await db.commit()
    return tenant


async def _q(stmt):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(stmt)).scalar_one()


def _subscription_obj(customer: str, cancel: bool) -> dict:
    return {
        "id": "sub_test", "object": "subscription", "customer": customer, "status": "active",
        "cancel_at_period_end": cancel, "trial_end": None,
        "items": {"object": "list", "data": [{"id": "si_1", "price": {"id": "price_desconhecido"},
                                              "current_period_end": int(time.time()) + 30 * 86400}]},
    }


async def test_assinatura_invalida_e_recusada_sem_efeito(client, db):
    tenant = await _paying_tenant(db, "cus_sig")
    event = _event("customer.subscription.updated", _subscription_obj("cus_sig", cancel=True))
    payload, headers = _signed(event)
    headers["stripe-signature"] = headers["stripe-signature"][:-4] + "0000"

    resp = await client.post("/api/v1/webhooks/stripe", content=payload, headers=headers)

    assert resp.status_code == 400
    assert await _q(select(Subscription.cancel_at_period_end).where(Subscription.tenant_id == tenant.id)) is False
    assert await _q(select(func.count()).select_from(StripeEventProcessed)) == 0


async def test_evento_valido_aplica_efeito_e_registra_processamento(client, db):
    tenant = await _paying_tenant(db, "cus_ok")
    event = _event("customer.subscription.updated", _subscription_obj("cus_ok", cancel=True))

    resp = await _post(client, event)

    assert resp.status_code == 200, resp.text
    assert await _q(select(Subscription.cancel_at_period_end).where(Subscription.tenant_id == tenant.id)) is True
    period_end = await _q(select(Subscription.current_period_end).where(Subscription.tenant_id == tenant.id))
    assert period_end is not None  # período lido do item da assinatura (PR #17)
    assert await _q(
        select(func.count()).select_from(StripeEventProcessed).where(StripeEventProcessed.event_id == event["id"])
    ) == 1


async def test_reentrega_do_mesmo_evento_nao_reprocessa(client, db):
    tenant = await _paying_tenant(db, "cus_dup")
    event = _event("customer.subscription.updated", _subscription_obj("cus_dup", cancel=True))
    assert (await _post(client, event)).status_code == 200

    # Muda o estado depois da 1ª entrega: se a 2ª reprocessar, volta para True.
    await db.execute(update(Subscription).where(Subscription.tenant_id == tenant.id).values(cancel_at_period_end=False))
    await db.commit()
    second = await _post(client, event)

    assert second.status_code == 200
    assert await _q(select(Subscription.cancel_at_period_end).where(Subscription.tenant_id == tenant.id)) is False
    assert await _q(
        select(func.count()).select_from(StripeEventProcessed).where(StripeEventProcessed.event_id == event["id"])
    ) == 1


async def test_falha_de_pagamento_suspende_e_audita_uma_vez(client, db):
    tenant = await _paying_tenant(db, "cus_fail")
    event = _event("invoice.payment_failed", {"id": "in_1", "object": "invoice", "customer": "cus_fail"})

    assert (await _post(client, event)).status_code == 200
    assert (await _post(client, event)).status_code == 200

    status = await _q(select(Subscription.status).where(Subscription.tenant_id == tenant.id))
    assert status == SubscriptionStatus.SUSPENDED
    audits = await _q(
        select(func.count()).select_from(AuditLog).where(
            AuditLog.tenant_id == tenant.id, AuditLog.resource_type == "stripe_subscription"
        )
    )
    assert audits == 1


async def test_entregas_simultaneas_do_mesmo_evento_aplicam_o_efeito_uma_vez(client, db):
    """Q-04: a marca do evento é inserida antes de processar, na mesma transação."""
    tenant = await _paying_tenant(db, "cus_race")
    event = _event("invoice.payment_failed", {"id": "in_2", "object": "invoice", "customer": "cus_race"})

    responses = await asyncio.gather(*[_post(client, event) for _ in range(5)])

    assert all(r.status_code == 200 for r in responses)
    audits = await _q(
        select(func.count()).select_from(AuditLog).where(
            AuditLog.tenant_id == tenant.id, AuditLog.resource_type == "stripe_subscription"
        )
    )
    assert audits == 1


# ---------------------------------------------------------------------------
# $-04 — assinatura paga por fatura (boleto) e pagamento assíncrono no Checkout
# ---------------------------------------------------------------------------

_PRO_LIMITS = {
    "price_pro_t": {
        "plan": PlanType.PRO, "max_users": 99999, "max_giras_per_month": 4, "max_mediuns": 30, "monthly_price": 79.0,
    },
}


@pytest.fixture
def stripe_pro(monkeypatch):
    """stripe.Subscription.retrieve devolve a assinatura no plano Pro com o status pedido."""
    state = {"status": "active", "collection_method": "send_invoice", "trial_end": None, "calls": 0}

    def fake_retrieve(sub_id, *a, **kw):
        state["calls"] += 1
        return _stripe.Subscription.construct_from(
            {
                "id": sub_id, "object": "subscription", "status": state["status"],
                "collection_method": state["collection_method"], "cancel_at_period_end": False,
                "trial_end": state["trial_end"],
                "items": {"object": "list", "data": [{"id": "si_1", "price": {"id": "price_pro_t"},
                                                      "current_period_end": int(time.time()) + 30 * 86400}]},
            },
            "sk_test_dummy",
        )

    monkeypatch.setattr(_stripe.Subscription, "retrieve", fake_retrieve)
    monkeypatch.setattr("src.api.v1.webhooks._get_price_plan_map", lambda: _PRO_LIMITS)
    return state


async def _tenant_with(db, customer: str, plan: PlanType = PlanType.FREE, **values):
    tenant = await create_tenant(db, "Terreiro Boleto", plan=plan)
    await db.execute(
        update(Subscription).where(Subscription.tenant_id == tenant.id).values(stripe_customer_id=customer, **values)
    )
    await db.commit()
    return tenant


async def _sub_row(tenant_id):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(select(Subscription).where(Subscription.tenant_id == tenant_id))).scalar_one()


def _invoice(customer: str, sub_id: str, invoice_id: str = "in_bol", collection: str = "send_invoice", **extra) -> dict:
    return {
        "id": invoice_id, "object": "invoice", "customer": customer, "collection_method": collection,
        "status": "paid", "amount_due": 7900, "amount_paid": 7900,
        "parent": {"type": "subscription_details", "subscription_details": {"subscription": sub_id, "metadata": {}}},
        **extra,
    }


def _boleto_subscription(customer: str, sub_id: str, status: str = "active") -> dict:
    return {
        "id": sub_id, "object": "subscription", "customer": customer, "status": status,
        "collection_method": "send_invoice", "cancel_at_period_end": False, "trial_end": None,
        "items": {"object": "list", "data": [{"id": "si_1", "price": {"id": "price_pro_t"},
                                              "current_period_end": int(time.time()) + 30 * 86400}]},
    }


async def _audits(tenant_id) -> int:
    return await _q(
        select(func.count()).select_from(AuditLog).where(
            AuditLog.tenant_id == tenant_id, AuditLog.resource_type == "stripe_subscription"
        )
    )


async def test_boleto_criado_sem_pagamento_nao_libera_plano(client, db, stripe_pro):
    """A Stripe cria a assinatura send_invoice já `active` — o customer.subscription.created
    não pode liberar o Pro antes de a fatura ser paga."""
    tenant = await _tenant_with(db, "cus_b1", pending_stripe_subscription_id="sub_b1", pending_invoice_id="in_b1")

    resp = await _post(client, _event("customer.subscription.created", _boleto_subscription("cus_b1", "sub_b1")))

    assert resp.status_code == 200, resp.text
    row = await _sub_row(tenant.id)
    assert row.plan == PlanType.FREE
    assert row.stripe_subscription_id is None
    assert row.pending_stripe_subscription_id == "sub_b1"


async def test_invoice_paid_do_boleto_libera_plano_e_reentrega_nao_reprocessa(client, db, stripe_pro):
    tenant = await _tenant_with(
        db, "cus_b2", pending_stripe_subscription_id="sub_b2", pending_invoice_id="in_b2",
        pending_invoice_url="https://invoice.stripe.com/i/x",
    )
    event = _event("invoice.paid", _invoice("cus_b2", "sub_b2", "in_b2"))

    assert (await _post(client, event)).status_code == 200
    row = await _sub_row(tenant.id)
    assert row.plan == PlanType.PRO
    assert row.status == SubscriptionStatus.ACTIVE
    assert row.stripe_subscription_id == "sub_b2"
    assert row.collection_method == "send_invoice"
    assert row.pending_stripe_subscription_id is None
    assert row.pending_invoice_url is None
    assert row.max_mediuns == 30

    # Reentrega do mesmo evento: não chama a Stripe nem audita de novo.
    calls = stripe_pro["calls"]
    assert (await _post(client, event)).status_code == 200
    assert stripe_pro["calls"] == calls
    assert await _audits(tenant.id) == 1


async def test_boleto_em_aberto_payment_failed_nao_suspende_nem_rebaixa_trial(client, db):
    """Boleto vencido/pagamento não concluído na fatura NÃO é inadimplência."""
    tenant = await _tenant_with(
        db, "cus_b3", plan=PlanType.PREMIUM, stripe_subscription_id="sub_b3", collection_method="send_invoice",
        is_trial=True,
    )
    event = _event("invoice.payment_failed", _invoice("cus_b3", "sub_b3", "in_b3", status="open"))

    assert (await _post(client, event)).status_code == 200
    row = await _sub_row(tenant.id)
    assert row.status == SubscriptionStatus.ACTIVE
    assert row.plan == PlanType.PREMIUM
    assert row.is_trial is True
    assert row.stripe_subscription_id == "sub_b3"
    assert await _audits(tenant.id) == 0


async def test_invoice_overdue_suspende_e_invoice_paid_reativa(client, db, stripe_pro):
    tenant = await _tenant_with(
        db, "cus_b4", plan=PlanType.PRO, stripe_subscription_id="sub_b4", collection_method="send_invoice",
    )

    overdue = _event("invoice.overdue", _invoice("cus_b4", "sub_b4", "in_b4", status="open"))
    assert (await _post(client, overdue)).status_code == 200
    assert (await _sub_row(tenant.id)).status == SubscriptionStatus.SUSPENDED

    assert (await _post(client, _event("invoice.paid", _invoice("cus_b4", "sub_b4", "in_b4")))).status_code == 200
    row = await _sub_row(tenant.id)
    assert row.status == SubscriptionStatus.ACTIVE
    assert row.plan == PlanType.PRO


async def test_invoice_overdue_do_pedido_pendente_nao_suspende(client, db):
    tenant = await _tenant_with(db, "cus_b5", pending_stripe_subscription_id="sub_b5", pending_invoice_id="in_b5")

    resp = await _post(client, _event("invoice.overdue", _invoice("cus_b5", "sub_b5", "in_b5", status="open")))

    assert resp.status_code == 200
    row = await _sub_row(tenant.id)
    assert row.status == SubscriptionStatus.ACTIVE
    assert row.plan == PlanType.FREE
    assert row.pending_stripe_subscription_id == "sub_b5"


async def test_invoice_finalized_guarda_link_sem_mexer_no_status(client, db):
    tenant = await _tenant_with(
        db, "cus_b6", plan=PlanType.PRO, stripe_subscription_id="sub_b6", collection_method="send_invoice",
    )
    invoice = _invoice(
        "cus_b6", "sub_b6", "in_b6", status="open",
        hosted_invoice_url="https://invoice.stripe.com/i/b6", due_date=int(time.time()) + 5 * 86400,
    )

    assert (await _post(client, _event("invoice.finalized", invoice))).status_code == 200
    row = await _sub_row(tenant.id)
    assert row.pending_invoice_url == "https://invoice.stripe.com/i/b6"
    assert row.pending_invoice_id == "in_b6"
    assert row.pending_invoice_due_at is not None
    assert row.status == SubscriptionStatus.ACTIVE
    assert row.plan == PlanType.PRO


async def test_assinatura_pendente_encerrada_nao_rebaixa(client, db):
    """Desistência/encerramento de um boleto nunca pago só limpa o pedido."""
    tenant = await _tenant_with(
        db, "cus_b7", plan=PlanType.PRO, stripe_subscription_id="sub_cartao_antigo",
        pending_stripe_subscription_id="sub_b7", pending_invoice_id="in_b7",
    )
    deleted = _boleto_subscription("cus_b7", "sub_b7", status="canceled")

    assert (await _post(client, _event("customer.subscription.deleted", deleted))).status_code == 200
    row = await _sub_row(tenant.id)
    assert row.plan == PlanType.PRO
    assert row.stripe_subscription_id == "sub_cartao_antigo"
    assert row.pending_stripe_subscription_id is None
    assert row.pending_invoice_id is None


def _checkout_session(tenant_id, customer: str, sub_id: str, payment_status: str) -> dict:
    return {
        "id": "cs_test_1", "object": "checkout.session", "customer": customer, "subscription": sub_id,
        "payment_status": payment_status, "metadata": {"tenant_id": str(tenant_id)}, "mode": "subscription",
    }


async def test_checkout_unpaid_nao_ativa_e_async_succeeded_ativa(client, db, stripe_pro):
    stripe_pro["collection_method"] = "charge_automatically"
    tenant = await _tenant_with(db, "cus_c1")

    unpaid = _event("checkout.session.completed", _checkout_session(tenant.id, "cus_c1", "sub_c1", "unpaid"))
    assert (await _post(client, unpaid)).status_code == 200
    row = await _sub_row(tenant.id)
    assert row.plan == PlanType.FREE
    assert row.stripe_subscription_id is None

    failed = _event("checkout.session.async_payment_failed", _checkout_session(tenant.id, "cus_c1", "sub_c1", "unpaid"))
    assert (await _post(client, failed)).status_code == 200
    assert (await _sub_row(tenant.id)).plan == PlanType.FREE

    paid = _event("checkout.session.async_payment_succeeded", _checkout_session(tenant.id, "cus_c1", "sub_c1", "paid"))
    assert (await _post(client, paid)).status_code == 200
    row = await _sub_row(tenant.id)
    assert row.plan == PlanType.PRO
    assert row.status == SubscriptionStatus.ACTIVE
    assert row.stripe_subscription_id == "sub_c1"


async def test_cartao_checkout_pago_continua_ativando(client, db, stripe_pro):
    """Regressão do cartão: checkout.session.completed pago liga e libera o plano."""
    stripe_pro["collection_method"] = "charge_automatically"
    tenant = await _tenant_with(db, "cus_c2")

    resp = await _post(client, _event("checkout.session.completed", _checkout_session(tenant.id, "cus_c2", "sub_c2", "paid")))

    assert resp.status_code == 200, resp.text
    row = await _sub_row(tenant.id)
    assert row.plan == PlanType.PRO
    assert row.status == SubscriptionStatus.ACTIVE
    assert row.stripe_subscription_id == "sub_c2"


async def test_cartao_invoice_paid_e_ignorado_e_falha_continua_suspendendo(client, db, stripe_pro):
    """Regressão do cartão: invoice.paid não faz nada (segue pelo subscription.updated) e
    invoice.payment_failed continua suspendendo."""
    tenant = await _tenant_with(
        db, "cus_c3", plan=PlanType.PRO, stripe_subscription_id="sub_c3", collection_method="charge_automatically",
    )
    card_invoice = _invoice("cus_c3", "sub_c3", "in_c3", collection="charge_automatically")

    assert (await _post(client, _event("invoice.paid", card_invoice))).status_code == 200
    assert stripe_pro["calls"] == 0
    assert await _audits(tenant.id) == 0

    failed = {**card_invoice, "status": "open"}
    assert (await _post(client, _event("invoice.payment_failed", failed))).status_code == 200
    assert (await _sub_row(tenant.id)).status == SubscriptionStatus.SUSPENDED


async def test_cartao_subscription_updated_ativa_continua_sincronizando(client, db, stripe_pro):
    """Regressão do cartão: assinatura ligada `active` sincroniza plano e status."""
    tenant = await _tenant_with(
        db, "cus_c4", plan=PlanType.BASIC, stripe_subscription_id="sub_c4", status=SubscriptionStatus.SUSPENDED,
    )
    card_sub = {**_boleto_subscription("cus_c4", "sub_c4"), "collection_method": "charge_automatically"}

    assert (await _post(client, _event("customer.subscription.updated", card_sub))).status_code == 200
    row = await _sub_row(tenant.id)
    assert row.plan == PlanType.PRO
    assert row.status == SubscriptionStatus.ACTIVE
    assert row.collection_method == "charge_automatically"
