"""AM-16 — Notificação no celular (Web Push) da Área do Médium com Postgres real.

Nenhuma notificação sai de verdade: o agendador recebe um `enviar_push` que só guarda os envios,
ou o `webpush` do pywebpush é trocado por um falso (para exercitar a limpeza de 404/410). Cobre:

- sem as chaves VAPID: API diz `disponivel: false`, ligar responde 409 e o agendador só manda e-mail;
- ligar/desligar só o meu aparelho (idempotente; endpoint só de serviço de push conhecido; o mesmo
  navegador inscrito por outra conta passa a ser dela), recusa sob impersonação, isolamento entre
  terreiros;
- agendador manda push por preferência (e-mail e celular independentes), uma vez só (a marca do
  AM-15 vale para os dois canais), só para os aparelhos do próprio médium;
- 404/410 do serviço de push apagam a inscrição; outras falhas contam `failures`;
- liga/desliga por tipo do celular não mexe no do e-mail; "Mandar um teste".
"""
from __future__ import annotations

import uuid
from datetime import date
from types import SimpleNamespace

import pytest
from pywebpush import WebPushException
from sqlalchemy import select

from src.core.config import settings
from src.models import MediumPreferencia, PushInscricao
from src.models.subscriptions import PlanType
from src.security.jwt import create_access_token
from src.services import web_push
from src.services.medium_lembrete_scheduler import processar_terreiro, processar_todos

from .test_am15_lembretes import Caixa, _brt, _email, _marcas, _medium, _mensalidade, _terreiro

PUSH = "/api/v1/medium/push"
FCM = "https://fcm.googleapis.com/fcm/send/"
CHAVES = {"p256dh": "B" + "x" * 86, "auth": "a" * 22}


@pytest.fixture
def vapid(monkeypatch):
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "BPublicaDeTeste" + "y" * 72)
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "privada-de-teste")
    monkeypatch.setattr(settings, "VAPID_SUBJECT", "mailto:contato@girahub.com.br")


@pytest.fixture
def sem_vapid(monkeypatch):
    for var in ("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"):
        monkeypatch.setattr(settings, var, "")


class Celular:
    """O `enviar_push` dos testes: guarda os envios (nunca manda nada)."""

    def __init__(self) -> None:
        self.envios: list[web_push.Envio] = []

    async def __call__(self, envios: list) -> int:
        self.envios.extend(envios)
        return len(envios)

    def para(self, endpoint: str) -> list:
        return [e for e in self.envios if e.endpoint == endpoint]


async def _ligar(client, actor, endpoint: str):
    return await client.post(f"{PUSH}/inscricao", headers=actor.headers, json={"endpoint": endpoint, "keys": CHAVES})


async def _inscricoes(db, **filtro) -> list[PushInscricao]:
    stmt = select(PushInscricao).execution_options(populate_existing=True)
    for k, v in filtro.items():
        stmt = stmt.where(getattr(PushInscricao, k) == v)
    return list((await db.execute(stmt)).scalars().all())


# ── Desligado sem VAPID ─────────────────────────────────────────────────────


async def test_sem_vapid_fica_desligado_e_so_sai_e_mail(client, db, sem_vapid):
    tenant, _ = await _terreiro(db, plan=PlanType.BASIC)
    await _mensalidade(db, tenant, dia_vencimento=10)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    r = await client.get(PUSH, headers=ana.headers)
    assert r.status_code == 200
    assert r.json()["disponivel"] is False and r.json()["chave_publica"] is None and r.json()["aparelhos"] == 0
    r = await _ligar(client, ana, FCM + "ana")
    assert r.status_code == 409 and r.json()["error_code"] == "PUSH_INDISPONIVEL"
    assert (await client.post(f"{PUSH}/teste", headers=ana.headers)).status_code == 409
    # Inscrição que sobrou de quando estava ligado: o agendador ignora.
    db.add(PushInscricao(tenant_id=tenant.id, user_id=ana.user.id, medium_id=ana_m.id, endpoint=FCM + "velha", **CHAVES))
    await db.commit()
    caixa, celular = Caixa(), Celular()
    assert await processar_terreiro(tenant.id, _brt(date(2026, 11, 7), 10), caixa, celular) == 1
    assert [m.to_email for m in caixa.mensagens] == [_email(ana)] and celular.envios == []


# ── Ligar e desligar o aparelho ─────────────────────────────────────────────


async def test_ligar_e_desligar_so_o_meu_aparelho(client, db, vapid):
    tenant, _ = await _terreiro(db, plan=PlanType.BASIC)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    bia, bia_m = await _medium(db, tenant, "Bia Souza")
    r = await client.get(PUSH, headers=ana.headers)
    assert r.json()["disponivel"] is True and r.json()["chave_publica"] == settings.VAPID_PUBLIC_KEY
    assert r.json()["aparelhos"] == 0 and all(r.json()["preferencias"].values())

    r = await _ligar(client, ana, FCM + "ana-celular")
    assert r.status_code == 200 and r.json()["aparelhos"] == 1
    # De novo (a tela sincroniza ao abrir): continua um, chaves renovadas.
    novas = {"p256dh": "B" + "z" * 86, "auth": "b" * 22}
    r = await client.post(f"{PUSH}/inscricao", headers=ana.headers, json={"endpoint": FCM + "ana-celular", "keys": novas})
    assert r.status_code == 200 and r.json()["aparelhos"] == 1
    (linha,) = await _inscricoes(db, medium_id=ana_m.id)
    assert (linha.tenant_id, linha.user_id, linha.p256dh) == (tenant.id, ana.user.id, novas["p256dh"])
    for ruim in (
        "http://localhost:8000/admin",
        "https://169.254.169.254/latest",
        "https://exemplo.com/push",
        "https://updates.push.services.mozilla.com.local/x",
    ):
        r = await _ligar(client, ana, ruim)
        assert r.status_code == 422, ruim
    assert len(await _inscricoes(db, medium_id=ana_m.id)) == 1
    # Campo a mais (medium_id) não muda de quem é.
    r = await client.post(
        f"{PUSH}/inscricao",
        headers=bia.headers,
        json={"endpoint": FCM + "bia", "keys": CHAVES, "medium_id": str(ana_m.id)},
    )
    assert r.status_code == 200
    assert [i.medium_id for i in await _inscricoes(db, endpoint=FCM + "bia")] == [bia_m.id]

    # Bia não desliga o aparelho da Ana.
    r = await client.request("DELETE", f"{PUSH}/inscricao", headers=bia.headers, json={"endpoint": FCM + "ana-celular"})
    assert r.status_code == 204
    assert len(await _inscricoes(db, medium_id=ana_m.id)) == 1
    # A Ana desliga.
    r = await client.request("DELETE", f"{PUSH}/inscricao", headers=ana.headers, json={"endpoint": FCM + "ana-celular"})
    assert r.status_code == 204
    assert await _inscricoes(db, medium_id=ana_m.id) == []
    assert (await client.get(PUSH, headers=ana.headers)).json()["aparelhos"] == 0

    # Mesmo navegador, outra conta: passa a ser da Bia.
    await _ligar(client, ana, FCM + "celular-da-casa")
    await _ligar(client, bia, FCM + "celular-da-casa")
    assert [i.medium_id for i in await _inscricoes(db, endpoint=FCM + "celular-da-casa")] == [bia_m.id]
    assert (await client.get(PUSH, headers=ana.headers)).json()["aparelhos"] == 0


async def test_impersonacao_so_le(client, db, vapid):
    tenant, _ = await _terreiro(db, plan=PlanType.BASIC)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    await _ligar(client, ana, FCM + "ana")
    token = create_access_token(ana.user.id, tenant.id, "medium", impersonated_by=uuid.uuid4())
    h = {"Authorization": f"Bearer {token}"}
    assert (await client.get(PUSH, headers=h)).json()["aparelhos"] == 1
    assert (await client.post(f"{PUSH}/inscricao", headers=h, json={"endpoint": FCM + "x", "keys": CHAVES})).status_code == 403
    assert (await client.request("DELETE", f"{PUSH}/inscricao", headers=h, json={"endpoint": FCM + "ana"})).status_code == 403
    assert (await client.put(f"{PUSH}/preferencias", headers=h, json={"avisos": False})).status_code == 403
    assert (await client.post(f"{PUSH}/teste", headers=h)).status_code == 403
    assert len(await _inscricoes(db, medium_id=ana_m.id)) == 1


async def test_isolamento_entre_terreiros(client, db, vapid):
    t1, _ = await _terreiro(db, nome="Casa Luz", plan=PlanType.BASIC)
    t2, _ = await _terreiro(db, nome="Casa Mar", plan=PlanType.BASIC)
    await _mensalidade(db, t1, dia_vencimento=10)
    await _mensalidade(db, t2, dia_vencimento=10)
    ana, ana_m = await _medium(db, t1, "Ana Paula")
    zeca, zeca_m = await _medium(db, t2, "Zeca Lopes")
    await _ligar(client, ana, FCM + "ana")
    await _ligar(client, zeca, FCM + "zeca")
    # Zeca não desliga o da Ana nem vê os aparelhos dela.
    await client.request("DELETE", f"{PUSH}/inscricao", headers=zeca.headers, json={"endpoint": FCM + "ana"})
    assert len(await _inscricoes(db, tenant_id=t1.id)) == 1
    assert (await client.get(PUSH, headers=zeca.headers)).json()["aparelhos"] == 1
    celular = Celular()
    await processar_terreiro(t1.id, _brt(date(2026, 11, 7), 10), Caixa(), celular)
    assert [e.endpoint for e in celular.envios] == [FCM + "ana"]
    assert {e.tenant_id for e in celular.envios} == {t1.id}
    celular2 = Celular()
    await processar_todos(_brt(date(2026, 11, 7), 10), Caixa(), celular2)
    # O da Ana já foi; (outros terreiros da suíte ficam de fora da conta)
    assert [e.endpoint for e in celular2.envios if e.tenant_id in (t1.id, t2.id)] == [FCM + "zeca"]


# ── Agendador ───────────────────────────────────────────────────────────────


async def test_agendador_manda_push_por_preferencia_uma_vez_so(client, db, vapid):
    tenant, _ = await _terreiro(db, plan=PlanType.BASIC)
    await _mensalidade(db, tenant, dia_vencimento=10)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")  # e-mail + celular (2 aparelhos)
    bia, bia_m = await _medium(db, tenant, "Bia Souza")  # só celular (desligou o e-mail)
    caio, caio_m = await _medium(db, tenant, "Caio Lima")  # só e-mail (desligou o celular)
    duda, _ = await _medium(db, tenant, "Duda Reis")  # sem aparelho → só e-mail
    eva, eva_m = await _medium(db, tenant, "Eva Melo")  # desligou os dois → nada
    for actor, nome in ((ana, "ana-1"), (ana, "ana-2"), (bia, "bia"), (caio, "caio"), (eva, "eva")):
        assert (await _ligar(client, actor, FCM + nome)).status_code == 200
    await client.put("/api/v1/medium/preferencias", headers=bia.headers, json={"mensalidade": False})
    r = await client.put(f"{PUSH}/preferencias", headers=caio.headers, json={"mensalidade": False})
    assert r.status_code == 200 and r.json()["preferencias"]["mensalidade"] is False
    await client.put("/api/v1/medium/preferencias", headers=eva.headers, json={"mensalidade": False})
    await client.put(f"{PUSH}/preferencias", headers=eva.headers, json={"mensalidade": False})

    agora = _brt(date(2026, 11, 7), 10)
    caixa, celular = Caixa(), Celular()
    # 3 e-mails (Ana, Caio, Duda) + 3 notificações (2 da Ana, 1 da Bia).
    assert await processar_terreiro(tenant.id, agora, caixa, celular) == 6
    assert sorted(m.to_email for m in caixa.mensagens) == sorted([_email(ana), _email(caio), _email(duda)])
    assert sorted(e.endpoint for e in celular.envios) == [FCM + "ana-1", FCM + "ana-2", FCM + "bia"]
    n = celular.envios[0].notificacao
    assert n.title == "Casa Luz"
    assert n.body == "A mensalidade de novembro vence em 3 dias." and n.url == "/medium/mensalidade?pagar=1"
    assert "50" not in n.json()
    # Uma marca por médium (a mesma para e-mail e celular); a segunda rodada não repete nada.
    assert await _marcas(tenant.id) == 4
    caixa2, celular2 = Caixa(), Celular()
    assert await processar_terreiro(tenant.id, _brt(date(2026, 11, 7), 15), caixa2, celular2) == 0
    assert caixa2.mensagens == [] and celular2.envios == []


async def test_aparelho_de_conta_desligada_do_medium_nao_recebe(client, db, vapid):
    tenant, _ = await _terreiro(db, plan=PlanType.BASIC)
    await _mensalidade(db, tenant, dia_vencimento=10)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    await _ligar(client, ana, FCM + "ana")
    # Linha forjada com outro usuário para o médium da Ana: não é do usuário ligado a ela.
    outro, _ = await _medium(db, tenant, "Outro Nome")
    db.add(PushInscricao(tenant_id=tenant.id, user_id=outro.user.id, medium_id=ana_m.id, endpoint=FCM + "x", **CHAVES))
    await db.commit()
    celular = Celular()
    await processar_terreiro(tenant.id, _brt(date(2026, 11, 7), 10), Caixa(), celular)
    assert FCM + "x" not in [e.endpoint for e in celular.envios]
    assert FCM + "ana" in [e.endpoint for e in celular.envios]


async def test_410_apaga_a_inscricao_e_falha_conta(client, db, vapid, monkeypatch):
    tenant, _ = await _terreiro(db, plan=PlanType.BASIC)
    await _mensalidade(db, tenant, dia_vencimento=10)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    for nome in ("vivo", "sumiu", "404", "instavel"):
        await _ligar(client, ana, FCM + nome)
    respostas = {FCM + "sumiu": 410, FCM + "404": 404, FCM + "instavel": 500}
    chamadas: list[dict] = []

    def falso_webpush(subscription_info, data, **kw):
        chamadas.append({"endpoint": subscription_info["endpoint"], "data": data, **kw})
        status = respostas.get(subscription_info["endpoint"])
        if status:
            raise WebPushException("falhou", response=SimpleNamespace(status_code=status, text="", headers={}))
        return SimpleNamespace(status_code=201)

    monkeypatch.setattr(web_push, "webpush", falso_webpush)
    # Envio padrão (services/web_push.enviar), como em produção.
    assert await processar_terreiro(tenant.id, _brt(date(2026, 11, 7), 10), Caixa()) == 5
    assert len(chamadas) == 4
    assert all(c["vapid_claims"] == {"sub": "mailto:contato@girahub.com.br"} for c in chamadas)
    assert all(c["ttl"] == web_push.TTL_S and c["vapid_private_key"] == "privada-de-teste" for c in chamadas)
    restantes = {i.endpoint: i for i in await _inscricoes(db, medium_id=ana_m.id)}
    assert set(restantes) == {FCM + "vivo", FCM + "instavel"}
    assert restantes[FCM + "vivo"].last_success_at is not None and restantes[FCM + "vivo"].failures == 0
    assert restantes[FCM + "instavel"].failures == 1 and restantes[FCM + "instavel"].last_success_at is None
    # Falhas seguidas demais também apagam.
    for _ in range(web_push.MAX_FALHAS):
        await client.post(f"{PUSH}/teste", headers=ana.headers)
    assert set(i.endpoint for i in await _inscricoes(db, medium_id=ana_m.id)) == {FCM + "vivo"}


async def test_preferencias_do_celular_separadas_do_e_mail_e_teste(client, db, vapid, monkeypatch):
    tenant, _ = await _terreiro(db, plan=PlanType.BASIC)
    await _mensalidade(db, tenant)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    r = await client.put(f"{PUSH}/preferencias", headers=ana.headers, json={"avisos": False, "faltas": False})
    assert r.status_code == 200
    assert r.json()["preferencias"] == {
        "mensalidade": True,
        "escalas": True,
        "confirmacao": True,
        "faltas": False,
        "avisos": False,
    }
    assert r.json()["disponiveis"] == ["mensalidade", "escalas", "confirmacao", "faltas", "avisos"]
    assert all((await client.get("/api/v1/medium/preferencias", headers=ana.headers)).json()["preferencias"].values())
    pref = (await db.execute(select(MediumPreferencia).where(MediumPreferencia.medium_id == ana_m.id))).scalar_one()
    await db.refresh(pref)
    assert (pref.push_avisos, pref.email_avisos) == (False, True)
    assert (await client.put(f"{PUSH}/preferencias", headers=ana.headers, json={"push_avisos": True})).status_code == 422

    # Teste: sem aparelho → 409; com aparelho → manda para ele.
    r = await client.post(f"{PUSH}/teste", headers=ana.headers)
    assert r.status_code == 409 and r.json()["error_code"] == "PUSH_SEM_APARELHO"
    await _ligar(client, ana, FCM + "ana")
    enviados: list[str] = []
    monkeypatch.setattr(web_push, "webpush", lambda subscription_info, data, **kw: enviados.append(data))
    r = await client.post(f"{PUSH}/teste", headers=ana.headers)
    assert r.status_code == 200 and r.json() == {"enviadas": 1}
    assert '"url": "/medium/perfil"' in enviados[0] and "Casa Luz" in enviados[0]
