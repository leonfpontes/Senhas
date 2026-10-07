"""AM-02 — Área do Médium: papel `medium`, vínculo médium↔usuário e trava do painel.

Postgres real (migrações 064/065), app inteiro via HTTP: JWT → middleware →
require_backoffice / require_medium → banco.
"""
import asyncio
import re
import subprocess
import sys
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.routing import APIRoute, iter_route_contexts
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from src.models import Medium
from src.models.permission_groups import PermissionFeature, PermissionGroup, UserGroupMembership
from src.models.subscriptions import PlanType, Subscription, SubscriptionStatus
from src.models.users import User, UserRole
from src.security import hash_password
from src.security.jwt import create_access_token

from .conftest import BACKEND_DIR
from .factories import Actor, create_user, grant
from .factories import create_tenant as _create_tenant

ME = "/api/v1/auth/me"
MEDIUM_ME = "/api/v1/medium/me"
SENHA = "Senha-forte-123"


async def create_tenant(db, *args, **kw):
    """Terreiros destes testes já com a Área liberada pela plataforma (a chave do
    piloto tem testes próprios em test_area_medium_chave.py)."""
    kw.setdefault("area_medium_liberada", True)
    return await _create_tenant(db, *args, **kw)


async def _medium(db, tenant, user=None, nome="Maria de Oxum", **kw) -> Medium:
    m = Medium(tenant_id=tenant.id, nome=nome, user_id=user.id if user else None, **kw)
    db.add(m)
    await db.commit()
    return m


async def _fresh(model, obj_id):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(select(model).where(model.id == obj_id))).scalar_one()


def _headers(user: User, **kw) -> dict:
    token = create_access_token(user.id, user.tenant_id, user.role.value, **kw)
    return {"Authorization": f"Bearer {token}"}


async def _medium_actor(db, tenant, nome="medium") -> Actor:
    return await create_user(db, tenant, UserRole.MEDIUM, name=nome)


# ── Migrações 064/065 ───────────────────────────────────────────────────────


def _alembic(*args):
    subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR, check=True, capture_output=True)


async def test_migracoes_criam_papel_vinculo_e_consentimento(migrated_db):
    from src.core.database import engine

    async with engine.connect() as conn:
        roles = {r[0] for r in await conn.execute(text("SELECT unnest(enum_range(NULL::user_role))::text"))}
        cols = {
            r[0]: r[1]
            for r in await conn.execute(text(
                "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'mediuns'"
            ))
        }
        indexdef = (await conn.execute(text(
            "SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_mediuns_user_id_ativo'"
        ))).scalar_one()
        fk_delete = (await conn.execute(text(
            "SELECT confdeltype::text FROM pg_constraint WHERE conrelid = 'mediuns'::regclass "
            "AND contype = 'f' AND conkey = ARRAY[(SELECT attnum FROM pg_attribute "
            "WHERE attrelid = 'mediuns'::regclass AND attname = 'user_id')]::smallint[]"
        ))).scalar_one()
    assert "medium" in roles
    assert cols["user_id"] == cols["area_consentimento_em"] == cols["area_consentimento_versao"] == "YES"
    assert "UNIQUE" in indexdef and "user_id IS NOT NULL" in indexdef and "deleted_at IS NULL" in indexdef
    assert fk_delete == "n"  # ON DELETE SET NULL


async def test_downgrade_para_062_e_volta(db):
    tenant = await create_tenant(db)
    medium_user = await _medium_actor(db, tenant)
    m = await _medium(db, tenant, medium_user.user)

    _alembic("downgrade", "062_permissao_site_copia")
    try:
        from src.core.database import engine

        async with engine.connect() as conn:
            cols = {r[0] for r in await conn.execute(text(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'mediuns'"
            ))}
            # O valor do ENUM fica (o Postgres não remove valor) e a conta `medium` continua lá.
            role = (await conn.execute(
                text("SELECT role::text FROM users WHERE id = :id"), {"id": medium_user.user.id}
            )).scalar_one()
        assert {"user_id", "area_consentimento_em", "area_consentimento_versao"}.isdisjoint(cols)
        assert role == "medium"
    finally:
        _alembic("upgrade", "head")
    assert (await _fresh(Medium, m.id)).user_id is None  # vínculo perdido no downgrade


async def test_um_usuario_so_fica_ligado_a_um_medium_nao_excluido(db):
    tenant = await create_tenant(db)
    tenant_id = tenant.id
    medium_user = await _medium_actor(db, tenant)
    outro = await _medium_actor(db, tenant, nome="outro")
    user_id, outro_id = medium_user.user.id, outro.user.id
    await _medium(db, tenant, medium_user.user, nome="Primeiro")
    db.add(Medium(tenant_id=tenant_id, nome="Segundo", user_id=user_id))
    with pytest.raises(IntegrityError):
        await db.commit()
    await db.rollback()

    # Médium excluído libera o usuário para outro vínculo.
    db.add(Medium(tenant_id=tenant_id, nome="Antigo", user_id=outro_id, deleted_at=datetime.now(timezone.utc)))
    await db.commit()
    db.add(Medium(tenant_id=tenant_id, nome="Novo", user_id=outro_id))
    await db.commit()


# ── Trava do painel: varredura de rotas com JWT e banco reais ───────────────

_PARAM = re.compile(r"\{[^}]+\}")
_PUBLIC_PLATFORM = {("GET", "/api/v1/platform/health"), ("GET", "/api/v1/platform/status")}


def _protected_routes(app):
    for ctx in iter_route_contexts(app.routes):
        if not isinstance(ctx.original_route, APIRoute):
            continue
        if not ctx.path.startswith(("/api/v1/admin", "/api/v1/platform")):
            continue
        for method in sorted(ctx.original_route.methods - {"HEAD", "OPTIONS"}):
            if (method, ctx.path) not in _PUBLIC_PLATFORM:
                yield method, _PARAM.sub("00000000-0000-0000-0000-000000000000", ctx.path), ctx.path


@pytest.mark.parametrize("impersonado", [False, True])
async def test_medium_leva_403_em_toda_rota_admin_e_platform(app, client, db, impersonado):
    tenant = await create_tenant(db)
    medium_user = await _medium_actor(db, tenant)
    await _medium(db, tenant, medium_user.user)
    headers = _headers(medium_user.user, impersonated_by=uuid.uuid4()) if impersonado else medium_user.headers

    vazou = []
    total = 0
    for method, probe, declared in _protected_routes(app):
        total += 1
        resp = await client.request(method, probe, headers=headers, json={})
        if resp.status_code != 403:
            vazou.append(f"{method} {declared} → {resp.status_code}")
    assert total > 200
    assert vazou == []
    # E a Área do Médium abre normalmente com o mesmo token.
    assert (await client.get(MEDIUM_ME, headers=headers)).status_code == 200


# ── require_medium via HTTP ─────────────────────────────────────────────────


async def test_area_do_medium_devolve_so_o_proprio_medium(client, db):
    tenant = await create_tenant(db, name="Tenda Pai Joaquim", plan=PlanType.BASIC)
    medium_user = await _medium_actor(db, tenant)
    m = await _medium(db, tenant, medium_user.user, nome="Maria de Oxum", observacoes="interno")

    resp = await client.get(MEDIUM_ME, headers=medium_user.headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["nome"] == "Maria de Oxum"
    assert body["terreiro"] == {"id": str(tenant.id), "nome": "Tenda Pai Joaquim", "slug": tenant.slug}
    assert body["areas"] == {"admin": False, "medium": {"medium_id": str(m.id), "nome": "Maria de Oxum"}}
    assert set(body["marca"]) == {"logo_url", "primary_color", "secondary_color", "font_color"}
    assert body["modulos"] == []
    assert "interno" not in resp.text


async def test_sem_vinculo_inativo_excluido_ou_de_outro_tenant_leva_403(client, db):
    tenant = await create_tenant(db)
    outro_tenant = await create_tenant(db, name="Outro Terreiro")

    sem_vinculo = await _medium_actor(db, tenant, nome="sem")
    await _medium(db, tenant, None)
    inativo = await _medium_actor(db, tenant, nome="inativo")
    await _medium(db, tenant, inativo.user, is_active=False)
    excluido = await _medium_actor(db, tenant, nome="excluido")
    await _medium(db, tenant, excluido.user, deleted_at=datetime.now(timezone.utc))
    # Médium do OUTRO terreiro apontando para um usuário deste: não vale.
    cruzado = await _medium_actor(db, tenant, nome="cruzado")
    await _medium(db, outro_tenant, cruzado.user)
    # Admin sem vínculo também não entra na Área.
    admin = await create_user(db, tenant, UserRole.ADMIN)

    for actor in (sem_vinculo, inativo, excluido, cruzado, admin):
        resp = await client.get(MEDIUM_ME, headers=actor.headers)
        assert resp.status_code == 403, (actor.user.username, resp.text)


async def test_plano_sem_area_medium_leva_403_e_assinatura_suspensa_402(client, db):
    gratis = await create_tenant(db, plan=PlanType.FREE)
    medium_gratis = await _medium_actor(db, gratis)
    await _medium(db, gratis, medium_gratis.user)
    assert (await client.get(MEDIUM_ME, headers=medium_gratis.headers)).status_code == 403

    suspenso = await create_tenant(db, plan=PlanType.PREMIUM)
    sub = (await db.execute(select(Subscription).where(Subscription.tenant_id == suspenso.id))).scalar_one()
    sub.status = SubscriptionStatus.SUSPENDED
    await db.commit()
    medium_suspenso = await _medium_actor(db, suspenso)
    await _medium(db, suspenso, medium_suspenso.user)
    assert (await client.get(MEDIUM_ME, headers=medium_suspenso.headers)).status_code == 402


# ── areas em /auth/me, /auth/profile e no login ─────────────────────────────


async def _login(client, user):
    resp = await client.post("/api/v1/auth/login", json={"email": user.email, "password": SENHA})
    assert resp.status_code == 200, resp.text
    return resp.json()["areas"]


async def _com_senha(db, actor: Actor) -> User:
    actor.user.password_hash = hash_password(SENHA)
    await db.commit()
    return actor.user


async def test_areas_no_login_no_me_e_no_profile(client, db):
    tenant = await create_tenant(db, plan=PlanType.BASIC)
    gratis = await create_tenant(db, name="Casa Gratis", plan=PlanType.FREE)

    admin = await create_user(db, tenant, UserRole.ADMIN, name="admin")
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="operador")
    m_op = await _medium(db, tenant, operador.user, nome="Operador Médium")
    puro = await _medium_actor(db, tenant, nome="puro")
    m_puro = await _medium(db, tenant, puro.user, nome="Médium Puro")
    sem_plano = await _medium_actor(db, gratis, nome="semplano")
    await _medium(db, gratis, sem_plano.user)

    esperado = [
        (admin, {"admin": True, "medium": None}),
        (operador, {"admin": True, "medium": {"medium_id": str(m_op.id), "nome": "Operador Médium"}}),
        (puro, {"admin": False, "medium": {"medium_id": str(m_puro.id), "nome": "Médium Puro"}}),
        (sem_plano, {"admin": False, "medium": None}),
    ]
    for actor, areas in esperado:
        me = await client.get(ME, headers=actor.headers)
        assert me.status_code == 200 and me.json()["areas"] == areas, (actor.user.username, me.text)
        profile = await client.get("/api/v1/auth/profile", headers=actor.headers)
        assert profile.json()["areas"] == areas
        assert await _login(client, await _com_senha(db, actor)) == areas


# ── Usuários (admin/users.py) ───────────────────────────────────────────────


async def test_lista_de_usuarios_esconde_contas_medium(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    puro = await _medium_actor(db, tenant)
    await _medium(db, tenant, puro.user)

    ids = {u["id"] for u in (await client.get("/api/v1/admin/users", headers=admin.headers)).json()}
    assert str(admin.user.id) in ids and str(puro.user.id) not in ids
    so_medium = (await client.get("/api/v1/admin/users?role_filter=medium", headers=admin.headers)).json()
    assert [u["id"] for u in so_medium] == [str(puro.user.id)]


async def test_criar_usuario_com_email_de_medium_promove_a_operador_sem_trocar_a_senha(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    puro = await _medium_actor(db, tenant)
    m = await _medium(db, tenant, puro.user)
    hash_antes = puro.user.password_hash

    resp = await client.post(
        "/api/v1/admin/users",
        headers=admin.headers,
        json={"email": puro.user.email.upper(), "username": "novo-nome", "password": "Outra-senha-456", "role": "operator"},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["id"] == str(puro.user.id) and resp.json()["role"] == "operator"

    user = await _fresh(User, puro.user.id)
    assert user.role == UserRole.OPERATOR
    assert user.password_hash == hash_antes and user.username == puro.user.username
    # Entrou no grupo padrão "Acesso total" e continua com a Área (mesmo vínculo).
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        grupos = (await fresh.execute(
            select(PermissionGroup.is_default).join(UserGroupMembership, UserGroupMembership.group_id == PermissionGroup.id)
            .where(UserGroupMembership.user_id == puro.user.id)
        )).scalars().all()
    assert grupos == [True]
    me = (await client.get(ME, headers=puro.headers)).json()
    assert me["areas"] == {"admin": True, "medium": {"medium_id": str(m.id), "nome": m.nome}}
    assert (await client.get("/api/v1/admin/giras", headers=puro.headers)).status_code == 200


async def test_operador_com_usuarios_nao_promove_medium_a_admin(client, db):
    tenant = await create_tenant(db)
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="op")
    await grant(db, operador, tenant, PermissionFeature.USUARIOS, "view", "insert", "edit", "delete")
    puro = await _medium_actor(db, tenant)
    await _medium(db, tenant, puro.user)

    resp = await client.post(
        "/api/v1/admin/users", headers=operador.headers,
        json={"email": puro.user.email, "username": "x", "password": SENHA, "role": "admin"},
    )
    assert resp.status_code == 403
    assert (await _fresh(User, puro.user.id)).role == UserRole.MEDIUM


async def test_perfil_medium_nao_se_cria_nem_se_atribui_sem_vinculo(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="op")

    criar = await client.post(
        "/api/v1/admin/users", headers=admin.headers,
        json={"email": "novo@example.com", "username": "novo", "password": SENHA, "role": "medium"},
    )
    assert criar.status_code == 422
    rebaixar = await client.put(f"/api/v1/admin/users/{operador.user.id}", headers=admin.headers, json={"role": "medium"})
    assert rebaixar.status_code == 422
    assert (await _fresh(User, operador.user.id)).role == UserRole.OPERATOR


async def test_remover_operador_ligado_a_medium_rebaixa_para_medium(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="op")
    await grant(db, operador, tenant, PermissionFeature.GIRAS, "view")
    await _medium(db, tenant, operador.user)

    resp = await client.delete(f"/api/v1/admin/users/{operador.user.id}", headers=admin.headers)
    assert resp.status_code == 204

    user = await _fresh(User, operador.user.id)
    assert user.role == UserRole.MEDIUM and user.deleted_at is None and user.is_active
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        n = (await fresh.execute(
            select(UserGroupMembership).where(UserGroupMembership.user_id == operador.user.id)
        )).scalars().all()
    assert n == []
    # Mesmo token antigo (role=operator no JWT): o painel fecha, a Área continua.
    assert (await client.get("/api/v1/admin/giras", headers=operador.headers)).status_code == 403
    assert (await client.get(MEDIUM_ME, headers=operador.headers)).status_code == 200


async def test_desativar_operador_medium_tira_so_o_painel(client, db):
    """Decisão do dono (07/10): desativar quem é operador e médium tira só o painel;
    a conta vira `medium` e continua ativa na Área. Sem vínculo, desativa de verdade."""
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    ligado = await create_user(db, tenant, UserRole.OPERATOR, name="ligado")
    await _medium(db, tenant, ligado.user)
    solto = await create_user(db, tenant, UserRole.OPERATOR, name="solto")

    resp = await client.put(f"/api/v1/admin/users/{ligado.user.id}", headers=admin.headers, json={"is_active": False})
    assert resp.status_code == 200, resp.text
    assert resp.json()["role"] == "medium" and resp.json()["is_active"] is True
    assert (await client.get("/api/v1/admin/giras", headers=ligado.headers)).status_code == 403
    assert (await client.get(MEDIUM_ME, headers=ligado.headers)).status_code == 200

    resp = await client.put(f"/api/v1/admin/users/{solto.user.id}", headers=admin.headers, json={"is_active": False})
    assert resp.status_code == 200, resp.text
    assert resp.json()["role"] == "operator" and resp.json()["is_active"] is False


async def test_rebaixar_por_edicao_e_remover_sem_vinculo(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    ligado = await create_user(db, tenant, UserRole.OPERATOR, name="ligado")
    await _medium(db, tenant, ligado.user)
    solto = await create_user(db, tenant, UserRole.OPERATOR, name="solto")

    put = await client.put(f"/api/v1/admin/users/{ligado.user.id}", headers=admin.headers, json={"role": "medium"})
    assert put.status_code == 200 and put.json()["role"] == "medium"

    assert (await client.delete(f"/api/v1/admin/users/{solto.user.id}", headers=admin.headers)).status_code == 204
    assert (await _fresh(User, solto.user.id)).deleted_at is not None


async def test_excluir_conta_medium_solta_o_vinculo(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    puro = await _medium_actor(db, tenant)
    m = await _medium(db, tenant, puro.user)

    assert (await client.delete(f"/api/v1/admin/users/{puro.user.id}", headers=admin.headers)).status_code == 204
    assert (await _fresh(Medium, m.id)).user_id is None
    # Conta excluída já não autentica (get_current_user recusa deleted_at): 401, não 403.
    assert (await client.get(MEDIUM_ME, headers=puro.headers)).status_code == 401


async def test_medium_nao_entra_em_grupo_de_permissao(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    puro = await _medium_actor(db, tenant)
    grupo = PermissionGroup(tenant_id=tenant.id, name="Porteiros")
    db.add(grupo)
    await db.commit()

    resp = await client.post(
        f"/api/v1/admin/permission-groups/{grupo.id}/members", headers=admin.headers,
        json={"user_id": str(puro.user.id)},
    )
    assert resp.status_code == 403


# ── Médiuns (admin/mediuns.py): inativar/excluir acompanha a conta ──────────


async def test_inativar_e_reativar_medium_desliga_e_religa_a_conta_medium(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    puro = await _medium_actor(db, tenant)
    m = await _medium(db, tenant, puro.user)

    resp = await client.patch(f"/api/v1/admin/mediuns/{m.id}", headers=admin.headers, json={"is_active": False})
    assert resp.status_code == 200, resp.text
    assert (await _fresh(User, puro.user.id)).is_active is False
    assert (await client.get(ME, headers=puro.headers)).status_code == 401

    resp = await client.patch(f"/api/v1/admin/mediuns/{m.id}", headers=admin.headers, json={"is_active": True})
    assert resp.status_code == 200, resp.text
    user = await _fresh(User, puro.user.id)
    assert user.is_active is True
    # Token novo (o antigo caiu com as sessões; `iat` do JWT tem resolução de segundos).
    await asyncio.sleep(1.1)
    assert (await client.get(MEDIUM_ME, headers=_headers(user))).status_code == 200


async def test_excluir_medium_desativa_a_conta_medium_pura(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    puro = await _medium_actor(db, tenant)
    m = await _medium(db, tenant, puro.user)

    assert (await client.delete(f"/api/v1/admin/mediuns/{m.id}", headers=admin.headers)).status_code == 204
    assert (await _fresh(User, puro.user.id)).is_active is False


async def test_inativar_medium_de_operador_so_tira_a_area(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="op")
    await grant(db, operador, tenant, PermissionFeature.GIRAS, "view")
    m = await _medium(db, tenant, operador.user)

    assert (await client.patch(
        f"/api/v1/admin/mediuns/{m.id}", headers=admin.headers, json={"is_active": False}
    )).status_code == 200
    user = await _fresh(User, operador.user.id)
    assert user.is_active is True and user.role == UserRole.OPERATOR
    assert (await client.get(MEDIUM_ME, headers=operador.headers)).status_code == 403
    assert (await client.get(ME, headers=operador.headers)).json()["areas"] == {"admin": True, "medium": None}
    assert (await client.get("/api/v1/admin/giras", headers=operador.headers)).status_code == 200


# ── Contato principal do terreiro nunca é um médium ─────────────────────────


async def test_contato_principal_ignora_contas_medium(db):
    from src.api.v1.webhooks import _get_tenant_primary_contact
    from src.services.trial_scheduler import get_tenant_primary_contact

    tenant = await create_tenant(db)
    puro = await _medium_actor(db, tenant)
    await _medium(db, tenant, puro.user)
    assert await get_tenant_primary_contact(tenant.id) is None
    assert await _get_tenant_primary_contact(tenant.id, db) is None

    operador = await create_user(db, tenant, UserRole.OPERATOR, name="op")
    assert (await get_tenant_primary_contact(tenant.id))[0] == operador.user.email
    assert (await _get_tenant_primary_contact(tenant.id, db)).id == operador.user.id
