"""AM-27 — Troca e substituição na escala + abono de justificativa, com Postgres real (HTTP).

- Fluxo completo com a aprovação da direção (padrão) numa escala de gira por função: o médium vê só
  o primeiro nome de quem aceitou aparecer (D-07), pede, o colega aceita, a direção aprova; a linha
  original fica "Substituído" e a do colega nasce com a mesma função, origem "troca"; os dois veem;
  chamada, escala e assiduidade mostram a troca (substituição, não falta).
- Casa sem aprovação: o aceite do colega já troca. Pedido "a direção escolhe" (ninguém aceitou
  aparecer) numa faxina: a direção escolhe o substituto (fora da escala, do terreiro).
- Recusa do colega e da direção, cancelamento por quem pediu e pela direção, pedido duplicado.
- O que não pode: médium fora da escala, gira sem função, colega já na escala / sem opt-in / de outro
  terreiro (422, nada gravado), atividade começada; mexer na troca de outro (404).
- Outro terreiro → 404/422 sem gravar; sem o plano `escalas` → 403; sem `ESCALAS` → 403; escrita
  impersonando → 403.
- Abono: aceitar/recusar o motivo de uma ausência; recusado conta como falta sem justificativa no
  relatório de assiduidade; um motivo novo volta a esperar a avaliação.
- E-mails da troca pelo agendador do AM-15 (pedido ao colega, aprovada aos dois), respeitando a
  preferência do médium.
"""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select, update

from src.core.tz import APP_TZ
from src.models import Atividade, AtividadeParticipacao, Gira, Medium, ParticipacaoTroca
from src.models.atividades import FuncaoCorrente
from src.models.audit_logs import AuditLog
from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.users import UserRole
from src.security.jwt import create_access_token
from src.services.atividades import ensure_default_atividade_tipos
from src.services.medium_lembrete_scheduler import processar_terreiro

from .factories import create_tenant, create_user, grant

ADMIN = "/api/v1/admin/atividades"
MEDIUM = "/api/v1/medium"
CONFIG = "/api/v1/admin/config/area-medium"


@pytest.fixture(autouse=True)
def _sem_cookies(client):
    client.cookies.clear()
    yield
    client.cookies.clear()


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _em(minutos: int) -> str:
    return (_agora() + timedelta(minutes=minutos)).isoformat()


async def _cenario(db, nome="Terreiro AM27", plan=PlanType.PRO, liberada=True):
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


async def _gira(db, tenant, dias=2) -> Gira:
    gira = Gira(tenant_id=tenant.id, nome="Gira de Caboclos", data_inicio=_agora() + timedelta(days=dias), is_active=True)
    db.add(gira)
    await db.commit()
    return gira


async def _funcoes(db, tenant) -> dict[str, uuid.UUID]:
    rows = await db.execute(select(FuncaoCorrente.nome, FuncaoCorrente.id).where(FuncaoCorrente.tenant_id == tenant.id))
    return dict(rows.all())


async def _escala_da_gira(client, admin, gira, funcao_id, mediuns) -> str:
    resp = await client.post(f"{ADMIN}/da-gira/{gira.id}/escala", headers=admin.headers)
    assert resp.status_code == 200, resp.text
    atividade_id = resp.json()["atividade_id"]
    body = {"funcoes": [{"funcao_id": str(funcao_id), "medium_ids": [str(m.id) for m in mediuns], "grupo_ids": []}]}
    salvo = await client.put(f"{ADMIN}/{atividade_id}/escala", headers=admin.headers, json=body)
    assert salvo.status_code == 200, salvo.text
    return atividade_id


async def _tipos(client, admin):
    resp = await client.get(f"{ADMIN}/tipos", headers=admin.headers)
    assert resp.status_code == 200, resp.text
    return {t["nome"]: t for t in resp.json()}


async def _faxina(client, admin, mediuns, minutos=3 * 24 * 60) -> str:
    tipos = await _tipos(client, admin)
    resp = await client.post(
        ADMIN, headers=admin.headers, json={"tipo_id": tipos["Faxina"]["id"], "titulo": "Faxina · G1", "inicio": _em(minutos)}
    )
    assert resp.status_code == 201, resp.text
    faxina = resp.json()["id"]
    conv = await client.post(
        f"{ADMIN}/{faxina}/convocar", headers=admin.headers, json={"medium_ids": [str(m.id) for m in mediuns]}
    )
    assert conv.status_code == 200, conv.text
    return faxina


async def _opt_in(client, actor, valor=True):
    resp = await client.put(f"{MEDIUM}/preferencias/colegas", headers=actor.headers, json={"mostrar_nome": valor})
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _linhas(atividade_id) -> dict:
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        rows = await fresh.execute(
            select(AtividadeParticipacao).where(AtividadeParticipacao.atividade_id == uuid.UUID(str(atividade_id)))
        )
        return {p.medium_id: p for p in rows.scalars()}


async def _n_trocas(tenant_id=None) -> int:
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        stmt = select(func.count(ParticipacaoTroca.id))
        if tenant_id is not None:
            stmt = stmt.where(ParticipacaoTroca.tenant_id == tenant_id)
        return (await fresh.execute(stmt)).scalar_one()


def _por_nome(lista: dict) -> dict:
    return {p["nome"]: p for p in lista["pessoas"]}


async def _assiduidade(client, admin, tipo_id=None) -> dict:
    hoje = datetime.now(APP_TZ).date()
    params = {"inicio": (hoje - timedelta(days=20)).isoformat(), "fim": (hoje + timedelta(days=20)).isoformat()}
    if tipo_id:
        params["tipo_id"] = tipo_id
    resp = await client.get(f"{ADMIN}/assiduidade", headers=admin.headers, params=params)
    assert resp.status_code == 200, resp.text
    return {linha["nome"]: linha for linha in resp.json()["linhas"]}


# ── 1. Fluxo com aprovação da direção (gira com função) ─────────────────────


async def test_troca_com_aprovacao_da_direcao_na_escala_de_gira(client, db):
    tenant, admin = await _cenario(db)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    beto, beto_m = await _medium(db, tenant, "Beto Lima")
    caio, caio_m = await _medium(db, tenant, "Caio Silva")
    funcoes = await _funcoes(db, tenant)
    gira = await _gira(db, tenant)
    atividade_id = await _escala_da_gira(client, admin, gira, funcoes["Cambone"], [ana_m])

    # Opt-in padrão desligado; Beto liga.
    prefs = (await client.get(f"{MEDIUM}/preferencias", headers=beto.headers)).json()
    assert prefs["mostrar_nome_colegas"] is False and prefs["colegas_disponivel"] is True
    assert (await _opt_in(client, beto))["mostrar_nome_colegas"] is True

    tela = await client.get(f"{MEDIUM}/atividades/gira/{gira.id}/troca", headers=ana.headers)
    assert tela.status_code == 200, tela.text
    tela = tela.json()
    assert tela["pode_pedir"] is True and tela["exige_aprovacao"] is True
    # Só o primeiro nome, e só de quem aceitou aparecer (Caio não ligou).
    assert tela["colegas"] == [{"id": str(beto_m.id), "nome": "Beto"}]

    pedido = await client.post(
        f"{MEDIUM}/atividades/gira/{gira.id}/troca",
        headers=ana.headers,
        json={"colega_id": str(beto_m.id), "recado": "<b>Viagem</b> de trabalho"},
    )
    assert pedido.status_code == 200, pedido.text
    p = pedido.json()
    assert p["pode_pedir"] is False and p["pedido"]["status"] == "pedido" and p["pedido"]["aguardando"] == "colega"
    assert p["pedido"]["colega"] == "Beto" and p["pedido"]["recado"] == "Viagem de trabalho"
    assert p["pedido"]["funcao"] == "Cambone" and p["pedido"]["pode_cancelar"] is True
    # Pedir de novo com um pedido aberto → 409.
    de_novo = await client.post(f"{MEDIUM}/atividades/gira/{gira.id}/troca", headers=ana.headers, json={})
    assert de_novo.status_code == 409

    # Beto vê o pedido no Início ("Para você ver agora") com o primeiro nome de quem pediu.
    inicio = (await client.get(f"{MEDIUM}/inicio", headers=beto.headers)).json()
    assert {"tipo": "troca", "quantidade": 1} in inicio["pendencias"]
    recebido = inicio["trocas"]["para_responder"][0]
    assert recebido["colega"] == "Ana" and recebido["papel"] == "para_mim" and recebido["pode_aceitar"] is True
    # Caio não tem nada a ver com isso.
    assert (await client.get(f"{MEDIUM}/trocas", headers=caio.headers)).json()["para_responder"] == []

    aceito = await client.post(f"{MEDIUM}/trocas/{recebido['id']}/aceitar", headers=beto.headers)
    assert aceito.status_code == 200, aceito.text
    assert aceito.json()["status"] == "aceito" and aceito.json()["aguardando"] == "direcao"
    # Até a direção aprovar, nada muda na escala.
    linhas = await _linhas(atividade_id)
    assert linhas[ana_m.id].substituida_por_id is None and beto_m.id not in linhas

    lista = (await client.get(f"{ADMIN}/trocas", headers=admin.headers)).json()
    assert lista["aguardando_direcao"] == 1 and lista["exige_aprovacao"] is True
    troca = lista["trocas"][0]
    assert troca["solicitante"]["nome"] == "Ana Paula" and troca["substituto"]["nome"] == "Beto Lima"
    assert troca["aguardando"] == "direcao" and troca["funcao"] == "Cambone"

    aprovada = await client.post(f"{ADMIN}/trocas/{troca['id']}/aprovar", headers=admin.headers, json={})
    assert aprovada.status_code == 200, aprovada.text
    assert aprovada.json()["status"] == "aprovado" and aprovada.json()["fechada_por"] == "direcao"

    linhas = await _linhas(atividade_id)
    ana_l, beto_l = linhas[ana_m.id], linhas[beto_m.id]
    assert ana_l.substituida_por_id == beto_l.id
    assert (beto_l.origem, beto_l.funcao_id, beto_l.resposta, beto_l.convocado) == ("troca", funcoes["Cambone"], "vou", True)

    # Os dois veem: "Você trocou com Beto" / "no lugar de Ana".
    tela_ana = (await client.get(f"{MEDIUM}/atividades/gira/{gira.id}/troca", headers=ana.headers)).json()
    assert tela_ana["pedido"]["status"] == "aprovado" and tela_ana["pedido"]["colega"] == "Beto"
    assert tela_ana["pode_pedir"] is False
    tela_beto = (await client.get(f"{MEDIUM}/atividades/gira/{gira.id}/troca", headers=beto.headers)).json()
    assert tela_beto["para_mim"][0]["status"] == "aprovado" and tela_beto["para_mim"][0]["colega"] == "Ana"
    agenda_ana = (await client.get(f"{MEDIUM}/agenda/gira/{gira.id}", headers=ana.headers)).json()
    assert agenda_ana["minha_participacao"]["situacao"] == "substituido"
    agenda_beto = (await client.get(f"{MEDIUM}/agenda/gira/{gira.id}", headers=beto.headers)).json()
    assert agenda_beto["minha_participacao"]["funcao"] == "Cambone"

    # Painel: chamada e escala mostram a troca.
    chamada = _por_nome((await client.get(f"{ADMIN}/{atividade_id}/chamada", headers=admin.headers)).json())
    assert chamada["Ana Paula"]["situacao"] == "substituido" and chamada["Ana Paula"]["substituido_por"] == "Beto Lima"
    assert chamada["Beto Lima"]["no_lugar_de"] == "Ana Paula" and chamada["Beto Lima"]["situacao"] == "confirmado"
    escala = (await client.get(f"{ADMIN}/{atividade_id}/escala", headers=admin.headers)).json()
    cambone = next(f for f in escala["funcoes"] if f["nome"] == "Cambone")
    assert [p["nome"] for p in cambone["mediuns"]] == ["Beto Lima"]
    assert [t["nome"] for t in escala["tirados"]] == ["Ana Paula"]

    # Assiduidade: Ana fica como substituição (não é falta nem entra no percentual); Beto conta.
    await db.execute(update(Gira).where(Gira.id == gira.id).values(data_inicio=_agora() - timedelta(hours=1)))
    await db.commit()
    assert (await client.post(f"{ADMIN}/{atividade_id}/chamada/encerrar", headers=admin.headers)).status_code == 200
    rel = await _assiduidade(client, admin)
    assert rel["Ana Paula"]["substituidos"] == 1 and rel["Ana Paula"]["convocacoes"] == 0
    assert rel["Ana Paula"]["ausencias_sem_justificativa"] == 0
    assert rel["Beto Lima"]["convocacoes"] == 1 and rel["Beto Lima"]["presencas"] == 1  # confiança + "vou"

    # Auditoria só com ids.
    logs = (
        await db.execute(
            select(AuditLog).where(
                AuditLog.tenant_id == tenant.id, AuditLog.resource_type.in_(("medium_troca", "atividade_troca"))
            )
        )
    ).scalars().all()
    assert len(logs) == 3
    assert all("Ana" not in str(log.details) and "Beto" not in str(log.details) and "Viagem" not in str(log.details) for log in logs)


# ── 2. Casa sem aprovação; "a direção escolhe" ──────────────────────────────


async def test_sem_aprovacao_o_aceite_ja_troca_e_direcao_escolhe_quando_ninguem_aparece(client, db):
    tenant, admin = await _cenario(db)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    beto, beto_m = await _medium(db, tenant, "Beto Lima")
    caio, caio_m = await _medium(db, tenant, "Caio Silva")
    dani, dani_m = await _medium(db, tenant, "Dani Souza")
    faxina = await _faxina(client, admin, [ana_m, caio_m])

    # Ninguém ligou o opt-in: a lista vem vazia e o pedido vai para a direção escolher.
    tela = (await client.get(f"{MEDIUM}/atividades/atividade/{faxina}/troca", headers=ana.headers)).json()
    assert tela["pode_pedir"] is True and tela["colegas"] == []
    pedido = await client.post(f"{MEDIUM}/atividades/atividade/{faxina}/troca", headers=ana.headers, json={})
    assert pedido.status_code == 200, pedido.text
    assert pedido.json()["pedido"]["aguardando"] == "direcao" and pedido.json()["pedido"]["direcao_escolhe"] is True

    troca = (await client.get(f"{ADMIN}/trocas", headers=admin.headers)).json()["trocas"][0]
    assert troca["substituto"] is None and troca["aguardando"] == "direcao"
    opcoes = (await client.get(f"{ADMIN}/trocas/{troca['id']}/substitutos", headers=admin.headers)).json()
    assert {o["nome"] for o in opcoes} == {"Beto Lima", "Dani Souza"}  # Caio já está na escala; Ana é quem pede
    sem = await client.post(f"{ADMIN}/trocas/{troca['id']}/aprovar", headers=admin.headers, json={})
    assert sem.status_code == 422
    ja_na_escala = await client.post(
        f"{ADMIN}/trocas/{troca['id']}/aprovar", headers=admin.headers, json={"substituto_id": str(caio_m.id)}
    )
    assert ja_na_escala.status_code == 422
    assert (await _linhas(faxina))[ana_m.id].substituida_por_id is None

    ok = await client.post(f"{ADMIN}/trocas/{troca['id']}/aprovar", headers=admin.headers, json={"substituto_id": str(beto_m.id)})
    assert ok.status_code == 200, ok.text
    assert ok.json()["indicado_pela_direcao"] is True
    linhas = await _linhas(faxina)
    assert linhas[ana_m.id].substituida_por_id == linhas[beto_m.id].id and linhas[beto_m.id].origem == "troca"
    # Beto foi indicado pela direção e não ligou o opt-in: Ana não vê o nome dele (D-07).
    tela_ana = (await client.get(f"{MEDIUM}/atividades/atividade/{faxina}/troca", headers=ana.headers)).json()
    assert tela_ana["pedido"]["status"] == "aprovado" and tela_ana["pedido"]["colega"] is None
    tela_beto = (await client.get(f"{MEDIUM}/atividades/atividade/{faxina}/troca", headers=beto.headers)).json()
    assert tela_beto["para_mim"][0]["colega"] == "Ana"

    # A casa desliga a aprovação: o aceite do colega já troca.
    cfg = await client.put(CONFIG, headers=admin.headers, json={"trocas": {"exige_aprovacao": False}})
    assert cfg.status_code == 200 and cfg.json()["trocas"]["exige_aprovacao"] is False and cfg.json()["trocas_no_plano"]
    await _opt_in(client, dani)
    tela_caio = (await client.get(f"{MEDIUM}/atividades/atividade/{faxina}/troca", headers=caio.headers)).json()
    assert tela_caio["exige_aprovacao"] is False and [c["nome"] for c in tela_caio["colegas"]] == ["Dani"]
    r = await client.post(
        f"{MEDIUM}/atividades/atividade/{faxina}/troca", headers=caio.headers, json={"colega_id": str(dani_m.id)}
    )
    assert r.status_code == 200, r.text
    troca_id = r.json()["pedido"]["id"]
    aceito = await client.post(f"{MEDIUM}/trocas/{troca_id}/aceitar", headers=dani.headers)
    assert aceito.status_code == 200 and aceito.json()["status"] == "aprovado" and aceito.json()["fechada_por"] == "substituto"
    linhas = await _linhas(faxina)
    assert linhas[caio_m.id].substituida_por_id == linhas[dani_m.id].id
    assert (await client.get(f"{ADMIN}/trocas", headers=admin.headers)).json()["aguardando_direcao"] == 0


# ── 3. Recusas e cancelamentos ──────────────────────────────────────────────


async def test_recusa_do_colega_e_da_direcao_e_cancelamentos(client, db):
    tenant, admin = await _cenario(db)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    beto, beto_m = await _medium(db, tenant, "Beto Lima")
    caio, _ = await _medium(db, tenant, "Caio Silva")
    faxina = await _faxina(client, admin, [ana_m])
    await _opt_in(client, beto)
    url = f"{MEDIUM}/atividades/atividade/{faxina}/troca"

    async def pedir():
        r = await client.post(url, headers=ana.headers, json={"colega_id": str(beto_m.id)})
        assert r.status_code == 200, r.text
        return r.json()["pedido"]["id"]

    # Beto recusa: Ana continua na escala e pode pedir de novo.
    t1 = await pedir()
    assert (await client.post(f"{MEDIUM}/trocas/{t1}/aceitar", headers=ana.headers)).status_code == 404  # não é dela
    assert (await client.post(f"{MEDIUM}/trocas/{t1}/cancelar", headers=beto.headers)).status_code == 404  # não é dele
    assert (await client.post(f"{MEDIUM}/trocas/{t1}/recusar", headers=caio.headers)).status_code == 404
    rec = await client.post(f"{MEDIUM}/trocas/{t1}/recusar", headers=beto.headers)
    assert rec.status_code == 200 and rec.json()["status"] == "recusado" and rec.json()["fechada_por"] == "substituto"
    assert (await client.post(f"{MEDIUM}/trocas/{t1}/aceitar", headers=beto.headers)).status_code == 409
    assert (await _linhas(faxina))[ana_m.id].substituida_por_id is None

    # Ana cancela o próprio pedido.
    t2 = await pedir()
    can = await client.post(f"{MEDIUM}/trocas/{t2}/cancelar", headers=ana.headers)
    assert can.status_code == 200 and can.json()["status"] == "cancelado"
    assert (await client.get(f"{MEDIUM}/trocas", headers=beto.headers)).json()["para_responder"] == []

    # A direção cancela um pedido que ainda espera o colega (e não pode recusar nem aprovar ainda).
    t3 = await pedir()
    assert (await client.post(f"{ADMIN}/trocas/{t3}/recusar", headers=admin.headers)).status_code == 409
    assert (await client.post(f"{ADMIN}/trocas/{t3}/aprovar", headers=admin.headers, json={})).status_code == 409
    can3 = await client.post(f"{ADMIN}/trocas/{t3}/cancelar", headers=admin.headers)
    assert can3.status_code == 200 and can3.json()["status"] == "cancelado" and can3.json()["fechada_por"] == "direcao"

    # Beto aceita e a direção recusa.
    t4 = await pedir()
    assert (await client.post(f"{MEDIUM}/trocas/{t4}/aceitar", headers=beto.headers)).json()["status"] == "aceito"
    rec4 = await client.post(f"{ADMIN}/trocas/{t4}/recusar", headers=admin.headers)
    assert rec4.status_code == 200 and rec4.json()["status"] == "recusado"
    assert (await client.post(f"{ADMIN}/trocas/{t4}/cancelar", headers=admin.headers)).status_code == 409
    linhas = await _linhas(faxina)
    assert linhas[ana_m.id].substituida_por_id is None and beto_m.id not in linhas

    historico = (await client.get(f"{ADMIN}/trocas", headers=admin.headers, params={"abertas": "false"})).json()
    assert sorted(t["status"] for t in historico["trocas"]) == ["cancelado", "cancelado", "recusado", "recusado"]


# ── 4. O que não pode ───────────────────────────────────────────────────────


async def test_quem_nao_pode_pedir_e_substituto_que_nao_vale(client, db):
    tenant, admin = await _cenario(db)
    outro, _ = await _cenario(db, nome="Outro Terreiro")
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    beto, beto_m = await _medium(db, tenant, "Beto Lima")
    caio, caio_m = await _medium(db, tenant, "Caio Silva")
    dani, dani_m = await _medium(db, tenant, "Dani Souza")
    _, de_fora = await _medium(db, outro, "Eva Fora")
    funcoes = await _funcoes(db, tenant)
    gira = await _gira(db, tenant)
    await _escala_da_gira(client, admin, gira, funcoes["Cambone"], [ana_m, caio_m])
    for actor in (beto, caio):
        await _opt_in(client, actor)

    # Gira: quem não tem função não tem troca (a corrente toda já é esperada).
    tela_dani = (await client.get(f"{MEDIUM}/atividades/gira/{gira.id}/troca", headers=dani.headers)).json()
    assert tela_dani["pode_pedir"] is False and "função" in tela_dani["motivo"]
    sem_escala = await client.post(f"{MEDIUM}/atividades/gira/{gira.id}/troca", headers=dani.headers, json={})
    assert sem_escala.status_code == 409

    # A lista de Ana não traz Caio (já está na escala): só Beto.
    tela_ana = (await client.get(f"{MEDIUM}/atividades/gira/{gira.id}/troca", headers=ana.headers)).json()
    assert [c["nome"] for c in tela_ana["colegas"]] == ["Beto"]
    url = f"{MEDIUM}/atividades/gira/{gira.id}/troca"
    for colega in (caio_m.id, dani_m.id, de_fora.id, ana_m.id, uuid.uuid4()):
        r = await client.post(url, headers=ana.headers, json={"colega_id": str(colega)})
        assert r.status_code == 422, (colega, r.text)
    assert await _n_trocas(tenant.id) == 0

    # Atividade que já começou não troca mais.
    faxina = await _faxina(client, admin, [ana_m])
    await db.execute(update(Atividade).where(Atividade.id == uuid.UUID(faxina)).values(inicio=_agora() - timedelta(minutes=5)))
    await db.commit()
    tarde = await client.post(f"{MEDIUM}/atividades/atividade/{faxina}/troca", headers=ana.headers, json={})
    assert tarde.status_code == 409 and "começou" in tarde.text
    assert await _n_trocas(tenant.id) == 0
    # Rota inexistente / origem inválida.
    assert (await client.get(f"{MEDIUM}/atividades/outra/{faxina}/troca", headers=ana.headers)).status_code == 404


# ── 5. Outro terreiro ───────────────────────────────────────────────────────


async def test_outro_terreiro_404_ou_422_sem_gravar(client, db):
    tenant, admin = await _cenario(db)
    outro, admin_b = await _cenario(db, nome="Outro Terreiro")
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    _, beto_m = await _medium(db, tenant, "Beto Lima")
    eva, eva_m = await _medium(db, outro, "Eva Fora")
    faxina = await _faxina(client, admin, [ana_m])
    r = await client.post(f"{MEDIUM}/atividades/atividade/{faxina}/troca", headers=ana.headers, json={})
    troca_id = r.json()["pedido"]["id"]

    # Admin e médium do outro terreiro não acham a troca nem a atividade.
    assert (await client.get(f"{ADMIN}/trocas", headers=admin_b.headers)).json()["trocas"] == []
    for acao in ("aprovar", "recusar", "cancelar"):
        resp = await client.post(f"{ADMIN}/trocas/{troca_id}/{acao}", headers=admin_b.headers, json={"substituto_id": str(eva_m.id)})
        assert resp.status_code == 404, (acao, resp.text)
    assert (await client.get(f"{ADMIN}/trocas/{troca_id}/substitutos", headers=admin_b.headers)).status_code == 404
    assert (await client.post(f"{MEDIUM}/trocas/{troca_id}/aceitar", headers=eva.headers)).status_code == 404
    assert (await client.get(f"{MEDIUM}/atividades/atividade/{faxina}/troca", headers=eva.headers)).status_code == 404
    # Substituto de outro terreiro → 422, nada muda.
    fora = await client.post(f"{ADMIN}/trocas/{troca_id}/aprovar", headers=admin.headers, json={"substituto_id": str(eva_m.id)})
    assert fora.status_code == 422
    assert (await _linhas(faxina))[ana_m.id].substituida_por_id is None
    assert eva_m.id not in await _linhas(faxina)
    # Abono de outro terreiro → 404.
    resp = await client.put(f"{ADMIN}/{faxina}/justificativas/{ana_m.id}", headers=admin_b.headers, json={"avaliacao": "recusada"})
    assert resp.status_code == 404
    assert beto_m.id not in await _linhas(faxina)


# ── 6. Plano, grupo de permissão e impersonação ─────────────────────────────


async def test_gates_de_plano_permissao_e_impersonacao(client, db):
    # Basic (sem `escalas`): trocas não existem — 403 no painel e na Área.
    basic, admin_basic = await _cenario(db, nome="Casa Basic", plan=PlanType.BASIC)
    ana_b, ana_bm = await _medium(db, basic, "Ana Paula")
    faxina_b = await _faxina(client, admin_basic, [ana_bm])
    assert (await client.get(f"{ADMIN}/trocas", headers=admin_basic.headers)).status_code == 403
    assert (await client.get(f"{MEDIUM}/trocas", headers=ana_b.headers)).status_code == 403
    assert (await client.post(f"{MEDIUM}/atividades/atividade/{faxina_b}/troca", headers=ana_b.headers, json={})).status_code == 403
    inicio = (await client.get(f"{MEDIUM}/inicio", headers=ana_b.headers)).json()
    assert inicio["trocas"] is None
    prefs = (await client.get(f"{MEDIUM}/preferencias", headers=ana_b.headers)).json()
    assert prefs["colegas_disponivel"] is False
    cfg = (await client.get(CONFIG, headers=admin_basic.headers)).json()
    assert cfg["trocas_no_plano"] is False

    # Pro: grupo de permissão ESCALAS.
    tenant, admin = await _cenario(db)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    faxina = await _faxina(client, admin, [ana_m])
    troca_id = (await client.post(f"{MEDIUM}/atividades/atividade/{faxina}/troca", headers=ana.headers, json={})).json()[
        "pedido"
    ]["id"]
    sem_grupo = await create_user(db, tenant, UserRole.OPERATOR, name="operador")
    assert (await client.get(f"{ADMIN}/trocas", headers=sem_grupo.headers)).status_code == 403
    so_ver = await create_user(db, tenant, UserRole.OPERATOR, name="visao")
    await grant(db, so_ver, tenant, PermissionFeature.ESCALAS, "view")
    assert (await client.get(f"{ADMIN}/trocas", headers=so_ver.headers)).status_code == 200
    for acao in ("aprovar", "recusar", "cancelar"):
        assert (await client.post(f"{ADMIN}/trocas/{troca_id}/{acao}", headers=so_ver.headers, json={})).status_code == 403
    assert (await client.get(f"{ADMIN}/trocas/{troca_id}/substitutos", headers=so_ver.headers)).status_code == 403
    assert (
        await client.put(f"{ADMIN}/{faxina}/justificativas/{ana_m.id}", headers=so_ver.headers, json={"avaliacao": "aceita"})
    ).status_code == 403
    editor = await create_user(db, tenant, UserRole.OPERATOR, name="escalador")
    await grant(db, editor, tenant, PermissionFeature.ESCALAS, "view", "edit")
    assert (await client.post(f"{ADMIN}/trocas/{troca_id}/cancelar", headers=editor.headers)).status_code == 200

    # Impersonando o médium: lê, mas não escreve.
    token = create_access_token(ana.user.id, tenant.id, "medium", impersonated_by=uuid.uuid4())
    imp = {"Authorization": f"Bearer {token}"}
    assert (await client.get(f"{MEDIUM}/atividades/atividade/{faxina}/troca", headers=imp)).status_code == 200
    assert (await client.post(f"{MEDIUM}/atividades/atividade/{faxina}/troca", headers=imp, json={})).status_code == 403
    assert (await client.put(f"{MEDIUM}/preferencias/colegas", headers=imp, json={"mostrar_nome": True})).status_code == 403


# ── 7. Abono da justificativa ───────────────────────────────────────────────


async def test_abono_aceita_ou_recusa_e_reflete_na_assiduidade(client, db):
    tenant, admin = await _cenario(db, plan=PlanType.BASIC)  # presença é Basic: abono não pede `escalas`
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    beto, beto_m = await _medium(db, tenant, "Beto Lima")
    _, caio_m = await _medium(db, tenant, "Caio Silva")
    faxina = await _faxina(client, admin, [ana_m, beto_m, caio_m], minutos=60)
    for actor in (ana, beto):
        r = await client.post(
            f"{MEDIUM}/atividades/atividade/{faxina}/resposta",
            headers=actor.headers,
            json={"resposta": "nao_vou", "justificativa": "Plantão no hospital"},
        )
        assert r.status_code == 200, r.text

    # Sem motivo (Caio) → 409.
    assert (
        await client.put(f"{ADMIN}/{faxina}/justificativas/{caio_m.id}", headers=admin.headers, json={"avaliacao": "aceita"})
    ).status_code == 409
    rec = await client.put(f"{ADMIN}/{faxina}/justificativas/{ana_m.id}", headers=admin.headers, json={"avaliacao": "recusada"})
    assert rec.status_code == 200, rec.text
    assert _por_nome(rec.json())["Ana Paula"]["justificativa_avaliacao"] == "recusada"
    ace = await client.put(f"{ADMIN}/{faxina}/justificativas/{beto_m.id}", headers=admin.headers, json={"avaliacao": "aceita"})
    assert _por_nome(ace.json())["Beto Lima"]["justificativa_avaliacao"] == "aceita"

    await db.execute(
        update(Atividade)
        .where(Atividade.id == uuid.UUID(faxina))
        .values(inicio=_agora() - timedelta(hours=4), fim=_agora() - timedelta(hours=1))
    )
    await db.commit()
    assert (await client.post(f"{ADMIN}/{faxina}/chamada/encerrar", headers=admin.headers)).status_code == 200
    chamada = _por_nome((await client.get(f"{ADMIN}/{faxina}/chamada", headers=admin.headers)).json())
    assert chamada["Ana Paula"]["situacao"] == "ausente" and chamada["Beto Lima"]["situacao"] == "ausente_justificado"

    rel = await _assiduidade(client, admin)
    assert rel["Ana Paula"]["ausencias_sem_justificativa"] == 1 and rel["Ana Paula"]["ausencias_justificadas"] == 0
    assert rel["Beto Lima"]["ausencias_justificadas"] == 1
    detalhe = (
        await client.get(
            f"{ADMIN}/assiduidade/medium/{ana_m.id}",
            headers=admin.headers,
            params={
                "inicio": (datetime.now(APP_TZ).date() - timedelta(days=2)).isoformat(),
                "fim": (datetime.now(APP_TZ).date() + timedelta(days=2)).isoformat(),
            },
        )
    ).json()
    assert detalhe["itens"][0]["justificativa_avaliacao"] == "recusada" and detalhe["itens"][0]["categoria"] == "ausente"
    assert detalhe["itens"][0]["situacao"] == "ausente"

    # A Área mostra a avaliação; um motivo novo volta a esperar a direção (e vale de novo).
    minha = (await client.get(f"{MEDIUM}/agenda/atividade/{faxina}", headers=ana.headers)).json()["minha_participacao"]
    assert minha["justificativa_avaliacao"] == "recusada" and minha["situacao"] == "ausente"
    novo = await client.post(
        f"{MEDIUM}/atividades/atividade/{faxina}/justificativa", headers=ana.headers, json={"justificativa": "Atestado médico"}
    )
    assert novo.status_code == 200 and novo.json()["justificativa_avaliacao"] is None
    assert novo.json()["situacao"] == "ausente_justificado"
    rel = await _assiduidade(client, admin)
    assert rel["Ana Paula"]["ausencias_justificadas"] == 1

    # Desfazer a avaliação (null) e auditoria sem o texto do motivo.
    desfaz = await client.put(f"{ADMIN}/{faxina}/justificativas/{beto_m.id}", headers=admin.headers, json={"avaliacao": None})
    assert _por_nome(desfaz.json())["Beto Lima"]["justificativa_avaliacao"] is None
    logs = (
        await db.execute(
            select(AuditLog).where(AuditLog.tenant_id == tenant.id, AuditLog.resource_type == "atividade_justificativa")
        )
    ).scalars().all()
    assert len(logs) == 3 and all("Plantão" not in str(log.details) and "Atestado" not in str(log.details) for log in logs)


# ── 8. E-mails da troca (agendador do AM-15) ────────────────────────────────


class _Caixa:
    def __init__(self) -> None:
        self.mensagens: list = []

    async def __call__(self, mensagem) -> None:
        self.mensagens.append(mensagem)

    def assuntos(self, email: str) -> list[str]:
        return [m.subject for m in self.mensagens if m.to_email == email]


def _tarde_brt() -> datetime:
    hoje: date = datetime.now(APP_TZ).date()
    return datetime(hoje.year, hoje.month, hoje.day, 15, 0, tzinfo=APP_TZ).astimezone(timezone.utc)


async def test_emails_da_troca_respeitam_a_preferencia(client, db):
    tenant, admin = await _cenario(db, nome="Casa dos Emails")
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    beto, beto_m = await _medium(db, tenant, "Beto Lima")
    await client.put(CONFIG, headers=admin.headers, json={"trocas": {"exige_aprovacao": False}})
    faxina = await _faxina(client, admin, [ana_m], minutos=5 * 24 * 60)
    await _opt_in(client, beto)
    r = await client.post(
        f"{MEDIUM}/atividades/atividade/{faxina}/troca", headers=ana.headers, json={"colega_id": str(beto_m.id)}
    )
    troca_id = r.json()["pedido"]["id"]

    caixa = _Caixa()
    await processar_terreiro(tenant.id, _tarde_brt(), caixa)
    assert [s for s in caixa.assuntos(beto.user.email) if "troca" in s] == ["Casa dos Emails: pedido de troca na escala"]
    corpo = next(m for m in caixa.mensagens if m.to_email == beto.user.email and "troca" in m.subject)
    assert "Ana perguntou" in corpo.text_body and "Paula" not in corpo.text_body
    # Uma vez só.
    caixa2 = _Caixa()
    await processar_terreiro(tenant.id, _tarde_brt(), caixa2)
    assert [s for s in caixa2.assuntos(beto.user.email) if "troca" in s] == []

    # Beto desliga os avisos de escala: não recebe a confirmação; Ana recebe.
    assert (await client.put(f"{MEDIUM}/preferencias", headers=beto.headers, json={"escalas": False})).status_code == 200
    assert (await client.post(f"{MEDIUM}/trocas/{troca_id}/aceitar", headers=beto.headers)).json()["status"] == "aprovado"
    caixa3 = _Caixa()
    await processar_terreiro(tenant.id, _tarde_brt(), caixa3)
    assert [s for s in caixa3.assuntos(ana.user.email) if "troca" in s] == ["Casa dos Emails: troca na escala confirmada"]
    assert [s for s in caixa3.assuntos(beto.user.email) if "troca" in s] == []
    corpo_ana = next(m for m in caixa3.mensagens if m.to_email == ana.user.email and "troca" in m.subject)
    assert "Beto vai no seu lugar" in corpo_ana.text_body
