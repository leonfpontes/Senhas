"""AM-26 — Relatório de assiduidade com Postgres real (migrações + app inteiro via HTTP).

- Números por médium e por grupo num cenário semeado: presentes, ausências com e sem motivo,
  "sem chamada" (fora do percentual), dispensados e atividade cancelada (fora), quem veio sem
  estar na escala (não é convocação), tipo que não controla presença, gira excluída, médium
  excluído e atividade fora do período (não aparecem).
- Filtros por período, tipo e grupo; `agrupar=grupo` sem o plano Pro (`escalas`) → 403.
- Confiança de verdade: "vou" + encerrar a chamada pela API → presente no relatório.
- Justificativa: o agregado (o que vai ao PDF) nunca traz o texto; o detalhe por médium traz,
  e só com `ESCALAS:view` (operador sem a feature → 403).
- Ids de outro terreiro → 404; id malformado → 422; período inválido → 400; chave do piloto
  desligada → 403.
"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from src.models import (
    Atividade,
    AtividadeParticipacao,
    AtividadeTipo,
    CorrenteGrupo,
    CorrenteGrupoMembro,
    Gira,
    Medium,
)
from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.users import UserRole
from src.services.atividades import ensure_default_atividade_tipos

from .factories import create_tenant, create_user, grant

ADMIN = "/api/v1/admin/atividades"
RELATORIO = f"{ADMIN}/assiduidade"
MEDIUM = "/api/v1/medium"


def _agora() -> datetime:
    return datetime.now(timezone.utc)


async def _cenario(db, nome="Terreiro AM26", plan=PlanType.PRO, liberada=True):
    tenant = await create_tenant(db, name=nome, plan=plan, area_medium_liberada=liberada)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="dirigente")
    await ensure_default_atividade_tipos(db, tenant.id)
    await db.commit()
    return tenant, admin


async def _tipos(db, tenant) -> dict[str, AtividadeTipo]:
    rows = await db.execute(select(AtividadeTipo).where(AtividadeTipo.tenant_id == tenant.id))
    return {t.nome: t for t in rows.scalars().all()}


def _medium(db, tenant, nome, **kw) -> Medium:
    m = Medium(tenant_id=tenant.id, nome=nome, is_atendimento=True, **kw)
    db.add(m)
    return m


def _grupo(db, tenant, nome, cor, **kw) -> CorrenteGrupo:
    g = CorrenteGrupo(tenant_id=tenant.id, nome=nome, cor=cor, **kw)
    db.add(g)
    return g


def _atividade(db, tenant, tipo, titulo, inicio, *, encerrada=False, cancelada=False, **kw) -> Atividade:
    a = Atividade(
        tenant_id=tenant.id,
        tipo_id=tipo.id,
        titulo=titulo,
        inicio=inicio,
        fim=inicio + timedelta(hours=2),
        origem="manual",
        visibilidade="corrente",
        chamada_encerrada_em=(inicio + timedelta(hours=3)) if encerrada else None,
        cancelada_em=(inicio - timedelta(days=1)) if cancelada else None,
        **kw,
    )
    db.add(a)
    return a


def _p(db, tenant, atividade, medium, *, convocado=True, presenca="nao_registrada", resposta="sem_resposta", **kw):
    db.add(
        AtividadeParticipacao(
            tenant_id=tenant.id,
            atividade_id=atividade.id,
            medium_id=medium.id,
            convocado=convocado,
            origem="manual" if convocado else "avulso",
            presenca=presenca,
            resposta=resposta,
            presenca_origem=kw.pop("presenca_origem", "chamada" if presenca != "nao_registrada" else None),
            **kw,
        )
    )


async def _semear(db, tenant):
    """Cenário do módulo (ver o docstring de cada atividade). Devolve ids úteis."""
    tipos = await _tipos(db, tenant)
    agora = _agora()
    ana, beto, caio, duda = (_medium(db, tenant, n) for n in ("Ana Paula", "Beto Souza", "Caio Lima", "Duda Reis"))
    eva = _medium(db, tenant, "Eva Excluída", deleted_at=agora)
    await db.flush()
    g1 = _grupo(db, tenant, "G1", "petroleo")
    g2 = _grupo(db, tenant, "G2", "vinho")
    g3 = _grupo(db, tenant, "G3 antigo", "grafite", arquivado_em=agora)
    await db.flush()
    for g, ms in ((g1, (ana, beto)), (g2, (beto, caio))):
        for m in ms:
            db.add(CorrenteGrupoMembro(tenant_id=tenant.id, grupo_id=g.id, medium_id=m.id))

    faxina, reuniao, ritual = tipos["Faxina"], tipos["Reunião"], tipos["Ritual coletivo"]
    # A1 Faxina, chamada encerrada.
    a1 = _atividade(db, tenant, faxina, "Faxina · G1", agora - timedelta(days=20), encerrada=True)
    # A2 Reunião, encerrada: Beto presente pela confiança; Caio veio sem estar na escala.
    a2 = _atividade(db, tenant, reuniao, "Reunião geral", agora - timedelta(days=15), encerrada=True)
    # A3 Reunião SEM chamada encerrada: não entra no percentual.
    a3 = _atividade(db, tenant, reuniao, "Reunião extra", agora - timedelta(days=10))
    # A4 Faxina cancelada.
    a4 = _atividade(db, tenant, faxina, "Faxina cancelada", agora - timedelta(days=8), cancelada=True)
    # A5 Faxina futura.
    a5 = _atividade(db, tenant, faxina, "Faxina futura", agora + timedelta(days=5))
    # A6 Ritual coletivo, encerrada.
    a6 = _atividade(db, tenant, ritual, "Amaci", agora - timedelta(days=5), encerrada=True)
    # Fora do relatório: fora do período, tipo que não controla presença, gira excluída.
    a7 = _atividade(db, tenant, reuniao, "Reunião antiga", agora - timedelta(days=60), encerrada=True)
    a8 = _atividade(db, tenant, tipos["Preparação de curso"], "Apostilas", agora - timedelta(days=4), encerrada=True)
    gira = Gira(tenant_id=tenant.id, nome="Gira de Pretos Velhos", data_inicio=agora - timedelta(days=3), is_active=True)
    gira_excluida = Gira(
        tenant_id=tenant.id, nome="Gira excluída", data_inicio=agora - timedelta(days=2), is_active=True, deleted_at=agora
    )
    db.add_all([gira, gira_excluida])
    await db.flush()
    ancora = Atividade(
        tenant_id=tenant.id, tipo_id=tipos["Gira"].id, gira_id=gira.id, origem="gira", visibilidade="corrente",
        chamada_encerrada_em=agora - timedelta(days=2),
    )
    ancora_excluida = Atividade(
        tenant_id=tenant.id, tipo_id=tipos["Gira"].id, gira_id=gira_excluida.id, origem="gira",
        visibilidade="corrente", chamada_encerrada_em=agora - timedelta(days=1),
    )
    db.add_all([ancora, ancora_excluida])
    await db.flush()

    _p(db, tenant, a1, ana, presenca="presente")
    _p(db, tenant, a1, beto, presenca="ausente", justificativa="Febre alta", presenca_origem="encerramento")
    _p(db, tenant, a1, caio, presenca="ausente", presenca_origem="encerramento")
    _p(db, tenant, a1, duda, presenca="ausente", dispensado_em=agora - timedelta(days=21))
    _p(db, tenant, a1, eva, presenca="presente")
    _p(db, tenant, a2, ana, presenca="ausente", resposta="nao_vou", justificativa="Viagem a trabalho")
    _p(db, tenant, a2, beto, presenca="presente", resposta="vou", presenca_origem="confianca")
    _p(db, tenant, a2, caio, convocado=False, presenca="presente")
    _p(db, tenant, a2, duda, presenca="presente")
    _p(db, tenant, a3, ana, presenca="presente", presenca_origem="checkin_medium")
    _p(db, tenant, a3, beto, resposta="vou")
    _p(db, tenant, a4, ana, resposta="vou", dispensado_em=agora - timedelta(days=9))
    _p(db, tenant, a5, ana, resposta="vou")
    _p(db, tenant, a6, beto, presenca="presente")
    _p(db, tenant, a6, caio, presenca="presente")
    _p(db, tenant, a6, duda, presenca="ausente", presenca_origem="encerramento")
    _p(db, tenant, a7, ana, presenca="presente")
    _p(db, tenant, a8, ana, presenca="presente")
    _p(db, tenant, ancora, duda, presenca="ausente", presenca_origem="encerramento")
    _p(db, tenant, ancora_excluida, ana, presenca="presente")
    await db.commit()
    periodo = {
        "inicio": (agora - timedelta(days=30)).date().isoformat(),
        "fim": (agora + timedelta(days=10)).date().isoformat(),
    }
    return {
        "mediuns": {"ana": ana, "beto": beto, "caio": caio, "duda": duda, "eva": eva},
        "grupos": {"g1": g1, "g2": g2, "g3": g3},
        "tipos": tipos,
        "periodo": periodo,
    }


def _numeros(linha):
    chaves = (
        "convocacoes", "presencas", "ausencias_justificadas", "ausencias_sem_justificativa",
        "sem_chamada", "dispensados", "avulsos", "percentual",
    )
    return tuple(linha[c] for c in chaves)


def _por_nome(resp):
    return {linha["nome"]: linha for linha in resp["linhas"]}


# ── Por médium ──────────────────────────────────────────────────────────────


async def test_por_medium_numeros_do_cenario(client, db):
    tenant, admin = await _cenario(db)
    s = await _semear(db, tenant)
    resp = await client.get(RELATORIO, headers=admin.headers, params=s["periodo"])
    assert resp.status_code == 200, resp.text
    dados = resp.json()
    linhas = _por_nome(dados)
    assert list(linhas) == ["Ana Paula", "Beto Souza", "Caio Lima", "Duda Reis"]  # Eva (excluída) fora
    #                                    conv pres just sem  s/ch disp avul  %
    assert _numeros(linhas["Ana Paula"]) == (2, 1, 1, 0, 1, 1, 0, 50)
    assert _numeros(linhas["Beto Souza"]) == (3, 2, 1, 0, 1, 0, 0, 67)
    assert _numeros(linhas["Caio Lima"]) == (2, 1, 0, 1, 0, 0, 1, 50)
    assert _numeros(linhas["Duda Reis"]) == (3, 1, 0, 2, 0, 1, 0, 33)
    assert _numeros(dados["totais"]) == (10, 5, 2, 3, 2, 2, 1, 50)
    assert all(linha["ativo"] is True for linha in dados["linhas"])
    # A1, A2, A6 e a gira com chamada; A3 sem (A4 cancelada, A5 futura, A7 fora, A8 sem presença).
    assert (dados["atividades_com_chamada"], dados["atividades_sem_chamada"]) == (4, 1)
    assert dados["agrupar"] == "medium" and dados["tipo"] is None and dados["grupo"] is None
    # O agregado (o que vai ao PDF) nunca traz o texto da justificativa.
    assert "Febre" not in resp.text and "Viagem" not in resp.text


async def test_filtros_por_tipo_grupo_e_periodo(client, db):
    tenant, admin = await _cenario(db)
    s = await _semear(db, tenant)
    faxina = s["tipos"]["Faxina"]

    so_faxina = (await client.get(RELATORIO, headers=admin.headers, params={**s["periodo"], "tipo_id": str(faxina.id)})).json()
    linhas = _por_nome(so_faxina)
    assert so_faxina["tipo"]["nome"] == "Faxina"
    assert _numeros(linhas["Ana Paula"]) == (1, 1, 0, 0, 0, 1, 0, 100)  # A1 presente, A4 cancelada; A5 futura não conta
    assert _numeros(linhas["Beto Souza"]) == (1, 0, 1, 0, 0, 0, 0, 0)
    assert _numeros(linhas["Caio Lima"]) == (1, 0, 0, 1, 0, 0, 0, 0)
    assert _numeros(linhas["Duda Reis"]) == (0, 0, 0, 0, 0, 1, 0, None)  # só dispensado: sem percentual
    assert (so_faxina["atividades_com_chamada"], so_faxina["atividades_sem_chamada"]) == (1, 0)

    g2 = s["grupos"]["g2"]
    so_g2 = (await client.get(RELATORIO, headers=admin.headers, params={**s["periodo"], "grupo_id": str(g2.id)})).json()
    assert list(_por_nome(so_g2)) == ["Beto Souza", "Caio Lima"]
    assert so_g2["grupo"] == {"id": str(g2.id), "nome": "G2", "cor": "vinho"}
    assert _numeros(so_g2["totais"])[:2] == (5, 3)

    # Só os últimos 7 dias: A6 e a gira.
    agora = _agora()
    semana = {"inicio": (agora - timedelta(days=7)).date().isoformat(), "fim": agora.date().isoformat()}
    ultima = (await client.get(RELATORIO, headers=admin.headers, params=semana)).json()
    assert set(_por_nome(ultima)) == {"Beto Souza", "Caio Lima", "Duda Reis"}
    assert _numeros(_por_nome(ultima)["Duda Reis"]) == (2, 0, 0, 2, 0, 0, 0, 0)
    # Padrão sem período: o mês corrente (200) e período inválido → 400.
    assert (await client.get(RELATORIO, headers=admin.headers)).status_code == 200
    invertido = await client.get(RELATORIO, headers=admin.headers, params={"inicio": "2026-10-10", "fim": "2026-10-01"})
    assert invertido.status_code == 400
    longo = await client.get(RELATORIO, headers=admin.headers, params={"inicio": "2025-01-01", "fim": "2026-06-30"})
    assert longo.status_code == 400 and "um ano" in longo.text


# ── Por grupo ───────────────────────────────────────────────────────────────


async def test_por_grupo_no_pro_e_403_sem_o_plano(client, db):
    tenant, admin = await _cenario(db)
    s = await _semear(db, tenant)
    resp = await client.get(RELATORIO, headers=admin.headers, params={**s["periodo"], "agrupar": "grupo"})
    assert resp.status_code == 200, resp.text
    dados = resp.json()
    linhas = _por_nome(dados)
    assert list(linhas) == ["G1", "G2"]  # arquivado (G3) fora
    # G1 = Ana + Beto; G2 = Beto + Caio (Beto conta nos dois).
    assert _numeros(linhas["G1"]) == (5, 3, 2, 0, 2, 1, 0, 60)
    assert _numeros(linhas["G2"]) == (5, 3, 1, 1, 1, 0, 1, 60)
    assert (linhas["G1"]["membros"], linhas["G1"]["cor"]) == (2, "petroleo")
    # Total: cada médium dos grupos uma vez (Ana, Beto, Caio); Duda não está em grupo.
    assert _numeros(dados["totais"]) == (7, 4, 2, 1, 2, 1, 1, 57)
    assert "Febre" not in resp.text and "Viagem" not in resp.text

    # Filtrar um grupo (mesmo arquivado) mostra só ele.
    g3 = s["grupos"]["g3"]
    so_g3 = (await client.get(RELATORIO, headers=admin.headers, params={**s["periodo"], "agrupar": "grupo", "grupo_id": str(g3.id)})).json()
    assert [(linha["nome"], linha["membros"], linha["convocacoes"]) for linha in so_g3["linhas"]] == [("G3 antigo", 0, 0)]

    # Basic: por médium sim; por grupo → 403 com a mensagem do plano.
    basic, admin_b = await _cenario(db, nome="Terreiro Basic AM26", plan=PlanType.BASIC)
    assert (await client.get(RELATORIO, headers=admin_b.headers)).status_code == 200
    negado = await client.get(RELATORIO, headers=admin_b.headers, params={"agrupar": "grupo"})
    assert negado.status_code == 403 and "Pro" in negado.text


# ── Confiança pela API ──────────────────────────────────────────────────────


async def test_confianca_e_encerramento_pela_api_contam_no_relatorio(client, db):
    tenant, admin = await _cenario(db, plan=PlanType.BASIC)
    tipos = await _tipos(db, tenant)
    xande = await create_user(db, tenant, UserRole.MEDIUM, name="xande")
    x = Medium(tenant_id=tenant.id, nome="Xande", is_atendimento=True, user_id=xande.user.id)
    y = Medium(tenant_id=tenant.id, nome="Yara", is_atendimento=True)
    db.add_all([x, y])
    await db.commit()
    criada = await client.post(
        ADMIN, headers=admin.headers,
        json={"tipo_id": str(tipos["Reunião"].id), "titulo": "Reunião", "inicio": (_agora() + timedelta(days=1)).isoformat()},
    )
    assert criada.status_code == 201, criada.text
    aid = criada.json()["id"]
    vou = await client.post(f"{MEDIUM}/atividades/atividade/{aid}/resposta", headers=xande.headers, json={"resposta": "vou"})
    assert vou.status_code == 200, vou.text
    # A reunião aconteceu (ontem) e ninguém encerrou ainda: "sem chamada".
    ontem = _agora() - timedelta(days=1)
    await db.execute(update(Atividade).where(Atividade.id == uuid.UUID(aid)).values(inicio=ontem, fim=ontem + timedelta(hours=1)))
    await db.commit()
    periodo = {"inicio": (_agora() - timedelta(days=3)).date().isoformat(), "fim": _agora().date().isoformat()}
    antes = _por_nome((await client.get(RELATORIO, headers=admin.headers, params=periodo)).json())
    assert list(antes) == ["Xande"] and _numeros(antes["Xande"]) == (0, 0, 0, 0, 1, 0, 0, None)

    enc = await client.post(f"{ADMIN}/{aid}/chamada/encerrar", headers=admin.headers)
    assert enc.status_code == 200, enc.text
    depois = (await client.get(RELATORIO, headers=admin.headers, params=periodo)).json()
    linhas = _por_nome(depois)
    assert _numeros(linhas["Xande"]) == (1, 1, 0, 0, 0, 0, 0, 100)  # "vou" na confiança = presente
    assert _numeros(linhas["Yara"]) == (1, 0, 0, 1, 0, 0, 0, 0)  # convocação virtual materializada
    assert (depois["atividades_com_chamada"], depois["atividades_sem_chamada"]) == (1, 0)


# ── Detalhe por médium e justificativa ──────────────────────────────────────


async def test_detalhe_com_justificativa_so_para_escalas_view(client, db):
    tenant, admin = await _cenario(db)
    s = await _semear(db, tenant)
    ana = s["mediuns"]["ana"]
    url = f"{RELATORIO}/medium/{ana.id}"
    resp = await client.get(url, headers=admin.headers, params=s["periodo"])
    assert resp.status_code == 200, resp.text
    det = resp.json()
    assert det["medium"] == {"id": str(ana.id), "nome": "Ana Paula", "ativo": True}
    itens = [(i["titulo"], i["categoria"], i["situacao"], i["conta_no_percentual"]) for i in det["itens"]]
    assert itens == [
        ("Faxina futura", "futura", "confirmado", False),
        ("Faxina cancelada", "dispensado", "dispensado", False),
        ("Reunião extra", "sem_chamada", "presente", False),
        ("Reunião geral", "ausente_justificado", "ausente_justificado", True),
        ("Faxina · G1", "presente", "presente", True),
    ]
    motivo = next(i for i in det["itens"] if i["titulo"] == "Reunião geral")
    assert motivo["justificativa"] == "Viagem a trabalho" and motivo["tem_justificativa"] is True
    assert _numeros(det["resumo"]) == (2, 1, 1, 0, 1, 1, 0, 50)
    # Filtro de tipo no detalhe.
    so_faxina = (await client.get(url, headers=admin.headers, params={**s["periodo"], "tipo_id": str(s["tipos"]["Faxina"].id)})).json()
    assert [i["titulo"] for i in so_faxina["itens"]] == ["Faxina futura", "Faxina cancelada", "Faxina · G1"]

    # Operador com ESCALAS:view vê o motivo; sem a feature → 403 (relatório e detalhe).
    op = await create_user(db, tenant, UserRole.OPERATOR, name="operador")
    await grant(db, op, tenant, PermissionFeature.ESCALAS, "view")
    com = await client.get(url, headers=op.headers, params=s["periodo"])
    assert com.status_code == 200 and "Viagem a trabalho" in com.text
    sem = await create_user(db, tenant, UserRole.OPERATOR, name="porteiro")
    await grant(db, sem, tenant, PermissionFeature.PORTA, "view", "edit")
    assert (await client.get(url, headers=sem.headers)).status_code == 403
    assert (await client.get(RELATORIO, headers=sem.headers)).status_code == 403
    # O médium (papel medium) nunca entra no painel.
    medium_user = await create_user(db, tenant, UserRole.MEDIUM, name="medium")
    assert (await client.get(RELATORIO, headers=medium_user.headers)).status_code == 403


async def test_ids_de_outro_terreiro_e_chave_desligada(client, db):
    tenant, admin = await _cenario(db)
    s = await _semear(db, tenant)
    outro, admin_b = await _cenario(db, nome="Outro Terreiro AM26")
    so = await _semear(db, outro)

    assert (await client.get(f"{RELATORIO}/medium/{so['mediuns']['ana'].id}", headers=admin.headers)).status_code == 404
    assert (await client.get(f"{RELATORIO}/medium/{s['mediuns']['eva'].id}", headers=admin.headers)).status_code == 404
    assert (await client.get(f"{RELATORIO}/medium/{uuid.uuid4()}", headers=admin.headers)).status_code == 404
    assert (await client.get(f"{RELATORIO}/medium/nao-e-uuid", headers=admin.headers)).status_code == 422
    alheio_tipo = {"tipo_id": str(so["tipos"]["Faxina"].id)}
    assert (await client.get(RELATORIO, headers=admin.headers, params=alheio_tipo)).status_code == 404
    assert (await client.get(f"{RELATORIO}/medium/{s['mediuns']['ana'].id}", headers=admin.headers, params=alheio_tipo)).status_code == 404
    alheio_grupo = {"grupo_id": str(so["grupos"]["g1"].id)}
    assert (await client.get(RELATORIO, headers=admin.headers, params=alheio_grupo)).status_code == 404
    assert (await client.get(RELATORIO, headers=admin.headers, params={**alheio_grupo, "agrupar": "grupo"})).status_code == 404
    assert (await client.get(RELATORIO, headers=admin.headers, params={"tipo_id": "x"})).status_code == 422

    # Cada terreiro vê só os seus números.
    meus = (await client.get(RELATORIO, headers=admin.headers, params=s["periodo"])).json()
    assert _numeros(meus["totais"]) == (10, 5, 2, 3, 2, 2, 1, 50)
    ids = {linha["id"] for linha in meus["linhas"]}
    assert ids.isdisjoint({str(m.id) for m in so["mediuns"].values()})

    # Chave do piloto desligada → 403 nas duas rotas.
    desligado, admin_d = await _cenario(db, nome="Terreiro sem Área AM26", liberada=False)
    assert (await client.get(RELATORIO, headers=admin_d.headers)).status_code == 403
    assert (await client.get(f"{RELATORIO}/medium/{uuid.uuid4()}", headers=admin_d.headers)).status_code == 403
