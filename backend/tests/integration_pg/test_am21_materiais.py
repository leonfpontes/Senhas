"""AM-21 — Estudos e documentos da casa com Postgres real (migrações + app inteiro via HTTP).

Painel: CRUD com o grupo `COMUNICADOS` (operador sem a feature → 403), plano `biblioteca_medium`
(Basic → 403; Pro → 200) e chave do piloto, links (só http/https; `javascript:` recusado também
pelo CHECK do banco), limites de texto e de quantidade, reordenar, outro terreiro → 404,
grupos de outro terreiro → 422. Área do Médium: só materiais publicados do público do médium
(todos / atendimento / cambones / grupos), rascunho e arquivado escondidos, detalhe com o texto,
outro terreiro → 404, `estudos` no `/medium/me`, cursos abertos da casa com o link da inscrição.
Migração 090: sobe e desce.
"""
import subprocess
import sys
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, text

from src.models import CursoParticipante, CursoPresencial, MaterialCorrente, MaterialGrupo, Medium
from src.models.corrente_grupos import CorrenteGrupo, CorrenteGrupoMembro
from src.models.materiais import MATERIAIS_MAX, TEXTO_MAX
from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.users import UserRole

from .conftest import BACKEND_DIR
from .factories import create_tenant, create_user, grant

ADMIN = "/api/v1/admin/materiais"
AREA = "/api/v1/medium/materiais"
YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
DRIVE = "https://drive.google.com/file/d/abc123/view?usp=sharing"


async def _cenario(db, nome="Terreiro AM21", plan=PlanType.PRO, liberada=True):
    tenant = await create_tenant(db, name=nome, plan=plan, area_medium_liberada=liberada)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="dirigente")
    return tenant, admin


async def _medium(db, tenant, nome, *, atendimento=True):
    actor = await create_user(db, tenant, UserRole.MEDIUM, name=nome.split()[0].lower())
    medium = Medium(tenant_id=tenant.id, nome=nome, is_atendimento=atendimento, is_active=True, user_id=actor.user.id)
    db.add(medium)
    await db.commit()
    return actor, medium


async def _grupo(db, tenant, nome, *mediuns):
    grupo = CorrenteGrupo(tenant_id=tenant.id, nome=nome)
    db.add(grupo)
    await db.flush()
    for m in mediuns:
        db.add(CorrenteGrupoMembro(tenant_id=tenant.id, grupo_id=grupo.id, medium_id=m.id))
    await db.commit()
    return grupo


async def _criar(client, admin, **kw):
    body = {"titulo": "Fundamentos de Ogum", "tipo": "link", "url": DRIVE, **kw}
    resp = await client.post(ADMIN, headers=admin.headers, json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Painel ──────────────────────────────────────────────────────────────────


async def test_admin_cria_edita_reordena_lista_e_arquiva(client, db):
    _, admin = await _cenario(db)
    link = await _criar(client, admin, titulo=" <b>Apostila</b> do desenvolvimento ", categoria="Fundamentos")
    assert link["titulo"] == "Apostila do desenvolvimento"
    assert link["fonte"] == "drive" and link["youtube_id"] is None
    assert link["categoria"] == "Fundamentos" and link["publico"] == "todos" and link["publicado"] is True
    assert link["ordem"] == 0

    ponto = await _criar(
        client,
        admin,
        titulo="Ponto de Oxóssi",
        tipo="ponto",
        url=YT,
        texto="Okê arô\r\n<script>alert(1)</script>Oxóssi",
        categoria="Pontos cantados",
    )
    assert ponto["texto"] == "Okê arô\nalert(1)Oxóssi"
    assert ponto["fonte"] == "youtube" and ponto["youtube_id"] == "dQw4w9WgXcQ"
    assert ponto["ordem"] == 1

    estudo = await _criar(client, admin, titulo="Reza", tipo="texto", url=None, texto="Pai nosso", publicado=False)
    assert estudo["categoria"] == "Estudos" and estudo["publicado"] is False

    put = await client.put(
        f"{ADMIN}/{link['id']}", headers=admin.headers, json={"titulo": "Apostila nova", "publico": "cambones"}
    )
    assert put.status_code == 200, put.text
    assert put.json()["titulo"] == "Apostila nova" and put.json()["url"] == DRIVE

    ordem = await client.put(
        f"{ADMIN}/ordem", headers=admin.headers, json={"ids": [estudo["id"], ponto["id"], link["id"]]}
    )
    assert ordem.status_code == 200, ordem.text
    assert [i["titulo"] for i in ordem.json()["itens"]] == ["Reza", "Ponto de Oxóssi", "Apostila nova"]

    lista = (await client.get(ADMIN, headers=admin.headers)).json()
    assert [i["id"] for i in lista["itens"]] == [estudo["id"], ponto["id"], link["id"]]
    assert lista["categorias"][:5] == ["Estudos", "Pontos cantados", "Fundamentos", "Rezas", "Avisos gerais"]
    assert lista["limite"] == MATERIAIS_MAX

    # Ordem incompleta (lista mudou) → 422
    assert (await client.put(f"{ADMIN}/ordem", headers=admin.headers, json={"ids": [link["id"]]})).status_code == 422

    assert (await client.delete(f"{ADMIN}/{link['id']}", headers=admin.headers)).status_code == 204
    assert (await client.get(f"{ADMIN}/{link['id']}", headers=admin.headers)).status_code == 404
    assert link["id"] not in [i["id"] for i in (await client.get(ADMIN, headers=admin.headers)).json()["itens"]]
    arquivado = (await db.execute(select(MaterialCorrente).where(MaterialCorrente.id == uuid.UUID(link["id"])))).scalar_one()
    await db.refresh(arquivado)
    assert arquivado.arquivado_em is not None


@pytest.mark.parametrize(
    "url",
    ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "ftp://x.com/a.pdf", "https://a.com@b.net/"],
)
async def test_link_perigoso_recusado(client, db, url):
    _, admin = await _cenario(db)
    resp = await client.post(ADMIN, headers=admin.headers, json={"titulo": "X", "tipo": "link", "url": url})
    assert resp.status_code == 422, resp.text
    criado = await _criar(client, admin)
    resp = await client.put(f"{ADMIN}/{criado['id']}", headers=admin.headers, json={"url": url})
    assert resp.status_code == 422, resp.text


async def test_check_do_banco_recusa_javascript(db):
    tenant, _ = await _cenario(db)
    with pytest.raises(Exception) as exc:
        await db.execute(
            text(
                "INSERT INTO materiais_corrente (id, tenant_id, titulo, tipo, url, created_at, updated_at)"
                " VALUES (gen_random_uuid(), :t, 'x', 'link', 'javascript:alert(1)', now(), now())"
            ),
            {"t": tenant.id},
        )
    assert "ck_materiais_corrente_url" in str(exc.value)
    await db.rollback()


async def test_validacoes_de_tipo_e_limites(client, db):
    _, admin = await _cenario(db)
    h = admin.headers
    assert (await client.post(ADMIN, headers=h, json={"titulo": "X", "tipo": "link"})).status_code == 422
    assert (await client.post(ADMIN, headers=h, json={"titulo": "X", "tipo": "texto"})).status_code == 422
    assert (await client.post(ADMIN, headers=h, json={"titulo": "X", "tipo": "ponto", "url": YT})).status_code == 422
    assert (await client.post(ADMIN, headers=h, json={"titulo": "X", "tipo": "pdf", "url": DRIVE})).status_code == 422
    assert (await client.post(ADMIN, headers=h, json={"titulo": "X", "tipo": "link", "url": DRIVE, "publico": "diretoria"})).status_code == 422
    assert (await client.post(ADMIN, headers=h, json={"titulo": "X", "tipo": "link", "url": DRIVE, "publico": "grupos"})).status_code == 422
    # Limite de texto medido: 15 000 entra, 15 001 não.
    ok = await client.post(ADMIN, headers=h, json={"titulo": "Longo", "tipo": "texto", "texto": "a" * TEXTO_MAX})
    assert ok.status_code == 201 and len(ok.json()["texto"]) == TEXTO_MAX
    longo = await client.post(ADMIN, headers=h, json={"titulo": "Longo", "tipo": "texto", "texto": "a" * (TEXTO_MAX + 1)})
    assert longo.status_code == 422
    # Trocar um texto para link sem endereço → 422
    assert (await client.put(f"{ADMIN}/{ok.json()['id']}", headers=h, json={"tipo": "link"})).status_code == 422


async def test_limite_de_materiais_por_terreiro(client, db, monkeypatch):
    import src.api.v1.admin.materiais as mod

    monkeypatch.setattr(mod, "MATERIAIS_MAX", 2)
    _, admin = await _cenario(db)
    await _criar(client, admin)
    await _criar(client, admin)
    resp = await client.post(ADMIN, headers=admin.headers, json={"titulo": "3º", "tipo": "link", "url": DRIVE})
    assert resp.status_code == 422 and "até 2 materiais" in resp.text


async def test_operador_sem_comunicados_leva_403_e_com_grupo_so_o_que_o_grupo_libera(client, db):
    tenant, admin = await _cenario(db)
    criado = await _criar(client, admin)

    sem = await create_user(db, tenant, UserRole.OPERATOR, name="sem")
    await grant(db, sem, tenant, PermissionFeature.MEDIUNS, "view", "insert", "edit", "delete")
    for metodo, url, body in (
        ("get", ADMIN, None),
        ("get", f"{ADMIN}/{criado['id']}", None),
        ("post", ADMIN, {"titulo": "X", "tipo": "link", "url": DRIVE}),
        ("put", f"{ADMIN}/ordem", {"ids": [criado["id"]]}),
        ("put", f"{ADMIN}/{criado['id']}", {"titulo": "X"}),
        ("delete", f"{ADMIN}/{criado['id']}", None),
    ):
        kwargs = {"headers": sem.headers}
        if body is not None:
            kwargs["json"] = body
        assert (await getattr(client, metodo)(url, **kwargs)).status_code == 403, (metodo, url)

    leitor = await create_user(db, tenant, UserRole.OPERATOR, name="leitor")
    await grant(db, leitor, tenant, PermissionFeature.COMUNICADOS, "view")
    assert (await client.get(ADMIN, headers=leitor.headers)).status_code == 200
    assert (await client.post(ADMIN, headers=leitor.headers, json={"titulo": "X", "tipo": "link", "url": DRIVE})).status_code == 403
    assert (await client.put(f"{ADMIN}/{criado['id']}", headers=leitor.headers, json={"titulo": "X"})).status_code == 403

    editor = await create_user(db, tenant, UserRole.OPERATOR, name="editor")
    await grant(db, editor, tenant, PermissionFeature.COMUNICADOS, "view", "insert", "edit")
    assert (await client.post(ADMIN, headers=editor.headers, json={"titulo": "X", "tipo": "link", "url": DRIVE})).status_code == 201
    assert (await client.put(f"{ADMIN}/{criado['id']}", headers=editor.headers, json={"publicado": False})).status_code == 200
    assert (await client.delete(f"{ADMIN}/{criado['id']}", headers=editor.headers)).status_code == 403


async def test_plano_e_chave_do_piloto(client, db):
    _, basic = await _cenario(db, nome="Casa Basic", plan=PlanType.BASIC)
    resp = await client.get(ADMIN, headers=basic.headers)
    assert resp.status_code == 403 and "plano Pro" in resp.text
    _, sem_chave = await _cenario(db, nome="Casa sem chave", liberada=False)
    assert (await client.get(ADMIN, headers=sem_chave.headers)).status_code == 403
    _, premium = await _cenario(db, nome="Casa Premium", plan=PlanType.PREMIUM)
    assert (await client.get(ADMIN, headers=premium.headers)).status_code == 200


async def test_outro_terreiro_nao_ve_nem_mexe(client, db):
    tenant_a, admin = await _cenario(db)
    criado = await _criar(client, admin)
    tenant_b, intruso = await _cenario(db, nome="Outra Casa")
    assert (await client.get(f"{ADMIN}/{criado['id']}", headers=intruso.headers)).status_code == 404
    assert (await client.put(f"{ADMIN}/{criado['id']}", headers=intruso.headers, json={"titulo": "X"})).status_code == 404
    assert (await client.delete(f"{ADMIN}/{criado['id']}", headers=intruso.headers)).status_code == 404
    assert (await client.put(f"{ADMIN}/ordem", headers=intruso.headers, json={"ids": [criado["id"]]})).status_code == 422
    assert (await client.get(ADMIN, headers=intruso.headers)).json()["itens"] == []

    # Grupo de outro terreiro no corpo → 422 e nada gravado.
    grupo_b = await _grupo(db, tenant_b, "G1 de B")
    resp = await client.post(
        ADMIN,
        headers=admin.headers,
        json={"titulo": "X", "tipo": "link", "url": DRIVE, "publico": "grupos", "grupo_ids": [str(grupo_b.id)]},
    )
    assert resp.status_code == 422
    resp = await client.put(
        f"{ADMIN}/{criado['id']}", headers=admin.headers, json={"publico": "grupos", "grupo_ids": [str(grupo_b.id)]}
    )
    assert resp.status_code == 422
    vinculos = (await db.execute(select(MaterialGrupo).where(MaterialGrupo.grupo_id == grupo_b.id))).scalars().all()
    assert vinculos == []


# ── Área do Médium ──────────────────────────────────────────────────────────


async def test_medium_ve_so_o_seu_publico_publicado(client, db):
    tenant, admin = await _cenario(db)
    ana, ana_m = await _medium(db, tenant, "Ana Paula", atendimento=True)
    beto, beto_m = await _medium(db, tenant, "Beto Cambone", atendimento=False)
    caio, _ = await _medium(db, tenant, "Caio Ogã", atendimento=True)
    g1 = await _grupo(db, tenant, "G1", beto_m)

    await _criar(client, admin, titulo="Para todos", categoria="Fundamentos")
    await _criar(client, admin, titulo="Só atendimento", publico="atendimento")
    await _criar(client, admin, titulo="Só cambones", publico="cambones")
    so_g1 = await _criar(client, admin, titulo="Só G1", publico="grupos", grupo_ids=[str(g1.id)], categoria="Rezas")
    rascunho = await _criar(client, admin, titulo="Rascunho", publicado=False)
    arquivado = await _criar(client, admin, titulo="Arquivado")
    assert (await client.delete(f"{ADMIN}/{arquivado['id']}", headers=admin.headers)).status_code == 204
    ponto = await _criar(client, admin, titulo="Ponto de Ogum", tipo="ponto", texto="Ogum ê\nPatacori", url=YT)

    def titulos(resp):
        assert resp.status_code == 200, resp.text
        return [i["titulo"] for i in resp.json()["itens"]]

    assert titulos(await client.get(AREA, headers=ana.headers)) == ["Para todos", "Só atendimento", "Ponto de Ogum"]
    assert titulos(await client.get(AREA, headers=beto.headers)) == ["Para todos", "Só cambones", "Só G1", "Ponto de Ogum"]
    assert titulos(await client.get(AREA, headers=caio.headers)) == ["Para todos", "Só atendimento", "Ponto de Ogum"]
    lista_beto = (await client.get(AREA, headers=beto.headers)).json()
    assert lista_beto["categorias"] == ["Fundamentos", "Estudos", "Rezas"]
    item_ponto = next(i for i in lista_beto["itens"] if i["titulo"] == "Ponto de Ogum")
    assert item_ponto["youtube_id"] == "dQw4w9WgXcQ" and item_ponto["resumo"] == "Ogum ê Patacori"
    assert "texto" not in item_ponto  # a lista leva só o resumo

    detalhe = await client.get(f"{AREA}/{ponto['id']}", headers=ana.headers)
    assert detalhe.status_code == 200 and detalhe.json()["texto"] == "Ogum ê\nPatacori"
    # Fora do público, rascunho e arquivado → 404
    assert (await client.get(f"{AREA}/{so_g1['id']}", headers=ana.headers)).status_code == 404
    assert (await client.get(f"{AREA}/{so_g1['id']}", headers=beto.headers)).status_code == 200
    assert (await client.get(f"{AREA}/{rascunho['id']}", headers=ana.headers)).status_code == 404
    assert (await client.get(f"{AREA}/{arquivado['id']}", headers=ana.headers)).status_code == 404

    # Despublicar tira da Área; grupo arquivado tira do público.
    assert (await client.put(f"{ADMIN}/{ponto['id']}", headers=admin.headers, json={"publicado": False})).status_code == 200
    assert "Ponto de Ogum" not in titulos(await client.get(AREA, headers=ana.headers))
    await db.execute(text("UPDATE corrente_grupos SET arquivado_em = now() WHERE id = :g"), {"g": g1.id})
    await db.commit()
    assert "Só G1" not in titulos(await client.get(AREA, headers=beto.headers))

    me = (await client.get("/api/v1/medium/me", headers=ana.headers)).json()
    assert me["estudos"] is True


async def test_area_so_do_proprio_terreiro_e_fora_do_plano(client, db):
    tenant_a, admin_a = await _cenario(db)
    material_a = await _criar(client, admin_a, titulo="Da casa A")
    tenant_b, admin_b = await _cenario(db, nome="Casa B")
    bia, _ = await _medium(db, tenant_b, "Bia da Casa B")
    await _criar(client, admin_b, titulo="Da casa B")
    assert [i["titulo"] for i in (await client.get(AREA, headers=bia.headers)).json()["itens"]] == ["Da casa B"]
    assert (await client.get(f"{AREA}/{material_a['id']}", headers=bia.headers)).status_code == 404

    tenant_c, _ = await _cenario(db, nome="Casa Basic", plan=PlanType.BASIC)
    clara, _ = await _medium(db, tenant_c, "Clara Basic")
    assert (await client.get(AREA, headers=clara.headers)).status_code == 403
    assert (await client.get("/api/v1/medium/me", headers=clara.headers)).json()["estudos"] is False


async def test_cursos_da_casa_abertos_com_link_de_inscricao(client, db):
    tenant, admin = await _cenario(db)
    ana, _ = await _medium(db, tenant, "Ana Paula")
    agora = datetime.now(timezone.utc)
    aberto = CursoPresencial(
        tenant_id=tenant.id, titulo="Curso de ervas", ementa="Banhos e defumações", data_inicio=agora + timedelta(days=10),
        max_participantes=3, local="Salão",
    )
    sem_fim = CursoPresencial(tenant_id=tenant.id, titulo="Curso livre", data_inicio=agora + timedelta(days=2))
    andamento = CursoPresencial(
        tenant_id=tenant.id, titulo="Em andamento", data_inicio=agora - timedelta(days=20), data_fim=agora + timedelta(days=20)
    )
    acabou = CursoPresencial(tenant_id=tenant.id, titulo="Acabou", data_inicio=agora - timedelta(days=30), data_fim=agora - timedelta(days=1))
    inativo = CursoPresencial(tenant_id=tenant.id, titulo="Inativo", data_inicio=agora + timedelta(days=5), is_active=False)
    db.add_all([aberto, sem_fim, andamento, acabou, inativo])
    await db.flush()
    db.add(CursoParticipante(tenant_id=tenant.id, curso_id=aberto.id, nome="Inscrita"))
    tenant_b, _ = await _cenario(db, nome="Outra Casa")
    db.add(CursoPresencial(tenant_id=tenant_b.id, titulo="Da outra casa", data_inicio=agora + timedelta(days=3)))
    await db.commit()

    cursos = (await client.get(AREA, headers=ana.headers)).json()["cursos"]
    assert [c["titulo"] for c in cursos] == ["Em andamento", "Curso livre", "Curso de ervas"]
    ervas = cursos[-1]
    assert ervas["vagas_restantes"] == 2 and ervas["resumo"] == "Banhos e defumações" and ervas["local"] == "Salão"
    assert ervas["inscricao_path"] == f"/public/cursos/{aberto.id}/inscricao"
    assert "participantes" not in str(cursos)


# ── Migração 090 ────────────────────────────────────────────────────────────


def _alembic(*args):
    subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR, check=True, capture_output=True)


async def test_migracao_090_sobe_e_desce(client, db):
    from src.core.database import engine

    await db.close()

    async def _tabelas():
        async with engine.connect() as conn:
            return set((await conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))).scalars())

    assert {"materiais_corrente", "material_grupos"} <= await _tabelas()
    _alembic("downgrade", "090_materiais_corrente-1")
    try:
        assert not ({"materiais_corrente", "material_grupos"} & await _tabelas())
    finally:
        _alembic("upgrade", "head")
    assert {"materiais_corrente", "material_grupos"} <= await _tabelas()
