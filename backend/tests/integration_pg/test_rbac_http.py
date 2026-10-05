"""Grupo 3 do Q-01 — RBAC via HTTP real.

Os `Depends(require_group_permission(...))` rodam de verdade: JWT →
middleware → get_current_user → grupos do usuário no Postgres.
"""
from datetime import datetime, timedelta, timezone

import pytest

from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.users import UserRole

from .factories import create_gira, create_tenant, create_user, grant

GIRA_BODY = {"nome": "Gira de Pretos-Velhos", "data_inicio": (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()}


@pytest.fixture
async def tenant(db):
    return await create_tenant(db)


async def test_sem_token_responde_401(client):
    resp = await client.get("/api/v1/admin/giras")
    assert resp.status_code == 401


async def test_token_invalido_responde_401(client):
    resp = await client.get("/api/v1/admin/giras", headers={"Authorization": "Bearer nao-e-um-jwt"})
    assert resp.status_code == 401


async def test_admin_faz_bypass_dos_grupos(client, db, tenant):
    admin = await create_user(db, tenant, UserRole.ADMIN)
    assert (await client.get("/api/v1/admin/giras", headers=admin.headers)).status_code == 200
    resp = await client.post("/api/v1/admin/giras", headers=admin.headers, json=GIRA_BODY)
    assert resp.status_code == 201, resp.text


async def test_operador_so_com_view_lista_mas_nao_altera(client, db, tenant):
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="operador")
    await grant(db, operador, tenant, PermissionFeature.GIRAS, "view")
    gira = await create_gira(db, tenant)

    assert (await client.get("/api/v1/admin/giras", headers=operador.headers)).status_code == 200
    assert (await client.get(f"/api/v1/admin/giras/{gira.id}", headers=operador.headers)).status_code == 200
    assert (await client.post("/api/v1/admin/giras", headers=operador.headers, json=GIRA_BODY)).status_code == 403
    put = await client.put(f"/api/v1/admin/giras/{gira.id}", headers=operador.headers, json=GIRA_BODY)
    assert put.status_code == 403
    assert (await client.delete(f"/api/v1/admin/giras/{gira.id}", headers=operador.headers)).status_code == 403


async def test_operador_com_insert_cria_mas_nao_apaga(client, db, tenant):
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="operador")
    await grant(db, operador, tenant, PermissionFeature.GIRAS, "view", "insert")

    created = await client.post("/api/v1/admin/giras", headers=operador.headers, json=GIRA_BODY)
    assert created.status_code == 201, created.text
    gira_id = created.json()["id"]
    assert (await client.delete(f"/api/v1/admin/giras/{gira_id}", headers=operador.headers)).status_code == 403


async def test_grupo_de_outro_modulo_nao_libera_giras(client, db, tenant):
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="operador")
    await grant(db, operador, tenant, PermissionFeature.MEDIUNS, "view", "insert", "edit", "delete")

    assert (await client.get("/api/v1/admin/giras", headers=operador.headers)).status_code == 403
    assert (await client.get("/api/v1/admin/mediuns", headers=operador.headers)).status_code == 200


async def test_porta_exige_permissao_de_porta(client, db, tenant):
    gira = await create_gira(db, tenant)
    sem_porta = await create_user(db, tenant, UserRole.OPERATOR, name="sem-porta")
    await grant(db, sem_porta, tenant, PermissionFeature.MEDIUNS, "view")
    com_porta = await create_user(db, tenant, UserRole.OPERATOR, name="porteiro")
    await grant(db, com_porta, tenant, PermissionFeature.PORTA, "view", "insert", "edit")

    url = f"/api/v1/admin/giras/{gira.id}/door/queue"
    assert (await client.get(url, headers=sem_porta.headers)).status_code == 403
    assert (await client.get(url, headers=com_porta.headers)).status_code == 200


async def test_rotas_da_plataforma_sao_so_do_super_admin(client, db, tenant):
    admin = await create_user(db, tenant, UserRole.ADMIN)
    super_admin = await create_user(db, None, UserRole.SUPER_ADMIN, name="super")

    url = "/api/v1/platform/tenant-observatory"
    assert (await client.get(url, headers=admin.headers)).status_code == 403
    resp = await client.get(url, headers=super_admin.headers)
    assert resp.status_code == 200, resp.text
    assert "activation" in resp.json()


async def test_plano_gratuito_nao_cria_medium(client, db):
    tenant_free = await create_tenant(db, "Terreiro Gratuito", plan=PlanType.FREE)
    admin = await create_user(db, tenant_free, UserRole.ADMIN)

    resp = await client.post("/api/v1/admin/mediuns", headers=admin.headers, json={"nome": "Médium Novo"})

    assert resp.status_code in (402, 403), resp.text


async def test_operador_sem_nenhum_grupo_nao_acessa_modulos(client, db, tenant):
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="sem-grupo")
    assert (await client.get("/api/v1/admin/giras", headers=operador.headers)).status_code == 403
