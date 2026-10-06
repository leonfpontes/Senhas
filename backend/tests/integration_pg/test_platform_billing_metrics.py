"""MRR da plataforma conta só pagantes (services/billing_metrics.py).

Cenário de produção de 2026-10-06: a aba Assinaturas mostrava R$ 475 de MRR e o painel
Hoje R$ 376 porque teste, bônus e até terreiro excluído entravam na soma.
"""
from datetime import datetime, timezone

from sqlalchemy import update

from src.models.subscriptions import PlanType, Subscription
from src.models.tenants import Tenant
from src.models.users import UserRole

from .factories import create_tenant, create_user


async def _set(db, tenant, **values):
    await db.execute(update(Subscription).where(Subscription.tenant_id == tenant.id).values(**values))
    await db.commit()


async def _cenario(db):
    pagante = await create_tenant(db, "Pagante", PlanType.PRO)
    await _set(db, pagante, stripe_subscription_id="sub_pagante")
    await create_user(db, pagante, UserRole.ADMIN, name="a")
    await create_user(db, pagante, UserRole.OPERATOR, name="b")

    teste = await create_tenant(db, "Em teste", PlanType.PREMIUM)
    await _set(db, teste, is_trial=True)

    bonus = await create_tenant(db, "Piloto", PlanType.PREMIUM)
    await _set(db, bonus, is_bonus=True)

    excluido = await create_tenant(db, "Excluido", PlanType.PREMIUM)
    await _set(db, excluido, stripe_subscription_id="sub_excluido")
    await db.execute(update(Tenant).where(Tenant.id == excluido.id).values(deleted_at=datetime.now(timezone.utc)))
    await db.commit()

    await create_tenant(db, "Gratuito", PlanType.FREE)
    sem_cobranca = await create_tenant(db, "Sem cobranca", PlanType.BASIC)
    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")
    return root, {"pagante": pagante, "teste": teste, "bonus": bonus, "excluido": excluido, "sem": sem_cobranca}


async def test_resumo_conta_so_pagantes(client, db):
    root, _ = await _cenario(db)

    resp = await client.get("/api/v1/platform/billing/statistics/summary", headers=root.headers)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["mrr"] == 79.0
    assert body["paying_tenants"] == 1
    assert body["trial_tenants"] == 1
    assert body["trial_potential_mrr"] == 99.0
    assert body["bonus_tenants"] == 1
    assert body["free_tenants"] == 1
    assert body["unbilled_tenants"] == 1
    assert body["deleted_tenants"] == 1
    assert body["plan_distribution"]["premium"] == 2  # excluído fora


async def test_lista_categoriza_esconde_excluidos_e_conta_usuarios(client, db):
    root, t = await _cenario(db)

    resp = await client.get("/api/v1/platform/billing/subscriptions", headers=root.headers)

    assert resp.status_code == 200, resp.text
    by_id = {row["tenant_id"]: row for row in resp.json()}
    assert str(t["excluido"].id) not in by_id
    assert by_id[str(t["pagante"].id)]["category"] == "pagante"
    assert by_id[str(t["pagante"].id)]["mrr"] == 79.0
    assert by_id[str(t["pagante"].id)]["current_users"] == 2
    assert by_id[str(t["teste"].id)]["category"] == "em_teste"
    assert by_id[str(t["teste"].id)]["mrr"] == 0.0
    assert by_id[str(t["teste"].id)]["potential_mrr"] == 99.0
    assert by_id[str(t["bonus"].id)]["category"] == "bonificado"
    assert by_id[str(t["sem"].id)]["category"] == "sem_cobranca"

    resp = await client.get("/api/v1/platform/billing/subscriptions?include_deleted=true", headers=root.headers)
    excluido = next(r for r in resp.json() if r["tenant_id"] == str(t["excluido"].id))
    assert excluido["category"] == "excluido" and excluido["tenant_deleted"] is True and excluido["mrr"] == 0.0


async def test_painel_hoje_usa_o_mesmo_mrr(client, db):
    root, _ = await _cenario(db)

    resp = await client.get("/api/v1/platform/dashboard", headers=root.headers)

    assert resp.status_code == 200, resp.text
    assert resp.json()["mrr"] == 79.0
