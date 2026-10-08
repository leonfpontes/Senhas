"""AM-23 — Grupos da corrente com Postgres real (migrações + app inteiro via HTTP).

Painel: CRUD com o grupo `MEDIUNS` (operador sem a feature → 403; com view só lê), nome único
por terreiro sem diferenciar maiúsculas e só entre os não arquivados, membros só médiuns ativos
do terreiro, ids de outro terreiro recusados, médium inativado/excluído sai dos grupos, campo
"Grupos" do cadastro do médium. Avisos: público `grupos` visível só para os membros (lista,
detalhe, leitura, Início, selo) e "lido por N de M" contando só membros. Área: `/medium/me`
mostra só os próprios grupos, nunca os outros membros. Chave do piloto desligada → 403.
Migração 075: tabelas, índice único parcial e o CHECK do `publico` (sobe e desce).
"""
import subprocess
import sys
import uuid

from sqlalchemy import select, text

from src.models import ComunicadoGrupo, CorrenteGrupoMembro, Medium
from src.models.permission_groups import PermissionFeature
from src.models.users import UserRole

from .conftest import BACKEND_DIR
from .factories import create_tenant, create_user, grant

GRUPOS = "/api/v1/admin/corrente-grupos"
COMUNICADOS = "/api/v1/admin/comunicados"
MEDIUNS = "/api/v1/admin/mediuns"
AVISOS = "/api/v1/medium/avisos"


async def _cenario(db, nome="Terreiro AM23", liberada=True):
    tenant = await create_tenant(db, name=nome, area_medium_liberada=liberada)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="dirigente")
    return tenant, admin


async def _medium(db, tenant, nome, *, atendimento=True, com_conta=True, ativo=True):
    actor = await create_user(db, tenant, UserRole.MEDIUM, name=nome.split()[0].lower()) if com_conta else None
    medium = Medium(
        tenant_id=tenant.id,
        nome=nome,
        is_atendimento=atendimento,
        is_active=ativo,
        user_id=actor.user.id if actor else None,
    )
    db.add(medium)
    await db.commit()
    return actor, medium


async def _criar_grupo(client, admin, nome="G1", **kw):
    resp = await client.post(GRUPOS, headers=admin.headers, json={"nome": nome, **kw})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _membros_no_banco(grupo_id):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        rows = await fresh.execute(
            select(CorrenteGrupoMembro.medium_id).where(CorrenteGrupoMembro.grupo_id == uuid.UUID(grupo_id))
        )
        return {str(r) for r in rows.scalars().all()}


# ── Painel: CRUD ────────────────────────────────────────────────────────────


async def test_admin_cria_lista_edita_membros_arquiva_e_desarquiva(client, db):
    tenant, admin = await _cenario(db)
    _, ana = await _medium(db, tenant, "Ana Paula")
    _, beto = await _medium(db, tenant, "Beto Souza", atendimento=False)
    _, caio = await _medium(db, tenant, "Caio Lima")

    g1 = await _criar_grupo(
        client, admin, nome="  <b>G1</b> ", cor="petroleo", descricao="Faxina dos sábados",
        medium_ids=[str(beto.id), str(ana.id), str(ana.id)],
    )
    assert g1["nome"] == "G1" and g1["cor"] == "petroleo" and g1["descricao"] == "Faxina dos sábados"
    assert g1["total_membros"] == 2
    assert [m["nome"] for m in g1["membros"]] == ["Ana Paula", "Beto Souza"]
    assert set(g1["membros"][0]) == {"medium_id", "nome", "desde"}
    g2 = await _criar_grupo(client, admin, nome="G2")
    assert g2["cor"] == "ambar" and g2["total_membros"] == 0

    lista = (await client.get(GRUPOS, headers=admin.headers)).json()
    assert [(g["nome"], g["total_membros"]) for g in lista] == [("G1", 2), ("G2", 0)]

    # PUT com medium_ids troca o conjunto inteiro.
    put = await client.put(f"{GRUPOS}/{g1['id']}", headers=admin.headers, json={"medium_ids": [str(caio.id), str(ana.id)]})
    assert put.status_code == 200, put.text
    assert {m["nome"] for m in put.json()["membros"]} == {"Ana Paula", "Caio Lima"}
    # Sem medium_ids, os membros ficam.
    put = await client.put(f"{GRUPOS}/{g1['id']}", headers=admin.headers, json={"nome": "Grupo 1", "cor": "vinho"})
    assert put.json()["nome"] == "Grupo 1" and put.json()["total_membros"] == 2

    add = await client.post(f"{GRUPOS}/{g2['id']}/membros", headers=admin.headers, json={"medium_ids": [str(beto.id)]})
    assert add.status_code == 200 and add.json()["total_membros"] == 1
    # De novo: idempotente.
    add = await client.post(f"{GRUPOS}/{g2['id']}/membros", headers=admin.headers, json={"medium_ids": [str(beto.id)]})
    assert add.status_code == 200 and add.json()["total_membros"] == 1
    rm = await client.delete(f"{GRUPOS}/{g2['id']}/membros/{beto.id}", headers=admin.headers)
    assert rm.status_code == 204
    assert (await client.delete(f"{GRUPOS}/{g2['id']}/membros/{beto.id}", headers=admin.headers)).status_code == 404

    opcoes = (await client.get(f"{GRUPOS}/opcoes", headers=admin.headers)).json()
    # Por nome, sem diferenciar maiúsculas ("G2" < "grupo 1").
    assert opcoes == [
        {"id": g2["id"], "nome": "G2", "cor": "ambar", "total_membros": 0},
        {"id": g1["id"], "nome": "Grupo 1", "cor": "vinho", "total_membros": 2},
    ]

    # Arquivar: some da lista e das opções; membros ficam gravados e voltam com o grupo.
    assert (await client.delete(f"{GRUPOS}/{g1['id']}", headers=admin.headers)).status_code == 204
    assert [g["nome"] for g in (await client.get(GRUPOS, headers=admin.headers)).json()] == ["G2"]
    todos = (await client.get(f"{GRUPOS}?incluir_arquivados=true", headers=admin.headers)).json()
    assert [(g["nome"], g["arquivado_em"] is not None) for g in todos] == [("G2", False), ("Grupo 1", True)]
    assert len(await _membros_no_banco(g1["id"])) == 2
    # Grupo arquivado não recebe membro nem edição.
    assert (await client.put(f"{GRUPOS}/{g1['id']}", headers=admin.headers, json={"nome": "X"})).status_code == 404
    assert (
        await client.post(f"{GRUPOS}/{g1['id']}/membros", headers=admin.headers, json={"medium_ids": [str(beto.id)]})
    ).status_code == 404
    assert (await client.get(f"{GRUPOS}/{g1['id']}", headers=admin.headers)).status_code == 200

    volta = await client.post(f"{GRUPOS}/{g1['id']}/desarquivar", headers=admin.headers)
    assert volta.status_code == 200 and volta.json()["arquivado_em"] is None and volta.json()["total_membros"] == 2


async def test_nome_unico_por_terreiro_sem_maiusculas_e_ignorando_arquivados(client, db):
    _, admin = await _cenario(db)
    g1 = await _criar_grupo(client, admin, nome="Ogãs")
    repetido = await client.post(GRUPOS, headers=admin.headers, json={"nome": "OGÃS"})
    assert repetido.status_code == 409
    g2 = await _criar_grupo(client, admin, nome="Desenvolvimento")
    assert (await client.put(f"{GRUPOS}/{g2['id']}", headers=admin.headers, json={"nome": "ogãs"})).status_code == 409
    # Mudar só maiúsculas do próprio nome pode.
    assert (await client.put(f"{GRUPOS}/{g1['id']}", headers=admin.headers, json={"nome": "OGÃS"})).status_code == 200

    # Arquivado libera o nome; desarquivar com nome tomado → 409.
    assert (await client.delete(f"{GRUPOS}/{g1['id']}", headers=admin.headers)).status_code == 204
    novo = await _criar_grupo(client, admin, nome="ogãs")
    assert (await client.post(f"{GRUPOS}/{g1['id']}/desarquivar", headers=admin.headers)).status_code == 409
    assert novo

    # Outro terreiro pode usar o mesmo nome.
    _, outro = await _cenario(db, nome="Outra Casa")
    await _criar_grupo(client, outro, nome="Ogãs")

    # O índice único parcial segura mesmo sem a checagem da API.
    from src.core.database import engine

    async with engine.connect() as conn:
        idx = (
            await conn.execute(text("SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_corrente_grupos_tenant_nome_ativo'"))
        ).scalar_one()
    assert "lower" in idx and "arquivado_em IS NULL" in idx and "UNIQUE" in idx


async def test_validacoes_de_nome_e_cor(client, db):
    _, admin = await _cenario(db)
    h = admin.headers
    assert (await client.post(GRUPOS, headers=h, json={"nome": "<i></i>"})).status_code == 422
    assert (await client.post(GRUPOS, headers=h, json={"nome": "x" * 61})).status_code == 422
    assert (await client.post(GRUPOS, headers=h, json={"nome": "G1", "cor": "#ff0000"})).status_code == 422
    assert (await client.post(GRUPOS, headers=h, json={"nome": "G1", "medium_ids": ["nao-e-uuid"]})).status_code == 422


async def test_membros_so_medium_ativo_do_terreiro(client, db):
    tenant, admin = await _cenario(db)
    _, ana = await _medium(db, tenant, "Ana Paula")
    _, inativo = await _medium(db, tenant, "Edu Inativo", ativo=False)
    _, excluido = await _medium(db, tenant, "Fábio Excluído")
    await db.execute(text("UPDATE mediuns SET deleted_at = now() WHERE id = :i"), {"i": excluido.id})
    await db.commit()
    outro, _ = await _cenario(db, nome="Outra Casa")
    _, de_fora = await _medium(db, outro, "Intrusa")

    g1 = await _criar_grupo(client, admin, nome="G1")
    for medium in (inativo, excluido, de_fora):
        for metodo, url, body in (
            ("post", GRUPOS, {"nome": f"G-{uuid.uuid4().hex[:4]}", "medium_ids": [str(ana.id), str(medium.id)]}),
            ("put", f"{GRUPOS}/{g1['id']}", {"medium_ids": [str(medium.id)]}),
            ("post", f"{GRUPOS}/{g1['id']}/membros", {"medium_ids": [str(medium.id)]}),
        ):
            resp = await getattr(client, metodo)(url, headers=admin.headers, json=body)
            assert resp.status_code == 422, (medium.nome, metodo, url, resp.text)
    assert await _membros_no_banco(g1["id"]) == set()
    # Nenhum grupo extra foi criado nas tentativas recusadas.
    assert len((await client.get(GRUPOS, headers=admin.headers)).json()) == 1


async def test_operador_sem_mediuns_leva_403_e_com_view_so_le(client, db):
    tenant, admin = await _cenario(db)
    g1 = await _criar_grupo(client, admin)
    _, ana = await _medium(db, tenant, "Ana Paula")

    sem = await create_user(db, tenant, UserRole.OPERATOR, name="sem")
    await grant(db, sem, tenant, PermissionFeature.GIRAS, "view", "insert", "edit", "delete")
    chamadas = (
        ("get", GRUPOS, None),
        ("get", f"{GRUPOS}/opcoes", None),
        ("get", f"{GRUPOS}/{g1['id']}", None),
        ("post", GRUPOS, {"nome": "X"}),
        ("put", f"{GRUPOS}/{g1['id']}", {"nome": "Y"}),
        ("post", f"{GRUPOS}/{g1['id']}/membros", {"medium_ids": [str(ana.id)]}),
        ("delete", f"{GRUPOS}/{g1['id']}/membros/{ana.id}", None),
        ("post", f"{GRUPOS}/{g1['id']}/desarquivar", None),
        ("delete", f"{GRUPOS}/{g1['id']}", None),
        ("put", f"{GRUPOS}/mediuns/{ana.id}", {"grupo_ids": [g1["id"]]}),
    )
    for metodo, url, body in chamadas:
        kwargs = {"headers": sem.headers}
        if body is not None:
            kwargs["json"] = body
        assert (await getattr(client, metodo)(url, **kwargs)).status_code == 403, (metodo, url)

    leitor = await create_user(db, tenant, UserRole.OPERATOR, name="leitor")
    await grant(db, leitor, tenant, PermissionFeature.MEDIUNS, "view")
    assert (await client.get(GRUPOS, headers=leitor.headers)).status_code == 200
    assert (await client.get(f"{GRUPOS}/opcoes", headers=leitor.headers)).status_code == 200
    assert (await client.post(GRUPOS, headers=leitor.headers, json={"nome": "X"})).status_code == 403
    assert (await client.put(f"{GRUPOS}/{g1['id']}", headers=leitor.headers, json={"nome": "Y"})).status_code == 403
    assert (await client.delete(f"{GRUPOS}/{g1['id']}", headers=leitor.headers)).status_code == 403

    # Quem só publica avisos vê as opções (sem nomes de médiuns), não a lista com membros.
    avisos = await create_user(db, tenant, UserRole.OPERATOR, name="avisos")
    await grant(db, avisos, tenant, PermissionFeature.COMUNICADOS, "view", "insert")
    opcoes = await client.get(f"{GRUPOS}/opcoes", headers=avisos.headers)
    assert opcoes.status_code == 200 and set(opcoes.json()[0]) == {"id", "nome", "cor", "total_membros"}
    assert (await client.get(GRUPOS, headers=avisos.headers)).status_code == 403

    editor = await create_user(db, tenant, UserRole.OPERATOR, name="editor")
    await grant(db, editor, tenant, PermissionFeature.MEDIUNS, "view", "insert", "edit")
    assert (await client.post(GRUPOS, headers=editor.headers, json={"nome": "G9"})).status_code == 201
    assert (
        await client.post(f"{GRUPOS}/{g1['id']}/membros", headers=editor.headers, json={"medium_ids": [str(ana.id)]})
    ).status_code == 200
    assert (await client.delete(f"{GRUPOS}/{g1['id']}", headers=editor.headers)).status_code == 403


async def test_chave_do_piloto_desligada_e_medium_no_painel_levam_403(client, db):
    tenant, admin = await _cenario(db, liberada=False)
    assert (await client.get(GRUPOS, headers=admin.headers)).status_code == 403
    assert (await client.post(GRUPOS, headers=admin.headers, json={"nome": "G1"})).status_code == 403

    tenant2, _ = await _cenario(db, nome="Casa Piloto")
    ana, _ = await _medium(db, tenant2, "Ana Paula")
    assert (await client.get(GRUPOS, headers=ana.headers)).status_code == 403


async def test_outro_terreiro_nao_ve_nem_mexe_no_grupo(client, db):
    tenant, admin = await _cenario(db)
    _, ana = await _medium(db, tenant, "Ana Paula")
    g1 = await _criar_grupo(client, admin, medium_ids=[str(ana.id)])
    outro, intruso = await _cenario(db, nome="Outra Casa")
    _, beto = await _medium(db, outro, "Beto")
    gid = g1["id"]
    for metodo, url, body in (
        ("get", f"{GRUPOS}/{gid}", None),
        ("put", f"{GRUPOS}/{gid}", {"nome": "X"}),
        ("post", f"{GRUPOS}/{gid}/membros", {"medium_ids": [str(beto.id)]}),
        ("delete", f"{GRUPOS}/{gid}/membros/{ana.id}", None),
        ("delete", f"{GRUPOS}/{gid}", None),
        ("post", f"{GRUPOS}/{gid}/desarquivar", None),
        ("put", f"{GRUPOS}/mediuns/{ana.id}", {"grupo_ids": []}),
    ):
        kwargs = {"headers": intruso.headers}
        if body is not None:
            kwargs["json"] = body
        assert (await getattr(client, metodo)(url, **kwargs)).status_code == 404, (metodo, url)
    # Grupo de outro terreiro no corpo → 422 (nem confirma que existe).
    resp = await client.put(f"{GRUPOS}/mediuns/{beto.id}", headers=intruso.headers, json={"grupo_ids": [gid]})
    assert resp.status_code == 422
    assert (await client.get(GRUPOS, headers=intruso.headers)).json() == []
    assert await _membros_no_banco(gid) == {str(ana.id)}


async def test_campo_grupos_do_cadastro_do_medium(client, db):
    tenant, admin = await _cenario(db)
    _, ana = await _medium(db, tenant, "Ana Paula")
    _, inativo = await _medium(db, tenant, "Edu Inativo", ativo=False)
    g1 = await _criar_grupo(client, admin, nome="G1")
    g2 = await _criar_grupo(client, admin, nome="G2")
    g3 = await _criar_grupo(client, admin, nome="G3")

    url = f"{GRUPOS}/mediuns/{ana.id}"
    resp = await client.put(url, headers=admin.headers, json={"grupo_ids": [g2["id"], g1["id"]]})
    assert resp.status_code == 200, resp.text
    assert [g["nome"] for g in resp.json()] == ["G2", "G1"]
    assert await _membros_no_banco(g1["id"]) == {str(ana.id)}

    # Arquivado: o vínculo fica guardado e não é tocado; pedir um grupo arquivado → 422.
    assert (await client.delete(f"{GRUPOS}/{g3['id']}", headers=admin.headers)).status_code == 204
    db.add(CorrenteGrupoMembro(tenant_id=tenant.id, grupo_id=uuid.UUID(g3["id"]), medium_id=ana.id))
    await db.commit()
    assert (await client.put(url, headers=admin.headers, json={"grupo_ids": [g3["id"]]})).status_code == 422
    resp = await client.put(url, headers=admin.headers, json={"grupo_ids": [g2["id"]]})
    assert [g["nome"] for g in resp.json()] == ["G2"]
    assert await _membros_no_banco(g1["id"]) == set()
    assert await _membros_no_banco(g3["id"]) == {str(ana.id)}
    assert (await client.put(url, headers=admin.headers, json={"grupo_ids": []})).json() == []
    assert await _membros_no_banco(g2["id"]) == set()

    # Médium inativo não entra; sair de tudo pode.
    url_inativo = f"{GRUPOS}/mediuns/{inativo.id}"
    assert (await client.put(url_inativo, headers=admin.headers, json={"grupo_ids": [g1["id"]]})).status_code == 422
    assert (await client.put(url_inativo, headers=admin.headers, json={"grupo_ids": []})).status_code == 200
    assert (await client.put(f"{GRUPOS}/mediuns/{uuid.uuid4()}", headers=admin.headers, json={"grupo_ids": []})).status_code == 404


async def test_medium_inativado_ou_excluido_sai_dos_grupos(client, db):
    tenant, admin = await _cenario(db)
    _, ana = await _medium(db, tenant, "Ana Paula", com_conta=False)
    _, beto = await _medium(db, tenant, "Beto Souza", com_conta=False)
    g1 = await _criar_grupo(client, admin, nome="G1", medium_ids=[str(ana.id), str(beto.id)])
    g2 = await _criar_grupo(client, admin, nome="G2", medium_ids=[str(ana.id)])

    resp = await client.patch(f"{MEDIUNS}/{ana.id}", headers=admin.headers, json={"is_active": False})
    assert resp.status_code == 200, resp.text
    assert await _membros_no_banco(g1["id"]) == {str(beto.id)}
    assert await _membros_no_banco(g2["id"]) == set()
    # Reativar não devolve (o dirigente põe de novo).
    assert (await client.patch(f"{MEDIUNS}/{ana.id}", headers=admin.headers, json={"is_active": True})).status_code == 200
    assert await _membros_no_banco(g2["id"]) == set()

    assert (await client.delete(f"{MEDIUNS}/{beto.id}", headers=admin.headers)).status_code == 204
    assert await _membros_no_banco(g1["id"]) == set()
    assert (await client.get(GRUPOS, headers=admin.headers)).json()[0]["total_membros"] == 0


# ── Avisos para grupos ──────────────────────────────────────────────────────


async def test_aviso_para_grupo_so_aparece_para_os_membros_e_leituras_contam_so_eles(client, db):
    tenant, admin = await _cenario(db)
    ana, m_ana = await _medium(db, tenant, "Ana Paula", atendimento=True)
    beto, m_beto = await _medium(db, tenant, "Beto Souza", atendimento=False)
    caio, m_caio = await _medium(db, tenant, "Caio Lima", atendimento=True)
    g1 = await _criar_grupo(client, admin, nome="G1", medium_ids=[str(m_ana.id), str(m_beto.id)])
    g2 = await _criar_grupo(client, admin, nome="G2", medium_ids=[str(m_caio.id)])

    resp = await client.post(
        COMUNICADOS,
        headers=admin.headers,
        json={"titulo": "Faxina de sábado", "corpo": "G1 às 9h.", "publico": "grupos", "grupo_ids": [g1["id"]]},
    )
    assert resp.status_code == 201, resp.text
    aviso = resp.json()
    assert aviso["publico"] == "grupos"
    assert aviso["grupos"] == [{"id": g1["id"], "nome": "G1", "cor": "ambar"}]
    assert aviso["leituras"] == {"lidos": 0, "total": 2}

    # Membros veem (lista, detalhe, Início, selo); quem está fora leva 404.
    for actor in (ana, beto):
        lista = (await client.get(AVISOS, headers=actor.headers)).json()
        assert [i["titulo"] for i in lista["itens"]] == ["Faxina de sábado"]
        assert (await client.get(f"{AVISOS}/{aviso['id']}", headers=actor.headers)).status_code == 200
        assert (await client.get("/api/v1/medium/me", headers=actor.headers)).json()["avisos_nao_lidos"] == 1
    assert (await client.get(AVISOS, headers=caio.headers)).json() == {"itens": [], "nao_lidos": 0}
    assert (await client.get(f"{AVISOS}/{aviso['id']}", headers=caio.headers)).status_code == 404
    assert (await client.post(f"{AVISOS}/{aviso['id']}/lido", headers=caio.headers)).status_code == 404
    assert (await client.get("/api/v1/medium/inicio", headers=caio.headers)).json()["avisos"]["nao_lidos"] == 0

    assert (await client.post(f"{AVISOS}/{aviso['id']}/lido", headers=ana.headers)).status_code == 200
    leituras = (await client.get(f"{COMUNICADOS}/{aviso['id']}/leituras", headers=admin.headers)).json()
    assert leituras["total"] == 2 and leituras["lidos"] == 1
    assert [leitor["nome"] for leitor in leituras["nao_leram"]] == ["Beto Souza"]

    # Trocar para G1 + G2: Caio passa a ver e entra no "de M".
    put = await client.put(f"{COMUNICADOS}/{aviso['id']}", headers=admin.headers, json={"grupo_ids": [g1["id"], g2["id"]]})
    assert put.status_code == 200, put.text
    assert {g["nome"] for g in put.json()["grupos"]} == {"G1", "G2"}
    assert put.json()["leituras"] == {"lidos": 1, "total": 3}
    assert (await client.get(f"{AVISOS}/{aviso['id']}", headers=caio.headers)).status_code == 200

    # Médium que sai do grupo deixa de ver e de contar.
    assert (await client.delete(f"{GRUPOS}/{g2['id']}/membros/{m_caio.id}", headers=admin.headers)).status_code == 204
    assert (await client.get(f"{AVISOS}/{aviso['id']}", headers=caio.headers)).status_code == 404
    lista = {c["id"]: c for c in (await client.get(COMUNICADOS, headers=admin.headers)).json()}
    assert lista[aviso["id"]]["leituras"] == {"lidos": 1, "total": 2}

    # Grupo arquivado sai do público.
    assert (await client.delete(f"{GRUPOS}/{g1['id']}", headers=admin.headers)).status_code == 204
    assert (await client.get(f"{AVISOS}/{aviso['id']}", headers=beto.headers)).status_code == 404
    detalhe = (await client.get(f"{COMUNICADOS}/{aviso['id']}", headers=admin.headers)).json()
    assert [g["nome"] for g in detalhe["grupos"]] == ["G2"] and detalhe["leituras"]["total"] == 0

    # Voltar para "todos" limpa os grupos.
    put = await client.put(f"{COMUNICADOS}/{aviso['id']}", headers=admin.headers, json={"publico": "todos"})
    assert put.json()["grupos"] == [] and put.json()["leituras"]["total"] == 3
    n = (await db.execute(select(ComunicadoGrupo).where(ComunicadoGrupo.comunicado_id == uuid.UUID(aviso["id"])))).all()
    assert n == []


async def test_aviso_para_grupos_exige_grupo_ativo_do_terreiro(client, db):
    tenant, admin = await _cenario(db)
    g1 = await _criar_grupo(client, admin, nome="G1")
    arquivado = await _criar_grupo(client, admin, nome="Velho")
    assert (await client.delete(f"{GRUPOS}/{arquivado['id']}", headers=admin.headers)).status_code == 204
    _, intruso = await _cenario(db, nome="Outra Casa")
    de_fora = await _criar_grupo(client, intruso, nome="G1")

    base = {"titulo": "Aviso", "corpo": "Texto", "publico": "grupos"}
    for grupo_ids in ([], [arquivado["id"]], [de_fora["id"]], [g1["id"], de_fora["id"]], [str(uuid.uuid4())]):
        resp = await client.post(COMUNICADOS, headers=admin.headers, json={**base, "grupo_ids": grupo_ids})
        assert resp.status_code == 422, (grupo_ids, resp.text)
    assert (await client.get(COMUNICADOS, headers=admin.headers)).json() == []

    criado = (await client.post(COMUNICADOS, headers=admin.headers, json={**base, "grupo_ids": [g1["id"]]})).json()
    for corpo in ({"grupo_ids": [de_fora["id"]]}, {"grupo_ids": []}):
        assert (await client.put(f"{COMUNICADOS}/{criado['id']}", headers=admin.headers, json=corpo)).status_code == 422
    # grupo_ids com outro público é ignorado (não grava grupo).
    todos = (
        await client.post(COMUNICADOS, headers=admin.headers, json={**base, "publico": "todos", "grupo_ids": [g1["id"]]})
    ).json()
    assert todos["grupos"] == []
    assert tenant


# ── Área do Médium: o próprio grupo, nunca os outros membros ────────────────


async def test_medium_me_mostra_so_os_proprios_grupos(client, db):
    tenant, admin = await _cenario(db)
    ana, m_ana = await _medium(db, tenant, "Ana Paula")
    _, m_beto = await _medium(db, tenant, "Beto Souza")
    caio, _ = await _medium(db, tenant, "Caio Lima")
    g2 = await _criar_grupo(client, admin, nome="G2", cor="petroleo", medium_ids=[str(m_ana.id), str(m_beto.id)])
    await _criar_grupo(client, admin, nome="G1", medium_ids=[str(m_beto.id)])
    ogas = await _criar_grupo(client, admin, nome="Ogãs", cor="violeta", medium_ids=[str(m_ana.id)])

    me = (await client.get("/api/v1/medium/me", headers=ana.headers)).json()
    assert me["grupos"] == [
        {"id": g2["id"], "nome": "G2", "cor": "petroleo"},
        {"id": ogas["id"], "nome": "Ogãs", "cor": "violeta"},
    ]
    # Nada de membros nem contagem de ninguém.
    bruto = (await client.get("/api/v1/medium/me", headers=ana.headers)).text
    assert "Beto" not in bruto and "membros" not in bruto
    assert (await client.get("/api/v1/medium/me", headers=caio.headers)).json()["grupos"] == []

    assert (await client.delete(f"{GRUPOS}/{ogas['id']}", headers=admin.headers)).status_code == 204
    assert [g["nome"] for g in (await client.get("/api/v1/medium/me", headers=ana.headers)).json()["grupos"]] == ["G2"]


# ── Migração 075 ────────────────────────────────────────────────────────────


def _alembic(*args):
    subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR, check=True, capture_output=True)


async def test_migracao_075_sobe_e_desce_com_o_check_do_publico(client, db):
    from src.core.database import engine

    tenant, admin = await _cenario(db)
    g1 = await _criar_grupo(client, admin, nome="G1")
    aviso = (
        await client.post(
            COMUNICADOS,
            headers=admin.headers,
            json={"titulo": "Só G1", "corpo": "Texto", "publico": "grupos", "grupo_ids": [g1["id"]]},
        )
    ).json()
    await db.close()

    async def _tabelas():
        async with engine.connect() as conn:
            return set((await conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))).scalars())

    async def _check():
        async with engine.connect() as conn:
            return (
                await conn.execute(
                    text("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ck_comunicados_publico'")
                )
            ).scalar_one()

    assert {"corrente_grupos", "corrente_grupo_membros", "comunicado_grupos"} <= await _tabelas()
    assert "grupos" in await _check()

    _alembic("downgrade", "075_corrente_grupos-1")
    try:
        assert not ({"corrente_grupos", "corrente_grupo_membros", "comunicado_grupos"} & await _tabelas())
        assert "grupos" not in await _check()
        # O aviso que era só do G1 não vira "para todos": sai do ar (arquivado).
        async with engine.connect() as conn:
            publico, apagado = (
                await conn.execute(
                    text("SELECT publico, deleted_at IS NOT NULL FROM comunicados WHERE id = :i"), {"i": aviso["id"]}
                )
            ).one()
        assert publico == "todos" and apagado is True
        async with engine.connect() as conn:
            try:
                await conn.execute(
                    text(
                        "INSERT INTO comunicados (id, tenant_id, titulo, corpo, publico, publicar_em, created_at, updated_at)"
                        " VALUES (gen_random_uuid(), :t, 'x', 'y', 'grupos', now(), now(), now())"
                    ),
                    {"t": tenant.id},
                )
                raise AssertionError("o CHECK antigo devia recusar publico = 'grupos'")
            except Exception as exc:  # noqa: BLE001 — IntegrityError do asyncpg embrulhado
                assert "ck_comunicados_publico" in str(exc)
    finally:
        _alembic("upgrade", "head")

    assert {"corrente_grupos", "corrente_grupo_membros", "comunicado_grupos"} <= await _tabelas()
    assert "grupos" in await _check()
    async with engine.connect() as conn:
        cores = (
            await conn.execute(text("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ck_corrente_grupos_cor'"))
        ).scalar_one()
    assert "petroleo" in cores and "grafite" in cores
