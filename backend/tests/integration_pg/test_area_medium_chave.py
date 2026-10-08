"""Chave da Área do Médium por terreiro (lançamento em piloto, decisão do dono 07/10).

A Área vai para a produção desligada; a plataforma liga por terreiro no Tenant 360.
Desligada, nada da Área aparece nem funciona, mesmo com plano Basic+.
"""
from src.models import Medium
from src.models.subscriptions import PlanType
from src.models.users import UserRole

from .factories import create_tenant, create_user

MEDIUM_ME = "/api/v1/medium/me"


async def test_area_desligada_ate_a_plataforma_liberar(client, db):
    tenant = await create_tenant(db, plan=PlanType.BASIC)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    medium = await create_user(db, tenant, UserRole.MEDIUM, name="medium")
    db.add(Medium(tenant_id=tenant.id, nome="Maria", user_id=medium.user.id))
    await db.commit()
    super_admin = await create_user(db, None, UserRole.SUPER_ADMIN, name="plataforma")

    # Desligada: médium sem Área, painel sem a feature, /auth/me sem a área.
    negado = await client.get(MEDIUM_ME, headers=medium.headers)
    assert negado.status_code == 403, negado.text
    info = await client.get("/api/v1/admin/subscription", headers=admin.headers)
    assert info.status_code == 200, info.text
    assert info.json()["features"]["area_medium"] is False
    me = await client.get("/api/v1/auth/me", headers=medium.headers)
    assert me.json()["areas"]["medium"] is None

    tenant_url = f"/api/v1/platform/tenants/{tenant.id}"
    detalhe = await client.get(tenant_url, headers=super_admin.headers)
    assert detalhe.json()["area_medium_liberada"] is False

    # Só super admin liga.
    assert (await client.put(tenant_url, headers=admin.headers, json={"area_medium_liberada": True})).status_code == 403
    liga = await client.put(tenant_url, headers=super_admin.headers, json={"area_medium_liberada": True})
    assert liga.status_code == 200, liga.text
    assert liga.json()["area_medium_liberada"] is True

    assert (await client.get(MEDIUM_ME, headers=medium.headers)).status_code == 200
    info = await client.get("/api/v1/admin/subscription", headers=admin.headers)
    assert info.json()["features"]["area_medium"] is True
    me = await client.get("/api/v1/auth/me", headers=medium.headers)
    assert me.json()["areas"]["medium"] is not None

    # Null não vale (coluna NOT NULL) e desligar volta a fechar.
    assert (await client.put(tenant_url, headers=super_admin.headers, json={"area_medium_liberada": None})).status_code == 422
    desliga = await client.put(tenant_url, headers=super_admin.headers, json={"area_medium_liberada": False})
    assert desliga.status_code == 200, desliga.text
    assert (await client.get(MEDIUM_ME, headers=medium.headers)).status_code == 403


async def test_liberada_mas_plano_gratuito_continua_sem_area(client, db):
    tenant = await create_tenant(db, plan=PlanType.FREE, area_medium_liberada=True)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    info = await client.get("/api/v1/admin/subscription", headers=admin.headers)
    assert info.json()["features"]["area_medium"] is False
