"""Tolerância na cobrança do plano no cartão (dunning, migração 094 — services/cobranca_cartao.py).

Pedido do dono (2026-10-13): um cliente foi suspenso na 1ª recusa da renovação (saldo
insuficiente), mas a Stripe tenta de novo dias depois e costuma passar. Agora:
- recusa do cartão / assinatura `past_due` → plano segue ACTIVE, "Pagamento pendente" + e-mail
  aos admins uma vez por fatura;
- `unpaid` (a Stripe desistiu) ou 10 dias sem pagar (rede de segurança diária) → SUSPENDED + e-mail;
- pago depois → limpa e reativa;
- trial, boleto e PIX mensal ficam como eram.

Webhooks assinados de verdade no endpoint público; Stripe simulada (nenhuma chamada real).
"""
import hashlib
import hmac
import json
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import stripe as _stripe
from sqlalchemy import func, select, update

from src.models.audit_logs import AuditLog
from src.models.subscriptions import PlanType, Subscription, SubscriptionStatus
from src.models.users import UserRole
from src.services import cobranca_cartao

from .factories import create_tenant, create_user

SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
pytestmark = pytest.mark.skipif(not SECRET, reason="defina STRIPE_WEBHOOK_SECRET para a suíte de webhook")

_PRO_LIMITS = {
    "price_pro_t": {
        "plan": PlanType.PRO, "max_users": 99999, "max_giras_per_month": 4, "max_mediuns": 30, "monthly_price": 79.0,
    },
}


# ── helpers ──────────────────────────────────────────────────────────────────

def _signed(event: dict) -> tuple[bytes, dict]:
    payload = json.dumps(event).encode()
    ts = int(time.time())
    sig = hmac.new(SECRET.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    return payload, {"stripe-signature": f"t={ts},v1={sig}", "content-type": "application/json"}


def _event(event_type: str, obj: dict, event_id: str | None = None) -> dict:
    return {"id": event_id or f"evt_{uuid.uuid4().hex[:20]}", "object": "event", "type": event_type,
            "data": {"object": obj}}


async def _post(client, event: dict):
    payload, headers = _signed(event)
    resp = await client.post("/api/v1/webhooks/stripe", content=payload, headers=headers)
    await cobranca_cartao.aguardar_avisos()
    return resp


def _invoice(customer: str, sub_id: str, invoice_id: str, collection: str = "charge_automatically", **extra) -> dict:
    return {
        "id": invoice_id, "object": "invoice", "customer": customer, "collection_method": collection,
        "status": "open", "amount_due": 7900, "amount_paid": 0, "attempt_count": 1,
        "parent": {"type": "subscription_details", "subscription_details": {"subscription": sub_id, "metadata": {}}},
        **extra,
    }


def _stripe_subscription(customer: str, sub_id: str, status: str, collection: str = "charge_automatically",
                         latest_invoice: str | None = None) -> dict:
    return {
        "id": sub_id, "object": "subscription", "customer": customer, "status": status,
        "collection_method": collection, "cancel_at_period_end": False, "trial_end": None,
        "latest_invoice": latest_invoice,
        "items": {"object": "list", "data": [{"id": "si_1", "price": {"id": "price_pro_t"},
                                              "current_period_end": int(time.time()) + 30 * 86400}]},
    }


async def _card_tenant(db, customer: str, admins: int = 2, **values):
    """Terreiro no Pro pago no cartão, com `admins` administradores (+ um operador, que não recebe)."""
    tenant = await create_tenant(db, "Terreiro Cartao", plan=PlanType.PRO)
    values = {"collection_method": "charge_automatically", **values}
    await db.execute(
        update(Subscription).where(Subscription.tenant_id == tenant.id).values(
            stripe_customer_id=customer, stripe_subscription_id=f"sub_{customer}", **values,
        )
    )
    await db.commit()
    actors = [await create_user(db, tenant, UserRole.ADMIN, name=f"admin{i}") for i in range(admins)]
    await create_user(db, tenant, UserRole.OPERATOR, name="operador")
    return tenant, actors


async def _row(tenant_id) -> Subscription:
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(select(Subscription).where(Subscription.tenant_id == tenant_id))).scalar_one()


async def _audits(tenant_id) -> int:
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(
            select(func.count()).select_from(AuditLog).where(
                AuditLog.tenant_id == tenant_id, AuditLog.resource_type == "stripe_subscription"
            )
        )).scalar_one()


@pytest.fixture
def emails(monkeypatch):
    sent = []

    async def fake_enviar(msg):
        sent.append(msg)

    monkeypatch.setattr("src.services.cobranca_cartao._enviar", fake_enviar)
    return sent


@pytest.fixture
def stripe_api(monkeypatch):
    """stripe.Subscription.retrieve com o status de cada assinatura em `state["status"][sub_id]`."""
    state = {"status": {}, "calls": [], "default": "active"}

    def fake_retrieve(sub_id, *a, **kw):
        state["calls"].append(sub_id)
        return _stripe.Subscription.construct_from(
            {**_stripe_subscription("cus_x", sub_id, state["status"].get(sub_id, state["default"])), "customer": None},
            "sk_test_dummy",
        )

    monkeypatch.setattr(_stripe.Subscription, "retrieve", fake_retrieve)
    monkeypatch.setattr("src.api.v1.webhooks._get_price_plan_map", lambda: _PRO_LIMITS)
    return state


# ── webhook ──────────────────────────────────────────────────────────────────

async def test_recusa_do_cartao_mantem_plano_marca_pendente_e_avisa_uma_vez(client, db, emails, stripe_api):
    tenant, admins = await _card_tenant(db, "cus_d1")
    failed = _event("invoice.payment_failed", _invoice("cus_d1", "sub_cus_d1", "in_d1"))

    assert (await _post(client, failed)).status_code == 200
    row = await _row(tenant.id)
    assert row.status == SubscriptionStatus.ACTIVE
    assert row.plan == PlanType.PRO
    assert row.pagamento_pendente_invoice_id == "in_d1"
    desde = row.pagamento_pendente_desde
    assert desde is not None
    # Um e-mail por administrador ativo (o operador não recebe).
    assert sorted(m.to_email for m in emails) == sorted(a.user.email for a in admins)
    assert "não passou" in emails[0].subject
    assert "/admin/billing" in emails[0].html_body

    # Reentrega do mesmo evento: não reprocessa nem reenvia.
    assert (await _post(client, failed)).status_code == 200
    # Nova tentativa recusada (outro evento, mesma fatura) e o past_due da assinatura: sem e-mail
    # novo e a data da 1ª recusa não anda.
    retry = _event("invoice.payment_failed", _invoice("cus_d1", "sub_cus_d1", "in_d1", attempt_count=2))
    assert (await _post(client, retry)).status_code == 200
    past_due = _event(
        "customer.subscription.updated", _stripe_subscription("cus_d1", "sub_cus_d1", "past_due", latest_invoice="in_d1")
    )
    assert (await _post(client, past_due)).status_code == 200

    row = await _row(tenant.id)
    assert row.status == SubscriptionStatus.ACTIVE
    assert row.pagamento_pendente_desde == desde
    assert len(emails) == len(admins)
    assert await _audits(tenant.id) == 2  # 1ª recusa + nova tentativa (a reentrega não audita)


async def test_past_due_sozinho_so_avisa(client, db, emails, stripe_api):
    tenant, admins = await _card_tenant(db, "cus_d2", admins=1)

    resp = await _post(client, _event(
        "customer.subscription.updated", _stripe_subscription("cus_d2", "sub_cus_d2", "past_due", latest_invoice="in_d2")
    ))

    assert resp.status_code == 200, resp.text
    row = await _row(tenant.id)
    assert row.status == SubscriptionStatus.ACTIVE
    assert row.pagamento_pendente_invoice_id == "in_d2"
    assert [m.to_email for m in emails] == [admins[0].user.email]


async def test_unpaid_suspende_e_avisa_e_active_reativa(client, db, emails, stripe_api):
    tenant, admins = await _card_tenant(db, "cus_d3", admins=1)
    await _post(client, _event("invoice.payment_failed", _invoice("cus_d3", "sub_cus_d3", "in_d3")))
    assert len(emails) == 1

    unpaid = _event("customer.subscription.updated",
                    _stripe_subscription("cus_d3", "sub_cus_d3", "unpaid", latest_invoice="in_d3"))
    assert (await _post(client, unpaid)).status_code == 200
    row = await _row(tenant.id)
    assert row.status == SubscriptionStatus.SUSPENDED
    assert len(emails) == 2
    assert "suspenso por falta de pagamento" in emails[1].subject
    # Suspenso: o gate de plano bloqueia o que é pago.
    assert (await client.get("/api/v1/admin/sites", headers=admins[0].headers)).status_code == 402

    # Cartão trocado no portal e fatura paga → a Stripe volta a assinatura para `active`.
    active = _event("customer.subscription.updated", _stripe_subscription("cus_d3", "sub_cus_d3", "active"))
    assert (await _post(client, active)).status_code == 200
    row = await _row(tenant.id)
    assert row.status == SubscriptionStatus.ACTIVE
    assert row.pagamento_pendente_desde is None
    assert row.pagamento_pendente_invoice_id is None
    assert len(emails) == 2
    assert (await client.get("/api/v1/admin/sites", headers=admins[0].headers)).status_code == 200


async def test_invoice_paid_do_cartao_com_pendente_limpa_e_reativa(client, db, emails, stripe_api):
    tenant, _ = await _card_tenant(
        db, "cus_d4", admins=0, status=SubscriptionStatus.SUSPENDED,
        pagamento_pendente_desde=datetime.now(timezone.utc) - timedelta(days=12),
        pagamento_pendente_invoice_id="in_d4",
    )
    stripe_api["status"]["sub_cus_d4"] = "active"

    paid = _event("invoice.paid", {**_invoice("cus_d4", "sub_cus_d4", "in_d4"), "status": "paid", "amount_paid": 7900})
    assert (await _post(client, paid)).status_code == 200

    row = await _row(tenant.id)
    assert row.status == SubscriptionStatus.ACTIVE
    assert row.pagamento_pendente_desde is None
    assert stripe_api["calls"] == ["sub_cus_d4"]


async def test_invoice_paid_com_stripe_ainda_past_due_mantem_pendente(client, db, emails, stripe_api):
    tenant, _ = await _card_tenant(
        db, "cus_d5", admins=0, pagamento_pendente_desde=datetime.now(timezone.utc), pagamento_pendente_invoice_id="in_x",
    )
    stripe_api["status"]["sub_cus_d5"] = "past_due"

    paid = _event("invoice.paid", {**_invoice("cus_d5", "sub_cus_d5", "in_other"), "status": "paid"})
    assert (await _post(client, paid)).status_code == 200

    row = await _row(tenant.id)
    assert row.pagamento_pendente_invoice_id == "in_x"
    assert row.status == SubscriptionStatus.ACTIVE


async def test_falha_na_conversao_do_trial_continua_voltando_ao_gratuito(client, db, emails, stripe_api):
    tenant, _ = await _card_tenant(db, "cus_d6", admins=1, is_trial=True)

    assert (await _post(client, _event("invoice.payment_failed", _invoice("cus_d6", "sub_cus_d6", "in_d6")))).status_code == 200

    row = await _row(tenant.id)
    assert row.plan == PlanType.FREE
    assert row.status == SubscriptionStatus.ACTIVE
    assert row.stripe_subscription_id is None
    assert row.pagamento_pendente_desde is None
    assert emails == []  # nada de "o plano continua" — o aviso do trial é o de sempre

    # A Stripe segue tentando a assinatura antiga: o past_due dela (já sem vínculo) não religa o Pro.
    late = _event("customer.subscription.updated", _stripe_subscription("cus_d6", "sub_cus_d6", "past_due"))
    assert (await _post(client, late)).status_code == 200
    row = await _row(tenant.id)
    assert row.plan == PlanType.FREE
    assert row.status == SubscriptionStatus.ACTIVE


async def test_trial_past_due_continua_suspendendo(client, db, emails, stripe_api):
    tenant, _ = await _card_tenant(db, "cus_d6b", admins=1, is_trial=True)

    resp = await _post(client, _event("customer.subscription.updated",
                                      _stripe_subscription("cus_d6b", "sub_cus_d6b", "past_due")))

    assert resp.status_code == 200
    assert (await _row(tenant.id)).status == SubscriptionStatus.SUSPENDED
    assert emails == []


async def test_boleto_continua_suspendendo_no_past_due_e_no_overdue(client, db, emails, stripe_api):
    tenant, _ = await _card_tenant(db, "cus_d7", admins=1, collection_method="send_invoice")

    past_due = _event("customer.subscription.updated",
                      _stripe_subscription("cus_d7", "sub_cus_d7", "past_due", collection="send_invoice"))
    assert (await _post(client, past_due)).status_code == 200
    row = await _row(tenant.id)
    assert row.status == SubscriptionStatus.SUSPENDED
    assert row.pagamento_pendente_desde is None

    await db.execute(update(Subscription).where(Subscription.tenant_id == tenant.id).values(status=SubscriptionStatus.ACTIVE))
    await db.commit()
    overdue = _event("invoice.overdue", _invoice("cus_d7", "sub_cus_d7", "in_d7", collection="send_invoice"))
    assert (await _post(client, overdue)).status_code == 200
    assert (await _row(tenant.id)).status == SubscriptionStatus.SUSPENDED

    failed = _event("invoice.payment_failed", _invoice("cus_d7", "sub_cus_d7", "in_d7b", collection="send_invoice"))
    assert (await _post(client, failed)).status_code == 200
    assert (await _row(tenant.id)).pagamento_pendente_desde is None
    assert emails == []


async def test_pix_mensal_ignora_fatura_recusada(client, db, emails, stripe_api):
    tenant = await create_tenant(db, "Terreiro PIX", plan=PlanType.PRO)
    pago_ate = datetime.now(timezone.utc) + timedelta(days=12)
    await db.execute(update(Subscription).where(Subscription.tenant_id == tenant.id).values(
        stripe_customer_id="cus_d8", collection_method="pix_mensal", current_period_end=pago_ate,
    ))
    await db.commit()

    assert (await _post(client, _event("invoice.payment_failed", _invoice("cus_d8", "sub_qualquer", "in_d8")))).status_code == 200

    row = await _row(tenant.id)
    assert row.status == SubscriptionStatus.ACTIVE
    assert row.collection_method == "pix_mensal"
    assert row.pagamento_pendente_desde is None
    assert emails == []


# ── rede de segurança (rodada diária) ────────────────────────────────────────

async def test_rede_de_seguranca_suspende_so_quem_a_stripe_ainda_nao_cobrou(db, emails, stripe_api):
    agora = datetime.now(timezone.utc)
    vencido, _ = await _card_tenant(db, "cus_s1", admins=1, pagamento_pendente_desde=agora - timedelta(days=11),
                                    pagamento_pendente_invoice_id="in_s1")
    pago, _ = await _card_tenant(db, "cus_s2", admins=1, pagamento_pendente_desde=agora - timedelta(days=11),
                                 pagamento_pendente_invoice_id="in_s2")
    recente, _ = await _card_tenant(db, "cus_s3", admins=1, pagamento_pendente_desde=agora - timedelta(days=3))
    boleto, _ = await _card_tenant(db, "cus_s4", admins=1, collection_method="send_invoice",
                                   pagamento_pendente_desde=agora - timedelta(days=20))
    stripe_api["status"].update({"sub_cus_s1": "past_due", "sub_cus_s2": "active"})

    await cobranca_cartao.processar_tolerancia_cartao()

    assert (await _row(vencido.id)).status == SubscriptionStatus.SUSPENDED
    pago_row = await _row(pago.id)
    assert pago_row.status == SubscriptionStatus.ACTIVE and pago_row.pagamento_pendente_desde is None
    assert (await _row(recente.id)).status == SubscriptionStatus.ACTIVE
    assert (await _row(boleto.id)).status == SubscriptionStatus.ACTIVE
    assert sorted(stripe_api["calls"]) == ["sub_cus_s1", "sub_cus_s2"]  # recente/boleto nem consultam
    assert len(emails) == 1 and "suspenso" in emails[0].subject

    # Segunda rodada: já suspenso não entra de novo (nem e-mail repetido).
    await cobranca_cartao.processar_tolerancia_cartao()
    assert len(emails) == 1


async def test_rede_de_seguranca_com_stripe_fora_do_ar_tenta_amanha(db, emails, monkeypatch):
    tenant, _ = await _card_tenant(db, "cus_s5", admins=1,
                                   pagamento_pendente_desde=datetime.now(timezone.utc) - timedelta(days=15))

    def boom(*a, **kw):
        raise _stripe.error.APIConnectionError("fora do ar")

    monkeypatch.setattr(_stripe.Subscription, "retrieve", boom)
    await cobranca_cartao.processar_tolerancia_cartao()

    assert (await _row(tenant.id)).status == SubscriptionStatus.ACTIVE
    assert emails == []


# ── painel: billing, banner, portal, gate e métricas ─────────────────────────

async def test_painel_mostra_pendente_e_gate_libera_durante_a_tolerancia(client, db, emails, stripe_api):
    desde = datetime.now(timezone.utc) - timedelta(days=2)
    tenant, admins = await _card_tenant(db, "cus_p1", admins=1, pagamento_pendente_desde=desde,
                                        pagamento_pendente_invoice_id="in_p1")
    headers = admins[0].headers

    billing = (await client.get("/api/v1/admin/billing", headers=headers)).json()
    assert billing["payment_pending_since"] is not None
    assert billing["payment_grace_days"] == 10
    info = (await client.get("/api/v1/admin/subscription", headers=headers)).json()
    assert info["payment_pending_since"] is not None
    assert info["features"]["site_builder"] is True
    # Recurso do Pro continua liberado durante a tolerância.
    assert (await client.get("/api/v1/admin/sites", headers=headers)).status_code == 200

    # Suspenso: o aviso de pendente some (vale o estado suspenso) e o gate bloqueia.
    await db.execute(update(Subscription).where(Subscription.tenant_id == tenant.id).values(status=SubscriptionStatus.SUSPENDED))
    await db.commit()
    info = (await client.get("/api/v1/admin/subscription", headers=headers)).json()
    assert info["payment_pending_since"] is None
    assert info["status"] == "suspended"
    assert (await client.get("/api/v1/admin/sites", headers=headers)).status_code == 402


@pytest.fixture
def fake_portal(monkeypatch):
    state = {"calls": [], "error": None}

    async def create_billing_portal_session(customer_id):
        state["calls"].append(customer_id)
        if state["error"]:
            raise state["error"]
        return "https://billing.stripe.com/p/session/test_123"

    from src.services import stripe_service

    monkeypatch.setattr(stripe_service, "create_billing_portal_session", create_billing_portal_session)
    return state


async def test_portal_so_admin_e_devolve_url(client, db, fake_portal):
    tenant, admins = await _card_tenant(db, "cus_p2", admins=1)
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="op2")

    resp = await client.post("/api/v1/admin/billing/portal", headers=admins[0].headers)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"portal_url": "https://billing.stripe.com/p/session/test_123"}
    assert fake_portal["calls"] == ["cus_p2"]

    assert (await client.post("/api/v1/admin/billing/portal", headers=operador.headers)).status_code == 403
    assert fake_portal["calls"] == ["cus_p2"]


async def test_portal_recusa_sem_cartao_e_explica_portal_nao_configurado(client, db, fake_portal):
    gratuito = await create_tenant(db, "Gratuito", plan=PlanType.FREE)
    admin_free = await create_user(db, gratuito, UserRole.ADMIN)
    assert (await client.post("/api/v1/admin/billing/portal", headers=admin_free.headers)).status_code == 400

    boleto, admins_boleto = await _card_tenant(db, "cus_p3", admins=1, collection_method="send_invoice")
    assert (await client.post("/api/v1/admin/billing/portal", headers=admins_boleto[0].headers)).status_code == 400
    assert fake_portal["calls"] == []

    _, admins = await _card_tenant(db, "cus_p4", admins=1)
    fake_portal["error"] = _stripe.error.InvalidRequestError(
        "No configuration provided and your test mode default configuration has not been created. Provide a "
        "configuration or create your default by saving your customer portal settings in test mode at "
        "https://dashboard.stripe.com/test/settings/billing/portal.",
        param=None,
    )
    resp = await client.post("/api/v1/admin/billing/portal", headers=admins[0].headers)
    assert resp.status_code == 400
    assert "suporte" in resp.json()["detail"]


async def test_metricas_contam_tolerancia_como_pagante_e_suspenso_nao(client, db):
    agora = datetime.now(timezone.utc)
    tolerancia, _ = await _card_tenant(db, "cus_m1", admins=0, pagamento_pendente_desde=agora - timedelta(days=2))
    suspenso, _ = await _card_tenant(db, "cus_m2", admins=0, status=SubscriptionStatus.SUSPENDED,
                                     pagamento_pendente_desde=agora - timedelta(days=12))
    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")

    summary = (await client.get("/api/v1/platform/billing/statistics/summary", headers=root.headers)).json()
    assert summary["mrr"] == 79.0
    assert summary["paying_tenants"] == 1
    assert summary["suspended_tenants"] == 1

    rows = {r["tenant_id"]: r for r in (await client.get("/api/v1/platform/billing/subscriptions", headers=root.headers)).json()}
    assert rows[str(tolerancia.id)]["category"] == "pagante"
    assert rows[str(tolerancia.id)]["payment_pending_since"] is not None
    assert rows[str(suspenso.id)]["category"] == "suspensa"
    assert rows[str(suspenso.id)]["payment_pending_since"] is None

    tenants = {t["id"]: t for t in (await client.get("/api/v1/platform/tenants", headers=root.headers)).json()}
    assert tenants[str(tolerancia.id)]["payment_pending_since"] is not None
    assert tenants[str(suspenso.id)]["payment_pending_since"] is None
    detalhe = (await client.get(f"/api/v1/platform/tenants/{tolerancia.id}", headers=root.headers)).json()
    assert detalhe["payment_pending_since"] is not None
