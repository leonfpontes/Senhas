"""AM-17/AM-28 — Presença com Postgres real (migrações + app inteiro via HTTP).

- Vou / Não vou até o início; "Não vou" pede o motivo quando o tipo exige; só quem está na escala.
- "Cheguei" pelo app só na janela do tipo e só para quem está na escala; com QR só com o código
  atual DAQUELA atividade; no modo confiança não há "Cheguei".
- Confiança: quem confirmou "vou" conta como presente no encerramento, salvo ausência marcada.
- Chamada por ESCALAS e, na gira, pela PORTA (sem ver o texto da justificativa); avulso;
  "Marcar todos os confirmados"; encerrar materializa os esperados e marca o resto ausente;
  encerrar é idempotente; encerramento automático em 48 h só com presença registrada.
- "Conte o motivo" até o prazo da casa; isolamento entre médiuns e entre terreiros; justificativa
  nunca na auditoria nem em e-mail; escrita recusada sob impersonação; sem plano/chave → 403;
  "Cheguei" e chamada ao mesmo tempo não duplicam a linha (único atividade + médium).
"""
import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select, text, update

from src.models import Atividade, AtividadeParticipacao, Gira, Medium
from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.users import UserRole
from src.security.jwt import create_access_token
from src.services import presenca as svc
from src.services.atividades import ensure_default_atividade_tipos

from .factories import create_tenant, create_user, grant

ADMIN = "/api/v1/admin/atividades"
CONFIG = "/api/v1/admin/config/area-medium"
MEDIUM = "/api/v1/medium"


@pytest.fixture
def enqueued(monkeypatch):
    from src.services.email.email_queue import email_queue

    items: list = []
    monkeypatch.setattr(email_queue, "enqueue", lambda item: items.append(item))
    return items


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _em(minutos: float) -> str:
    return (_agora() + timedelta(minutes=minutos)).isoformat()


async def _cenario(db, nome="Terreiro AM17", plan=PlanType.BASIC, liberada=True):
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


async def _tipos(client, admin):
    resp = await client.get(f"{ADMIN}/tipos", headers=admin.headers)
    assert resp.status_code == 200, resp.text
    return {t["nome"]: t for t in resp.json()}


async def _atividade(client, admin, tipo_id, titulo, inicio, **kw):
    resp = await client.post(ADMIN, headers=admin.headers, json={"tipo_id": tipo_id, "titulo": titulo, "inicio": inicio, **kw})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _modo_da_casa(client, admin, modo, prazo=None):
    presenca = {"modo_padrao": modo}
    if prazo is not None:
        presenca["prazo_justificativa_dias"] = prazo
    resp = await client.put(CONFIG, headers=admin.headers, json={"presenca": presenca})
    assert resp.status_code == 200, resp.text


async def _mover(db, atividade_id, inicio: datetime, fim: datetime | None = None):
    """Leva a atividade para outro horário (para testar depois do início/fim)."""
    await db.execute(update(Atividade).where(Atividade.id == atividade_id).values(inicio=inicio, fim=fim))
    await db.commit()


async def _resposta(client, actor, origem, ref_id, resposta, justificativa=None):
    body = {"resposta": resposta}
    if justificativa is not None:
        body["justificativa"] = justificativa
    return await client.post(f"{MEDIUM}/atividades/{origem}/{ref_id}/resposta", headers=actor.headers, json=body)


async def _cheguei(client, actor, origem, ref_id, codigo=None):
    return await client.post(
        f"{MEDIUM}/atividades/{origem}/{ref_id}/checkin", headers=actor.headers, json={"codigo": codigo}
    )


async def _chamada(client, actor, atividade_id, **body):
    return await client.put(f"{ADMIN}/{atividade_id}/chamada", headers=actor.headers, json=body)


async def _contar_linhas(atividade_id, medium_id=None):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        stmt = select(func.count()).select_from(AtividadeParticipacao).where(
            AtividadeParticipacao.atividade_id == atividade_id
        )
        if medium_id is not None:
            stmt = stmt.where(AtividadeParticipacao.medium_id == medium_id)
        return (await fresh.execute(stmt)).scalar_one()


def _por_nome(lista):
    return {p["nome"]: p for p in lista["pessoas"]}


# ── Vou / Não vou ───────────────────────────────────────────────────────────


async def test_vou_nao_vou_ate_o_inicio_e_motivo_pelo_tipo(client, db):
    tenant, admin = await _cenario(db)
    tipos = await _tipos(client, admin)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    reuniao = await _atividade(client, admin, tipos["Reunião"]["id"], "Reunião geral", _em(2 * 24 * 60))
    ritual = await _atividade(client, admin, tipos["Ritual coletivo"]["id"], "Amaci", _em(3 * 24 * 60))
    faxina = await _atividade(client, admin, tipos["Faxina"]["id"], "Faxina · G1", _em(4 * 24 * 60))

    # Reunião: "todos os elegíveis", não exige motivo.
    r = await _resposta(client, ana, "atividade", reuniao, "vou")
    assert r.status_code == 200, r.text
    assert (r.json()["situacao"], r.json()["resposta"]) == ("confirmado", "vou")
    r = await _resposta(client, ana, "atividade", reuniao, "nao_vou")
    assert r.status_code == 200 and r.json()["situacao"] == "ausencia_avisada"

    # Ritual coletivo exige o motivo para "não vou".
    sem = await _resposta(client, ana, "atividade", ritual, "nao_vou", "   ")
    assert sem.status_code == 422 and "motivo" in sem.text
    com = await _resposta(client, ana, "atividade", ritual, "nao_vou", "<b>Viagem</b> a trabalho")
    assert com.status_code == 200 and com.json()["justificativa"] == "Viagem a trabalho"
    volta = await _resposta(client, ana, "atividade", ritual, "vou")
    assert volta.json()["justificativa"] is None and volta.json()["situacao"] == "confirmado"
    longa = await _resposta(client, ana, "atividade", ritual, "nao_vou", "a" * 501)
    assert longa.status_code == 422

    # Faxina é "só escalados": fora da escala → 403; convocada → pode responder.
    fora = await _resposta(client, ana, "atividade", faxina, "vou")
    assert fora.status_code == 403 and "FORA_DA_ESCALA" in fora.text
    conv = await client.post(f"{ADMIN}/{faxina}/convocar", headers=admin.headers, json={"medium_ids": [str(ana_m.id)]})
    assert conv.status_code == 200, conv.text
    assert (await _resposta(client, ana, "atividade", faxina, "nao_vou")).status_code == 422
    assert (await _resposta(client, ana, "atividade", faxina, "nao_vou", "Plantão")).status_code == 200

    # Depois do início não muda mais.
    await _mover(db, uuid.UUID(reuniao), _agora() - timedelta(minutes=10))
    tarde = await _resposta(client, ana, "atividade", reuniao, "vou")
    assert tarde.status_code == 409 and "começou" in tarde.text

    # Confirmações do painel: contadores e o motivo para quem tem ESCALAS:view.
    conf = (await client.get(f"{ADMIN}/{ritual}/confirmacoes", headers=admin.headers)).json()
    assert conf["contadores"]["confirmados"] == 1 and conf["ver_justificativa"] is True
    faxina_conf = _por_nome((await client.get(f"{ADMIN}/{faxina}/confirmacoes", headers=admin.headers)).json())
    assert faxina_conf["Ana Paula"]["justificativa"] == "Plantão"
    assert faxina_conf["Ana Paula"]["situacao"] == "ausencia_avisada"


async def test_gira_pela_ancora_e_agenda_com_minha_participacao(client, db):
    tenant, admin = await _cenario(db)
    ana, _ = await _medium(db, tenant, "Ana Paula")
    gira = Gira(tenant_id=tenant.id, nome="Gira de Caboclos", data_inicio=_agora() + timedelta(days=1), is_active=True)
    db.add(gira)
    await db.commit()
    det = (await client.get(f"{MEDIUM}/agenda/gira/{gira.id}", headers=ana.headers)).json()
    assert det["minha_participacao"]["situacao"] == "convocado" and det["minha_participacao"]["pode_responder"]
    # Gira exige o motivo (tipo de sistema).
    assert (await _resposta(client, ana, "gira", gira.id, "nao_vou")).status_code == 422
    r = await _resposta(client, ana, "gira", gira.id, "vou")
    assert r.status_code == 200 and r.json()["situacao"] == "confirmado"
    ancora = (await db.execute(select(Atividade).where(Atividade.gira_id == gira.id))).scalar_one()
    assert ancora.tenant_id == tenant.id and ancora.origem == "gira"
    assert await _contar_linhas(ancora.id) == 1
    inicio = (await client.get(f"{MEDIUM}/inicio", headers=ana.headers)).json()
    assert [e["titulo"] for e in inicio["escalas"]] == ["Gira de Caboclos"]
    assert all(p["tipo"] != "escala" for p in inicio["pendencias"])  # já respondeu


# ── "Cheguei" ───────────────────────────────────────────────────────────────


async def test_cheguei_pelo_app_so_na_janela_e_so_quem_esta_na_escala(client, db):
    tenant, admin = await _cenario(db)
    tipos = await _tipos(client, admin)
    ana, _ = await _medium(db, tenant, "Ana Paula")
    await _modo_da_casa(client, admin, "app")
    agora_mesmo = await _atividade(client, admin, tipos["Reunião"]["id"], "Reunião agora", _em(30))
    mais_tarde = await _atividade(client, admin, tipos["Reunião"]["id"], "Reunião mais tarde", _em(180))
    faxina = await _atividade(client, admin, tipos["Faxina"]["id"], "Faxina", _em(20))
    cambones = (await client.post(f"{ADMIN}/tipos", headers=admin.headers, json={"nome": "Ensaio", "elegiveis": "cambones"})).json()
    so_cambones = await _atividade(client, admin, cambones["id"], "Ensaio", _em(15))

    inicio = (await client.get(f"{MEDIUM}/inicio", headers=ana.headers)).json()
    pendente = next(e for e in inicio["escalas"] if e["titulo"] == "Reunião agora")
    assert pendente["minha_participacao"]["pode_checkin"] is True
    assert {"tipo": "escala", "quantidade": 2} in inicio["pendencias"]  # responder + "Cheguei"

    ok = await _cheguei(client, ana, "atividade", agora_mesmo)
    assert ok.status_code == 200, ok.text
    assert ok.json()["situacao"] == "presente" and ok.json()["presenca_em"] is not None
    de_novo = await _cheguei(client, ana, "atividade", agora_mesmo)
    assert de_novo.status_code == 200 and await _contar_linhas(uuid.UUID(agora_mesmo)) == 1

    cedo = await _cheguei(client, ana, "atividade", mais_tarde)
    assert cedo.status_code == 409 and "FORA_DA_JANELA" in cedo.text
    assert (await _cheguei(client, ana, "atividade", faxina)).status_code == 403  # só escalados
    assert (await _cheguei(client, ana, "atividade", so_cambones)).status_code == 404  # tipo não alcança

    await _modo_da_casa(client, admin, "confianca")
    conf = await _cheguei(client, ana, "atividade", mais_tarde)
    assert conf.status_code == 409 and "MODO_CONFIANCA" in conf.text
    # Trocar o modo não mexe na presença já registrada.
    lista = _por_nome((await client.get(f"{ADMIN}/{agora_mesmo}/chamada", headers=admin.headers)).json())
    assert lista["Ana Paula"]["presenca"] == "presente" and lista["Ana Paula"]["presenca_origem"] == "checkin_medium"


async def test_cheguei_com_qr_so_com_o_codigo_atual_daquela_atividade(client, db):
    tenant, admin = await _cenario(db)
    tipos = await _tipos(client, admin)
    ana, _ = await _medium(db, tenant, "Ana Paula")
    put = await client.put(f"{ADMIN}/tipos/{tipos['Reunião']['id']}", headers=admin.headers, json={"presenca_modo": "qr"})
    assert put.status_code == 200 and put.json()["presenca_modo_efetivo"] == "qr"
    assert put.json()["checkin_pelo_medium"] is True
    a = await _atividade(client, admin, tipos["Reunião"]["id"], "Reunião A", _em(30))
    b = await _atividade(client, admin, tipos["Reunião"]["id"], "Reunião B", _em(30))

    qr_a = (await client.get(f"{ADMIN}/{a}/qr", headers=admin.headers)).json()
    assert qr_a["ativo"] is True and len(qr_a["codigo"]) == 6
    assert qr_a["conteudo"].endswith(f"/medium/agenda/atividade/{a}?cheguei={qr_a['codigo']}")
    assert "Ana" not in json.dumps(qr_a) and "@" not in json.dumps(qr_a)

    assert (await _cheguei(client, ana, "atividade", b, qr_a["codigo"])).status_code == 422  # outra atividade
    assert (await _cheguei(client, ana, "atividade", a)).status_code == 422  # sem código
    vencido = svc.codigo_qr(tenant.id, "atividade", uuid.UUID(a), svc.janela_qr(_agora()) - 3)
    r = await _cheguei(client, ana, "atividade", a, vencido)
    assert r.status_code == 422 and "QR_INVALIDO" in r.text
    ok = await _cheguei(client, ana, "atividade", a, qr_a["conteudo"])  # o link inteiro do QR vale
    assert ok.status_code == 200 and ok.json()["situacao"] == "presente"
    qr_b = (await client.get(f"{ADMIN}/{b}/qr", headers=admin.headers)).json()
    assert (await _cheguei(client, ana, "atividade", b, qr_b["codigo"].lower())).status_code == 200

    # Gira: o QR da Porta/TV (PORTA:view) sem criar âncora; a Área marca com ele.
    await client.put(f"{ADMIN}/tipos/{tipos['Gira']['id']}", headers=admin.headers, json={"presenca_modo": "qr"})
    gira = Gira(tenant_id=tenant.id, nome="Gira de Exu", data_inicio=_agora() + timedelta(minutes=20), is_active=True)
    db.add(gira)
    await db.commit()
    porta = await create_user(db, tenant, UserRole.OPERATOR, name="porteiro")
    await grant(db, porta, tenant, PermissionFeature.PORTA, "view")
    qr_gira = await client.get(f"{ADMIN}/da-gira/{gira.id}/qr", headers=porta.headers)
    assert qr_gira.status_code == 200 and qr_gira.json()["ativo"] is True
    assert (await db.execute(select(func.count()).select_from(Atividade).where(Atividade.gira_id == gira.id))).scalar_one() == 0
    assert (await _cheguei(client, ana, "gira", gira.id, qr_gira.json()["codigo"])).status_code == 200
    # PORTA:view não vê o QR de atividade interna.
    assert (await client.get(f"{ADMIN}/{a}/qr", headers=porta.headers)).status_code == 403
    # Fora do modo QR, a tela não recebe código.
    put = await client.put(f"{ADMIN}/tipos/{tipos['Reunião']['id']}", headers=admin.headers, json={"presenca_modo": None})
    assert put.json()["presenca_modo"] is None and put.json()["presenca_modo_efetivo"] == "confianca"
    sem_codigo = (await client.get(f"{ADMIN}/{a}/qr", headers=admin.headers)).json()
    assert sem_codigo["ativo"] is False and sem_codigo["codigo"] is None


# ── Chamada e encerramento ──────────────────────────────────────────────────


async def test_confianca_vou_conta_presente_salvo_ausencia_e_encerrar_materializa(client, db):
    tenant, admin = await _cenario(db)
    tipos = await _tipos(client, admin)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    beto, _ = await _medium(db, tenant, "Beto Souza", atendimento=False)
    caio, _ = await _medium(db, tenant, "Caio Lima")
    reuniao = await _atividade(client, admin, tipos["Reunião"]["id"], "Reunião", _em(24 * 60))
    for actor in (ana, beto):
        assert (await _resposta(client, actor, "atividade", reuniao, "vou")).status_code == 200
    assert await _contar_linhas(uuid.UUID(reuniao)) == 2
    cedo = await client.post(f"{ADMIN}/{reuniao}/chamada/encerrar", headers=admin.headers)
    assert cedo.status_code == 409  # antes do início

    await _mover(db, uuid.UUID(reuniao), _agora() - timedelta(hours=3), _agora() - timedelta(hours=1))
    # Antes do encerramento, no modo confiança, quem confirmou já aparece como presente.
    det = (await client.get(f"{MEDIUM}/agenda/atividade/{reuniao}", headers=ana.headers)).json()
    assert det["minha_participacao"]["situacao"] == "presente"
    marcou = await _chamada(client, admin, reuniao, marcacoes=[{"medium_id": str(_por_nome((await client.get(f"{ADMIN}/{reuniao}/chamada", headers=admin.headers)).json())["Beto Souza"]["medium_id"]), "presenca": "ausente"}])
    assert marcou.status_code == 200, marcou.text

    fim = await client.post(f"{ADMIN}/{reuniao}/chamada/encerrar", headers=admin.headers)
    assert fim.status_code == 200, fim.text
    corpo = fim.json()
    pessoas = _por_nome(corpo)
    assert (pessoas["Ana Paula"]["presenca"], pessoas["Ana Paula"]["presenca_origem"]) == ("presente", "confianca")
    assert (pessoas["Beto Souza"]["presenca"], pessoas["Beto Souza"]["presenca_origem"]) == ("ausente", "chamada")
    assert (pessoas["Caio Lima"]["presenca"], pessoas["Caio Lima"]["presenca_origem"]) == ("ausente", "encerramento")
    assert corpo["atividade"]["chamada_encerrada_em"] and corpo["atividade"]["chamada_encerrada_por"] == "Dirigente"
    assert await _contar_linhas(uuid.UUID(reuniao)) == 3  # Caio materializado

    # Idempotente: encerrar de novo não muda nada nem audita de novo.
    de_novo = await client.post(f"{ADMIN}/{reuniao}/chamada/encerrar", headers=admin.headers)
    assert de_novo.status_code == 200 and de_novo.json()["atividade"]["chamada_encerrada_em"] == corpo["atividade"]["chamada_encerrada_em"]
    detalhes = (
        await db.execute(
            text("SELECT details FROM audit_logs WHERE tenant_id = :t AND resource_type = 'atividade_chamada'"),
            {"t": tenant.id},
        )
    ).scalars().all()
    assert sum(1 for d in detalhes if (d.get("new_state") or {}).get("encerrada") is True) == 1

    presencas = (await client.get(f"{MEDIUM}/presencas", headers=ana.headers)).json()
    assert [h["titulo"] for h in presencas["historico"]] == ["Reunião"]
    assert presencas["resumo"] == {**presencas["resumo"], "presentes": 1, "total": 1, "percentual": 100}
    beto_p = (await client.get(f"{MEDIUM}/presencas", headers=beto.headers)).json()
    assert beto_p["historico"][0]["minha_participacao"]["situacao"] == "ausente"
    assert beto_p["historico"][0]["minha_participacao"]["pode_justificar"] is True
    assert beto_p["resumo"]["percentual"] == 0

    # Correção depois de encerrada: vale e fica quem mudou.
    corr = await _chamada(client, admin, reuniao, marcacoes=[{"medium_id": str(ana_m.id), "presenca": "ausente"}])
    assert corr.status_code == 200 and _por_nome(corr.json())["Ana Paula"]["presenca_registrada_por"] == "Dirigente"


async def test_chamada_por_escalas_e_pela_porta_na_gira(client, db):
    tenant, admin = await _cenario(db)
    tipos = await _tipos(client, admin)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    beto, beto_m = await _medium(db, tenant, "Beto Souza", atendimento=False)
    caio, caio_m = await _medium(db, tenant, "Caio Lima")
    dora_actor, dora_m = await _medium(db, tenant, "Dora Melo")
    gira = Gira(tenant_id=tenant.id, nome="Gira de Pretos-Velhos", data_inicio=_agora() + timedelta(days=1), is_active=True)
    db.add(gira)
    await db.commit()
    assert (await _resposta(client, ana, "gira", gira.id, "nao_vou", "Consulta médica")).status_code == 200
    assert (await _resposta(client, caio, "gira", gira.id, "vou")).status_code == 200
    await db.execute(update(Gira).where(Gira.id == gira.id).values(data_inicio=_agora() - timedelta(minutes=30)))
    await db.commit()

    porteiro = await create_user(db, tenant, UserRole.OPERATOR, name="porteiro")
    await grant(db, porteiro, tenant, PermissionFeature.PORTA, "view", "edit")
    abrir = await client.post(f"{ADMIN}/da-gira/{gira.id}/chamada", headers=porteiro.headers)
    assert abrir.status_code == 200, abrir.text
    atividade_id = abrir.json()["atividade_id"]

    lista = (await client.get(f"{ADMIN}/{atividade_id}/chamada", headers=porteiro.headers)).json()
    assert lista["ver_justificativa"] is False and lista["atividade"]["origem"] == "gira"
    pessoas = _por_nome(lista)
    assert set(pessoas) == {"Ana Paula", "Beto Souza", "Caio Lima", "Dora Melo"}
    assert pessoas["Ana Paula"]["tem_justificativa"] is True and pessoas["Ana Paula"]["justificativa"] is None
    assert "Consulta" not in json.dumps(lista)
    completa = (await client.get(f"{ADMIN}/{atividade_id}/chamada", headers=admin.headers)).json()
    assert _por_nome(completa)["Ana Paula"]["justificativa"] == "Consulta médica"

    r = await _chamada(client, porteiro, atividade_id, marcacoes=[{"medium_id": str(beto_m.id), "presenca": "presente"}], marcar_confirmados=True)
    assert r.status_code == 200, r.text
    pessoas = _por_nome(r.json())
    assert pessoas["Beto Souza"]["presenca"] == "presente" and pessoas["Beto Souza"]["presenca_registrada_por"] == "Porteiro"
    assert pessoas["Caio Lima"]["presenca"] == "presente"  # confirmou "vou"
    assert pessoas["Ana Paula"]["presenca"] == "nao_registrada"
    # Tocar de novo alterna; voltar a "sem marcação" limpa quem/quando.
    r = await _chamada(client, porteiro, atividade_id, marcacoes=[{"medium_id": str(beto_m.id), "presenca": "nao_registrada"}])
    assert _por_nome(r.json())["Beto Souza"]["presenca_registrada_por"] is None

    # Atividade interna: a PORTA não abre a chamada.
    faxina = await _atividade(client, admin, tipos["Faxina"]["id"], "Faxina", _em(-30))
    assert (await client.get(f"{ADMIN}/{faxina}/chamada", headers=porteiro.headers)).status_code == 403
    so_ver = await create_user(db, tenant, UserRole.OPERATOR, name="leitor")
    await grant(db, so_ver, tenant, PermissionFeature.ESCALAS, "view")
    assert (await client.get(f"{ADMIN}/{atividade_id}/chamada", headers=so_ver.headers)).status_code == 403
    assert (await client.get(f"{ADMIN}/{atividade_id}/confirmacoes", headers=so_ver.headers)).status_code == 200
    assert (await client.get(f"{ADMIN}/{atividade_id}/confirmacoes", headers=porteiro.headers)).status_code == 403

    # Faxina ("só escalados"): avulso e quem não está na lista.
    await client.post(f"{ADMIN}/{faxina}/convocar", headers=admin.headers, json={"medium_ids": [str(ana_m.id)]})
    fora = await _chamada(client, admin, faxina, marcacoes=[{"medium_id": str(dora_m.id), "presenca": "presente"}])
    assert fora.status_code == 422 and "Adicionar quem veio" in fora.text
    avulso = await _chamada(client, admin, faxina, medium_ids=[str(dora_m.id)])
    assert avulso.status_code == 200
    dora = _por_nome(avulso.json())["Dora Melo"]
    assert (dora["origem"], dora["convocado"], dora["presenca"]) == ("avulso", False, "presente")
    assert all(o["id"] != str(dora_m.id) for o in avulso.json()["outros_mediuns"])
    enc = (await client.post(f"{ADMIN}/{faxina}/chamada/encerrar", headers=admin.headers)).json()
    final = _por_nome(enc)
    assert final["Ana Paula"]["presenca"] == "ausente" and final["Dora Melo"]["presenca"] == "presente"
    assert "Beto Souza" not in final  # só escalados: quem não foi convocado não vira ausente


async def test_encerramento_automatico_so_com_presenca_registrada(client, db):
    from src.services.presenca_scheduler import encerrar_vencidas

    tenant, admin = await _cenario(db)
    tipos = await _tipos(client, admin)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    app_tipo = (await client.post(f"{ADMIN}/tipos", headers=admin.headers, json={"nome": "Ensaio", "presenca_modo": "app"})).json()
    ids = {}
    for nome, tipo, dias in (
        ("com presenca", tipos["Reunião"]["id"], 3),
        ("sem nada", tipos["Reunião"]["id"], 3),
        ("recente", tipos["Reunião"]["id"], 1),
        ("confianca com vou", tipos["Reunião"]["id"], 3),
        ("app so com vou", app_tipo["id"], 3),
    ):
        ids[nome] = uuid.UUID(await _atividade(client, admin, tipo, nome, _em(-dias * 24 * 60), fim=_em(-dias * 24 * 60 + 60)))
    agora = _agora()
    db.add_all(
        [
            AtividadeParticipacao(tenant_id=tenant.id, atividade_id=ids["com presenca"], medium_id=ana_m.id, convocado=True,
                                  presenca="presente", presenca_origem="chamada", presenca_registrada_em=agora),
            AtividadeParticipacao(tenant_id=tenant.id, atividade_id=ids["recente"], medium_id=ana_m.id, convocado=True,
                                  presenca="presente", presenca_origem="chamada", presenca_registrada_em=agora),
            AtividadeParticipacao(tenant_id=tenant.id, atividade_id=ids["confianca com vou"], medium_id=ana_m.id,
                                  convocado=True, resposta="vou"),
            AtividadeParticipacao(tenant_id=tenant.id, atividade_id=ids["app so com vou"], medium_id=ana_m.id,
                                  convocado=True, resposta="vou"),
        ]
    )
    await db.commit()

    ana_id = ana_m.id
    assert await encerrar_vencidas() == 2
    assert await encerrar_vencidas() == 0  # idempotente
    db.expire_all()
    fechadas = {
        nome
        for nome, aid in ids.items()
        if (await db.execute(select(Atividade.chamada_encerrada_em).where(Atividade.id == aid))).scalar_one()
    }
    assert fechadas == {"com presenca", "confianca com vou"}
    linha = (
        await db.execute(
            select(AtividadeParticipacao).where(
                AtividadeParticipacao.atividade_id == ids["confianca com vou"], AtividadeParticipacao.medium_id == ana_id
            )
        )
    ).scalar_one()
    assert (linha.presenca, linha.presenca_origem) == ("presente", "confianca")
    por = (await db.execute(select(Atividade.chamada_encerrada_por).where(Atividade.id == ids["com presenca"]))).scalar_one()
    assert por is None  # foi o agendador


async def test_contar_o_motivo_ate_o_prazo(client, db):
    tenant, admin = await _cenario(db)
    tipos = await _tipos(client, admin)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    recente = await _atividade(client, admin, tipos["Reunião"]["id"], "Reunião recente", _em(-2 * 24 * 60))
    antiga = await _atividade(client, admin, tipos["Reunião"]["id"], "Reunião antiga", _em(-10 * 24 * 60))
    for aid in (recente, antiga):
        assert (await client.post(f"{ADMIN}/{aid}/chamada/encerrar", headers=admin.headers)).status_code == 200

    url = f"{MEDIUM}/atividades/atividade/{{}}/justificativa"
    vazio = await client.post(url.format(recente), headers=ana.headers, json={"justificativa": " "})
    assert vazio.status_code == 422
    ok = await client.post(url.format(recente), headers=ana.headers, json={"justificativa": "Estava doente"})
    assert ok.status_code == 200 and ok.json()["situacao"] == "ausente_justificado"
    tarde = await client.post(url.format(antiga), headers=ana.headers, json={"justificativa": "Viagem"})
    assert tarde.status_code == 409 and "prazo" in tarde.text
    await _modo_da_casa(client, admin, "confianca", prazo=15)
    assert (await client.post(url.format(antiga), headers=ana.headers, json={"justificativa": "Viagem"})).status_code == 200

    # Só depois de ausente.
    futura = await _atividade(client, admin, tipos["Reunião"]["id"], "Reunião futura", _em(60 * 24))
    assert (await client.post(url.format(futura), headers=ana.headers, json={"justificativa": "x"})).status_code == 409
    conf = _por_nome((await client.get(f"{ADMIN}/{recente}/confirmacoes", headers=admin.headers)).json())
    assert conf["Ana Paula"]["situacao"] == "ausente_justificado" and conf["Ana Paula"]["justificativa"] == "Estava doente"


# ── Visibilidade, cancelamento e isolamento ─────────────────────────────────


async def test_so_convocados_aparece_para_quem_esta_na_escala_e_cancelar_dispensa(client, db):
    tenant, admin = await _cenario(db)
    tipos = await _tipos(client, admin)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    beto, beto_m = await _medium(db, tenant, "Beto Souza")
    ritual = await _atividade(client, admin, tipos["Ritual individual"]["id"], "Amaci da Ana", _em(3 * 24 * 60))
    assert (await client.get(f"{MEDIUM}/agenda/atividade/{ritual}", headers=ana.headers)).status_code == 404
    conv = await client.post(f"{ADMIN}/{ritual}/convocar", headers=admin.headers, json={"medium_ids": [str(ana_m.id), str(beto_m.id)]})
    assert conv.status_code == 200
    det = await client.get(f"{MEDIUM}/agenda/atividade/{ritual}", headers=ana.headers)
    assert det.status_code == 200 and det.json()["minha_participacao"]["convocado"] is True
    disp = await client.post(f"{ADMIN}/{ritual}/dispensar", headers=admin.headers, json={"medium_ids": [str(beto_m.id)]})
    assert _por_nome(disp.json())["Beto Souza"]["situacao"] == "dispensado"
    assert (await _resposta(client, beto, "atividade", ritual, "vou")).status_code == 409

    cancel = await client.post(f"{ADMIN}/{ritual}/cancelar", headers=admin.headers, json={"motivo": "Chuva"})
    assert cancel.status_code == 200
    det = (await client.get(f"{MEDIUM}/agenda/atividade/{ritual}", headers=ana.headers)).json()
    assert det["minha_participacao"]["situacao"] == "dispensado" and det["cancelada"] is True
    assert (await _resposta(client, ana, "atividade", ritual, "vou")).status_code == 409
    await client.post(f"{ADMIN}/{ritual}/reativar", headers=admin.headers)
    conf = _por_nome((await client.get(f"{ADMIN}/{ritual}/confirmacoes", headers=admin.headers)).json())
    assert conf["Ana Paula"]["situacao"] == "convocado"  # voltou
    assert conf["Beto Souza"]["situacao"] == "dispensado"  # já estava fora antes do cancelamento


async def test_isolamento_entre_mediuns_e_entre_terreiros(client, db):
    tenant, admin = await _cenario(db)
    tipos = await _tipos(client, admin)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    beto, _ = await _medium(db, tenant, "Beto Souza")
    outro, admin_outro = await _cenario(db, nome="Outra Casa")
    zeca, zeca_m = await _medium(db, outro, "Zeca Lima")
    ritual = await _atividade(client, admin, tipos["Ritual coletivo"]["id"], "Amaci", _em(2 * 24 * 60))
    assert (await _resposta(client, ana, "atividade", ritual, "nao_vou", "Motivo da Ana")).status_code == 200

    beto_det = (await client.get(f"{MEDIUM}/agenda/atividade/{ritual}", headers=beto.headers)).json()
    assert beto_det["minha_participacao"]["resposta"] == "sem_resposta"
    for resp in (
        await client.get(f"{MEDIUM}/agenda", headers=beto.headers),
        await client.get(f"{MEDIUM}/presencas", headers=beto.headers),
        await client.get(f"{MEDIUM}/inicio", headers=beto.headers),
    ):
        assert resp.status_code == 200 and "Motivo da Ana" not in resp.text

    # Outro terreiro: nem o médium nem o painel alcançam.
    assert (await _resposta(client, zeca, "atividade", ritual, "vou")).status_code == 404
    assert (await client.get(f"{ADMIN}/{ritual}/chamada", headers=admin_outro.headers)).status_code == 404
    assert (await client.get(f"{ADMIN}/{ritual}/confirmacoes", headers=admin_outro.headers)).status_code == 404
    # médium de outro terreiro no corpo → 422
    r = await client.post(f"{ADMIN}/{ritual}/convocar", headers=admin.headers, json={"medium_ids": [str(zeca_m.id)]})
    assert r.status_code == 422
    r = await _chamada(client, admin, ritual, medium_ids=[str(zeca_m.id)])
    assert r.status_code == 422
    r = await _chamada(client, admin, ritual, marcacoes=[{"medium_id": str(zeca_m.id), "presenca": "presente"}])
    assert r.status_code == 422
    assert await _contar_linhas(uuid.UUID(ritual), zeca_m.id) == 0


async def test_justificativa_nunca_na_auditoria_nem_em_email(client, db, enqueued):
    tenant, admin = await _cenario(db)
    tipos = await _tipos(client, admin)
    ana, _ = await _medium(db, tenant, "Ana Paula")
    ritual = await _atividade(client, admin, tipos["Ritual coletivo"]["id"], "Amaci", _em(2 * 24 * 60))
    reuniao = await _atividade(client, admin, tipos["Reunião"]["id"], "Reunião", _em(-24 * 60))
    await _resposta(client, ana, "atividade", ritual, "nao_vou", "SEGREDO-SAUDE-1")
    await client.post(f"{ADMIN}/{reuniao}/chamada/encerrar", headers=admin.headers)
    r = await client.post(
        f"{MEDIUM}/atividades/atividade/{reuniao}/justificativa", headers=ana.headers, json={"justificativa": "SEGREDO-SAUDE-2"}
    )
    assert r.status_code == 200
    linhas = (await db.execute(text("SELECT * FROM audit_logs WHERE tenant_id = :t"), {"t": tenant.id})).all()
    assert linhas, "as ações do médium são auditadas"
    tudo = " ".join(str(tuple(row)) for row in linhas)
    assert "SEGREDO-SAUDE" not in tudo
    assert "contou o motivo de uma ausência" in tudo and "respondeu não vou" in tudo
    assert "SEGREDO-SAUDE" not in " ".join(repr(i) for i in enqueued)


# ── Impersonação, plano e concorrência ──────────────────────────────────────


async def test_impersonacao_le_mas_nao_escreve(client, db):
    tenant, admin = await _cenario(db)
    tipos = await _tipos(client, admin)
    ana, _ = await _medium(db, tenant, "Ana Paula")
    reuniao = await _atividade(client, admin, tipos["Reunião"]["id"], "Reunião", _em(30))
    token = create_access_token(ana.user.id, tenant.id, "medium", impersonated_by=uuid.uuid4())
    h = {"Authorization": f"Bearer {token}"}
    base = f"{MEDIUM}/atividades/atividade/{reuniao}"
    assert (await client.post(f"{base}/resposta", headers=h, json={"resposta": "vou"})).status_code == 403
    assert (await client.post(f"{base}/checkin", headers=h, json={})).status_code == 403
    assert (await client.post(f"{base}/justificativa", headers=h, json={"justificativa": "x"})).status_code == 403
    assert (await client.get(f"{MEDIUM}/presencas", headers=h)).status_code == 200
    assert await _contar_linhas(uuid.UUID(reuniao)) == 0


@pytest.mark.parametrize("plan, liberada", [(PlanType.BASIC, False), (PlanType.FREE, True)])
async def test_sem_chave_do_piloto_ou_sem_plano_403(client, db, plan, liberada):
    tenant, admin = await _cenario(db, plan=plan, liberada=liberada)
    ana, _ = await _medium(db, tenant, "Ana Paula")
    atividade = Atividade(
        tenant_id=tenant.id,
        tipo_id=(await db.execute(text("SELECT id FROM atividade_tipos WHERE tenant_id = :t AND nome = 'Reunião'"), {"t": tenant.id})).scalar_one(),
        titulo="Reunião",
        inicio=_agora() + timedelta(days=1),
    )
    db.add(atividade)
    await db.commit()
    assert (await _resposta(client, ana, "atividade", atividade.id, "vou")).status_code == 403
    assert (await client.get(f"{MEDIUM}/presencas", headers=ana.headers)).status_code == 403
    assert (await client.get(f"{ADMIN}/{atividade.id}/chamada", headers=admin.headers)).status_code == 403
    assert (await client.get(f"{ADMIN}/{atividade.id}/confirmacoes", headers=admin.headers)).status_code == 403


async def test_cheguei_e_chamada_ao_mesmo_tempo_nao_duplicam(client, db):
    tenant, admin = await _cenario(db)
    tipos = await _tipos(client, admin)
    await _modo_da_casa(client, admin, "app")
    pessoas = [await _medium(db, tenant, f"Medium {i:02d}") for i in range(6)]
    reuniao = await _atividade(client, admin, tipos["Reunião"]["id"], "Reunião", _em(10))

    tarefas = []
    for actor, medium in pessoas:
        tarefas.append(_cheguei(client, actor, "atividade", reuniao))
        tarefas.append(_chamada(client, admin, reuniao, marcacoes=[{"medium_id": str(medium.id), "presenca": "presente"}]))
        tarefas.append(_cheguei(client, actor, "atividade", reuniao))
    respostas = await asyncio.gather(*tarefas)
    assert all(r.status_code == 200 for r in respostas), [r.text for r in respostas if r.status_code != 200]
    assert await _contar_linhas(uuid.UUID(reuniao)) == len(pessoas)
    lista = (await client.get(f"{ADMIN}/{reuniao}/chamada", headers=admin.headers)).json()
    assert lista["contadores"]["presentes"] == len(pessoas)


# ── Configuração ────────────────────────────────────────────────────────────


async def test_configuracao_da_presenca_na_area_e_no_tipo(client, db):
    tenant, admin = await _cenario(db)
    tipos = await _tipos(client, admin)
    cfg = (await client.get(CONFIG, headers=admin.headers)).json()
    assert cfg["presenca"] == {"modo_padrao": "confianca", "prazo_justificativa_dias": 7}
    assert cfg["presenca_no_plano"] is True
    assert (await client.put(CONFIG, headers=admin.headers, json={"presenca": {"modo_padrao": "gps"}})).status_code == 422
    assert (await client.put(CONFIG, headers=admin.headers, json={"presenca": {"prazo_justificativa_dias": 0}})).status_code == 422
    ok = await client.put(CONFIG, headers=admin.headers, json={"presenca": {"modo_padrao": "qr", "prazo_justificativa_dias": 10}})
    assert ok.json()["presenca"] == {"modo_padrao": "qr", "prazo_justificativa_dias": 10}
    novos = await _tipos(client, admin)
    assert novos["Reunião"]["presenca_modo"] is None and novos["Reunião"]["presenca_modo_efetivo"] == "qr"

    # Compatibilidade: quem ainda manda só `checkin_pelo_medium` (AM-08).
    tid = tipos["Faxina"]["id"]
    put = (await client.put(f"{ADMIN}/tipos/{tid}", headers=admin.headers, json={"checkin_pelo_medium": True})).json()
    assert (put["presenca_modo"], put["checkin_pelo_medium"]) == ("app", True)
    put = (await client.put(f"{ADMIN}/tipos/{tid}", headers=admin.headers, json={"checkin_pelo_medium": False})).json()
    assert (put["presenca_modo"], put["checkin_pelo_medium"]) == ("confianca", False)
    assert (await client.put(f"{ADMIN}/tipos/{tid}", headers=admin.headers, json={"presenca_modo": "gps"})).status_code == 422
    # Operador sem CONFIGURACOES não mexe no modo da casa.
    op = await create_user(db, tenant, UserRole.OPERATOR, name="operador")
    await grant(db, op, tenant, PermissionFeature.ESCALAS, "view", "edit")
    assert (await client.put(CONFIG, headers=op.headers, json={"presenca": {"modo_padrao": "app"}})).status_code == 403


# ── Migração 079 ────────────────────────────────────────────────────────────


def _alembic(*args):
    import subprocess
    import sys

    from .conftest import BACKEND_DIR

    subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR, check=True, capture_output=True)


async def test_migracao_079_sobe_e_desce_e_leva_o_cheguei_do_am08(client, db):
    from src.core.database import engine

    tenant, _ = await _cenario(db)
    await db.execute(text("UPDATE atividade_tipos SET checkin_pelo_medium = true WHERE tenant_id = :t AND nome = 'Faxina'"), {"t": tenant.id})
    await db.commit()
    await db.close()
    _alembic("downgrade", "078_atividades")
    try:
        async with engine.connect() as conn:
            tabelas = set((await conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))).scalars())
            colunas = set(
                (await conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'tenant_configs'"))).scalars()
            )
        assert "atividade_participacoes" not in tabelas and "presenca_modo_padrao" not in colunas
    finally:
        _alembic("upgrade", "head")
    async with engine.connect() as conn:
        modos = dict(
            (await conn.execute(text("SELECT nome, presenca_modo FROM atividade_tipos WHERE tenant_id = :t"), {"t": tenant.id})).all()
        )
        cfg = (
            await conn.execute(
                text("SELECT presenca_modo_padrao, presenca_prazo_justificativa_dias FROM tenant_configs WHERE tenant_id = :t"),
                {"t": tenant.id},
            )
        ).one()
        unico = (
            await conn.execute(
                text("SELECT count(*) FROM pg_constraint WHERE conname = 'uq_atividade_participacoes_atividade_medium'")
            )
        ).scalar_one()
    assert modos["Faxina"] == "app" and modos["Reunião"] is None
    assert tuple(cfg) == ("confianca", 7)
    assert unico == 1
