"""$-04 — assinar o plano pagando por fatura (boleto), pelo endpoint real com Postgres.

A Stripe é simulada trocando as funções de `src.services.stripe_service` (nenhuma chamada
de verdade). O que se confere aqui é o efeito no banco: sem teste, o plano NÃO é liberado
na hora (fica o pedido pendente com o link da fatura); no teste, os dias que faltam são
preservados e o plano escolhido já vale; boleto não ativado na conta vira erro claro; e o
cartão continua indo para o Checkout.
"""
from datetime import datetime, timedelta, timezone

import pytest
import stripe
from sqlalchemy import select, update

from src.models.subscriptions import PlanType, Subscription, SubscriptionStatus

from .factories import create_tenant, create_user


async def _row(tenant_id):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(select(Subscription).where(Subscription.tenant_id == tenant_id))).scalar_one()


@pytest.fixture
def fake_stripe(monkeypatch):
    calls = {"create": [], "cancel": [], "checkout": []}
    state = {"status": "active", "error": None}

    async def get_or_create_customer(tenant_id, email, name):
        return "cus_admin_t"

    async def create_invoice_subscription(customer_id, plan, tenant_id, trial_period_days=None):
        calls["create"].append({"plan": plan, "trial_period_days": trial_period_days})
        if state["error"]:
            raise state["error"]
        due = int((datetime.now(timezone.utc) + timedelta(days=5)).timestamp())
        sub = {"id": "sub_bol_t", "status": state["status"], "collection_method": "send_invoice"}
        if state["status"] == "trialing":
            sub["trial_end"] = int((datetime.now(timezone.utc) + timedelta(days=trial_period_days or 1)).timestamp())
            sub["latest_invoice"] = {"id": "in_zero", "status": "paid", "amount_due": 0}
        else:
            sub["latest_invoice"] = {
                "id": "in_bol_t", "status": "open", "amount_due": 7900, "due_date": due,
                "hosted_invoice_url": "https://invoice.stripe.com/i/bol_t",
            }
        return sub

    async def cancel_pending_invoice_subscription(sub_id, invoice_id=None):
        calls["cancel"].append((sub_id, invoice_id))

    async def create_checkout_session(customer_id, plan, tenant_id, trial_period_days=None):
        calls["checkout"].append(plan)
        return "https://checkout.stripe.com/c/t"

    from src.services import stripe_service

    monkeypatch.setattr(stripe_service, "get_or_create_customer", get_or_create_customer)
    monkeypatch.setattr(stripe_service, "create_invoice_subscription", create_invoice_subscription)
    monkeypatch.setattr(stripe_service, "cancel_pending_invoice_subscription", cancel_pending_invoice_subscription)
    monkeypatch.setattr(stripe_service, "create_checkout_session", create_checkout_session)
    monkeypatch.setattr(stripe_service, "_price_id_for_plan", lambda plan: f"price_{plan}_t")
    return calls, state


async def _free_admin(db):
    tenant = await create_tenant(db, "Terreiro Sem Cartao", plan=PlanType.FREE)
    admin = await create_user(db, tenant)
    return tenant, admin


async def test_boleto_sem_teste_deixa_pedido_pendente_sem_liberar_plano(client, db, fake_stripe):
    calls, _ = fake_stripe
    tenant, admin = await _free_admin(db)

    resp = await client.post("/api/v1/admin/billing/subscribe-invoice", json={"plan": "pro"}, headers=admin.headers)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "pending"
    assert body["hosted_invoice_url"] == "https://invoice.stripe.com/i/bol_t"
    assert calls["create"] == [{"plan": "pro", "trial_period_days": None}]

    row = await _row(tenant.id)
    assert row.plan == PlanType.FREE  # só o invoice.paid libera
    assert row.stripe_subscription_id is None
    assert row.pending_stripe_subscription_id == "sub_bol_t"
    assert row.pending_invoice_id == "in_bol_t"
    assert row.stripe_customer_id == "cus_admin_t"

    info = (await client.get("/api/v1/admin/billing", headers=admin.headers)).json()
    assert info["awaiting_first_payment"] is True
    assert info["pending_invoice_url"] == "https://invoice.stripe.com/i/bol_t"
    assert info["pending_invoice_due_at"]
    assert info["invoice_payment_methods"] == ["boleto"]

    # Segundo clique e troca para cartão com pedido pendente: recusados, sem nova assinatura.
    again = await client.post("/api/v1/admin/billing/subscribe-invoice", json={"plan": "pro"}, headers=admin.headers)
    assert again.status_code == 409
    card = await client.post("/api/v1/admin/billing/checkout", json={"plan": "pro"}, headers=admin.headers)
    assert card.status_code == 409
    assert len(calls["create"]) == 1
    assert calls["checkout"] == []


async def test_cancelar_pedido_pendente_desiste_na_stripe_e_limpa(client, db, fake_stripe):
    calls, _ = fake_stripe
    tenant, admin = await _free_admin(db)
    assert (await client.post("/api/v1/admin/billing/subscribe-invoice", json={"plan": "basic"}, headers=admin.headers)).status_code == 200

    resp = await client.post("/api/v1/admin/billing/cancel", headers=admin.headers)

    assert resp.status_code == 200, resp.text
    assert calls["cancel"] == [("sub_bol_t", "in_bol_t")]
    row = await _row(tenant.id)
    assert row.pending_stripe_subscription_id is None
    assert row.pending_invoice_url is None
    assert row.plan == PlanType.FREE
    assert row.status == SubscriptionStatus.ACTIVE
    # Agora o cartão volta a ser possível.
    card = await client.post("/api/v1/admin/billing/checkout", json={"plan": "basic"}, headers=admin.headers)
    assert card.status_code == 200
    assert card.json()["checkout_url"] == "https://checkout.stripe.com/c/t"


async def test_boleto_no_teste_preserva_dias_e_liga_assinatura(client, db, fake_stripe):
    calls, state = fake_stripe
    state["status"] = "trialing"
    tenant = await create_tenant(db, "Terreiro Em Teste", plan=PlanType.PREMIUM)
    await db.execute(
        update(Subscription).where(Subscription.tenant_id == tenant.id).values(
            is_trial=True, trial_ends_at=datetime.now(timezone.utc) + timedelta(days=12, hours=2),
        )
    )
    await db.commit()
    admin = await create_user(db, tenant)

    resp = await client.post("/api/v1/admin/billing/subscribe-invoice", json={"plan": "pro"}, headers=admin.headers)

    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "trialing"
    assert calls["create"][0]["trial_period_days"] == 12
    row = await _row(tenant.id)
    assert row.stripe_subscription_id == "sub_bol_t"
    assert row.collection_method == "send_invoice"
    assert row.plan == PlanType.PRO
    assert row.is_trial is True
    assert row.pending_stripe_subscription_id is None


async def test_boleto_nao_ativado_na_stripe_vira_erro_claro_sem_efeito(client, db, fake_stripe):
    _, state = fake_stripe
    state["error"] = stripe.error.InvalidRequestError(
        "The payment method type provided: boleto is invalid. Please ensure the provided type is activated in your dashboard.",
        param="payment_settings[payment_method_types][0]",
    )
    tenant, admin = await _free_admin(db)

    resp = await client.post("/api/v1/admin/billing/subscribe-invoice", json={"plan": "pro"}, headers=admin.headers)

    assert resp.status_code == 400
    assert "boleto ainda não está liberado" in resp.json()["detail"]
    row = await _row(tenant.id)
    assert row.pending_stripe_subscription_id is None
    assert row.plan == PlanType.FREE


async def test_operador_nao_assina(client, db, fake_stripe):
    from src.models.users import UserRole

    tenant, _ = await _free_admin(db)
    operator = await create_user(db, tenant, role=UserRole.OPERATOR, name="operador")

    resp = await client.post("/api/v1/admin/billing/subscribe-invoice", json={"plan": "pro"}, headers=operator.headers)

    assert resp.status_code == 403
