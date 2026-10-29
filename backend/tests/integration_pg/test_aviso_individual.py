"""Aviso para médiuns específicos (público `mediuns`) com Postgres real.

Painel: `GET /comunicados/mediuns` (opções com `COMUNICADOS:view`, diz quem tem acesso à Área),
criar/editar aviso para um ou mais médiuns, ids inativos ou de outro terreiro recusados, "lido por
N de M" contando só os escolhidos, voltar para "todos" limpa a lista. Área: só os escolhidos veem
(lista, detalhe, leitura, selo). Estudos e documentos não aceitam o público. Migração 101 sobe e
desce com o CHECK do `publico`.
"""
import subprocess
import sys
import uuid

from sqlalchemy import select, text

from src.models import ComunicadoMedium, Medium
from src.models.permission_groups import PermissionFeature
from src.models.users import UserRole

from .conftest import BACKEND_DIR
from .factories import create_tenant, create_user, grant

COMUNICADOS = "/api/v1/admin/comunicados"
AVISOS = "/api/v1/medium/avisos"


async def _cenario(db, nome="Terreiro Individual", liberada=True):
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


async def test_aviso_individual_so_aparece_para_os_escolhidos(client, db):
    tenant, admin = await _cenario(db)
    ana, m_ana = await _medium(db, tenant, "Ana Paula", atendimento=True)
    beto, m_beto = await _medium(db, tenant, "Beto Souza", atendimento=False)
    caio, m_caio = await _medium(db, tenant, "Caio Lima", atendimento=True)

    resp = await client.post(
        COMUNICADOS,
        headers=admin.headers,
        json={
            "titulo": "Conversa com o pai",
            "corpo": "Passe aqui antes da gira.",
            "publico": "mediuns",
            "medium_ids": [str(m_beto.id), str(m_beto.id)],
        },
    )
    assert resp.status_code == 201, resp.text
    aviso = resp.json()
    assert aviso["publico"] == "mediuns"
    assert aviso["mediuns"] == [{"id": str(m_beto.id), "nome": "Beto Souza"}]
    assert aviso["grupos"] == []
    assert aviso["leituras"] == {"lidos": 0, "total": 1}

    # Só o escolhido vê (lista, detalhe, selo); os outros levam 404, mesmo sendo cambone/atendimento.
    lista = (await client.get(AVISOS, headers=beto.headers)).json()
    assert [i["titulo"] for i in lista["itens"]] == ["Conversa com o pai"]
    assert (await client.get("/api/v1/medium/me", headers=beto.headers)).json()["avisos_nao_lidos"] == 1
    for actor in (ana, caio):
        assert (await client.get(AVISOS, headers=actor.headers)).json() == {"itens": [], "nao_lidos": 0}
        assert (await client.get(f"{AVISOS}/{aviso['id']}", headers=actor.headers)).status_code == 404
        assert (await client.post(f"{AVISOS}/{aviso['id']}/lido", headers=actor.headers)).status_code == 404

    assert (await client.post(f"{AVISOS}/{aviso['id']}/lido", headers=beto.headers)).status_code == 200
    leituras = (await client.get(f"{COMUNICADOS}/{aviso['id']}/leituras", headers=admin.headers)).json()
    assert leituras["total"] == 1 and leituras["lidos"] == 1
    assert [leitor["nome"] for leitor in leituras["leram"]] == ["Beto Souza"]

    # Trocar os médiuns: Caio passa a ver, Beto deixa de ver.
    put = await client.put(
        f"{COMUNICADOS}/{aviso['id']}", headers=admin.headers, json={"medium_ids": [str(m_caio.id), str(m_ana.id)]}
    )
    assert put.status_code == 200, put.text
    assert [m["nome"] for m in put.json()["mediuns"]] == ["Ana Paula", "Caio Lima"]
    assert put.json()["leituras"] == {"lidos": 0, "total": 2}
    assert (await client.get(f"{AVISOS}/{aviso['id']}", headers=caio.headers)).status_code == 200
    assert (await client.get(f"{AVISOS}/{aviso['id']}", headers=beto.headers)).status_code == 404

    # Editar outro campo sem medium_ids mantém a lista.
    put = await client.put(f"{COMUNICADOS}/{aviso['id']}", headers=admin.headers, json={"fixado": True})
    assert put.status_code == 200 and len(put.json()["mediuns"]) == 2

    # Voltar para "todos" limpa os médiuns escolhidos.
    put = await client.put(f"{COMUNICADOS}/{aviso['id']}", headers=admin.headers, json={"publico": "todos"})
    assert put.json()["mediuns"] == [] and put.json()["leituras"]["total"] == 3
    n = (await db.execute(select(ComunicadoMedium).where(ComunicadoMedium.comunicado_id == uuid.UUID(aviso["id"])))).all()
    assert n == []
    # E sair de "todos" para "mediuns" sem dizer quem → 422.
    put = await client.put(f"{COMUNICADOS}/{aviso['id']}", headers=admin.headers, json={"publico": "mediuns"})
    assert put.status_code == 422


async def test_aviso_individual_exige_medium_ativo_do_terreiro(client, db):
    tenant, admin = await _cenario(db)
    _, ana = await _medium(db, tenant, "Ana Paula")
    _, inativo = await _medium(db, tenant, "Dona Inativa", ativo=False)
    outro, _ = await _cenario(db, nome="Outra Casa")
    _, de_fora = await _medium(db, outro, "Zé de Fora")

    base = {"titulo": "Aviso", "corpo": "Texto", "publico": "mediuns"}
    for medium_ids in ([], [str(inativo.id)], [str(de_fora.id)], [str(ana.id), str(de_fora.id)], [str(uuid.uuid4())]):
        resp = await client.post(COMUNICADOS, headers=admin.headers, json={**base, "medium_ids": medium_ids})
        assert resp.status_code == 422, (medium_ids, resp.text)
    assert (await client.get(COMUNICADOS, headers=admin.headers)).json() == []

    criado = (await client.post(COMUNICADOS, headers=admin.headers, json={**base, "medium_ids": [str(ana.id)]})).json()
    for corpo in ({"medium_ids": [str(de_fora.id)]}, {"medium_ids": []}):
        assert (await client.put(f"{COMUNICADOS}/{criado['id']}", headers=admin.headers, json=corpo)).status_code == 422
    # medium_ids com outro público é ignorado.
    todos = (
        await client.post(COMUNICADOS, headers=admin.headers, json={**base, "publico": "todos", "medium_ids": [str(ana.id)]})
    ).json()
    assert todos["mediuns"] == []


async def test_opcoes_de_mediuns_com_comunicados_view(client, db):
    tenant, admin = await _cenario(db)
    await _medium(db, tenant, "Beto Souza", com_conta=False)
    await _medium(db, tenant, "Ana Paula")
    await _medium(db, tenant, "Dona Inativa", ativo=False)
    outro, _ = await _cenario(db, nome="Outra Casa")
    await _medium(db, outro, "Zé de Fora")

    opcoes = (await client.get(f"{COMUNICADOS}/mediuns", headers=admin.headers)).json()
    assert [(o["nome"], o["tem_acesso"]) for o in opcoes] == [("Ana Paula", True), ("Beto Souza", False)]
    assert set(opcoes[0]) == {"id", "nome", "tem_acesso"}

    sem = await create_user(db, tenant, UserRole.OPERATOR, name="sem")
    await grant(db, sem, tenant, PermissionFeature.MEDIUNS, "view")
    assert (await client.get(f"{COMUNICADOS}/mediuns", headers=sem.headers)).status_code == 403
    leitor = await create_user(db, tenant, UserRole.OPERATOR, name="leitor")
    await grant(db, leitor, tenant, PermissionFeature.COMUNICADOS, "view")
    assert (await client.get(f"{COMUNICADOS}/mediuns", headers=leitor.headers)).status_code == 200
    ana, _ = await _medium(db, tenant, "Caio Lima")
    assert (await client.get(f"{COMUNICADOS}/mediuns", headers=ana.headers)).status_code == 403


async def test_estudos_nao_aceitam_publico_de_mediuns(client, db):
    tenant = await create_tenant(db, name="Casa Pro", area_medium_liberada=True)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="dirigente")
    resp = await client.post(
        "/api/v1/admin/materiais",
        headers=admin.headers,
        json={"titulo": "Apostila", "tipo": "texto", "texto": "Conteúdo", "publico": "mediuns"},
    )
    assert resp.status_code == 422, resp.text


# ── Migração 101 ────────────────────────────────────────────────────────────


def _alembic(*args):
    subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR, check=True, capture_output=True)


async def test_migracao_101_sobe_e_desce_com_o_check_do_publico(client, db):
    from src.core.database import engine

    tenant, admin = await _cenario(db)
    _, ana = await _medium(db, tenant, "Ana Paula")
    aviso = (
        await client.post(
            COMUNICADOS,
            headers=admin.headers,
            json={"titulo": "Só Ana", "corpo": "Texto", "publico": "mediuns", "medium_ids": [str(ana.id)]},
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

    assert "comunicado_mediuns" in await _tabelas()
    assert "mediuns" in await _check()

    _alembic("downgrade", "100_mensalidade_chaves_pix_grupos")
    try:
        assert "comunicado_mediuns" not in await _tabelas()
        assert "mediuns" not in await _check() and "grupos" in await _check()
        # O aviso que era só da Ana não vira "para todos": sai do ar (arquivado).
        async with engine.connect() as conn:
            publico, apagado = (
                await conn.execute(
                    text("SELECT publico, deleted_at IS NOT NULL FROM comunicados WHERE id = :i"), {"i": aviso["id"]}
                )
            ).one()
        assert publico == "todos" and apagado is True
    finally:
        _alembic("upgrade", "head")

    assert "comunicado_mediuns" in await _tabelas()
    assert "mediuns" in await _check()
