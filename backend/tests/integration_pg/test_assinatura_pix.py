"""$-04 — PIX mês a mês: Checkout avulso, webhook que libera 30 dias, lembretes e vencimento.

Postgres real; a Stripe é simulada (funções de `src.services.stripe_service` trocadas e eventos
de webhook assinados com STRIPE_WEBHOOK_SECRET, como em test_stripe_webhook.py). Nenhuma
chamada de verdade à Stripe.
"""
import hashlib
import hmac
import json
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select, update

from src.models import UserRole
from src.models.assinatura_pix import AssinaturaPixPagamento
from src.models.subscriptions import PlanType, Subscription, SubscriptionStatus
from src.models.tenants import Tenant

from .factories import create_tenant, create_user

SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
pytestmark = pytest.mark.skipif(not SECRET, reason="defina STRIPE_WEBHOOK_SECRET para a suíte de webhook")

CUSTOMER = "cus_pix_t"


# ── helpers ──────────────────────────────────────────────────────────────────

def _signed(event: dict) -> tuple[bytes, dict]:
    payload = json.dumps(event).encode()
    ts = int(time.time())
    sig = hmac.new(SECRET.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    return payload, {"stripe-signature": f"t={ts},v1={sig}", "content-type": "application/json"}


async def _post_event(client, event_type: str, obj: dict, event_id: str | None = None):
    event = {
        "id": event_id or f"evt_{uuid.uuid4().hex[:20]}", "object": "event", "type": event_type,
        "data": {"object": obj},
    }
    payload, headers = _signed(event)
    return await client.post("/api/v1/webhooks/stripe", content=payload, headers=headers)


def _session(tenant_id, plan="pro", amount=7900, paid=True, customer=CUSTOMER, session_id=None) -> dict:
    return {
        "id": session_id or f"cs_{uuid.uuid4().hex[:16]}", "object": "checkout.session", "mode": "payment",
        "customer": customer, "payment_intent": f"pi_{uuid.uuid4().hex[:12]}",
        "payment_status": "paid" if paid else "unpaid", "amount_total": amount, "currency": "brl",
        "metadata": {"tenant_id": str(tenant_id), "plan": plan, "tipo": "pix_mensal"},
    }


async def _row(tenant_id) -> Subscription:
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(select(Subscription).where(Subscription.tenant_id == tenant_id))).scalar_one()


async def _count_pagamentos(tenant_id) -> int:
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(
            select(func.count()).select_from(AssinaturaPixPagamento).where(AssinaturaPixPagamento.tenant_id == tenant_id)
        )).scalar_one()


async def _tenant(db, plan=PlanType.FREE, **values):
    tenant = await create_tenant(db, "Terreiro Pix", plan=plan)
    await db.execute(
        update(Subscription).where(Subscription.tenant_id == tenant.id).values(stripe_customer_id=CUSTOMER, **values)
    )
    await db.commit()
    return tenant


def _pix_ativo(dias: float, plan=PlanType.PRO) -> dict:
    return dict(
        plan=plan, collection_method="pix_mensal", monthly_price=79.0 if plan == PlanType.PRO else 49.0,
        current_period_end=datetime.now(timezone.utc) + timedelta(days=dias),
    )


def _close(a: datetime, b: datetime, seconds: int = 120) -> bool:
    return abs((a - b).total_seconds()) < seconds


@pytest.fixture
def fake_stripe(monkeypatch):
    calls = {"pix": [], "checkout": [], "invoice": []}

    async def get_or_create_customer(tenant_id, email, name):
        return CUSTOMER

    async def create_pix_checkout_session(customer_id, plan, plan_label, amount_brl, tenant_id):
        calls["pix"].append({"customer": customer_id, "plan": plan, "amount": amount_brl, "tenant": tenant_id})
        return "https://checkout.stripe.com/c/pix_t"

    async def create_checkout_session(customer_id, plan, tenant_id, trial_period_days=None):
        calls["checkout"].append(plan)
        return "https://checkout.stripe.com/c/card_t"

    async def create_invoice_subscription(customer_id, plan, tenant_id, trial_period_days=None):
        calls["invoice"].append(plan)
        raise AssertionError("não deveria chegar na Stripe")

    from src.services import stripe_service

    monkeypatch.setattr(stripe_service, "get_or_create_customer", get_or_create_customer)
    monkeypatch.setattr(stripe_service, "create_pix_checkout_session", create_pix_checkout_session)
    monkeypatch.setattr(stripe_service, "create_checkout_session", create_checkout_session)
    monkeypatch.setattr(stripe_service, "create_invoice_subscription", create_invoice_subscription)
    return calls


# ── POST /admin/billing/pix-checkout ─────────────────────────────────────────

async def test_pix_checkout_so_para_admin_e_valor_do_plano(client, db, fake_stripe):
    tenant = await create_tenant(db, "Terreiro Pix Novo", plan=PlanType.FREE)
    admin = await create_user(db, tenant)
    operador = await create_user(db, tenant, role=UserRole.OPERATOR, name="operador")

    negado = await client.post("/api/v1/admin/billing/pix-checkout", json={"plan": "pro"}, headers=operador.headers)
    assert negado.status_code == 403
    assert fake_stripe["pix"] == []

    resp = await client.post("/api/v1/admin/billing/pix-checkout", json={"plan": "pro"}, headers=admin.headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["checkout_url"] == "https://checkout.stripe.com/c/pix_t"
    assert fake_stripe["pix"] == [{"customer": CUSTOMER, "plan": "pro", "amount": 79.0, "tenant": str(tenant.id)}]
    row = await _row(tenant.id)
    assert row.stripe_customer_id == CUSTOMER  # o webhook confere a sessão contra este cliente
    assert row.plan == PlanType.FREE  # nada liberado antes do pagamento

    invalido = await client.post("/api/v1/admin/billing/pix-checkout", json={"plan": "free"}, headers=admin.headers)
    assert invalido.status_code == 400


async def test_pix_recusado_com_assinatura_cartao_ou_boleto(client, db, fake_stripe):
    cartao = await _tenant(db, plan=PlanType.PRO, stripe_subscription_id="sub_card_t")
    admin_c = await create_user(db, cartao)
    resp = await client.post("/api/v1/admin/billing/pix-checkout", json={"plan": "pro"}, headers=admin_c.headers)
    assert resp.status_code == 409

    boleto = await create_tenant(db, "Terreiro Boleto Pendente", plan=PlanType.FREE)
    await db.execute(
        update(Subscription).where(Subscription.tenant_id == boleto.id).values(pending_stripe_subscription_id="sub_bol_p")
    )
    await db.commit()
    admin_b = await create_user(db, boleto)
    resp = await client.post("/api/v1/admin/billing/pix-checkout", json={"plan": "basic"}, headers=admin_b.headers)
    assert resp.status_code == 409
    assert fake_stripe["pix"] == []


async def test_mes_pix_ativo_so_renova_o_mesmo_plano_e_trava_cartao_e_boleto(client, db, fake_stripe):
    tenant = await _tenant(db, **_pix_ativo(10))
    admin = await create_user(db, tenant)

    outro = await client.post("/api/v1/admin/billing/pix-checkout", json={"plan": "basic"}, headers=admin.headers)
    assert outro.status_code == 409
    mesmo = await client.post("/api/v1/admin/billing/pix-checkout", json={"plan": "pro"}, headers=admin.headers)
    assert mesmo.status_code == 200

    card = await client.post("/api/v1/admin/billing/checkout", json={"plan": "pro"}, headers=admin.headers)
    assert card.status_code == 409
    assert "PIX" in card.json()["detail"]
    boleto = await client.post("/api/v1/admin/billing/subscribe-invoice", json={"plan": "pro"}, headers=admin.headers)
    assert boleto.status_code == 409
    assert fake_stripe["checkout"] == [] and fake_stripe["invoice"] == []


async def test_depois_do_pago_ate_cartao_liberado_e_webhook_do_cartao_tira_o_pix(client, db, fake_stripe, monkeypatch):
    tenant = await _tenant(db, **_pix_ativo(-1))  # venceu ontem: na tolerância
    admin = await create_user(db, tenant)
    card = await client.post("/api/v1/admin/billing/checkout", json={"plan": "pro"}, headers=admin.headers)
    assert card.status_code == 200
    assert fake_stripe["checkout"] == ["pro"]

    import stripe as _stripe

    def fake_retrieve(sub_id, *a, **kw):
        return _stripe.Subscription.construct_from({
            "id": sub_id, "object": "subscription", "status": "active", "trial_end": None,
            "items": {"object": "list", "data": [{"id": "si_1", "price": {"id": "price_pro_t"},
                                                  "current_period_end": int(time.time()) + 30 * 86400}]},
        }, "sk_test_dummy")

    monkeypatch.setattr(_stripe.Subscription, "retrieve", fake_retrieve)
    monkeypatch.setattr("src.api.v1.webhooks._get_price_plan_map", lambda: {"price_pro_t": {
        "plan": PlanType.PRO, "max_users": 99999, "max_giras_per_month": 4, "max_mediuns": 30, "monthly_price": 79.0,
    }})
    resp = await _post_event(client, "checkout.session.completed", {
        "id": "cs_card_t", "object": "checkout.session", "mode": "subscription", "payment_status": "paid",
        "customer": CUSTOMER, "subscription": "sub_card_new", "metadata": {"tenant_id": str(tenant.id)},
    })
    assert resp.status_code == 200, resp.text
    row = await _row(tenant.id)
    assert row.stripe_subscription_id == "sub_card_new"
    assert row.collection_method is None  # agendador do PIX não rebaixa mais


# ── webhook ──────────────────────────────────────────────────────────────────

async def test_completed_pago_libera_30_dias_e_reentrega_nao_duplica(client, db, fake_stripe):
    tenant = await _tenant(db)
    sess = _session(tenant.id)

    first = await _post_event(client, "checkout.session.completed", sess, event_id="evt_pix_1")
    assert first.status_code == 200, first.text
    row = await _row(tenant.id)
    assert row.plan == PlanType.PRO
    assert row.status == SubscriptionStatus.ACTIVE
    assert row.collection_method == "pix_mensal"
    assert row.stripe_subscription_id is None
    assert row.max_mediuns == 30 and row.monthly_price == 79.0
    assert _close(row.current_period_end, datetime.now(timezone.utc) + timedelta(days=30))
    fim = row.current_period_end

    # mesmo evento de novo e outro evento da mesma sessão: nada muda
    assert (await _post_event(client, "checkout.session.completed", sess, event_id="evt_pix_1")).status_code == 200
    assert (await _post_event(client, "checkout.session.async_payment_succeeded", sess)).status_code == 200
    assert (await _row(tenant.id)).current_period_end == fim
    assert await _count_pagamentos(tenant.id) == 1

    admin = await create_user(db, tenant)
    info = (await client.get("/api/v1/admin/billing", headers=admin.headers)).json()
    assert info["pix_active"] is True
    assert info["pix_paid_until"]
    assert info["pix_grace_until"]
    assert len(info["pix_payments"]) == 1
    assert info["pix_payments"][0]["plan"] == "pro" and info["pix_payments"][0]["applied"] is True
    sub_info = (await client.get("/api/v1/admin/subscription", headers=admin.headers)).json()
    assert sub_info["collection_method"] == "pix_mensal"
    assert sub_info["features"]["relatorio_gira"] is True


async def test_async_payment_succeeded_libera_e_completed_sem_pagamento_nao(client, db, fake_stripe):
    tenant = await _tenant(db)
    sess = _session(tenant.id, paid=False)
    assert (await _post_event(client, "checkout.session.completed", sess)).status_code == 200
    assert (await _row(tenant.id)).plan == PlanType.FREE

    paid = {**sess, "payment_status": "paid"}
    assert (await _post_event(client, "checkout.session.async_payment_succeeded", paid)).status_code == 200
    row = await _row(tenant.id)
    assert row.plan == PlanType.PRO and row.collection_method == "pix_mensal"


async def test_async_payment_failed_nao_faz_nada(client, db, fake_stripe):
    tenant = await _tenant(db)
    resp = await _post_event(client, "checkout.session.async_payment_failed", _session(tenant.id, paid=False))
    assert resp.status_code == 200
    row = await _row(tenant.id)
    assert row.plan == PlanType.FREE and row.collection_method is None
    assert await _count_pagamentos(tenant.id) == 0


async def test_pagar_antes_estende_a_partir_do_pago_ate(client, db, fake_stripe):
    tenant = await _tenant(db, **_pix_ativo(4))
    antes = (await _row(tenant.id)).current_period_end
    assert (await _post_event(client, "checkout.session.completed", _session(tenant.id))).status_code == 200
    depois = (await _row(tenant.id)).current_period_end
    assert depois == antes + timedelta(days=30)


async def test_pago_no_meio_do_teste_preserva_dias_gratis(client, db, fake_stripe):
    fim_teste = datetime.now(timezone.utc) + timedelta(days=12)
    tenant = await _tenant(db, plan=PlanType.PREMIUM, is_trial=True, trial_ends_at=fim_teste)
    assert (await _post_event(client, "checkout.session.completed", _session(tenant.id, plan="basic", amount=4900))).status_code == 200
    row = await _row(tenant.id)
    assert row.plan == PlanType.BASIC
    assert row.is_trial is False and row.trial_ends_at is None
    assert _close(row.current_period_end, fim_teste + timedelta(days=30))


async def test_cliente_diferente_ou_valor_menor_nao_libera(client, db, fake_stripe):
    tenant = await _tenant(db)
    outro = await _post_event(client, "checkout.session.completed", _session(tenant.id, customer="cus_intruso"))
    assert outro.status_code == 200
    assert (await _row(tenant.id)).plan == PlanType.FREE
    assert await _count_pagamentos(tenant.id) == 0

    barato = await _post_event(client, "checkout.session.completed", _session(tenant.id, amount=100))
    assert barato.status_code == 200
    row = await _row(tenant.id)
    assert row.plan == PlanType.FREE
    assert await _count_pagamentos(tenant.id) == 1  # registrado como não aplicado, para o suporte


async def test_pix_pago_com_assinatura_cartao_nao_mexe_no_cartao(client, db, fake_stripe):
    tenant = await _tenant(db, plan=PlanType.PREMIUM, stripe_subscription_id="sub_card_x", monthly_price=99.0)
    assert (await _post_event(client, "checkout.session.completed", _session(tenant.id))).status_code == 200
    row = await _row(tenant.id)
    assert row.plan == PlanType.PREMIUM
    assert row.stripe_subscription_id == "sub_card_x"
    assert row.collection_method is None


# ── agendador: lembretes e vencimento ────────────────────────────────────────

@pytest.fixture
def outbox(monkeypatch):
    sent = []

    async def fake_enviar(msg):
        sent.append(msg)

    monkeypatch.setattr("src.services.assinatura_pix._enviar", fake_enviar)
    return sent


async def test_lembretes_5_e_1_dia_saem_uma_vez(db, outbox):
    from src.services.assinatura_pix import _processar_pix_mensal_locked

    tenant = await _tenant(db, **_pix_ativo(4.5))  # faltam 5 dias (arredondado para cima)
    await create_user(db, tenant, name="dirigente")
    await create_user(db, tenant, name="mae pequena")
    await create_user(db, tenant, role=UserRole.OPERATOR, name="cambone")
    agora = datetime.now(timezone.utc)

    await _processar_pix_mensal_locked(agora)
    await _processar_pix_mensal_locked(agora)
    assert len(outbox) == 2  # os dois administradores, uma vez só
    assert all("vence em 5 dias" in m.subject for m in outbox)

    await _processar_pix_mensal_locked(agora + timedelta(days=4))
    await _processar_pix_mensal_locked(agora + timedelta(days=4))
    assert len(outbox) == 4
    assert all("vence amanhã" in m.subject for m in outbox[2:])
    assert (await _row(tenant.id)).plan == PlanType.PRO


async def test_vencimento_respeita_tolerancia_e_volta_ao_gratuito(db, outbox):
    from src.services.assinatura_pix import _processar_pix_mensal_locked

    tenant = await _tenant(db, **_pix_ativo(-2))  # venceu há 2 dias: ainda na tolerância
    await create_user(db, tenant)
    agora = datetime.now(timezone.utc)

    await _processar_pix_mensal_locked(agora)
    assert (await _row(tenant.id)).plan == PlanType.PRO
    assert outbox == []

    await _processar_pix_mensal_locked(agora + timedelta(days=1, hours=1))
    row = await _row(tenant.id)
    assert row.plan == PlanType.FREE
    assert row.status == SubscriptionStatus.CANCELLED
    assert row.collection_method is None
    assert row.max_mediuns == 0
    assert len(outbox) == 1 and "gratuita" in outbox[0].subject

    # rodada seguinte não repete
    await _processar_pix_mensal_locked(agora + timedelta(days=2))
    assert len(outbox) == 1


async def test_pagar_depois_de_voltar_ao_gratuito_religa(client, db, fake_stripe, outbox):
    from src.services.assinatura_pix import _processar_pix_mensal_locked

    tenant = await _tenant(db, **_pix_ativo(-5))
    await _processar_pix_mensal_locked(datetime.now(timezone.utc))
    assert (await _row(tenant.id)).plan == PlanType.FREE

    assert (await _post_event(client, "checkout.session.completed", _session(tenant.id))).status_code == 200
    row = await _row(tenant.id)
    assert row.plan == PlanType.PRO and row.status == SubscriptionStatus.ACTIVE
    assert _close(row.current_period_end, datetime.now(timezone.utc) + timedelta(days=30))


# ── métricas ─────────────────────────────────────────────────────────────────

async def test_mrr_conta_mes_pix_pago_e_nao_conta_vencido(db):
    from src.core.database import AsyncSessionLocal
    from src.services.billing_metrics import paying_clause

    ativo = await _tenant(db, **_pix_ativo(10))
    vencido = await create_tenant(db, "Terreiro Pix Vencido", plan=PlanType.FREE)
    await db.execute(update(Subscription).where(Subscription.tenant_id == vencido.id).values(**_pix_ativo(-1)))
    await db.commit()

    async with AsyncSessionLocal() as fresh:
        ids = set((await fresh.execute(
            select(Subscription.tenant_id).join(Tenant, Tenant.id == Subscription.tenant_id).where(paying_clause())
        )).scalars().all())
    assert ativo.id in ids
    assert vencido.id not in ids
