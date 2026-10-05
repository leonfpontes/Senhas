"""Q-05 — RBAC fail-closed com grupo padrão "Acesso total" por tenant."""
import subprocess
import sys
import uuid

from sqlalchemy import func, select, text

from src.models.permission_groups import PermissionGroup, UserGroupMembership
from src.models.users import UserRole

from .conftest import BACKEND_DIR
from .factories import create_tenant, create_user, grant
from src.models.permission_groups import PermissionFeature


async def _q(stmt):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(stmt)).scalar_one_or_none()


async def _grupo_padrao(tenant_id):
    return await _q(
        select(PermissionGroup).where(
            PermissionGroup.tenant_id == tenant_id,
            PermissionGroup.is_default.is_(True),
            PermissionGroup.deleted_at.is_(None),
        )
    )


async def test_operador_criado_pelo_admin_entra_no_grupo_padrao_e_acessa(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    suffix = uuid.uuid4().hex[:6]

    resp = await client.post(
        "/api/v1/admin/users",
        headers=admin.headers,
        json={"email": f"op-{suffix}@example.com", "username": f"op-{suffix}", "password": "Senha-forte-123", "role": "operator"},
    )

    assert resp.status_code == 201, resp.text
    grupo = await _grupo_padrao(tenant.id)
    assert grupo is not None and grupo.name == "Acesso total"
    membros = await _q(
        select(func.count()).select_from(UserGroupMembership).where(
            UserGroupMembership.group_id == grupo.id, UserGroupMembership.user_id == uuid.UUID(resp.json()["id"])
        )
    )
    assert membros == 1


async def test_operador_em_grupo_restrito_nao_ganha_o_padrao_ao_virar_operador(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="restrito")
    await grant(db, operador, tenant, PermissionFeature.GIRAS, "view")

    resp = await client.put(
        f"/api/v1/admin/users/{operador.user.id}", headers=admin.headers, json={"role": "operator"}
    )

    assert resp.status_code == 200, resp.text
    assert await _grupo_padrao(tenant.id) is None  # não precisou criar
    assert (await client.get("/api/v1/admin/giras", headers=operador.headers)).status_code == 200
    assert (await client.get("/api/v1/admin/mediuns", headers=operador.headers)).status_code == 403


async def test_admin_rebaixado_a_operador_mantem_acesso_pelo_grupo_padrao(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    outro = await create_user(db, tenant, UserRole.ADMIN, name="ex-admin")

    resp = await client.put(f"/api/v1/admin/users/{outro.user.id}", headers=admin.headers, json={"role": "operator"})

    assert resp.status_code == 200, resp.text
    from src.security.jwt import create_access_token

    headers = {"Authorization": f"Bearer {create_access_token(outro.user.id, tenant.id, 'operator')}"}
    assert (await client.get("/api/v1/admin/giras", headers=headers)).status_code == 200


async def test_grupo_padrao_nao_pode_ser_excluido(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    suffix = uuid.uuid4().hex[:6]
    await client.post(
        "/api/v1/admin/users",
        headers=admin.headers,
        json={"email": f"op-{suffix}@example.com", "username": f"op-{suffix}", "password": "Senha-forte-123", "role": "operator"},
    )
    grupo = await _grupo_padrao(tenant.id)

    lista = await client.get("/api/v1/admin/permission-groups", headers=admin.headers)
    resp = await client.delete(f"/api/v1/admin/permission-groups/{grupo.id}?force=true", headers=admin.headers)

    assert any(g["id"] == str(grupo.id) and g["is_default"] for g in lista.json())
    assert resp.status_code == 400, resp.text
    assert await _grupo_padrao(tenant.id) is not None


def _alembic(*args):
    subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR, check=True, capture_output=True)


async def test_migracao_poe_operadores_sem_grupo_no_padrao_e_preserva_os_demais(client, db):
    tenant = await create_tenant(db)
    sem_grupo = await create_user(db, tenant, UserRole.OPERATOR, name="sem-grupo")
    restrito = await create_user(db, tenant, UserRole.OPERATOR, name="restrito")
    await grant(db, restrito, tenant, PermissionFeature.GIRAS, "view")
    admin = await create_user(db, tenant, UserRole.ADMIN, name="admin")

    _alembic("downgrade", "056_dedupe_tickets_unique_ativo")
    _alembic("upgrade", "head")

    grupo = await _grupo_padrao(tenant.id)
    assert grupo is not None

    async def _no_padrao(user_id):
        return await _q(
            select(func.count()).select_from(UserGroupMembership).where(
                UserGroupMembership.group_id == grupo.id, UserGroupMembership.user_id == user_id
            )
        )

    assert await _no_padrao(sem_grupo.user.id) == 1
    assert await _no_padrao(restrito.user.id) == 0
    assert await _no_padrao(admin.user.id) == 0
    # Sem mudança visível: o operador sem grupo continua acessando; o restrito continua restrito.
    assert (await client.get("/api/v1/admin/mediuns", headers=sem_grupo.headers)).status_code == 200
    assert (await client.get("/api/v1/admin/mediuns", headers=restrito.headers)).status_code == 403
    from src.core.database import engine

    async with engine.connect() as conn:
        n = (await conn.execute(text("SELECT count(*) FROM group_permissions WHERE group_id = :g"), {"g": grupo.id})).scalar()
    assert n == len(list(PermissionFeature))
