"""AM-25 — Escala de faxina com Postgres real (migrações + app inteiro via HTTP).

- Rascunho não aparece para o médium; publicar cria uma atividade por dia e grupo ("Faxina · G1")
  e convoca os membros ATIVOS de cada grupo (origem "grupo"); a Agenda do médium mostra o grupo.
- Republicar aplica o diff: dia removido → cancelada e escala dispensada; grupo trocado → os do
  grupo antigo dispensados e os do novo convocados na mesma atividade; o que não mudou mantém
  respostas e presenças. Publicar de novo sem mudança não faz nada; publicações simultâneas
  não duplicam (FOR UPDATE no plano).
- "Atualizar convocações" só mexe nas faxinas que ainda não começaram.
- Copiar do mês anterior, girar e distribuir pela API.
- Ids de outro terreiro recusados sem gravar; plano sem `escalas` → 403; chave do piloto
  desligada → 403; grupo de permissão por ação.
"""
import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select, update

from src.core.tz import today_local
from src.models import Atividade, AtividadeParticipacao, AtividadeTipo, EscalaPlano, EscalaPlanoDia, Medium
from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.users import UserRole
from src.services import escala_planos as svc
from src.services.atividades import ensure_default_atividade_tipos

from .factories import create_tenant, create_user, grant

PLANOS = "/api/v1/admin/escala-planos"
GRUPOS = "/api/v1/admin/corrente-grupos"
MEDIUM = "/api/v1/medium"


@pytest.fixture(autouse=True)
def _sem_cookies(client):
    client.cookies.clear()
    yield
    client.cookies.clear()


def _proximo_mes(meses: int = 1) -> date:
    mes = today_local().replace(day=1)
    for _ in range(meses):
        mes = (mes + timedelta(days=32)).replace(day=1)
    return mes


MES = _proximo_mes()
MES_TXT = svc.mes_texto(MES)
SAB = [svc.enesimo_dia_semana(MES, 6, n) for n in (1, 2, 3, 4)]  # os 4 primeiros sábados


async def _cenario(db, nome="Terreiro AM25", plan=PlanType.PRO, liberada=True):
    tenant = await create_tenant(db, name=nome, plan=plan, area_medium_liberada=liberada)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="dirigente")
    await ensure_default_atividade_tipos(db, tenant.id)
    await db.commit()
    faxina = (
        await db.execute(select(AtividadeTipo).where(AtividadeTipo.tenant_id == tenant.id, AtividadeTipo.nome == "Faxina"))
    ).scalar_one()
    return tenant, admin, faxina


async def _medium(db, tenant, nome, *, ativo=True):
    actor = await create_user(db, tenant, UserRole.MEDIUM, name=nome.split()[0].lower())
    medium = Medium(tenant_id=tenant.id, nome=nome, is_atendimento=True, user_id=actor.user.id)
    db.add(medium)
    await db.commit()
    if not ativo:
        await db.execute(update(Medium).where(Medium.id == medium.id).values(is_active=False))
        await db.commit()
    return actor, medium


async def _grupo(client, admin, nome, mediuns):
    resp = await client.post(GRUPOS, headers=admin.headers, json={"nome": nome, "medium_ids": [str(m.id) for m in mediuns]})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _url(tipo, mes=MES_TXT, acao=""):
    return f"{PLANOS}/{tipo.id if hasattr(tipo, 'id') else tipo}/{mes}{acao}"


async def _salvar(client, actor, tipo, dias, mes=MES_TXT):
    body = {"dias": [{"data": d.isoformat(), "grupo_id": str(g), **extra} for d, g, *rest in dias for extra in [rest[0] if rest else {}]]}
    return await client.put(_url(tipo, mes), headers=actor.headers, json=body)


async def _publicar(client, actor, tipo, mes=MES_TXT):
    return await client.post(_url(tipo, mes, "/publicar"), headers=actor.headers)


async def _fresh(stmt):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(stmt)).scalars().all()


async def _atividades(tenant_id) -> dict:
    rows = await _fresh(
        select(Atividade).where(Atividade.tenant_id == tenant_id, Atividade.origem == "plano_escala")
    )
    return {(a.inicio.astimezone(svc.APP_TZ).date(), a.titulo): a for a in rows}


async def _linhas(atividade_id) -> dict:
    rows = await _fresh(select(AtividadeParticipacao).where(AtividadeParticipacao.atividade_id == atividade_id))
    return {p.medium_id: p for p in rows}


async def _cenario_com_grupos(client, db, **kw):
    tenant, admin, faxina = await _cenario(db, **kw)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    beto, beto_m = await _medium(db, tenant, "Beto Lima")
    caio, caio_m = await _medium(db, tenant, "Caio Souza")
    _, dani_m = await _medium(db, tenant, "Dani Reis")
    g1 = await _grupo(client, admin, "G1", [ana_m, beto_m, dani_m])
    g2 = await _grupo(client, admin, "G2", [caio_m])
    # Dani saiu da casa depois de entrar no G1 (a linha do grupo ficou): não é convocada.
    await db.execute(update(Medium).where(Medium.id == dani_m.id).values(is_active=False))
    await db.commit()
    return {
        "tenant": tenant, "admin": admin, "faxina": faxina, "g1": g1, "g2": g2,
        "ana": ana, "ana_m": ana_m, "beto": beto, "beto_m": beto_m, "caio": caio, "caio_m": caio_m, "dani_m": dani_m,
    }


# ── Rascunho e publicação ───────────────────────────────────────────────────


async def test_rascunho_invisivel_e_publicar_cria_faxinas_e_convoca_os_grupos(client, db):
    c = await _cenario_com_grupos(client, db)
    admin, faxina, g1, g2 = c["admin"], c["faxina"], c["g1"], c["g2"]

    vazio = (await client.get(_url(faxina), headers=admin.headers)).json()
    assert (vazio["existe"], vazio["dias"], vazio["mes"]) == (False, [], MES_TXT)
    assert [g["nome"] for g in vazio["grupos"]] == ["G1", "G2"]
    assert {g["nome"]: g["total_membros"] for g in vazio["grupos"]} == {"G1": 2, "G2": 1}  # sem a Dani
    assert (vazio["hora_inicio_padrao"], vazio["hora_fim_padrao"]) == ("09:00", "12:00")

    resp = await _salvar(
        client, admin, faxina, [(SAB[0], g1), (SAB[1], g2), (SAB[2], g1), (SAB[2], g2, {"hora_inicio": "08:00", "hora_fim": "10:30"})]
    )
    assert resp.status_code == 200, resp.text
    rascunho = resp.json()
    assert (rascunho["status"], len(rascunho["dias"]), rascunho["pendencias"]["criar"]) == ("rascunho", 4, 4)
    assert all(not d["publicado"] for d in rascunho["dias"])

    # O médium não vê nada do rascunho.
    assert await _atividades(c["tenant"].id) == {}
    agenda = (await client.get(f"{MEDIUM}/agenda", headers=c["ana"].headers)).json()
    assert not [i for i in agenda["itens"] if i["tipo"]["nome"] == "Faxina"]

    pub = await _publicar(client, admin, faxina)
    assert pub.status_code == 200, pub.text
    body = pub.json()
    assert body["resultado"]["criadas"] == 4
    assert body["resultado"]["convocados"] == 2 + 1 + 2 + 1
    assert body["status"] == "publicado" and body["publicado_por"]
    assert body["pendencias"]["tem_mudancas"] is False
    assert all(d["publicado"] for d in body["dias"])

    atividades = await _atividades(c["tenant"].id)
    assert set(atividades) == {
        (SAB[0], "Faxina · G1"), (SAB[1], "Faxina · G2"), (SAB[2], "Faxina · G1"), (SAB[2], "Faxina · G2")
    }
    terceiro_g2 = atividades[(SAB[2], "Faxina · G2")]
    assert terceiro_g2.inicio.astimezone(svc.APP_TZ).strftime("%H:%M") == "08:00"
    assert terceiro_g2.fim.astimezone(svc.APP_TZ).strftime("%H:%M") == "10:30"
    linhas = await _linhas(atividades[(SAB[0], "Faxina · G1")].id)
    assert set(linhas) == {c["ana_m"].id, c["beto_m"].id}
    assert {(p.origem, str(p.grupo_id), p.convocado) for p in linhas.values()} == {("grupo", g1, True)}

    # A Agenda da Ana mostra as faxinas dela com o grupo e o horário.
    agenda = (await client.get(f"{MEDIUM}/agenda", headers=c["ana"].headers)).json()
    minhas = [i for i in agenda["itens"] if i["minha_participacao"] and i["minha_participacao"]["convocado"]]
    assert {i["titulo"] for i in minhas} == {"Faxina · G1"}
    assert {i["minha_participacao"]["grupo"] for i in minhas} == {"G1"}
    assert all(i["inicio"] and i["fim"] for i in minhas)


async def test_republicar_aplica_o_diff_e_preserva_o_que_nao_mudou(client, db):
    c = await _cenario_com_grupos(client, db)
    admin, faxina, g1, g2 = c["admin"], c["faxina"], c["g1"], c["g2"]
    assert (await _salvar(client, admin, faxina, [(SAB[0], g1), (SAB[1], g2), (SAB[2], g1)])).status_code == 200
    assert (await _publicar(client, admin, faxina)).status_code == 200
    antes = await _atividades(c["tenant"].id)
    a0, a1, a2 = antes[(SAB[0], "Faxina · G1")], antes[(SAB[1], "Faxina · G2")], antes[(SAB[2], "Faxina · G1")]

    # Ana responde "vou" no 1º sábado e o Caio, no 2º; a Ana tem presença registrada no 1º.
    r = await client.post(f"{MEDIUM}/atividades/atividade/{a0.id}/resposta", headers=c["ana"].headers, json={"resposta": "vou"})
    assert r.status_code == 200, r.text
    r = await client.post(f"{MEDIUM}/atividades/atividade/{a1.id}/resposta", headers=c["caio"].headers, json={"resposta": "vou"})
    assert r.status_code == 200, r.text
    await db.execute(
        update(AtividadeParticipacao)
        .where(AtividadeParticipacao.atividade_id == a0.id, AtividadeParticipacao.medium_id == c["ana_m"].id)
        .values(presenca="presente", presenca_origem="chamada")
    )
    await db.commit()

    # 1º sábado igual; 2º troca G2 → G1; 3º sai; 4º entra o G2.
    resp = await _salvar(client, admin, faxina, [(SAB[0], g1), (SAB[1], g1), (SAB[3], g2)])
    assert resp.status_code == 200, resp.text
    assert resp.json()["pendencias"] == {
        "criar": 1, "cancelar": 1, "trocar": 1, "reagendar": 0, "ignorados_passado": 0, "tem_mudancas": True
    }
    # Ainda não publicado: o médium continua vendo o que estava publicado.
    assert set(await _atividades(c["tenant"].id)) == set(antes)

    pub = (await _publicar(client, admin, faxina)).json()
    assert {k: pub["resultado"][k] for k in ("criadas", "canceladas", "trocadas", "reagendadas")} == {
        "criadas": 1, "canceladas": 1, "trocadas": 1, "reagendadas": 0
    }
    depois = await _atividades(c["tenant"].id)

    # Não mudou: mesma atividade, resposta e presença da Ana mantidas.
    assert depois[(SAB[0], "Faxina · G1")].id == a0.id
    ana0 = (await _linhas(a0.id))[c["ana_m"].id]
    assert (ana0.resposta, ana0.presenca, ana0.dispensado_em) == ("vou", "presente", None)

    # Trocou o grupo: a MESMA atividade vira "Faxina · G1"; o Caio (G2) é dispensado e o G1 convocado.
    trocada = depois[(SAB[1], "Faxina · G1")]
    assert trocada.id == a1.id and trocada.cancelada_em is None
    l1 = await _linhas(a1.id)
    assert l1[c["caio_m"].id].dispensado_em is not None and l1[c["caio_m"].id].resposta == "vou"
    assert {m for m, p in l1.items() if p.dispensado_em is None} == {c["ana_m"].id, c["beto_m"].id}
    assert all(str(l1[m].grupo_id) == g1 for m in (c["ana_m"].id, c["beto_m"].id))

    # Dia removido: atividade cancelada, todo mundo dispensado.
    cancelada = depois[(SAB[2], "Faxina · G1")]
    assert cancelada.id == a2.id and cancelada.cancelada_em is not None
    assert cancelada.cancelamento_motivo == svc.MOTIVO_DIA_REMOVIDO
    assert all(p.dispensado_em is not None for p in (await _linhas(a2.id)).values())

    # Dia novo: criado com o G2.
    nova = depois[(SAB[3], "Faxina · G2")]
    assert set(await _linhas(nova.id)) == {c["caio_m"].id}

    # O Caio vê o 2º sábado como cancelado para ele? Não: só "a casa tirou você da escala".
    det = (await client.get(f"{MEDIUM}/agenda/atividade/{a1.id}", headers=c["caio"].headers)).json()
    assert det["minha_participacao"]["situacao"] == "dispensado"

    # Plano: só os 3 dias ativos, todos publicados, sem pendências.
    plano = (await client.get(_url(faxina), headers=admin.headers)).json()
    assert sorted((d["data"], d["grupo_id"]) for d in plano["dias"]) == sorted(
        [(SAB[0].isoformat(), g1), (SAB[1].isoformat(), g1), (SAB[3].isoformat(), g2)]
    )
    assert plano["pendencias"]["tem_mudancas"] is False


async def test_publicar_de_novo_e_ao_mesmo_tempo_nao_duplica(client, db):
    c = await _cenario_com_grupos(client, db)
    admin, faxina, g1, g2 = c["admin"], c["faxina"], c["g1"], c["g2"]
    assert (await _salvar(client, admin, faxina, [(SAB[0], g1), (SAB[1], g2), (SAB[1], g1)])).status_code == 200

    respostas = await asyncio.gather(*[_publicar(client, admin, faxina) for _ in range(5)])
    assert all(r.status_code == 200 for r in respostas), [r.text for r in respostas]
    assert sum(r.json()["resultado"]["criadas"] for r in respostas) == 3
    atividades = await _atividades(c["tenant"].id)
    assert len(atividades) == 3

    # De novo, sem mudança: nada acontece.
    de_novo = (await _publicar(client, admin, faxina)).json()["resultado"]
    assert de_novo == {
        "criadas": 0, "canceladas": 0, "trocadas": 0, "reagendadas": 0, "atividades": 0,
        "convocados": 0, "dispensados": 0, "ignorados_passado": 0, "fora_da_elegibilidade": 0,
    }
    assert len(await _atividades(c["tenant"].id)) == 3
    total = (
        await _fresh(
            select(func.count())
            .select_from(AtividadeParticipacao)
            .where(AtividadeParticipacao.atividade_id.in_([a.id for a in atividades.values()]))
        )
    )[0]
    assert total == 2 + 1 + 2


async def test_mudar_horario_reagenda_sem_perder_resposta(client, db):
    c = await _cenario_com_grupos(client, db)
    admin, faxina, g1 = c["admin"], c["faxina"], c["g1"]
    assert (await _salvar(client, admin, faxina, [(SAB[0], g1)])).status_code == 200
    assert (await _publicar(client, admin, faxina)).status_code == 200
    a0 = (await _atividades(c["tenant"].id))[(SAB[0], "Faxina · G1")]
    await client.post(f"{MEDIUM}/atividades/atividade/{a0.id}/resposta", headers=c["ana"].headers, json={"resposta": "vou"})
    assert (
        await _salvar(client, admin, faxina, [(SAB[0], g1, {"hora_inicio": "14:00", "hora_fim": "16:00"})])
    ).status_code == 200
    res = (await _publicar(client, admin, faxina)).json()["resultado"]
    assert res["reagendadas"] == 1
    a0 = (await _atividades(c["tenant"].id))[(SAB[0], "Faxina · G1")]
    assert a0.inicio.astimezone(svc.APP_TZ).strftime("%H:%M") == "14:00"
    assert (await _linhas(a0.id))[c["ana_m"].id].resposta == "vou"


async def test_atualizar_convocacoes_so_nas_faxinas_futuras(client, db):
    c = await _cenario_com_grupos(client, db)
    admin, faxina, g1 = c["admin"], c["faxina"], c["g1"]
    assert (await _salvar(client, admin, faxina, [(SAB[0], g1), (SAB[1], g1)])).status_code == 200
    # Antes de publicar não há o que atualizar.
    assert (await client.post(_url(faxina, acao="/atualizar-convocacoes"), headers=admin.headers)).status_code == 409
    assert (await _publicar(client, admin, faxina)).status_code == 200
    atividades = await _atividades(c["tenant"].id)
    passada, futura = atividades[(SAB[0], "Faxina · G1")], atividades[(SAB[1], "Faxina · G1")]
    # A primeira faxina "já aconteceu".
    agora = datetime.now(timezone.utc)
    await db.execute(
        update(Atividade).where(Atividade.id == passada.id).values(inicio=agora - timedelta(days=2), fim=agora - timedelta(days=2, hours=-3))
    )
    await db.commit()

    # Edu entra no G1 e o Beto sai.
    _, edu_m = await _medium(db, c["tenant"], "Edu Ramos")
    r = await client.post(f"{GRUPOS}/{g1}/membros", headers=admin.headers, json={"medium_ids": [str(edu_m.id)]})
    assert r.status_code == 200, r.text
    r = await client.delete(f"{GRUPOS}/{g1}/membros/{c['beto_m'].id}", headers=admin.headers)
    assert r.status_code == 204, r.text

    resp = await client.post(_url(faxina, acao="/atualizar-convocacoes"), headers=admin.headers)
    assert resp.status_code == 200, resp.text
    res = resp.json()["resultado"]
    assert (res["atividades"], res["convocados"], res["dispensados"]) == (1, 1, 1)

    futura_l = await _linhas(futura.id)
    assert futura_l[edu_m.id].dispensado_em is None and futura_l[edu_m.id].origem == "grupo"
    assert futura_l[c["beto_m"].id].dispensado_em is not None
    assert futura_l[c["ana_m"].id].dispensado_em is None
    passada_l = await _linhas(passada.id)
    assert edu_m.id not in passada_l  # o passado não muda
    assert passada_l[c["beto_m"].id].dispensado_em is None

    # De novo: nada muda.
    res = (await client.post(_url(faxina, acao="/atualizar-convocacoes"), headers=admin.headers)).json()["resultado"]
    assert (res["convocados"], res["dispensados"]) == (0, 0)


# ── Atalhos ─────────────────────────────────────────────────────────────────


async def test_distribuir_girar_e_copiar_do_mes_anterior(client, db):
    c = await _cenario_com_grupos(client, db)
    admin, faxina, g1, g2 = c["admin"], c["faxina"], c["g1"], c["g2"]
    g3 = await _grupo(client, admin, "G3", [c["ana_m"]])

    resp = await client.post(
        _url(faxina, acao="/distribuir"), headers=admin.headers, json={"dias_semana": [6], "grupo_ids": [g1, g2, g3]}
    )
    assert resp.status_code == 200, resp.text
    sabados = sorted(d for d in svc.dias_do_mes(MES) if svc.dia_semana(d) == 6)
    esperado = [(d.isoformat(), [g1, g2, g3][i % 3]) for i, d in enumerate(sabados)]
    assert sorted((d["data"], d["grupo_id"]) for d in resp.json()["dias"]) == esperado

    resp = await client.post(_url(faxina, acao="/girar-grupos"), headers=admin.headers, json={})
    assert resp.status_code == 200, resp.text
    girado = [(d.isoformat(), [g2, g3, g1][i % 3]) for i, d in enumerate(sabados)]  # G2 pega os do G1...
    assert sorted((d["data"], d["grupo_id"]) for d in resp.json()["dias"]) == girado

    # Copiar para o mês seguinte pela ordem do sábado.
    seguinte = _proximo_mes(2)
    resp = await client.post(_url(faxina, svc.mes_texto(seguinte), "/copiar-mes-anterior"), headers=admin.headers)
    assert resp.status_code == 200, resp.text
    copiado = resp.json()
    origem = [svc.DiaPlano(date.fromisoformat(d), uuid.UUID(g), svc.HORA_PADRAO) for d, g in girado]
    esperado, descartados = svc.copiar_por_dia_da_semana(origem, seguinte)
    assert sorted((d["data"], d["grupo_id"]) for d in copiado["dias"]) == sorted(
        (d.data.isoformat(), str(d.grupo_id)) for d in esperado
    )
    assert copiado["descartados"] == descartados
    assert copiado["mes_anterior_dias"] == len(sabados)

    # Mês anterior vazio → 409; girar sem plano → 409.
    vazio = svc.mes_texto(_proximo_mes(5))
    assert (await client.post(_url(faxina, vazio, "/copiar-mes-anterior"), headers=admin.headers)).status_code == 409
    assert (await client.post(_url(faxina, vazio, "/girar-grupos"), headers=admin.headers, json={})).status_code == 409


async def test_validacoes_do_rascunho(client, db):
    c = await _cenario_com_grupos(client, db)
    admin, faxina, g1 = c["admin"], c["faxina"], c["g1"]
    fora = MES - timedelta(days=1)
    assert (await _salvar(client, admin, faxina, [(fora, g1)])).status_code == 422
    assert (await _salvar(client, admin, faxina, [(SAB[0], g1, {"hora_inicio": "10:00", "hora_fim": "09:00"})])).status_code == 422
    assert (await client.get(_url(faxina, "2026-13"), headers=admin.headers)).status_code == 422
    # Tipo sem escala por grupos (Reunião) → 422.
    reuniao = (
        await db.execute(
            select(AtividadeTipo).where(AtividadeTipo.tenant_id == c["tenant"].id, AtividadeTipo.nome == "Reunião")
        )
    ).scalar_one()
    assert (await client.get(_url(reuniao), headers=admin.headers)).status_code == 422
    # Publicar sem nenhum dia → 409.
    assert (await _salvar(client, admin, faxina, [])).status_code == 200
    assert (await _publicar(client, admin, faxina)).status_code == 409


# ── Isolamento, plano e permissões ──────────────────────────────────────────


async def test_ids_de_outro_terreiro_sao_recusados(client, db):
    c = await _cenario_com_grupos(client, db)
    admin, faxina, g1 = c["admin"], c["faxina"], c["g1"]
    tenant_b, admin_b, faxina_b = await _cenario(db, nome="Terreiro B AM25")
    _, bia_b = await _medium(db, tenant_b, "Bia B")
    g_b = await _grupo(client, admin_b, "G1 de B", [bia_b])

    # tipo de B no caminho
    assert (await client.get(_url(faxina_b), headers=admin.headers)).status_code == 404
    assert (await _salvar(client, admin, faxina_b, [(SAB[0], g1)])).status_code == 404
    assert (await _publicar(client, admin, faxina_b)).status_code == 404
    # grupo de B no corpo
    assert (await _salvar(client, admin, faxina, [(SAB[0], g_b)])).status_code == 422
    resp = await client.post(_url(faxina, acao="/distribuir"), headers=admin.headers, json={"dias_semana": [6], "grupo_ids": [g_b]})
    assert resp.status_code == 422
    assert (await _salvar(client, admin, faxina, [(SAB[0], g1)])).status_code == 200
    resp = await client.post(_url(faxina, acao="/girar-grupos"), headers=admin.headers, json={"grupo_ids": [g1, g_b]})
    assert resp.status_code == 422

    assert not await _fresh(select(EscalaPlanoDia).where(EscalaPlanoDia.grupo_id == uuid.UUID(g_b)))
    assert not await _fresh(select(EscalaPlano).where(EscalaPlano.tipo_id == faxina_b.id))
    # B não vê o plano de A.
    assert (await client.get(_url(faxina), headers=admin_b.headers)).status_code == 404


@pytest.mark.parametrize("plan, liberada", [(PlanType.BASIC, True), (PlanType.PRO, False)])
async def test_sem_plano_pro_ou_sem_a_chave_do_piloto_403(client, db, plan, liberada):
    tenant, admin, faxina = await _cenario(db, plan=plan, liberada=liberada)
    assert (await client.get(_url(faxina), headers=admin.headers)).status_code == 403
    assert (await _salvar(client, admin, faxina, [])).status_code == 403
    assert (await _publicar(client, admin, faxina)).status_code == 403


async def test_grupo_de_permissao_por_acao(client, db):
    c = await _cenario_com_grupos(client, db)
    tenant, faxina, g1 = c["tenant"], c["faxina"], c["g1"]
    so_ve = await create_user(db, tenant, UserRole.OPERATOR, name="ve")
    await grant(db, so_ve, tenant, PermissionFeature.ESCALAS, "view")
    edita = await create_user(db, tenant, UserRole.OPERATOR, name="edita")
    await grant(db, edita, tenant, PermissionFeature.ESCALAS, "view", "edit")
    publica = await create_user(db, tenant, UserRole.OPERATOR, name="publica")
    await grant(db, publica, tenant, PermissionFeature.ESCALAS, "view", "insert", "edit")

    assert (await client.get(_url(faxina), headers=so_ve.headers)).status_code == 200
    assert (await _salvar(client, so_ve, faxina, [(SAB[0], g1)])).status_code == 403
    assert (await _salvar(client, edita, faxina, [(SAB[0], g1)])).status_code == 200
    assert (await _publicar(client, edita, faxina)).status_code == 403
    assert (await _publicar(client, publica, faxina)).status_code == 200
