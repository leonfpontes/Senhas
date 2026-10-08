"""T-06 — "Site do terreiro" com permissão própria (`PermissionFeature.SITE`).

Antes, `sites.py` usava o grupo de Cursos Presenciais: quem cuidava dos cursos
editava o site e vice-versa. Agora as duas features são independentes. As
migrações 061/062 copiaram, em todo grupo, a linha `cursos_presenciais` para uma
linha `site` com as mesmas ações — ninguém perdeu acesso na virada.
"""
import subprocess
import sys
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, text

from src.models.permission_groups import GroupPermission, PermissionFeature, PermissionGroup
from src.models.users import UserRole

from .conftest import BACKEND_DIR
from .factories import create_tenant, create_user, grant

SITES = "/api/v1/admin/sites"
CURSOS = "/api/v1/admin/cursos-presenciais"
CURSO_BODY = {"titulo": "Desenvolvimento", "data_inicio": datetime.now(timezone.utc).isoformat()}


# ── RBAC via HTTP ───────────────────────────────────────────────────────────


async def test_grupo_com_site_e_sem_cursos_edita_o_site_e_nao_os_cursos(client, db):
    tenant = await create_tenant(db)
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="site")
    await grant(db, operador, tenant, PermissionFeature.SITE, "view", "insert", "edit")
    h = operador.headers

    assert (await client.get(SITES, headers=h)).status_code == 200
    put = await client.put(SITES, headers=h, json={"meta_title": "Casa de Oxalá"})
    assert put.status_code == 200, put.text
    assert put.json()["meta_title"] == "Casa de Oxalá"
    secoes = await client.put(
        f"{SITES}/sections", headers=h,
        json={"sections": [{"section_type": "HERO", "config": {"title": "Casa"}}], "site_version": None},
    )
    assert secoes.status_code == 200, secoes.text
    assert (await client.post(f"{SITES}/publish", headers=h)).status_code == 200

    assert (await client.get(CURSOS, headers=h)).status_code == 403
    assert (await client.post(CURSOS, headers=h, json=CURSO_BODY)).status_code == 403


async def test_grupo_com_cursos_e_sem_site_cuida_dos_cursos_e_nao_do_site(client, db):
    tenant = await create_tenant(db)
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="cursos")
    await grant(db, operador, tenant, PermissionFeature.CURSOS_PRESENCIAIS, "view", "insert", "edit", "delete")
    h = operador.headers

    assert (await client.get(CURSOS, headers=h)).status_code == 200
    assert (await client.post(CURSOS, headers=h, json=CURSO_BODY)).status_code == 201

    assert (await client.get(SITES, headers=h)).status_code == 403
    assert (await client.put(SITES, headers=h, json={"meta_title": "Invadido"})).status_code == 403
    assert (await client.get(f"{SITES}/images", headers=h)).status_code == 403
    assert (await client.post(f"{SITES}/publish", headers=h)).status_code == 403


async def test_site_so_com_view_le_mas_nao_altera(client, db):
    tenant = await create_tenant(db)
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="leitor")
    await grant(db, operador, tenant, PermissionFeature.SITE, "view")
    h = operador.headers

    assert (await client.get(SITES, headers=h)).status_code == 200
    assert (await client.get(f"{SITES}/images", headers=h)).status_code == 200
    assert (await client.put(SITES, headers=h, json={"meta_title": "X"})).status_code == 403
    assert (await client.post(f"{SITES}/publish", headers=h)).status_code == 403


async def test_grupo_padrao_de_tenant_novo_ja_nasce_com_site(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    suffix = uuid.uuid4().hex[:6]
    resp = await client.post(
        "/api/v1/admin/users",
        headers=admin.headers,
        json={"email": f"op-{suffix}@example.com", "username": f"op-{suffix}", "password": "Senha-forte-123", "role": "operator"},
    )
    assert resp.status_code == 201, resp.text
    from src.security.jwt import create_access_token

    headers = {"Authorization": f"Bearer {create_access_token(uuid.UUID(resp.json()['id']), tenant.id, 'operator')}"}
    assert (await client.get(SITES, headers=headers)).status_code == 200
    assert (await client.get(CURSOS, headers=headers)).status_code == 200


# ── Migrações 061/062 ───────────────────────────────────────────────────────


def _alembic(*args):
    subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR, check=True, capture_output=True)


async def _linhas(group_id):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        rows = (await fresh.execute(select(GroupPermission).where(GroupPermission.group_id == group_id))).scalars().all()
        return {
            r.feature: (r.can_view, r.can_insert, r.can_edit, r.can_delete) for r in rows
        }


async def _grupo(db, tenant, nome, *, is_default=False, cursos=None, site=None):
    g = PermissionGroup(tenant_id=tenant.id, name=nome, is_default=is_default)
    db.add(g)
    await db.flush()
    for feature, acoes in ((PermissionFeature.CURSOS_PRESENCIAIS, cursos), (PermissionFeature.SITE, site)):
        if acoes is not None:
            v, i, e, d = acoes
            db.add(GroupPermission(group_id=g.id, feature=feature, can_view=v, can_insert=i, can_edit=e, can_delete=d))
    await db.commit()
    return g


async def test_migracao_copia_cursos_para_site_preservando_o_acesso(client, db):
    tenant = await create_tenant(db)
    # Grupo padrão "Acesso total" restringido pelo admin, grupo completo e grupo só leitura.
    padrao = await _grupo(db, tenant, "Acesso total", is_default=True, cursos=(True, False, True, False))
    completo = await _grupo(db, tenant, "Equipe de Cursos", cursos=(True, True, True, True))
    leitura = await _grupo(db, tenant, "Só olha", cursos=(True, False, False, False))
    sem_cursos = await _grupo(db, tenant, "Outro módulo")
    db.add(GroupPermission(group_id=sem_cursos.id, feature=PermissionFeature.GIRAS, can_view=True))
    await db.commit()

    _alembic("downgrade", "060_usuarios_ilimitados")
    _alembic("upgrade", "head")

    for grupo in (padrao, completo, leitura):
        linhas = await _linhas(grupo.id)
        assert linhas[PermissionFeature.SITE] == linhas[PermissionFeature.CURSOS_PRESENCIAIS], grupo.name
    assert PermissionFeature.SITE not in await _linhas(sem_cursos.id)

    # E o acesso de fato continua igual pela API: operador no grupo só leitura lê o site e não edita.
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="leitura")
    from src.models.permission_groups import UserGroupMembership

    db.add(UserGroupMembership(group_id=leitura.id, user_id=operador.user.id, tenant_id=tenant.id))
    await db.commit()
    assert (await client.get(SITES, headers=operador.headers)).status_code == 200
    assert (await client.put(SITES, headers=operador.headers, json={"meta_title": "X"})).status_code == 403


async def test_migracao_e_idempotente_e_nao_sobrescreve_site_existente(db):
    tenant = await create_tenant(db)
    grupo = await _grupo(db, tenant, "Misto", cursos=(True, True, True, True))

    _alembic("downgrade", "061_permissao_site_enum")
    # Linha `site` já existente e diferente da de cursos: a cópia não mexe nela.
    from src.core.database import engine

    async with engine.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO group_permissions (id, group_id, feature, can_view, can_insert, can_edit, can_delete, created_at, updated_at) "
                "VALUES (gen_random_uuid(), :g, 'site', true, false, false, false, now(), now())"
            ),
            {"g": grupo.id},
        )
    _alembic("upgrade", "head")

    assert (await _linhas(grupo.id))[PermissionFeature.SITE] == (True, False, False, False)
    async with engine.connect() as conn:
        n = (await conn.execute(
            text("SELECT count(*) FROM group_permissions WHERE group_id = :g AND feature = 'site'"), {"g": grupo.id}
        )).scalar()
    assert n == 1


async def test_downgrade_apaga_so_as_linhas_de_site(db):
    tenant = await create_tenant(db)
    grupo = await _grupo(db, tenant, "Cursos", cursos=(True, True, False, False), site=(True, True, False, False))

    _alembic("downgrade", "061_permissao_site_enum")
    try:
        linhas = await _linhas(grupo.id)
        assert PermissionFeature.SITE not in linhas
        assert linhas[PermissionFeature.CURSOS_PRESENCIAIS] == (True, True, False, False)
    finally:
        _alembic("upgrade", "head")
    assert (await _linhas(grupo.id))[PermissionFeature.SITE] == (True, True, False, False)
