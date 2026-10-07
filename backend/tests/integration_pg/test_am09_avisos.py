"""AM-09 — Avisos da casa com Postgres real (migrações + app inteiro via HTTP).

Painel: CRUD com o grupo `COMUNICADOS` (operador sem a feature → 403), "lido por N de M" e
quem leu / quem não leu. Área do Médium: só os avisos do público do médium, publicados e não
expirados, fixados primeiro, `lido` por item, marca de leitura (recusada sob impersonação),
outro terreiro → 404, módulo desligado → 403, chave do piloto desligada → 403. Migrações
070/071: valor do ENUM e acesso total no grupo padrão "Acesso total".
"""
import subprocess
import sys
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text

from src.models import Comunicado, ComunicadoLeitura, Medium, TenantConfig
from src.models.permission_groups import GroupPermission, PermissionFeature, PermissionGroup
from src.models.subscriptions import PlanType
from src.models.users import UserRole
from src.security.jwt import create_access_token

from .conftest import BACKEND_DIR
from .factories import create_tenant, create_user, grant

ADMIN = "/api/v1/admin/comunicados"
AVISOS = "/api/v1/medium/avisos"


def _agora():
    return datetime.now(timezone.utc)


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


async def _cenario(db, nome="Terreiro AM09", liberada=True, plan=PlanType.BASIC):
    tenant = await create_tenant(db, name=nome, plan=plan, area_medium_liberada=liberada)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="dirigente")
    return tenant, admin


async def _publicar(client, admin, **kw):
    body = {"titulo": "Gira de sexta começa às 20h30", "corpo": "A corrente chega às 19h30.", **kw}
    resp = await client.post(ADMIN, headers=admin.headers, json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Painel: CRUD com grupo de permissão ─────────────────────────────────────


async def test_admin_publica_edita_lista_e_arquiva(client, db):
    tenant, admin = await _cenario(db)
    criado = await _publicar(
        client,
        admin,
        titulo="  <b>Agenda</b> de outubro ",
        corpo="Giras: 09/10 e 16/10.\r\n<script>alert(1)</script>Veja https://exemplo.com.br/agenda",
        fixado=True,
    )
    assert criado["titulo"] == "Agenda de outubro"
    assert criado["corpo"] == "Giras: 09/10 e 16/10.\nalert(1)Veja https://exemplo.com.br/agenda"
    assert criado["situacao"] == "publicado"
    assert criado["publico"] == "todos" and criado["fixado"] is True
    assert criado["leituras"] == {"lidos": 0, "total": 0}

    put = await client.put(
        f"{ADMIN}/{criado['id']}", headers=admin.headers, json={"titulo": "Agenda nova", "publico": "cambones"}
    )
    assert put.status_code == 200, put.text
    assert put.json()["titulo"] == "Agenda nova" and put.json()["publico"] == "cambones"
    assert put.json()["corpo"] == criado["corpo"]

    lista = (await client.get(ADMIN, headers=admin.headers)).json()
    assert [c["id"] for c in lista] == [criado["id"]]
    assert (await client.get(f"{ADMIN}/{criado['id']}", headers=admin.headers)).status_code == 200

    assert (await client.delete(f"{ADMIN}/{criado['id']}", headers=admin.headers)).status_code == 204
    assert (await client.get(ADMIN, headers=admin.headers)).json() == []
    assert (await client.get(f"{ADMIN}/{criado['id']}", headers=admin.headers)).status_code == 404
    arquivado = (await db.execute(select(Comunicado).where(Comunicado.id == uuid.UUID(criado["id"])))).scalar_one()
    await db.refresh(arquivado)
    assert arquivado.deleted_at is not None


async def test_validacoes_do_aviso(client, db):
    _, admin = await _cenario(db)
    h = admin.headers
    vazio = await client.post(ADMIN, headers=h, json={"titulo": "<i></i>", "corpo": "texto"})
    assert vazio.status_code == 422
    assert (await client.post(ADMIN, headers=h, json={"titulo": "Oi", "corpo": "x", "publico": "diretoria"})).status_code == 422
    amanha = (_agora() + timedelta(days=1)).isoformat()
    hoje_cedo = (_agora() + timedelta(hours=1)).isoformat()
    antes = await client.post(ADMIN, headers=h, json={"titulo": "Oi", "corpo": "x", "publicar_em": amanha, "expira_em": hoje_cedo})
    assert antes.status_code == 422
    passado = await client.post(
        ADMIN, headers=h, json={"titulo": "Oi", "corpo": "x", "expira_em": (_agora() - timedelta(hours=1)).isoformat()}
    )
    assert passado.status_code == 422


async def test_operador_sem_comunicados_leva_403_e_com_grupo_so_faz_o_que_o_grupo_libera(client, db):
    tenant, admin = await _cenario(db)
    criado = await _publicar(client, admin)

    sem = await create_user(db, tenant, UserRole.OPERATOR, name="sem")
    await grant(db, sem, tenant, PermissionFeature.MEDIUNS, "view", "insert", "edit", "delete")
    for metodo, url, body in (
        ("get", ADMIN, None),
        ("get", f"{ADMIN}/{criado['id']}", None),
        ("get", f"{ADMIN}/{criado['id']}/leituras", None),
        ("post", ADMIN, {"titulo": "X", "corpo": "Y"}),
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
    assert (await client.get(f"{ADMIN}/{criado['id']}/leituras", headers=leitor.headers)).status_code == 200
    assert (await client.post(ADMIN, headers=leitor.headers, json={"titulo": "X", "corpo": "Y"})).status_code == 403
    assert (await client.put(f"{ADMIN}/{criado['id']}", headers=leitor.headers, json={"titulo": "X"})).status_code == 403
    assert (await client.delete(f"{ADMIN}/{criado['id']}", headers=leitor.headers)).status_code == 403

    editor = await create_user(db, tenant, UserRole.OPERATOR, name="editor")
    await grant(db, editor, tenant, PermissionFeature.COMUNICADOS, "view", "insert", "edit")
    assert (await client.post(ADMIN, headers=editor.headers, json={"titulo": "X", "corpo": "Y"})).status_code == 201
    assert (await client.put(f"{ADMIN}/{criado['id']}", headers=editor.headers, json={"fixado": True})).status_code == 200
    assert (await client.delete(f"{ADMIN}/{criado['id']}", headers=editor.headers)).status_code == 403


async def test_operador_novo_no_grupo_padrao_ja_tem_comunicados(client, db):
    tenant, admin = await _cenario(db)
    suffix = uuid.uuid4().hex[:6]
    resp = await client.post(
        "/api/v1/admin/users",
        headers=admin.headers,
        json={"email": f"op-{suffix}@example.com", "username": f"op-{suffix}", "password": "Senha-forte-123", "role": "operator"},
    )
    assert resp.status_code == 201, resp.text
    headers = {"Authorization": f"Bearer {create_access_token(uuid.UUID(resp.json()['id']), tenant.id, 'operator')}"}
    assert (await client.get(ADMIN, headers=headers)).status_code == 200
    assert (await client.post(ADMIN, headers=headers, json={"titulo": "Oi", "corpo": "Texto"})).status_code == 201


async def test_painel_sem_chave_do_piloto_ou_sem_plano_leva_403(client, db):
    _, admin = await _cenario(db, liberada=False)
    assert (await client.get(ADMIN, headers=admin.headers)).status_code == 403
    _, admin_free = await _cenario(db, nome="Casa Free", plan=PlanType.FREE)
    assert (await client.get(ADMIN, headers=admin_free.headers)).status_code == 403


async def test_outro_terreiro_nao_ve_nem_mexe_no_aviso(client, db):
    _, admin = await _cenario(db)
    criado = await _publicar(client, admin)
    _, intruso = await _cenario(db, nome="Outra Casa")
    assert (await client.get(f"{ADMIN}/{criado['id']}", headers=intruso.headers)).status_code == 404
    assert (await client.get(f"{ADMIN}/{criado['id']}/leituras", headers=intruso.headers)).status_code == 404
    assert (await client.put(f"{ADMIN}/{criado['id']}", headers=intruso.headers, json={"titulo": "X"})).status_code == 404
    assert (await client.delete(f"{ADMIN}/{criado['id']}", headers=intruso.headers)).status_code == 404
    assert (await client.get(ADMIN, headers=intruso.headers)).json() == []


# ── Área do Médium: público, agenda, leitura ────────────────────────────────


async def test_medium_ve_so_o_seu_publico_fixados_primeiro_e_le(client, db):
    tenant, admin = await _cenario(db)
    ana, _ = await _medium(db, tenant, "Ana Paula", atendimento=True)
    beto, _ = await _medium(db, tenant, "Beto Cambone", atendimento=False)

    todos = await _publicar(client, admin, titulo="Para todos")
    so_atendimento = await _publicar(client, admin, titulo="Só atendimento", publico="atendimento")
    so_cambones = await _publicar(client, admin, titulo="Só cambones", publico="cambones")
    fixado = await _publicar(
        client, admin, titulo="Fixado antigo", fixado=True, publicar_em=(_agora() - timedelta(days=5)).isoformat()
    )

    lista_ana = (await client.get(AVISOS, headers=ana.headers)).json()
    titulos = [i["titulo"] for i in lista_ana["itens"]]
    assert titulos[0] == "Fixado antigo"
    assert set(titulos) == {"Fixado antigo", "Só atendimento", "Para todos"}
    assert lista_ana["nao_lidos"] == 3
    assert all(i["lido"] is False for i in lista_ana["itens"])
    assert {i["titulo"] for i in (await client.get(AVISOS, headers=beto.headers)).json()["itens"]} == {
        "Fixado antigo",
        "Só cambones",
        "Para todos",
    }
    # Aviso de outro público é 404 (nem confirma que existe).
    assert (await client.get(f"{AVISOS}/{so_cambones['id']}", headers=ana.headers)).status_code == 404
    assert (await client.post(f"{AVISOS}/{so_cambones['id']}/lido", headers=ana.headers)).status_code == 404

    detalhe = (await client.get(f"{AVISOS}/{todos['id']}", headers=ana.headers)).json()
    assert detalhe["corpo"] == "A corrente chega às 19h30." and detalhe["lido"] is False
    assert set(detalhe) == {"id", "titulo", "corpo", "fixado", "publicado_em", "lido", "lido_em"}

    lido = await client.post(f"{AVISOS}/{todos['id']}/lido", headers=ana.headers)
    assert lido.status_code == 200, lido.text
    primeira = lido.json()["lido_em"]
    # Idempotente: a data da primeira leitura fica.
    assert (await client.post(f"{AVISOS}/{todos['id']}/lido", headers=ana.headers)).json()["lido_em"] == primeira
    n = (
        await db.execute(text("SELECT count(*) FROM comunicado_leituras WHERE comunicado_id = :c"), {"c": todos["id"]})
    ).scalar()
    assert n == 1

    lista_ana = (await client.get(AVISOS, headers=ana.headers)).json()
    assert lista_ana["nao_lidos"] == 2
    assert next(i for i in lista_ana["itens"] if i["id"] == todos["id"])["lido"] is True
    # A leitura da Ana não conta para o Beto.
    assert next(i for i in (await client.get(AVISOS, headers=beto.headers)).json()["itens"] if i["id"] == todos["id"])[
        "lido"
    ] is False

    # Início e selo da aba.
    inicio = (await client.get("/api/v1/medium/inicio", headers=ana.headers)).json()
    assert inicio["avisos"]["nao_lidos"] == 2
    assert [a["titulo"] for a in inicio["avisos"]["ultimos"]] == ["Só atendimento", "Fixado antigo"]
    assert {"tipo": "aviso", "quantidade": 2} in inicio["pendencias"]
    assert (await client.get("/api/v1/medium/me", headers=ana.headers)).json()["avisos_nao_lidos"] == 2
    assert so_atendimento and fixado


async def test_agendado_e_expirado_nao_aparecem(client, db):
    tenant, admin = await _cenario(db)
    ana, _ = await _medium(db, tenant, "Ana Paula")
    agendado = await _publicar(client, admin, titulo="Agendado", publicar_em=(_agora() + timedelta(days=1)).isoformat())
    assert agendado["situacao"] == "agendado"
    expira = await _publicar(client, admin, titulo="Vai expirar", expira_em=(_agora() + timedelta(days=1)).isoformat())
    # Força a validade para o passado direto no banco (não dá para criar já expirado).
    await db.execute(
        text("UPDATE comunicados SET expira_em = now() - interval '1 minute' WHERE id = :i"), {"i": expira["id"]}
    )
    await db.commit()

    assert (await client.get(AVISOS, headers=ana.headers)).json() == {"itens": [], "nao_lidos": 0}
    assert (await client.get(f"{AVISOS}/{agendado['id']}", headers=ana.headers)).status_code == 404
    assert (await client.get(f"{AVISOS}/{expira['id']}", headers=ana.headers)).status_code == 404
    situacoes = {c["titulo"]: c["situacao"] for c in (await client.get(ADMIN, headers=admin.headers)).json()}
    assert situacoes == {"Agendado": "agendado", "Vai expirar": "expirado"}

    # "Publicar agora" (publicar_em: null) solta o agendado.
    put = await client.put(f"{ADMIN}/{agendado['id']}", headers=admin.headers, json={"publicar_em": None})
    assert put.json()["situacao"] == "publicado"
    assert [i["titulo"] for i in (await client.get(AVISOS, headers=ana.headers)).json()["itens"]] == ["Agendado"]


async def test_leituras_quem_leu_e_quem_nao_leu(client, db):
    tenant, admin = await _cenario(db)
    ana, m_ana = await _medium(db, tenant, "Ana Paula", atendimento=True)
    beto, m_beto = await _medium(db, tenant, "Beto Souza", atendimento=False)
    _, m_caio = await _medium(db, tenant, "Caio Lima", atendimento=True)
    # Sem acesso à Área (sem conta) ou inativo não contam no "de M".
    await _medium(db, tenant, "Dora Sem Acesso", com_conta=False)
    await _medium(db, tenant, "Edu Inativo", ativo=False)

    aviso = await _publicar(client, admin)
    so_atendimento = await _publicar(client, admin, titulo="Atendimento", publico="atendimento")
    assert (await client.post(f"{AVISOS}/{aviso['id']}/lido", headers=ana.headers)).status_code == 200
    assert (await client.post(f"{AVISOS}/{aviso['id']}/lido", headers=beto.headers)).status_code == 200

    leituras = (await client.get(f"{ADMIN}/{aviso['id']}/leituras", headers=admin.headers)).json()
    assert leituras["total"] == 3 and leituras["lidos"] == 2
    assert {leitor["nome"] for leitor in leituras["leram"]} == {"Ana Paula", "Beto Souza"}
    assert all(leitor["lido_em"] for leitor in leituras["leram"])
    assert leituras["nao_leram"] == [{"medium_id": str(m_caio.id), "nome": "Caio Lima", "lido_em": None}]
    # Nada de contato ou cadastro do médium nas leituras.
    assert set(leituras["leram"][0]) == {"medium_id", "nome", "lido_em"}

    lista = {c["id"]: c["leituras"] for c in (await client.get(ADMIN, headers=admin.headers)).json()}
    assert lista[aviso["id"]] == {"lidos": 2, "total": 3}
    assert lista[so_atendimento["id"]] == {"lidos": 0, "total": 2}
    assert m_ana and m_beto


async def test_impersonacao_le_mas_nao_marca_leitura(client, db):
    tenant, admin = await _cenario(db)
    ana, _ = await _medium(db, tenant, "Ana Paula")
    aviso = await _publicar(client, admin)
    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")
    token = create_access_token(ana.user.id, tenant.id, "medium", impersonated_by=root.user.id)
    headers = {"Authorization": f"Bearer {token}"}

    assert (await client.get(AVISOS, headers=headers)).status_code == 200
    assert (await client.get(f"{AVISOS}/{aviso['id']}", headers=headers)).status_code == 200
    assert (await client.post(f"{AVISOS}/{aviso['id']}/lido", headers=headers)).status_code == 403
    assert (await db.execute(select(ComunicadoLeitura))).scalars().all() == []


async def test_medium_de_outro_terreiro_leva_404(client, db):
    _, admin = await _cenario(db)
    aviso = await _publicar(client, admin)
    outro, _ = await _cenario(db, nome="Outra Casa")
    intrusa, _ = await _medium(db, outro, "Intrusa")
    assert (await client.get(AVISOS, headers=intrusa.headers)).json()["itens"] == []
    assert (await client.get(f"{AVISOS}/{aviso['id']}", headers=intrusa.headers)).status_code == 404
    assert (await client.post(f"{AVISOS}/{aviso['id']}/lido", headers=intrusa.headers)).status_code == 404


async def test_modulo_desligado_e_chave_do_piloto(client, db):
    tenant, admin = await _cenario(db)
    ana, _ = await _medium(db, tenant, "Ana Paula")
    aviso = await _publicar(client, admin)

    config = (await db.execute(select(TenantConfig).where(TenantConfig.tenant_id == tenant.id))).scalar_one()
    config.area_medium_avisos = False
    await db.commit()
    for metodo, url in (("get", AVISOS), ("get", f"{AVISOS}/{aviso['id']}"), ("post", f"{AVISOS}/{aviso['id']}/lido")):
        resp = await getattr(client, metodo)(url, headers=ana.headers)
        assert resp.status_code == 403, (metodo, url)
    inicio = (await client.get("/api/v1/medium/inicio", headers=ana.headers)).json()
    assert inicio["avisos"] == {"nao_lidos": 0, "ultimos": []}
    assert all(p["tipo"] != "aviso" for p in inicio["pendencias"])
    me = (await client.get("/api/v1/medium/me", headers=ana.headers)).json()
    assert "avisos" not in me["modulos"] and me["avisos_nao_lidos"] == 0

    config.area_medium_avisos = True
    await db.commit()
    assert (await client.get(AVISOS, headers=ana.headers)).status_code == 200

    # Chave do piloto desligada: a Área inteira some (require_medium).
    await db.execute(text("UPDATE tenants SET area_medium_liberada = false WHERE id = :t"), {"t": tenant.id})
    await db.commit()
    assert (await client.get(AVISOS, headers=ana.headers)).status_code == 403
    assert (await client.get(ADMIN, headers=admin.headers)).status_code == 403


async def test_painel_nao_e_rota_do_medium_e_medium_nao_publica(client, db):
    tenant, _ = await _cenario(db)
    ana, _ = await _medium(db, tenant, "Ana Paula")
    assert (await client.get(ADMIN, headers=ana.headers)).status_code == 403
    assert (await client.post(ADMIN, headers=ana.headers, json={"titulo": "X", "corpo": "Y"})).status_code == 403


# ── Migrações 070/071 ───────────────────────────────────────────────────────


def _alembic(*args):
    subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR, check=True, capture_output=True)


async def _linha(group_id):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        row = (
            await fresh.execute(
                select(GroupPermission).where(
                    GroupPermission.group_id == group_id, GroupPermission.feature == PermissionFeature.COMUNICADOS
                )
            )
        ).scalar_one_or_none()
        return None if row is None else (row.can_view, row.can_insert, row.can_edit, row.can_delete)


async def test_migracao_da_acesso_total_so_ao_grupo_padrao(db):
    from src.core.database import engine

    async with engine.connect() as conn:
        valores = (
            await conn.execute(text("SELECT unnest(enum_range(NULL::permission_feature))::text"))
        ).scalars().all()
    assert "comunicados" in valores

    tenant = await create_tenant(db)
    padrao = PermissionGroup(tenant_id=tenant.id, name="Acesso total", is_default=True)
    outro = PermissionGroup(tenant_id=tenant.id, name="Portaria")
    db.add_all([padrao, outro])
    await db.commit()

    _alembic("downgrade", "070_permissao_comunicados_enum")
    try:
        async with engine.connect() as conn:
            tabelas = (
                await conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))
            ).scalars().all()
        assert "comunicados" not in tabelas and "comunicado_leituras" not in tabelas
        assert await _linha(padrao.id) is None
    finally:
        _alembic("upgrade", "head")

    assert await _linha(padrao.id) == (True, True, True, True)
    assert await _linha(outro.id) is None
    async with engine.connect() as conn:
        checks = (
            await conn.execute(text("SELECT conname FROM pg_constraint WHERE conname = 'ck_comunicados_publico'"))
        ).scalars().all()
    assert checks == ["ck_comunicados_publico"]
