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
from sqlalchemy import func, select, update

from src.models.audit_logs import AuditLog
from src.models.stripe_events import StripeEventProcessed
from src.models.subscriptions import Subscription, SubscriptionStatus

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
