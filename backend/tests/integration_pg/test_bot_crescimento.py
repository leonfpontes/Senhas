"""Bot Crescimento — conteúdo da rota só de leitura, com Postgres real.

Confere status/plano por terreiro, giras do mês, último acesso, totais e MRR pelos preços
vigentes; que o demo e os apagados ficam de fora; e que nenhum dado pessoal de usuário sai.
O 401 está em tests/unit/test_bot_crescimento_auth.py.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select, update

from src.api.v1.bots import crescimento as mod
from src.core.config import settings
from src.models.giras import Gira
from src.models.subscriptions import PlanType, Subscription, SubscriptionStatus
from src.models.tenants import Tenant
from src.models.user_sessions import UserSession

from .factories import create_gira, create_tenant, create_user

URL = "/api/v1/bots/crescimento/resumo"
TOKEN = "c" * 64
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture(autouse=True)
def _token(monkeypatch):
    monkeypatch.setattr(settings, "GIRAHUB_READ_TOKEN", TOKEN)
    mod.limiter.reset()


async def _assinatura(db, tenant, **valores):
    await db.execute(update(Subscription).where(Subscription.tenant_id == tenant.id).values(**valores))
    await db.commit()


async def test_resumo_do_funil(client, db):
    agora = datetime.now(timezone.utc)
    fim_teste = agora + timedelta(days=5)

    pagante = await create_tenant(db, "Casa Pagante", plan=PlanType.PRO)
    await _assinatura(db, pagante, stripe_subscription_id=f"sub_{uuid.uuid4().hex[:10]}")
    gira = await create_gira(db, pagante)
    await db.execute(update(Gira).where(Gira.id == gira.id).values(data_inicio=agora))
    gira_antiga = await create_gira(db, pagante)  # mês passado: não conta
    await db.execute(update(Gira).where(Gira.id == gira_antiga.id).values(data_inicio=agora - timedelta(days=40)))
    await db.commit()
    dono = await create_user(db, pagante, name="pessoa-sigilosa")
    acesso = agora - timedelta(hours=3)
    db.add(
        UserSession(
            user_id=dono.user.id, tenant_id=pagante.id, current_jti=str(uuid.uuid4()),
            orig_iat=acesso, expires_at=agora + timedelta(days=1), last_used_at=acesso,
        )
    )
    await db.commit()

    em_teste = await create_tenant(db, "Casa Em Teste", plan=PlanType.BASIC)
    await _assinatura(db, em_teste, is_trial=True, trial_ends_at=fim_teste)

    cancelada = await create_tenant(db, "Casa Cancelada", plan=PlanType.BASIC)
    await _assinatura(db, cancelada, status=SubscriptionStatus.CANCELLED)

    gratuita = await create_tenant(db, "Casa Gratuita", plan=PlanType.FREE)

    inativa = await create_tenant(db, "Casa Inativa", plan=PlanType.PREMIUM)
    await db.execute(update(Tenant).where(Tenant.id == inativa.id).values(self_deactivated_at=agora))

    demo = await create_tenant(db, "Demo")
    await db.execute(update(Tenant).where(Tenant.id == demo.id).values(slug=mod.DEMO_TENANT_SLUG))
    apagada = await create_tenant(db, "Casa Apagada")
    await db.execute(update(Tenant).where(Tenant.id == apagada.id).values(deleted_at=agora))
    await db.commit()

    r = await client.get(URL, headers=AUTH)
    assert r.status_code == 200, r.text
    corpo = r.json()

    por_id = {t["id"]: t for t in corpo["terreiros"]}
    assert str(demo.id) not in por_id and str(apagada.id) not in por_id
    assert set(por_id) == {str(t.id) for t in (pagante, em_teste, cancelada, gratuita, inativa)}

    p = por_id[str(pagante.id)]
    assert (p["nome"], p["plano"], p["status"], p["giras_no_mes"]) == ("Casa Pagante", "pro", "pagante", 1)
    assert p["fim_do_teste"] is None
    assert datetime.fromisoformat(p["ultimo_acesso"]) == acesso
    assert p["criado_em"]

    t = por_id[str(em_teste.id)]
    assert (t["plano"], t["status"], t["ultimo_acesso"]) == ("basic", "teste", None)
    assert datetime.fromisoformat(t["fim_do_teste"]) == fim_teste

    assert por_id[str(cancelada.id)]["status"] == "cancelado"
    assert (por_id[str(gratuita.id)]["plano"], por_id[str(gratuita.id)]["status"]) == ("free", "gratuito")
    assert por_id[str(inativa.id)]["status"] == "inativo"

    tot = corpo["totais"]
    assert tot["terreiros"] == 5
    assert tot["por_plano"] == {"free": 1, "basic": 2, "pro": 1, "premium": 1}
    assert tot["por_status"]["pagante"] == 1 and tot["por_status"]["teste"] == 1
    assert tot["por_status"]["cancelado"] == 1 and tot["por_status"]["inativo"] == 1
    assert tot["por_status"]["gratuito"] == 1
    assert tot["por_status_e_plano"]["teste"]["basic"] == 1
    assert tot["mrr_estimado"] == 79.0  # só o pagante, pelo preço vigente do Pro
    assert tot["mrr_potencial_testes"] == 49.0
    assert corpo["precos_vigentes"] == {"free": 0.0, "basic": 49.0, "pro": 79.0, "premium": 99.0}
    assert r.headers["cache-control"] == "no-store"

    # Nenhum dado pessoal de usuário sai na resposta.
    assert dono.user.email not in r.text and "pessoa-sigilosa" not in r.text.lower()


async def test_mrr_usa_preco_vigente_e_nao_o_gravado(client, db):
    """Assinatura antiga gravada com outro preço entra no MRR pelo preço atual do plano."""
    casa = await create_tenant(db, "Casa Preco Antigo", plan=PlanType.BASIC)
    await _assinatura(db, casa, stripe_subscription_id=f"sub_{uuid.uuid4().hex[:10]}", monthly_price=29.0)

    corpo = (await client.get(URL, headers=AUTH)).json()
    casa_json = next(t for t in corpo["terreiros"] if t["id"] == str(casa.id))
    assert casa_json["status"] == "pagante"
    assert corpo["totais"]["mrr_estimado"] == 49.0


async def test_rota_nao_escreve_no_banco(client, db):
    await create_tenant(db, "Casa Leitura")
    antes = await db.scalar(select(func.count(Tenant.id)))
    assert (await client.get(URL, headers=AUTH)).status_code == 200
    assert await db.scalar(select(func.count(Tenant.id))) == antes


async def test_sem_token_401_com_app_inteiro(client):
    assert (await client.get(URL)).status_code == 401
    assert (await client.get(URL, headers={"Authorization": "Bearer errado"})).status_code == 401
