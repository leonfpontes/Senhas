"""AM-18 — Escala de gira por função com Postgres real (migrações + app inteiro via HTTP).

- Monta a escala da gira por função, com médiuns um a um e com um grupo inteiro (membros ativos
  que o tipo alcança, origem "grupo"), pela âncora da gira.
- Um médium tem uma função por gira (a mesma linha da presença); trocar de função muda a linha;
  tirar da função numa gira ("todos os elegíveis") só limpa a função — segue esperado; em tipo
  "só escalados" marca `dispensado_em` e guarda a função; voltar tira a dispensa.
- "Copiar da gira anterior" e rodízio de uma função entre médiuns ou grupos pelas próximas giras.
- O médium vê a própria função (Agenda, Início, Minhas presenças) — e não a vê depois de tirado.
- Tipo sem escala por função → 409; outro terreiro → 404/422 sem gravar; sem o plano `escalas`
  (Pro) → 403; chave do piloto desligada → 403; só `ESCALAS:view` não salva.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select, update

from src.models import Atividade, AtividadeParticipacao, Gira, Medium
from src.models.atividades import AtividadeTipo, FuncaoCorrente
from src.models.audit_logs import AuditLog
from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.users import UserRole
from src.services.atividades import ensure_default_atividade_tipos

from .factories import create_tenant, create_user, grant

ADMIN = "/api/v1/admin/atividades"
GRUPOS = "/api/v1/admin/corrente-grupos"
MEDIUM = "/api/v1/medium"


@pytest.fixture(autouse=True)
def _sem_cookies(client):
    client.cookies.clear()
    yield
    client.cookies.clear()


def _agora() -> datetime:
    return datetime.now(timezone.utc)


async def _cenario(db, nome="Terreiro AM18", plan=PlanType.PRO, liberada=True):
    tenant = await create_tenant(db, name=nome, plan=plan, area_medium_liberada=liberada)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="dirigente")
    await ensure_default_atividade_tipos(db, tenant.id)
    await db.commit()
    return tenant, admin


async def _medium(db, tenant, nome, *, atendimento=True):
    actor = await create_user(db, tenant, UserRole.MEDIUM, name=nome.split()[0].lower())
    medium = Medium(tenant_id=tenant.id, nome=nome, is_atendimento=atendimento, user_id=actor.user.id)
    db.add(medium)
    await db.commit()
    return actor, medium


async def _gira(db, tenant, dias, nome="Gira de Caboclos") -> Gira:
    gira = Gira(tenant_id=tenant.id, nome=nome, data_inicio=_agora() + timedelta(days=dias), is_active=True)
    db.add(gira)
    await db.commit()
    return gira


async def _grupo(client, admin, nome, mediuns) -> str:
    resp = await client.post(GRUPOS, headers=admin.headers, json={"nome": nome, "medium_ids": [str(m.id) for m in mediuns]})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _funcoes(db, tenant) -> dict[str, uuid.UUID]:
    rows = await db.execute(select(FuncaoCorrente.nome, FuncaoCorrente.id).where(FuncaoCorrente.tenant_id == tenant.id))
    return dict(rows.all())


async def _abrir(client, actor, gira) -> str:
    resp = await client.post(f"{ADMIN}/da-gira/{gira.id}/escala", headers=actor.headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["atividade_id"]


def _pedido(funcao_id, mediuns=(), grupos=()):
    return {"funcao_id": str(funcao_id), "medium_ids": [str(m.id) for m in mediuns], "grupo_ids": [str(g) for g in grupos]}


async def _salvar(client, actor, atividade_id, *pedidos):
    return await client.put(f"{ADMIN}/{atividade_id}/escala", headers=actor.headers, json={"funcoes": list(pedidos)})


async def _linhas(atividade_id) -> dict:
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        rows = await fresh.execute(
            select(AtividadeParticipacao).where(AtividadeParticipacao.atividade_id == uuid.UUID(str(atividade_id)))
        )
        return {p.medium_id: p for p in rows.scalars()}


def _na_funcao(escala: dict, nome: str) -> dict:
    return next(f for f in escala["funcoes"] if f["nome"] == nome)


def _nomes(funcao: dict) -> list[str]:
    return sorted([p["nome"] for p in funcao["mediuns"]] + [p["nome"] for g in funcao["grupos"] for p in g["mediuns"]])


# ── 1. Por função, com médiuns e com grupo inteiro ──────────────────────────


async def test_escala_por_funcao_com_mediuns_e_grupo_inteiro(client, db):
    tenant, admin = await _cenario(db)
    _, ana = await _medium(db, tenant, "Ana Paula")
    _, beto = await _medium(db, tenant, "Beto Lima")
    _, caio = await _medium(db, tenant, "Caio Silva")
    _, dani = await _medium(db, tenant, "Dani Souza")
    g1 = await _grupo(client, admin, "G1", [caio, dani])
    # Dani saiu da casa depois de entrar no grupo: não entra pela escala do grupo.
    await db.execute(update(Medium).where(Medium.id == dani.id).values(is_active=False))
    await db.commit()
    funcoes = await _funcoes(db, tenant)
    gira = await _gira(db, tenant, 2)

    atividade_id = await _abrir(client, admin, gira)
    vazia = (await client.get(f"{ADMIN}/{atividade_id}/escala", headers=admin.headers)).json()
    assert [f["nome"] for f in vazia["funcoes"]][:2] == ["Cambone", "Porteiro"]
    assert vazia["total_na_escala"] == 0 and vazia["anterior"] is None and vazia["atividade"]["pode_editar"]
    assert {m["nome"] for m in vazia["elegiveis"]} == {"Ana Paula", "Beto Lima", "Caio Silva"}
    assert vazia["atividade"]["origem"] == "gira" and vazia["atividade"]["ref_id"] == str(gira.id)

    resp = await _salvar(
        client, admin, atividade_id,
        _pedido(funcoes["Cambone"], [ana, beto]),
        _pedido(funcoes["Porteiro"], grupos=[g1]),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["resultado"]["novos"] == 3 and body["resultado"]["tirados"] == 0
    assert body["total_na_escala"] == 3
    cambone, porteiro = _na_funcao(body, "Cambone"), _na_funcao(body, "Porteiro")
    assert [p["nome"] for p in cambone["mediuns"]] == ["Ana Paula", "Beto Lima"] and cambone["grupos"] == []
    assert porteiro["mediuns"] == [] and [(g["nome"], [p["nome"] for p in g["mediuns"]]) for g in porteiro["grupos"]] == [
        ("G1", ["Caio Silva"])
    ]
    linhas = await _linhas(atividade_id)
    assert set(linhas) == {ana.id, beto.id, caio.id}
    assert (linhas[ana.id].funcao_id, linhas[ana.id].origem, linhas[ana.id].convocado) == (funcoes["Cambone"], "funcao", True)
    assert (linhas[caio.id].funcao_id, linhas[caio.id].origem, str(linhas[caio.id].grupo_id)) == (
        funcoes["Porteiro"], "grupo", g1,
    )
    # A âncora é uma só (abrir de novo não cria outra) e a auditoria guarda só ids.
    assert await _abrir(client, admin, gira) == atividade_id
    log = (
        await db.execute(
            select(AuditLog).where(AuditLog.tenant_id == tenant.id, AuditLog.resource_type == "atividade_escala")
        )
    ).scalars().all()[-1]
    assert log.details["new_state"]["funcoes"][str(ana.id)] == str(funcoes["Cambone"]) and "Ana" not in str(log.details)


# ── 2. Uma função por médium; trocar; tirar da função (segue esperado) ─────


async def test_uma_funcao_por_medium_trocar_e_tirar_da_escala(client, db):
    tenant, admin = await _cenario(db)
    ana_actor, ana = await _medium(db, tenant, "Ana Paula")
    beto_actor, beto = await _medium(db, tenant, "Beto Lima")
    funcoes = await _funcoes(db, tenant)
    gira = await _gira(db, tenant, 3)
    atividade_id = await _abrir(client, admin, gira)

    duas = await _salvar(client, admin, atividade_id, _pedido(funcoes["Cambone"], [ana]), _pedido(funcoes["Porteiro"], [ana]))
    assert duas.status_code == 422, duas.text
    assert await _linhas(atividade_id) == {}

    # Beto já respondeu "vou" antes da escala: a resposta fica.
    r = await client.post(f"{MEDIUM}/atividades/gira/{gira.id}/resposta", headers=beto_actor.headers, json={"resposta": "vou"})
    assert r.status_code == 200, r.text
    assert (await _salvar(client, admin, atividade_id, _pedido(funcoes["Cambone"], [ana, beto]))).status_code == 200
    linha_ana = (await _linhas(atividade_id))[ana.id]

    troca = await _salvar(
        client, admin, atividade_id, _pedido(funcoes["Cambone"], [beto]), _pedido(funcoes["Porteiro"], [ana])
    )
    assert troca.status_code == 200, troca.text
    assert (troca.json()["resultado"]["trocados"], troca.json()["resultado"]["mantidos"]) == (1, 1)
    linhas = await _linhas(atividade_id)
    assert len(linhas) == 2 and linhas[ana.id].id == linha_ana.id  # a mesma linha, só mudou a função
    assert linhas[ana.id].funcao_id == funcoes["Porteiro"] and linhas[beto.id].resposta == "vou"

    # Tirar a Ana da função: a gira é "todos os elegíveis" — ela só perde a função e segue esperada.
    tirar = await _salvar(client, admin, atividade_id, _pedido(funcoes["Cambone"], [beto]))
    assert tirar.json()["resultado"]["tirados"] == 1
    linhas = await _linhas(atividade_id)
    assert (linhas[ana.id].dispensado_em, linhas[ana.id].funcao_id, linhas[ana.id].origem) == (None, None, "elegivel")
    escala = tirar.json()
    assert escala["tirados"] == []
    assert _nomes(_na_funcao(escala, "Porteiro")) == []
    det = (await client.get(f"{MEDIUM}/agenda/gira/{gira.id}", headers=ana_actor.headers)).json()
    assert det["minha_participacao"]["situacao"] != "dispensado" and det["minha_participacao"]["funcao"] is None
    assert det["minha_participacao"]["convocado"]

    # Voltar para a escala tira a dispensa.
    volta = await _salvar(client, admin, atividade_id, _pedido(funcoes["Cambone"], [beto]), _pedido(funcoes["Ogã/Atabaque"], [ana]))
    assert volta.json()["resultado"]["novos"] == 1
    linhas = await _linhas(atividade_id)
    assert linhas[ana.id].dispensado_em is None and linhas[ana.id].funcao_id == funcoes["Ogã/Atabaque"]


# ── 3. Copiar da gira anterior ──────────────────────────────────────────────


async def test_copiar_da_gira_anterior(client, db):
    tenant, admin = await _cenario(db)
    _, ana = await _medium(db, tenant, "Ana Paula")
    _, beto = await _medium(db, tenant, "Beto Lima")
    _, caio = await _medium(db, tenant, "Caio Silva")
    g1 = await _grupo(client, admin, "G1", [beto])
    funcoes = await _funcoes(db, tenant)
    sabado = await _gira(db, tenant, 2, "Gira de sábado")
    proximo = await _gira(db, tenant, 9, "Gira do outro sábado")
    primeira = await _abrir(client, admin, sabado)
    segunda = await _abrir(client, admin, proximo)

    sem = await client.post(f"{ADMIN}/{primeira}/escala/copiar-anterior", headers=admin.headers)
    assert sem.status_code == 409, sem.text

    await _salvar(client, admin, primeira, _pedido(funcoes["Cambone"], [ana]), _pedido(funcoes["Porteiro"], grupos=[g1]))
    # O G1 ganhou o Caio depois: a cópia entra com os membros de hoje.
    resp = await client.put(f"{GRUPOS}/{g1}", headers=admin.headers, json={"medium_ids": [str(beto.id), str(caio.id)]})
    assert resp.status_code == 200, resp.text
    antes = (await client.get(f"{ADMIN}/{segunda}/escala", headers=admin.headers)).json()
    assert antes["anterior"]["atividade_id"] == primeira and antes["anterior"]["titulo"] == "Gira de sábado"

    copia = await client.post(f"{ADMIN}/{segunda}/escala/copiar-anterior", headers=admin.headers)
    assert copia.status_code == 200, copia.text
    body = copia.json()
    assert _nomes(_na_funcao(body, "Cambone")) == ["Ana Paula"]
    assert [g["nome"] for g in _na_funcao(body, "Porteiro")["grupos"]] == ["G1"]
    assert _nomes(_na_funcao(body, "Porteiro")) == ["Beto Lima", "Caio Silva"]
    # A primeira gira não mudou.
    assert set(await _linhas(primeira)) == {ana.id, beto.id}


# ── 4. Rodízio pelas próximas giras ─────────────────────────────────────────


async def test_rodizio_entre_mediuns_e_entre_grupos_pelas_proximas_giras(client, db):
    tenant, admin = await _cenario(db)
    _, ana = await _medium(db, tenant, "Ana Paula")
    _, beto = await _medium(db, tenant, "Beto Lima")
    _, caio = await _medium(db, tenant, "Caio Silva")
    _, dani = await _medium(db, tenant, "Dani Souza")
    g1 = await _grupo(client, admin, "G1", [caio])
    g2 = await _grupo(client, admin, "G2", [dani])
    funcoes = await _funcoes(db, tenant)
    giras = [await _gira(db, tenant, d, f"Gira {i}") for i, d in enumerate((2, 9, 16), start=1)]
    # Uma gira cancelada no meio não entra no rodízio.
    cancelada = Gira(tenant_id=tenant.id, nome="Cancelada", data_inicio=_agora() + timedelta(days=5), is_active=False)
    db.add(cancelada)
    await db.commit()
    primeira = await _abrir(client, admin, giras[0])
    # Na Gira 2 a Ana já é Porteiro: o rodízio do Cambone não tira ela de lá.
    segunda = await _abrir(client, admin, giras[1])
    await _salvar(client, admin, segunda, _pedido(funcoes["Porteiro"], [ana]))

    resp = await client.post(
        f"{ADMIN}/{primeira}/escala/rodizio",
        headers=admin.headers,
        json={"funcao_id": str(funcoes["Cambone"]), "medium_ids": [str(ana.id), str(beto.id)], "quantidade": 3},
    )
    assert resp.status_code == 200, resp.text
    feitos = resp.json()["rodizio"]
    assert [(f["titulo"], f["escolhidos"]) for f in feitos] == [
        ("Gira 1", ["Ana Paula"]),
        ("Gira 2", ["Beto Lima"]),
        ("Gira 3", ["Ana Paula"]),  # deu a volta
    ]
    ancoras = {
        g.id: a.id
        for g, a in (
            await db.execute(select(Gira, Atividade).join(Atividade, Atividade.gira_id == Gira.id).where(Gira.tenant_id == tenant.id))
        ).all()
    }
    assert cancelada.id not in ancoras
    l1, l2, l3 = [await _linhas(ancoras[g.id]) for g in giras]
    assert (l1[ana.id].funcao_id, l1[ana.id].origem) == (funcoes["Cambone"], "rodizio")
    assert l2[beto.id].funcao_id == funcoes["Cambone"] and l2[ana.id].funcao_id == funcoes["Porteiro"]
    assert l3[ana.id].funcao_id == funcoes["Cambone"]

    # Grupos: G1 na 1ª, G2 na 2ª (o Cambone de antes fica; só o Porteiro gira).
    resp = await client.post(
        f"{ADMIN}/{primeira}/escala/rodizio",
        headers=admin.headers,
        json={"funcao_id": str(funcoes["Ogã/Atabaque"]), "grupo_ids": [g1, g2], "quantidade": 2},
    )
    assert resp.status_code == 200, resp.text
    assert [f["escolhidos"] for f in resp.json()["rodizio"]] == [["G1"], ["G2"]]
    l1, l2 = await _linhas(ancoras[giras[0].id]), await _linhas(ancoras[giras[1].id])
    assert (l1[caio.id].funcao_id, l1[caio.id].origem, str(l1[caio.id].grupo_id)) == (funcoes["Ogã/Atabaque"], "grupo", g1)
    assert l2[dani.id].funcao_id == funcoes["Ogã/Atabaque"] and l1[ana.id].funcao_id == funcoes["Cambone"]

    # Rodízio de novo no Cambone, só com o Beto: na 1ª a Ana sai da função (segue na gira) e o Beto entra.
    resp = await client.post(
        f"{ADMIN}/{primeira}/escala/rodizio",
        headers=admin.headers,
        json={"funcao_id": str(funcoes["Cambone"]), "medium_ids": [str(beto.id)], "quantidade": 1},
    )
    l1 = await _linhas(ancoras[giras[0].id])
    assert (l1[ana.id].dispensado_em, l1[ana.id].funcao_id) == (None, None)
    assert l1[beto.id].funcao_id == funcoes["Cambone"]


async def test_atividade_com_escala_por_funcao_e_tipo_sem_escala(client, db):
    tenant, admin = await _cenario(db)
    _, ana = await _medium(db, tenant, "Ana Paula")
    _, beto = await _medium(db, tenant, "Beto Lima")
    funcoes = await _funcoes(db, tenant)
    reuniao = (
        await db.execute(select(AtividadeTipo).where(AtividadeTipo.tenant_id == tenant.id, AtividadeTipo.nome == "Reunião"))
    ).scalar_one()

    async def _reuniao(dias):
        inicio = (_agora() + timedelta(days=dias)).isoformat()
        resp = await client.post(ADMIN, headers=admin.headers, json={"tipo_id": str(reuniao.id), "titulo": f"Reunião {dias}", "inicio": inicio})
        assert resp.status_code == 201, resp.text
        return resp.json()["id"]

    r1, r2 = await _reuniao(3), await _reuniao(10)
    # "Reunião" nasce sem escala por função.
    assert (await client.get(f"{ADMIN}/{r1}/escala", headers=admin.headers)).status_code == 409
    assert (await _salvar(client, admin, r1, _pedido(funcoes["Cozinha"], [ana]))).status_code == 409
    await db.execute(update(AtividadeTipo).where(AtividadeTipo.id == reuniao.id).values(modo_escala="funcoes"))
    await db.commit()
    resp = await client.post(
        f"{ADMIN}/{r1}/escala/rodizio",
        headers=admin.headers,
        json={"funcao_id": str(funcoes["Cozinha"]), "medium_ids": [str(ana.id), str(beto.id)], "quantidade": 2},
    )
    assert resp.status_code == 200, resp.text
    assert [f["escolhidos"] for f in resp.json()["rodizio"]] == [["Ana Paula"], ["Beto Lima"]]
    assert (await _linhas(r2))[beto.id].funcao_id == funcoes["Cozinha"]
    # Cancelada: a escala não muda (409).
    assert (await client.post(f"{ADMIN}/{r2}/cancelar", headers=admin.headers, json={"motivo": "Chuva"})).status_code == 200
    assert (await _salvar(client, admin, r2, _pedido(funcoes["Cozinha"], [ana]))).status_code == 409


async def test_tipo_so_escalados_tirar_da_funcao_dispensa(client, db):
    tenant, admin = await _cenario(db)
    ana_actor, ana = await _medium(db, tenant, "Ana Paula")
    _, beto = await _medium(db, tenant, "Beto Lima")
    funcoes = await _funcoes(db, tenant)
    tipo = (
        await db.execute(
            select(AtividadeTipo).where(AtividadeTipo.tenant_id == tenant.id, AtividadeTipo.nome == "Organização interna")
        )
    ).scalar_one()
    assert tipo.convocacao_padrao == "so_escalados"
    await db.execute(update(AtividadeTipo).where(AtividadeTipo.id == tipo.id).values(modo_escala="funcoes"))
    await db.commit()
    inicio = (_agora() + timedelta(days=4)).isoformat()
    resp = await client.post(ADMIN, headers=admin.headers, json={"tipo_id": str(tipo.id), "titulo": "Mutirão", "inicio": inicio})
    assert resp.status_code == 201, resp.text
    atividade_id = resp.json()["id"]

    assert (await _salvar(client, admin, atividade_id, _pedido(funcoes["Cozinha"], [ana, beto]))).status_code == 200
    tirar = await _salvar(client, admin, atividade_id, _pedido(funcoes["Cozinha"], [beto]))
    assert tirar.status_code == 200, tirar.text
    linhas = await _linhas(atividade_id)
    # Só escalados: quem sai da função sai da atividade (dispensado, função guardada no histórico).
    assert linhas[ana.id].dispensado_em is not None and linhas[ana.id].funcao_id == funcoes["Cozinha"]
    assert [(t["nome"], t["funcao"]) for t in tirar.json()["tirados"]] == [("Ana Paula", "Cozinha")]


# ── 5. O médium vê a própria função ─────────────────────────────────────────


async def test_medium_ve_a_propria_funcao(client, db):
    tenant, admin = await _cenario(db)
    ana_actor, ana = await _medium(db, tenant, "Ana Paula")
    beto_actor, beto = await _medium(db, tenant, "Beto Lima")
    funcoes = await _funcoes(db, tenant)
    gira = await _gira(db, tenant, 2, "Gira de sábado")
    atividade_id = await _abrir(client, admin, gira)
    await _salvar(client, admin, atividade_id, _pedido(funcoes["Cambone"], [ana]))

    det = (await client.get(f"{MEDIUM}/agenda/gira/{gira.id}", headers=ana_actor.headers)).json()
    assert det["minha_participacao"]["funcao"] == "Cambone" and det["minha_participacao"]["convocado"]
    agenda = (await client.get(f"{MEDIUM}/agenda", headers=ana_actor.headers)).json()
    item = next(i for i in agenda["itens"] if i["id"] == str(gira.id))
    assert item["minha_participacao"]["funcao"] == "Cambone"
    inicio = (await client.get(f"{MEDIUM}/inicio", headers=ana_actor.headers)).json()
    assert [e["minha_participacao"]["funcao"] for e in inicio["escalas"]] == ["Cambone"]
    presencas = (await client.get(f"{MEDIUM}/presencas", headers=ana_actor.headers)).json()
    assert presencas["proximas"][0]["minha_participacao"]["funcao"] == "Cambone"
    # Beto, sem função, continua na gira (todos os elegíveis) e não vê a função de ninguém.
    beto_det = (await client.get(f"{MEDIUM}/agenda/gira/{gira.id}", headers=beto_actor.headers)).json()
    assert beto_det["minha_participacao"]["convocado"] and beto_det["minha_participacao"]["funcao"] is None
    assert "Ana" not in str(beto_det)


# ── 6. Isolamento, permissão e plano ────────────────────────────────────────


async def test_outro_terreiro_e_recusado_sem_gravar(client, db):
    tenant, admin = await _cenario(db)
    tenant_b, admin_b = await _cenario(db, nome="Terreiro B")
    _, ana = await _medium(db, tenant, "Ana Paula")
    _, medium_b = await _medium(db, tenant_b, "Zeca de B")
    grupo_b = await _grupo(client, admin_b, "G de B", [medium_b])
    funcoes = await _funcoes(db, tenant)
    funcoes_b = await _funcoes(db, tenant_b)
    gira = await _gira(db, tenant, 2)
    gira_b = await _gira(db, tenant_b, 2)
    atividade_id = await _abrir(client, admin, gira)
    atividade_b = await _abrir(client, admin_b, gira_b)
    h = admin.headers

    # Função, médium e grupo de B no corpo → 422, nada gravado.
    for pedido in (
        _pedido(funcoes_b["Cambone"], [ana]),
        _pedido(funcoes["Cambone"], [medium_b]),
        _pedido(funcoes["Cambone"], grupos=[grupo_b]),
    ):
        resp = await _salvar(client, admin, atividade_id, pedido)
        assert resp.status_code == 422, resp.text
    for corpo in (
        {"funcao_id": str(funcoes_b["Cambone"]), "medium_ids": [str(ana.id)]},
        {"funcao_id": str(funcoes["Cambone"]), "medium_ids": [str(medium_b.id)]},
        {"funcao_id": str(funcoes["Cambone"]), "grupo_ids": [grupo_b]},
    ):
        resp = await client.post(f"{ADMIN}/{atividade_id}/escala/rodizio", headers=h, json=corpo)
        assert resp.status_code == 422, resp.text
    assert await _linhas(atividade_id) == {}

    # Atividade e gira de B no caminho → 404.
    assert (await client.get(f"{ADMIN}/{atividade_b}/escala", headers=h)).status_code == 404
    assert (await _salvar(client, admin, atividade_b, _pedido(funcoes["Cambone"], [ana]))).status_code == 404
    assert (await client.post(f"{ADMIN}/{atividade_b}/escala/copiar-anterior", headers=h)).status_code == 404
    assert (await client.post(f"{ADMIN}/da-gira/{gira_b.id}/escala", headers=h)).status_code == 404
    assert await _linhas(atividade_b) == {}


async def test_permissao_de_grupo_view_e_edit(client, db):
    tenant, admin = await _cenario(db)
    _, ana = await _medium(db, tenant, "Ana Paula")
    funcoes = await _funcoes(db, tenant)
    gira = await _gira(db, tenant, 2)
    atividade_id = await _abrir(client, admin, gira)

    sem_grupo = await create_user(db, tenant, UserRole.OPERATOR, name="sem-grupo")
    assert (await client.get(f"{ADMIN}/{atividade_id}/escala", headers=sem_grupo.headers)).status_code == 403
    so_ver = await create_user(db, tenant, UserRole.OPERATOR, name="so-ver")
    await grant(db, so_ver, tenant, PermissionFeature.ESCALAS, "view")
    assert (await client.get(f"{ADMIN}/{atividade_id}/escala", headers=so_ver.headers)).status_code == 200
    assert (await client.post(f"{ADMIN}/da-gira/{gira.id}/escala", headers=so_ver.headers)).status_code == 200
    assert (await _salvar(client, so_ver, atividade_id, _pedido(funcoes["Cambone"], [ana]))).status_code == 403
    assert (await client.post(f"{ADMIN}/{atividade_id}/escala/copiar-anterior", headers=so_ver.headers)).status_code == 403
    escalador = await create_user(db, tenant, UserRole.OPERATOR, name="escalador")
    await grant(db, escalador, tenant, PermissionFeature.ESCALAS, "view", "edit")
    assert (await _salvar(client, escalador, atividade_id, _pedido(funcoes["Cambone"], [ana]))).status_code == 200


@pytest.mark.parametrize("plan, liberada", [(PlanType.BASIC, True), (PlanType.PRO, False)])
async def test_sem_plano_escalas_ou_sem_chave_do_piloto_403(client, db, plan, liberada):
    tenant, admin = await _cenario(db, nome=f"Casa {plan.value} {liberada}", plan=plan, liberada=liberada)
    _, ana = await _medium(db, tenant, "Ana Paula")
    funcoes = await _funcoes(db, tenant)
    gira = await _gira(db, tenant, 2)
    ancora = Atividade(tenant_id=tenant.id, tipo_id=(
        await db.execute(select(AtividadeTipo.id).where(AtividadeTipo.tenant_id == tenant.id, AtividadeTipo.natureza == "gira"))
    ).scalar_one(), gira_id=gira.id, origem="gira")
    db.add(ancora)
    await db.commit()
    h = admin.headers
    assert (await client.post(f"{ADMIN}/da-gira/{gira.id}/escala", headers=h)).status_code == 403
    assert (await client.get(f"{ADMIN}/{ancora.id}/escala", headers=h)).status_code == 403
    assert (await _salvar(client, admin, ancora.id, _pedido(funcoes["Cambone"], [ana]))).status_code == 403
    resp = await client.post(
        f"{ADMIN}/{ancora.id}/escala/rodizio", headers=h, json={"funcao_id": str(funcoes["Cambone"]), "medium_ids": [str(ana.id)]}
    )
    assert resp.status_code == 403
    total = (
        await db.execute(
            select(func.count()).select_from(AtividadeParticipacao).where(AtividadeParticipacao.atividade_id == ancora.id)
        )
    ).scalar_one()
    assert total == 0
