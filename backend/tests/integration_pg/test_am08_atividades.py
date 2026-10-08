"""AM-08 — Atividades da casa com Postgres real (migrações + app inteiro via HTTP).

- Tipos sugeridos: terreiro existente (migração 078), cadastro público e criação pela
  plataforma nascem com os 8 tipos e as funções; "Gira" é de sistema (renomeia, não arquiva —
  API e CHECK no banco); nome único por terreiro sem diferenciar maiúsculas e ignorando os
  arquivados; grupos elegíveis só ativos do terreiro.
- Painel: CRUD de tipos, funções e atividades com o grupo `ESCALAS` e os planos `area_medium` +
  `atividades_corrente`; cancelar com motivo; calendário da casa (giras + atividades); atividade
  não consome o limite de giras/mês; âncora da gira idempotente.
- Área do Médium: a Agenda mostra só as atividades "corrente" que o tipo deixa o médium ver
  (atendimento/cambones/grupos); "só quem estiver na escala" fica escondida até o AM-17;
  detalhe e .ics com a mesma regra.
- Público: agenda pública, próxima gira, site e sitemap nunca mostram atividade interna.
- Migrações 077/078 sobem e descem (enum, acesso no grupo padrão, dados).
"""
import subprocess
import sys
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

from sqlalchemy import func, select, text

from src.core.tz import APP_TZ
from src.models import (
    Atividade,
    AtividadeTipo,
    AtividadeTipoGrupo,
    CorrenteGrupo,
    CorrenteGrupoMembro,
    FuncaoCorrente,
    Gira,
    Medium,
)
from src.models.permission_groups import GroupPermission, PermissionFeature, PermissionGroup
from src.models.site import SiteStatus, TenantSite
from src.models.subscriptions import PlanType
from src.models.tenants import Tenant
from src.models.users import UserRole
from src.services.atividades import FUNCOES_SUGERIDAS, TIPOS_SUGERIDOS, ensure_default_atividade_tipos

from .conftest import BACKEND_DIR
from .factories import create_gira, create_tenant, create_user, grant

BASE = "/api/v1/admin/atividades"
TIPOS = f"{BASE}/tipos"
FUNCOES = f"{BASE}/funcoes"
AGENDA = "/api/v1/medium/agenda"
PERIODO = {"inicio": "2026-11-01", "fim": "2026-11-30"}
NOMES_SUGERIDOS = [t[0] for t in TIPOS_SUGERIDOS]


def _br(d, h=20, mi=0):
    return datetime(2026, 11, d, h, mi, tzinfo=APP_TZ).isoformat()


async def _cenario(db, nome="Terreiro AM08", plan=PlanType.BASIC, liberada=True, tipos=True):
    tenant = await create_tenant(db, name=nome, plan=plan, area_medium_liberada=liberada)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="dirigente")
    if tipos:
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
    resp = await client.get(TIPOS, headers=admin.headers)
    assert resp.status_code == 200, resp.text
    return {t["nome"]: t for t in resp.json()}


async def _criar_atividade(client, admin, tipo_id, titulo, inicio, **kw):
    resp = await client.post(BASE, headers=admin.headers, json={"tipo_id": tipo_id, "titulo": titulo, "inicio": inicio, **kw})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _contar(model, *where):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(select(func.count()).select_from(model).where(*where))).scalar_one()


# ── Tipos sugeridos ─────────────────────────────────────────────────────────


async def test_tipos_sugeridos_e_tipo_gira_de_sistema(client, db):
    tenant, admin = await _cenario(db)
    tipos = await _tipos(client, admin)
    assert list(tipos) == NOMES_SUGERIDOS
    gira = tipos["Gira"]
    assert gira["natureza"] == "gira" and gira["is_sistema"] and gira["visivel_no_site"]
    assert gira["cor"] is None and gira["icone"] == "gira" and gira["modo_escala"] == "funcoes"
    assert [t for t in tipos.values() if t["visivel_no_site"]] == [gira]
    faxina = tipos["Faxina"]
    assert (faxina["convocacao_padrao"], faxina["modo_escala"], faxina["hora_padrao"], faxina["duracao_min"]) == (
        "so_escalados", "grupos_por_dia", "09:00", 180,
    )
    assert tipos["Ritual individual"]["visibilidade_padrao"] == "convocados"
    assert tipos["Preparação de curso"]["controla_presenca"] is False
    assert tipos["Desenvolvimento"]["elegiveis"] == "atendimento"
    funcoes = (await client.get(FUNCOES, headers=admin.headers)).json()
    assert [f["nome"] for f in funcoes] == list(FUNCOES_SUGERIDAS)

    # Gira: renomeia e muda cor/ícone, nunca arquiva (API e CHECK do banco).
    put = await client.put(f"{TIPOS}/{gira['id']}", headers=admin.headers, json={"nome": "Sessão", "cor": "violeta"})
    assert put.status_code == 200 and put.json()["nome"] == "Sessão" and put.json()["natureza"] == "gira"
    arq = await client.delete(f"{TIPOS}/{gira['id']}", headers=admin.headers)
    assert arq.status_code == 422 and "não para arquivar" in arq.text
    from src.core.database import engine

    async with engine.connect() as conn:
        try:
            await conn.execute(text("UPDATE atividade_tipos SET arquivado_em = now() WHERE id = :i"), {"i": gira["id"]})
            raise AssertionError("o CHECK devia recusar arquivar o tipo Gira")
        except Exception as exc:  # noqa: BLE001
            assert "ck_atividade_tipos_gira_nao_arquiva" in str(exc)
    async with engine.connect() as conn:
        try:
            await conn.execute(
                text(
                    "INSERT INTO atividade_tipos (id, tenant_id, nome, natureza) VALUES (gen_random_uuid(), :t, 'Outra gira', 'gira')"
                ),
                {"t": tenant.id},
            )
            raise AssertionError("só um tipo Gira por terreiro")
        except Exception as exc:  # noqa: BLE001
            assert "uq_atividade_tipos_gira" in str(exc)

    # Idempotente: chamar de novo não duplica.
    assert await ensure_default_atividade_tipos(db, tenant.id) == 0
    await db.commit()
    assert await _contar(AtividadeTipo, AtividadeTipo.tenant_id == tenant.id) == 8


async def test_cadastro_publico_e_plataforma_criam_os_tipos(client, db, monkeypatch):
    monkeypatch.setattr("src.api.v1.public.onboarding._send_welcome_email", AsyncMock())
    ok = await client.post(
        "/api/v1/public/onboarding",
        json={
            "terreiro_nome": "Casa Nova de Luz",
            "responsavel_nome": "Maria",
            "whatsapp": "11999998888",
            "documento": "52998224725",
            "password": "Senha-forte-123",
            "como_conheceu": "indicacao",
            "principal_dor": "outro",
            "aceite_termos": True,
            "email": "nova-am08@example.com",
        },
    )
    assert ok.status_code == 201, ok.text
    novo = (await db.execute(select(Tenant).where(Tenant.name == "Casa Nova de Luz"))).scalar_one()
    nomes = (
        await db.execute(select(AtividadeTipo.nome).where(AtividadeTipo.tenant_id == novo.id).order_by(AtividadeTipo.ordem))
    ).scalars().all()
    assert list(nomes) == NOMES_SUGERIDOS
    assert await _contar(FuncaoCorrente, FuncaoCorrente.tenant_id == novo.id) == len(FUNCOES_SUGERIDAS)

    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")
    resp = await client.post(
        "/api/v1/platform/tenants",
        headers=root.headers,
        json={"slug": f"casa-plataforma-{uuid.uuid4().hex[:6]}", "name": "Casa Plataforma", "email_admin": "adm-am08@example.com"},
    )
    assert resp.status_code == 201, resp.text
    tid = uuid.UUID(resp.json()["id"])
    assert await _contar(AtividadeTipo, AtividadeTipo.tenant_id == tid) == 8
    assert await _contar(AtividadeTipo, AtividadeTipo.tenant_id == tid, AtividadeTipo.natureza == "gira") == 1
    assert await _contar(FuncaoCorrente, FuncaoCorrente.tenant_id == tid) == len(FUNCOES_SUGERIDAS)


async def test_crud_de_tipos_nome_unico_e_grupos_elegiveis(client, db):
    tenant, admin = await _cenario(db)
    h = admin.headers
    g1 = CorrenteGrupo(tenant_id=tenant.id, nome="G1")
    arquivado = CorrenteGrupo(tenant_id=tenant.id, nome="Velho", arquivado_em=datetime.now(timezone.utc))
    outro, _ = await _cenario(db, nome="Outra Casa", tipos=False)
    de_fora = CorrenteGrupo(tenant_id=outro.id, nome="Intruso")
    db.add_all([g1, arquivado, de_fora])
    await db.commit()

    novo = await client.post(
        TIPOS,
        headers=h,
        json={
            "nome": " <b>Ogãs</b> ensaio ", "icone": "atabaque", "cor": "terra", "checkin_pelo_medium": True,
            "checkin_antes_min": 30, "checkin_depois_min": 90, "elegiveis": "grupos", "grupo_ids": [str(g1.id)],
            "convocacao_padrao": "so_escalados", "modo_escala": "funcoes", "hora_padrao": "18:30", "duracao_min": 60,
            "visibilidade_padrao": "convocados",
        },
    )
    assert novo.status_code == 201, novo.text
    t = novo.json()
    assert t["nome"] == "Ogãs ensaio" and t["natureza"] == "atividade" and not t["is_sistema"] and not t["visivel_no_site"]
    assert (t["icone"], t["cor"], t["checkin_antes_min"], t["checkin_depois_min"], t["hora_padrao"]) == (
        "atabaque", "terra", 30, 90, "18:30",
    )
    assert [g["nome"] for g in t["grupos"]] == ["G1"]

    # Nome único sem diferenciar maiúsculas; arquivado libera.
    assert (await client.post(TIPOS, headers=h, json={"nome": "FAXINA"})).status_code == 409
    assert (await client.put(f"{TIPOS}/{t['id']}", headers=h, json={"nome": "reunião"})).status_code == 409
    tipos = await _tipos(client, admin)
    assert (await client.delete(f"{TIPOS}/{tipos['Faxina']['id']}", headers=h)).status_code == 204
    assert "Faxina" not in await _tipos(client, admin)
    nova_faxina = await client.post(TIPOS, headers=h, json={"nome": "faxina"})
    assert nova_faxina.status_code == 201
    assert (await client.post(f"{TIPOS}/{tipos['Faxina']['id']}/desarquivar", headers=h)).status_code == 409
    todos = (await client.get(f"{TIPOS}?incluir_arquivados=true", headers=h)).json()
    assert [x["nome"] for x in todos if x["arquivado_em"]] == ["Faxina"]
    # Outro terreiro pode usar o mesmo nome.
    admin_outro = await create_user(db, outro, UserRole.ADMIN, name="outro")
    assert (await client.post(TIPOS, headers=admin_outro.headers, json={"nome": "Ogãs ensaio"})).status_code == 201

    # Grupos elegíveis: só ativos do terreiro, pelo menos um quando elegiveis = grupos.
    for ruim in ([str(arquivado.id)], [str(de_fora.id)], [], [str(g1.id), str(de_fora.id)]):
        resp = await client.put(f"{TIPOS}/{t['id']}", headers=h, json={"elegiveis": "grupos", "grupo_ids": ruim})
        assert resp.status_code == 422, (ruim, resp.text)
    assert await _contar(AtividadeTipoGrupo, AtividadeTipoGrupo.grupo_id == de_fora.id) == 0
    # Mudar para "todos" limpa os grupos; voltar para grupos sem lista → 422.
    put = await client.put(f"{TIPOS}/{t['id']}", headers=h, json={"elegiveis": "todos"})
    assert put.status_code == 200 and put.json()["grupos"] == []
    assert (await client.put(f"{TIPOS}/{t['id']}", headers=h, json={"elegiveis": "grupos"})).status_code == 422

    # Validações de listas fechadas e limites.
    for body in (
        {"nome": "X1", "icone": "foguete"},
        {"nome": "X2", "cor": "#ff0000"},
        {"nome": "X3", "elegiveis": "ninguem"},
        {"nome": "X4", "modo_escala": "sorteio"},
        {"nome": "X5", "checkin_antes_min": 2000},
        {"nome": "X6", "duracao_min": 5},
        {"nome": "X7", "hora_padrao": "25h"},
        {"nome": "<i></i>"},
        {"nome": "x" * 61},
    ):
        assert (await client.post(TIPOS, headers=h, json=body)).status_code == 422, body


async def test_funcoes_crud_nome_unico_e_arquivar(client, db):
    _, admin = await _cenario(db)
    h = admin.headers
    nova = await client.post(FUNCOES, headers=h, json={"nome": "Ekedi", "descricao": "Cuida dos guias"})
    assert nova.status_code == 201 and nova.json()["descricao"] == "Cuida dos guias"
    assert (await client.post(FUNCOES, headers=h, json={"nome": "cambone"})).status_code == 409
    fid = nova.json()["id"]
    put = await client.put(f"{FUNCOES}/{fid}", headers=h, json={"nome": "Ekedi / Equede", "descricao": None})
    assert put.status_code == 200 and put.json()["descricao"] is None
    assert (await client.delete(f"{FUNCOES}/{fid}", headers=h)).status_code == 204
    assert "Ekedi / Equede" not in [f["nome"] for f in (await client.get(FUNCOES, headers=h)).json()]
    volta = await client.post(f"{FUNCOES}/{fid}/desarquivar", headers=h)
    assert volta.status_code == 200 and volta.json()["arquivado_em"] is None


# ── Atividades ──────────────────────────────────────────────────────────────


async def test_crud_de_atividade_cancelar_e_calendario(client, db):
    tenant, admin = await _cenario(db)
    h = admin.headers
    tipos = await _tipos(client, admin)
    faxina = tipos["Faxina"]

    criada = await _criar_atividade(
        client, admin, faxina["id"], "  Faxina · <b>G1</b> ", _br(7, 9), local="Terreiro", orientacoes="Leve luvas"
    )
    assert criada["titulo"] == "Faxina · G1" and criada["origem"] == "manual" and criada["gira_id"] is None
    assert criada["visibilidade"] == "corrente"  # padrão do tipo
    # Sem fim: início + duração padrão do tipo (180 min).
    assert datetime.fromisoformat(criada["fim"]) - datetime.fromisoformat(criada["inicio"]) == timedelta(minutes=180)
    assert criada["tipo"] == {"id": faxina["id"], "nome": "Faxina", "icone": "faxina", "cor": "petroleo"}
    # Sem título: o nome do tipo; visibilidade padrão do tipo "Ritual individual" = convocados.
    ritual = await _criar_atividade(client, admin, tipos["Ritual individual"]["id"], None, _br(10))
    assert ritual["titulo"] == "Ritual individual" and ritual["visibilidade"] == "convocados"

    # Tipo Gira não serve para atividade interna; tipo arquivado também não.
    assert (await client.post(BASE, headers=h, json={"tipo_id": tipos["Gira"]["id"], "titulo": "X", "inicio": _br(8)})).status_code == 422
    assert (await client.delete(f"{TIPOS}/{tipos['Reunião']['id']}", headers=h)).status_code == 204
    assert (await client.post(BASE, headers=h, json={"tipo_id": tipos["Reunião"]["id"], "titulo": "X", "inicio": _br(8)})).status_code == 422
    # Fim antes do início.
    ruim = await client.post(BASE, headers=h, json={"tipo_id": faxina["id"], "titulo": "X", "inicio": _br(8, 10), "fim": _br(8, 9)})
    assert ruim.status_code == 422

    put = await client.put(f"{BASE}/{criada['id']}", headers=h, json={"titulo": "Faxina geral", "visibilidade": "convocados"})
    assert put.status_code == 200 and put.json()["titulo"] == "Faxina geral" and put.json()["visibilidade"] == "convocados"
    assert (await client.get(f"{BASE}/{criada['id']}", headers=h)).json()["orientacoes"] == "Leve luvas"

    # Cancelar exige motivo; cancelada não edita; reativar desfaz.
    assert (await client.post(f"{BASE}/{criada['id']}/cancelar", headers=h, json={"motivo": "  "})).status_code == 422
    canc = await client.post(f"{BASE}/{criada['id']}/cancelar", headers=h, json={"motivo": "Chuva forte"})
    assert canc.status_code == 200 and canc.json()["cancelada_em"] and canc.json()["cancelamento_motivo"] == "Chuva forte"
    assert (await client.put(f"{BASE}/{criada['id']}", headers=h, json={"titulo": "Y"})).status_code == 409

    # Calendário: giras + atividades, canceladas marcadas, ordem do dia.
    db.add(Gira(tenant_id=tenant.id, nome="Gira de Caboclos", data_inicio=datetime(2026, 11, 9, 20, tzinfo=APP_TZ)))
    await db.commit()
    cal = await client.get(f"{BASE}/calendario", headers=h, params=PERIODO)
    assert cal.status_code == 200, cal.text
    itens = cal.json()["itens"]
    assert [(i["origem"], i["titulo"], i["cancelada"]) for i in itens] == [
        ("atividade", "Faxina geral", True),
        ("gira", "Gira de Caboclos", False),
        ("atividade", "Ritual individual", False),
    ]
    assert itens[1]["tipo"]["nome"] == "Gira" and itens[1]["tipo"]["id"] == tipos["Gira"]["id"]
    so_gira = (await client.get(f"{BASE}/calendario", headers=h, params={**PERIODO, "tipo_id": tipos["Gira"]["id"]})).json()
    assert [i["origem"] for i in so_gira["itens"]] == ["gira"]
    so_ritual = (
        await client.get(f"{BASE}/calendario", headers=h, params={**PERIODO, "tipo_id": tipos["Ritual individual"]["id"]})
    ).json()
    assert [i["titulo"] for i in so_ritual["itens"]] == ["Ritual individual"]

    reat = await client.post(f"{BASE}/{criada['id']}/reativar", headers=h)
    assert reat.status_code == 200 and reat.json()["cancelada_em"] is None and reat.json()["cancelamento_motivo"] is None
    lista = (await client.get(BASE, headers=h, params=PERIODO)).json()
    assert [a["titulo"] for a in lista] == ["Faxina geral", "Ritual individual"]

    assert (await client.delete(f"{BASE}/{criada['id']}", headers=h)).status_code == 204
    assert (await client.get(f"{BASE}/{criada['id']}", headers=h)).status_code == 404
    assert [a["titulo"] for a in (await client.get(BASE, headers=h, params=PERIODO)).json()] == ["Ritual individual"]


async def test_atividade_nao_consome_limite_de_giras(client, db):
    _, admin = await _cenario(db, plan=PlanType.BASIC)  # Basic: 3 giras/mês
    tipos = await _tipos(client, admin)
    agora = datetime.now(timezone.utc)
    for i in range(5):
        await _criar_atividade(client, admin, tipos["Reunião"]["id"], f"Reunião {i}", (agora + timedelta(days=i + 1)).isoformat())
    for i in range(3):
        resp = await client.post(
            "/api/v1/admin/giras",
            headers=admin.headers,
            json={"nome": f"Gira {i}", "data_inicio": (agora + timedelta(days=i + 1)).isoformat()},
        )
        assert resp.status_code == 201, resp.text
    quarta = await client.post(
        "/api/v1/admin/giras", headers=admin.headers, json={"nome": "Gira 4", "data_inicio": agora.isoformat()}
    )
    assert quarta.status_code == 422 and "Limite mensal" in quarta.text


async def test_ancora_da_gira_idempotente(client, db):
    tenant, admin = await _cenario(db)
    gira = await create_gira(db, tenant, nome="Gira de Pretos-Velhos")
    a1 = await client.post(f"{BASE}/da-gira/{gira.id}", headers=admin.headers)
    a2 = await client.post(f"{BASE}/da-gira/{gira.id}", headers=admin.headers)
    assert a1.status_code == 200 and a2.status_code == 200
    assert a1.json()["id"] == a2.json()["id"]
    assert a1.json()["titulo"] == "Gira de Pretos-Velhos" and a1.json()["origem"] == "gira"
    assert a1.json()["tipo"]["nome"] == "Gira"
    assert await _contar(Atividade, Atividade.gira_id == gira.id) == 1
    # A âncora não é atividade interna: não aparece na lista nem se edita por aqui.
    assert (await client.get(f"{BASE}/{a1.json()['id']}", headers=admin.headers)).status_code == 404
    assert (await client.delete(f"{BASE}/{a1.json()['id']}", headers=admin.headers)).status_code == 404
    # Gira excluída ou inexistente → 404.
    assert (await client.post(f"{BASE}/da-gira/{uuid.uuid4()}", headers=admin.headers)).status_code == 404


# ── Permissões e plano ──────────────────────────────────────────────────────


async def test_operador_precisa_de_escalas_e_plano_e_chave_do_piloto(client, db):
    tenant, admin = await _cenario(db)
    tipos = await _tipos(client, admin)
    atividade = await _criar_atividade(client, admin, tipos["Reunião"]["id"], "Reunião", _br(3))
    funcao = (await client.get(FUNCOES, headers=admin.headers)).json()[0]

    sem = await create_user(db, tenant, UserRole.OPERATOR, name="sem")
    await grant(db, sem, tenant, PermissionFeature.MEDIUNS, "view", "insert", "edit", "delete")
    chamadas = (
        ("get", f"{BASE}/calendario", None),
        ("get", TIPOS, None),
        ("post", TIPOS, {"nome": "X"}),
        ("put", f"{TIPOS}/{tipos['Reunião']['id']}", {"nome": "Y"}),
        ("delete", f"{TIPOS}/{tipos['Reunião']['id']}", None),
        ("post", f"{TIPOS}/{tipos['Reunião']['id']}/desarquivar", None),
        ("get", FUNCOES, None),
        ("post", FUNCOES, {"nome": "X"}),
        ("put", f"{FUNCOES}/{funcao['id']}", {"nome": "Y"}),
        ("delete", f"{FUNCOES}/{funcao['id']}", None),
        ("get", BASE, None),
        ("get", f"{BASE}/{atividade['id']}", None),
        ("post", BASE, {"tipo_id": tipos["Reunião"]["id"], "titulo": "X", "inicio": _br(4)}),
        ("put", f"{BASE}/{atividade['id']}", {"titulo": "Y"}),
        ("post", f"{BASE}/{atividade['id']}/cancelar", {"motivo": "x"}),
        ("delete", f"{BASE}/{atividade['id']}", None),
    )
    for metodo, url, body in chamadas:
        kwargs = {"headers": sem.headers}
        if body is not None:
            kwargs["json"] = body
        assert (await getattr(client, metodo)(url, **kwargs)).status_code == 403, (metodo, url)

    leitor = await create_user(db, tenant, UserRole.OPERATOR, name="leitor")
    await grant(db, leitor, tenant, PermissionFeature.ESCALAS, "view")
    assert (await client.get(TIPOS, headers=leitor.headers)).status_code == 200
    assert (await client.get(f"{BASE}/calendario", headers=leitor.headers)).status_code == 200
    assert (await client.post(TIPOS, headers=leitor.headers, json={"nome": "X"})).status_code == 403
    assert (await client.put(f"{BASE}/{atividade['id']}", headers=leitor.headers, json={"titulo": "Y"})).status_code == 403
    # Com ESCALAS view lê os grupos da corrente (AM-23), sem precisar de MEDIUNS.
    assert (await client.get("/api/v1/admin/corrente-grupos", headers=leitor.headers)).status_code == 200
    assert (await client.get("/api/v1/admin/corrente-grupos/opcoes", headers=leitor.headers)).status_code == 200
    assert (await client.post("/api/v1/admin/corrente-grupos", headers=leitor.headers, json={"nome": "G"})).status_code == 403

    editor = await create_user(db, tenant, UserRole.OPERATOR, name="editor")
    await grant(db, editor, tenant, PermissionFeature.ESCALAS, "view", "insert", "edit")
    assert (await client.post(TIPOS, headers=editor.headers, json={"nome": "Ensaio"})).status_code == 201
    assert (await client.post(f"{BASE}/{atividade['id']}/cancelar", headers=editor.headers, json={"motivo": "x"})).status_code == 200
    assert (await client.delete(f"{BASE}/{atividade['id']}", headers=editor.headers)).status_code == 403

    # Plano sem atividades (Gratuito) e chave do piloto desligada → 403.
    _, admin_free = await _cenario(db, nome="Casa Gratuita", plan=PlanType.FREE)
    assert (await client.get(TIPOS, headers=admin_free.headers)).status_code == 403
    _, admin_piloto = await _cenario(db, nome="Casa Fora do Piloto", liberada=False)
    assert (await client.get(TIPOS, headers=admin_piloto.headers)).status_code == 403
    # Conta medium nunca entra no painel.
    ana, _ = await _medium(db, tenant, "Ana Paula")
    assert (await client.get(TIPOS, headers=ana.headers)).status_code == 403


async def test_outro_terreiro_nao_ve_nem_mexe(client, db):
    _, admin = await _cenario(db)
    tipos = await _tipos(client, admin)
    atividade = await _criar_atividade(client, admin, tipos["Reunião"]["id"], "Reunião", _br(3))
    funcao = (await client.get(FUNCOES, headers=admin.headers)).json()[0]
    _, intruso = await _cenario(db, nome="Outra Casa")
    h = intruso.headers
    assert (await client.get(f"{BASE}/{atividade['id']}", headers=h)).status_code == 404
    assert (await client.put(f"{BASE}/{atividade['id']}", headers=h, json={"titulo": "X"})).status_code == 404
    assert (await client.post(f"{BASE}/{atividade['id']}/cancelar", headers=h, json={"motivo": "x"})).status_code == 404
    assert (await client.delete(f"{BASE}/{atividade['id']}", headers=h)).status_code == 404
    assert (await client.put(f"{TIPOS}/{tipos['Reunião']['id']}", headers=h, json={"nome": "X"})).status_code == 404
    assert (await client.delete(f"{TIPOS}/{tipos['Reunião']['id']}", headers=h)).status_code == 404
    assert (await client.put(f"{FUNCOES}/{funcao['id']}", headers=h, json={"nome": "X"})).status_code == 404
    cal = (await client.get(f"{BASE}/calendario", headers=h, params=PERIODO)).json()
    assert cal["itens"] == []


# ── Área do Médium ──────────────────────────────────────────────────────────


async def test_agenda_do_medium_mostra_so_atividades_que_o_tipo_deixa_ver(client, db):
    tenant, admin = await _cenario(db)
    h = admin.headers
    tipos = await _tipos(client, admin)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")  # atendimento
    beto, beto_m = await _medium(db, tenant, "Beto Souza", atendimento=False)  # cambone
    caio, caio_m = await _medium(db, tenant, "Caio Lima")  # atendimento, sem grupo
    g1 = CorrenteGrupo(tenant_id=tenant.id, nome="G1")
    db.add(g1)
    await db.flush()
    db.add(CorrenteGrupoMembro(tenant_id=tenant.id, grupo_id=g1.id, medium_id=beto_m.id))
    await db.commit()

    so_cambones = (await client.post(TIPOS, headers=h, json={"nome": "Ensaio de cambones", "elegiveis": "cambones", "cor": "azul"})).json()
    so_g1 = (await client.post(TIPOS, headers=h, json={"nome": "Escala G1", "elegiveis": "grupos", "grupo_ids": [str(g1.id)]})).json()

    await _criar_atividade(client, admin, tipos["Reunião"]["id"], "Reunião geral", _br(5, 19, 30), orientacoes="Pauta: festa")
    await _criar_atividade(client, admin, tipos["Desenvolvimento"]["id"], "Desenvolvimento", _br(6))
    await _criar_atividade(client, admin, so_cambones["id"], "Ensaio", _br(7))
    await _criar_atividade(client, admin, so_g1["id"], "Faxina do G1", _br(8, 9))
    escondida = await _criar_atividade(client, admin, tipos["Reunião"]["id"], "Reunião da diretoria", _br(9), visibilidade="convocados")
    cancelada = await _criar_atividade(client, admin, tipos["Reunião"]["id"], "Reunião cancelada", _br(11))
    assert (await client.post(f"{BASE}/{cancelada['id']}/cancelar", headers=h, json={"motivo": "Feriado"})).status_code == 200
    excluida = await _criar_atividade(client, admin, tipos["Reunião"]["id"], "Reunião excluída", _br(12))
    assert (await client.delete(f"{BASE}/{excluida['id']}", headers=h)).status_code == 204
    gira = Gira(
        tenant_id=tenant.id, nome="Gira de Caboclos", data_inicio=datetime(2026, 11, 13, 20, tzinfo=APP_TZ)
    )
    db.add(gira)
    await db.commit()
    # O tipo Gira renomeado vale para as giras da agenda.
    await client.put(f"{TIPOS}/{tipos['Gira']['id']}", headers=h, json={"nome": "Sessão"})
    # Outra casa: nunca aparece.
    outro, admin_outro = await _cenario(db, nome="Outra Casa")
    tipos_outro = await _tipos(client, admin_outro)
    await _criar_atividade(client, admin_outro, tipos_outro["Reunião"]["id"], "Reunião de outra casa", _br(5))

    async def _titulos(actor):
        resp = await client.get(AGENDA, headers=actor.headers, params=PERIODO)
        assert resp.status_code == 200, resp.text
        return [(i["origem"], i["titulo"]) for i in resp.json()["itens"]]

    assert await _titulos(ana) == [
        ("atividade", "Reunião geral"),
        ("atividade", "Desenvolvimento"),
        ("atividade", "Reunião cancelada"),
        ("gira", "Gira de Caboclos"),
    ]
    assert await _titulos(beto) == [
        ("atividade", "Reunião geral"),
        ("atividade", "Ensaio"),
        ("atividade", "Faxina do G1"),
        ("atividade", "Reunião cancelada"),
        ("gira", "Gira de Caboclos"),
    ]
    assert ("atividade", "Faxina do G1") not in await _titulos(caio)

    itens = {i["titulo"]: i for i in (await client.get(AGENDA, headers=beto.headers, params=PERIODO)).json()["itens"]}
    assert itens["Ensaio"]["tipo"] == {"nome": "Ensaio de cambones", "icone": "estrela", "cor": "azul"}
    assert itens["Reunião cancelada"]["cancelada"] is True and itens["Reunião geral"]["cancelada"] is False
    assert itens["Gira de Caboclos"]["tipo"] == {"nome": "Sessão", "icone": "gira", "cor": None}
    # AM-17: a Reunião ("todos os elegíveis") já põe o médium na escala, sem resposta ainda.
    assert itens["Reunião geral"]["minha_participacao"]["situacao"] == "convocado"

    # Detalhe e .ics: mesma regra; nada de link público.
    reuniao_id = itens["Reunião geral"]["id"]
    det = await client.get(f"{AGENDA}/atividade/{reuniao_id}", headers=ana.headers)
    assert det.status_code == 200, det.text
    corpo = det.json()
    assert corpo["orientacoes_corrente"] == "Pauta: festa" and "link_publico" not in corpo
    assert corpo["agenda_celular"]["ics_path"] == f"/api/v1/medium/agenda/atividade/{reuniao_id}/ics"
    ics = await client.get(f"{AGENDA}/atividade/{reuniao_id}/ics", headers=ana.headers)
    assert ics.status_code == 200 and ics.headers["content-type"].startswith("text/calendar")
    assert f"UID:atividade-{reuniao_id}@girahub" in ics.text and "Reunião geral" in ics.text
    canc = (await client.get(f"{AGENDA}/atividade/{itens['Reunião cancelada']['id']}", headers=ana.headers)).json()
    assert canc["cancelada"] is True and canc["cancelamento_motivo"] == "Feriado"
    ensaio_id = itens["Ensaio"]["id"]
    assert (await client.get(f"{AGENDA}/atividade/{ensaio_id}", headers=ana.headers)).status_code == 404
    assert (await client.get(f"{AGENDA}/atividade/{ensaio_id}/ics", headers=ana.headers)).status_code == 404
    assert (await client.get(f"{AGENDA}/atividade/{escondida['id']}", headers=beto.headers)).status_code == 404
    assert (await client.get(f"{AGENDA}/atividade/{excluida['id']}", headers=ana.headers)).status_code == 404

    # Grupo arquivado deixa de valer; sair do grupo também.
    g1.arquivado_em = datetime.now(timezone.utc)
    await db.commit()
    assert ("atividade", "Faxina do G1") not in await _titulos(beto)


async def test_publico_site_e_sitemap_nunca_mostram_atividade(client, db):
    tenant, admin = await _cenario(db)
    tipos = await _tipos(client, admin)
    gira = await create_gira(db, tenant, nome="Gira aberta")
    db.add(TenantSite(tenant_id=tenant.id, slug=tenant.slug, status=SiteStatus.PUBLISHED))
    await db.commit()
    marcador = "Atividade-interna-secreta"
    agora = datetime.now(timezone.utc)
    await _criar_atividade(client, admin, tipos["Reunião"]["id"], marcador, (agora + timedelta(days=1)).isoformat(), local=marcador)
    await _criar_atividade(client, admin, tipos["Faxina"]["id"], f"{marcador} 2", (agora + timedelta(hours=2)).isoformat())

    for url in (
        f"/api/v1/public/agenda/{tenant.slug}",
        f"/api/v1/public/next-gira?tenant_slug={tenant.slug}",
        f"/api/v1/public/gira/{gira.id}",
        f"/api/v1/public/sites/{tenant.slug}",
        "/api/v1/public/sitemap/sites",
    ):
        resp = await client.get(url)
        assert resp.status_code == 200, (url, resp.text)
        assert marcador not in resp.text, url
    agenda = (await client.get(f"/api/v1/public/agenda/{tenant.slug}")).json()
    assert "Gira aberta" in str(agenda)


# ── Migrações 077/078 ───────────────────────────────────────────────────────


def _alembic(*args):
    subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR, check=True, capture_output=True)


async def test_migracoes_077_078_sobem_e_descem_com_dados_e_acesso(client, db):
    from src.core.database import engine
    from src.repositories.permission_group_repo import PermissionGroupRepository

    existente = await create_tenant(db, name="Casa Existente")
    com_grupo = await create_tenant(db, name="Casa com Desenvolvimento")
    for t in (existente, com_grupo):
        await PermissionGroupRepository(db).ensure_default_group(t.id)
    db.add(CorrenteGrupo(tenant_id=com_grupo.id, nome="Desenvolvimento"))
    await db.commit()
    await db.close()

    async def _tabelas():
        async with engine.connect() as conn:
            return set((await conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))).scalars())

    novas = {"atividade_tipos", "atividade_tipo_grupos", "funcoes_corrente", "atividades"}
    _alembic("downgrade", "076_medium_email_pendente")
    try:
        assert not (novas & await _tabelas())
        async with engine.connect() as conn:
            escalas = (await conn.execute(text("SELECT count(*) FROM group_permissions WHERE feature = 'escalas'"))).scalar_one()
            enum = (
                await conn.execute(
                    text("SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid "
                         "WHERE t.typname = 'permission_feature' AND e.enumlabel = 'escalas'")
                )
            ).scalar_one()
        assert escalas == 0
        assert enum == 1  # valor de ENUM não sai no downgrade (077 é no-op ao descer)
    finally:
        _alembic("upgrade", "head")

    assert novas <= await _tabelas()
    async with engine.connect() as conn:
        for t in (existente, com_grupo):
            nomes = (
                await conn.execute(
                    text("SELECT nome FROM atividade_tipos WHERE tenant_id = :t ORDER BY ordem"), {"t": t.id}
                )
            ).scalars().all()
            assert list(nomes) == NOMES_SUGERIDOS
            funcoes = (
                await conn.execute(text("SELECT nome FROM funcoes_corrente WHERE tenant_id = :t ORDER BY ordem"), {"t": t.id})
            ).scalars().all()
            assert list(funcoes) == list(FUNCOES_SUGERIDAS)
            sistema = (
                await conn.execute(
                    text("SELECT nome FROM atividade_tipos WHERE tenant_id = :t AND is_sistema AND natureza = 'gira'"),
                    {"t": t.id},
                )
            ).scalars().all()
            assert sistema == ["Gira"]
            grant_escalas = (
                await conn.execute(
                    text(
                        "SELECT gp.can_view AND gp.can_insert AND gp.can_edit AND gp.can_delete FROM group_permissions gp "
                        "JOIN permission_groups pg ON pg.id = gp.group_id WHERE pg.tenant_id = :t AND pg.is_default "
                        "AND gp.feature = 'escalas'"
                    ),
                    {"t": t.id},
                )
            ).scalar_one()
            assert grant_escalas is True
        dev = dict(
            (
                await conn.execute(
                    text("SELECT tenant_id, elegiveis FROM atividade_tipos WHERE nome = 'Desenvolvimento'")
                )
            ).all()
        )
        assert dev[existente.id] == "atendimento" and dev[com_grupo.id] == "grupos"
        ligados = (await conn.execute(text("SELECT count(*) FROM atividade_tipo_grupos"))).scalar_one()
        assert ligados == 1
        idx = (
            await conn.execute(text("SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_atividade_tipos_tenant_nome_ativo'"))
        ).scalar_one()
        assert "lower" in idx and "arquivado_em IS NULL" in idx and "UNIQUE" in idx
        assert (
            await conn.execute(text("SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_atividades_gira_id'"))
        ).scalar_one()

    # Com o modelo: grupo padrão continua completo (ensure_default_group não duplica).
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        grupo = (
            await fresh.execute(select(PermissionGroup).where(PermissionGroup.tenant_id == existente.id, PermissionGroup.is_default))
        ).scalar_one()
        feats = (
            await fresh.execute(select(GroupPermission.feature).where(GroupPermission.group_id == grupo.id))
        ).scalars().all()
        assert PermissionFeature.ESCALAS in feats and len(feats) == len(set(feats))
