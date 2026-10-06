"""Jornadas Estoque / Cursos presenciais / Meu Site via HTTP real (2026-10-06).

- Operador com grupo CURSOS_PRESENCIAIS faz o que o grupo libera (antes: 403 por
  checagem de cargo `is_admin` no corpo, apesar do require_group_permission).
- Meu Site: o `updated_at` devolvido por publish/unpublish/PUT /sites é aceito pelo
  próximo PUT /sections (antes: texto naive em memória ≠ aware do banco → 409 falso).
- Histórico de versões com rótulo e sem uma entrada por autosave.
- Listagens paginadas sem repetir/pular itens.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from src.models.permission_groups import PermissionFeature
from src.models.site import SiteVersion
from src.models.users import UserRole

from .conftest import SESSION_LOOP
from .factories import create_tenant, create_user, grant

CURSOS = "/api/v1/admin/cursos-presenciais"
SITES = "/api/v1/admin/sites"
HERO = {"section_type": "HERO", "config": {"title": "Casa de Oxalá"}}


@SESSION_LOOP
async def tenant(db):
    return await create_tenant(db)


# ── Cursos presenciais: RBAC de grupo é a única autorização ─────────────────────


async def test_operador_com_grupo_de_cursos_cria_edita_e_inscreve(client, db, tenant):
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="operador")
    await grant(db, operador, tenant, PermissionFeature.CURSOS_PRESENCIAIS, "view", "insert", "edit")
    h = operador.headers

    curso = await client.post(CURSOS, headers=h, json={
        "titulo": "Desenvolvimento", "data_inicio": datetime.now(timezone.utc).isoformat(),
        "valor_mensalidade_padrao": "120.00",
    })
    assert curso.status_code == 201, curso.text
    curso_id = curso.json()["id"]
    assert curso.json()["valor_mensalidade_padrao"] == "120.00"  # Decimal → string (o front usa toNum)

    assert (await client.put(f"{CURSOS}/{curso_id}", headers=h, json={"titulo": "Desenvolvimento II"})).status_code == 200
    part = await client.post(f"{CURSOS}/{curso_id}/participantes", headers=h, json={"nome": "Zeca", "tem_diabetes": True})
    assert part.status_code == 201, part.text
    assert part.json()["aceita_uso_dados_saude"] is False  # não inferido das respostas de saúde

    # sem "delete" no grupo → 403 (o grupo continua mandando)
    assert (await client.delete(f"{CURSOS}/{curso_id}", headers=h)).status_code == 403


async def test_listagem_de_cursos_pagina_sem_repetir(client, db, tenant):
    admin = await create_user(db, tenant, UserRole.ADMIN)
    mesma_data = datetime(2026, 11, 1, 22, 0, tzinfo=timezone.utc).isoformat()
    for i in range(5):
        r = await client.post(CURSOS, headers=admin.headers, json={"titulo": f"Curso {i}", "data_inicio": mesma_data})
        assert r.status_code == 201
    ids = []
    for skip in range(0, 5, 2):
        page = await client.get(CURSOS, headers=admin.headers, params={"skip": skip, "limit": 2})
        ids += [c["id"] for c in page.json()]
    assert len(ids) == 5 and len(set(ids)) == 5


# ── Meu Site: lock otimista e histórico ─────────────────────────────────────────


async def _site_com_secoes(client, admin):
    site = await client.get(SITES, headers=admin.headers)
    assert site.status_code == 200, site.text
    put = await client.put(f"{SITES}/sections", headers=admin.headers, json={"sections": [HERO], "site_version": None})
    assert put.status_code == 200, put.text
    return put.json()["site_updated_at"]


async def test_versao_devolvida_por_publish_unpublish_e_settings_vale_no_proximo_save(client, db, tenant):
    admin = await create_user(db, tenant, UserRole.ADMIN)
    await _site_com_secoes(client, admin)

    for chamada in (
        lambda: client.post(f"{SITES}/publish", headers=admin.headers),
        lambda: client.post(f"{SITES}/unpublish", headers=admin.headers),
        lambda: client.put(SITES, headers=admin.headers, json={"meta_title": "Casa"}),
    ):
        resp = await chamada()
        assert resp.status_code == 200, resp.text
        versao = resp.json()["updated_at"]
        assert versao.endswith("+00:00")
        save = await client.put(
            f"{SITES}/sections", headers=admin.headers, json={"sections": [HERO], "site_version": versao}
        )
        assert save.status_code == 200, f"409 falso depois de {resp.request.url.path}: {save.text}"

    # versão realmente velha continua dando 409
    velha = await client.put(
        f"{SITES}/sections", headers=admin.headers, json={"sections": [HERO], "site_version": "2020-01-01T00:00:00+00:00"}
    )
    assert velha.status_code == 409


async def test_settings_limpa_campo_e_slug_segue_o_tenant(client, db, tenant):
    admin = await create_user(db, tenant, UserRole.ADMIN)
    await _site_com_secoes(client, admin)
    assert (await client.put(SITES, headers=admin.headers, json={"meta_title": "Casa"})).json()["meta_title"] == "Casa"

    resp = await client.put(SITES, headers=admin.headers, json={"meta_title": None, "slug": "outro-endereco"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["meta_title"] is None
    assert resp.json()["slug"] == tenant.slug


async def test_autosave_nao_enche_o_historico_e_publicar_restaurar_tem_rotulo(client, db, tenant):
    admin = await create_user(db, tenant, UserRole.ADMIN)
    versao = await _site_com_secoes(client, admin)  # 1º save: "Rascunho" (estado vazio)
    for i in range(5):  # autosaves seguidos: nenhuma versão nova
        r = await client.put(f"{SITES}/sections", headers=admin.headers, json={
            "sections": [{"section_type": "HERO", "config": {"title": f"Casa {i}"}}], "site_version": versao,
        })
        assert r.status_code == 200, r.text
        versao = r.json()["site_updated_at"]

    pub = await client.post(f"{SITES}/publish", headers=admin.headers)
    assert pub.status_code == 200
    lista = (await client.get(f"{SITES}/versions", headers=admin.headers)).json()
    assert [v["label"] for v in lista] == ["Publicado", "Rascunho"]
    assert "snapshot" not in lista[0]

    # Com o site no ar, salvar guarda o publicado que sai — aqui ele é idêntico ao
    # snapshot do publish, então não duplica.
    no_ar = await client.put(f"{SITES}/sections", headers=admin.headers, json={
        "sections": [{"section_type": "HERO", "config": {"title": "Casa nova"}}],
        "site_version": pub.json()["updated_at"],
    })
    assert no_ar.status_code == 200, no_ar.text
    labels = [v["label"] for v in (await client.get(f"{SITES}/versions", headers=admin.headers)).json()]
    assert labels == ["Publicado", "Rascunho"]

    restaurada = await client.post(f"{SITES}/versions/{lista[1]['id']}/restore", headers=admin.headers)
    assert restaurada.status_code == 200, restaurada.text
    assert restaurada.json()["sections"] == []  # a versão "Rascunho" era o site vazio
    labels = [v["label"] for v in (await client.get(f"{SITES}/versions", headers=admin.headers)).json()]
    assert labels == ["Antes de restaurar", "Publicado", "Rascunho"]


async def test_rascunho_volta_a_ser_guardado_depois_do_intervalo(client, db, tenant):
    from src.core.database import AsyncSessionLocal

    admin = await create_user(db, tenant, UserRole.ADMIN)
    versao = await _site_com_secoes(client, admin)
    async with AsyncSessionLocal() as s:
        for v in (await s.execute(select(SiteVersion).where(SiteVersion.tenant_id == tenant.id))).scalars():
            v.created_at = datetime.now(timezone.utc) - timedelta(minutes=11)
        await s.commit()

    r = await client.put(f"{SITES}/sections", headers=admin.headers, json={
        "sections": [{"section_type": "HERO", "config": {"title": "Outra"}}], "site_version": versao,
    })
    assert r.status_code == 200
    labels = [v["label"] for v in (await client.get(f"{SITES}/versions", headers=admin.headers)).json()]
    assert labels == ["Rascunho", "Rascunho"]


# ── Estoque ─────────────────────────────────────────────────────────────────────


async def test_estoque_grupo_limpa_descricao_e_itens_paginam_sem_repetir(client, db, tenant):
    admin = await create_user(db, tenant, UserRole.ADMIN)
    h = admin.headers
    grupo = await client.post("/api/v1/admin/estoque/grupos", headers=h, json={"nome": "Velas", "descricao": "7 dias"})
    assert grupo.status_code == 201
    upd = await client.put(f"/api/v1/admin/estoque/grupos/{grupo.json()['id']}", headers=h, json={"descricao": None})
    assert upd.status_code == 200 and upd.json()["descricao"] is None and upd.json()["nome"] == "Velas"

    for _ in range(5):  # nomes iguais: sem desempate, o offset podia repetir/pular
        assert (await client.post("/api/v1/admin/estoque/itens", headers=h, json={"nome": "Vela"})).status_code == 201
    ids = []
    for skip in range(0, 5, 2):
        page = await client.get("/api/v1/admin/estoque/itens", headers=h, params={"skip": skip, "limit": 2})
        ids += [i["id"] for i in page.json()]
    assert len(ids) == 5 and len(set(ids)) == 5

    item_id = ids[0]
    neg = await client.put(f"/api/v1/admin/estoque/itens/{item_id}", headers=h, json={"estoque_minimo": -1})
    assert neg.status_code == 422
