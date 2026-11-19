"""Área do Médium como beta do Laboratório (decisão do dono, 19/11/2026; antes era chave da plataforma).

Vale só com as três coisas: terreiro beta tester (marcado pela plataforma), beta "Área do Médium"
ligada pela casa em Configurações › Laboratório e plano Basic+. Desligada, nada da Área aparece nem
funciona.
"""
from src.models import Medium
from src.models.subscriptions import PlanType
from src.models.users import UserRole

from .factories import create_tenant, create_user

MEDIUM_ME = "/api/v1/medium/me"
LAB = "/api/v1/admin/config/laboratorio"


async def test_area_desligada_ate_a_casa_ligar_no_laboratorio(client, db):
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

    # A plataforma só marca beta tester (a casa ainda não ligou nada).
    tenant_url = f"/api/v1/platform/tenants/{tenant.id}"
    assert (await client.put(tenant_url, headers=admin.headers, json={"beta_tester": True})).status_code == 403
    marca = await client.put(tenant_url, headers=super_admin.headers, json={"beta_tester": True})
    assert marca.status_code == 200, marca.text
    assert marca.json()["betas_ligadas"] == []
    assert (await client.get(MEDIUM_ME, headers=medium.headers)).status_code == 403

    # A casa liga no Laboratório.
    liga = await client.put(LAB, headers=admin.headers, json={"chave": "beta_area_medium", "ligada": True})
    assert liga.status_code == 200, liga.text
    assert (await client.get(MEDIUM_ME, headers=medium.headers)).status_code == 200
    info = await client.get("/api/v1/admin/subscription", headers=admin.headers)
    assert info.json()["features"]["area_medium"] is True
    me = await client.get("/api/v1/auth/me", headers=medium.headers)
    assert me.json()["areas"]["medium"] is not None
    detalhe = await client.get(tenant_url, headers=super_admin.headers)
    assert detalhe.json()["betas_ligadas"] == ["Área do Médium"]

    # Desligar volta a fechar; tirar o beta tester também.
    desliga = await client.put(LAB, headers=admin.headers, json={"chave": "beta_area_medium", "ligada": False})
    assert desliga.status_code == 200, desliga.text
    assert (await client.get(MEDIUM_ME, headers=medium.headers)).status_code == 403
    await client.put(LAB, headers=admin.headers, json={"chave": "beta_area_medium", "ligada": True})
    assert (await client.put(tenant_url, headers=super_admin.headers, json={"beta_tester": None})).status_code == 422
    assert (await client.put(tenant_url, headers=super_admin.headers, json={"beta_tester": False})).status_code == 200
    assert (await client.get(MEDIUM_ME, headers=medium.headers)).status_code == 403


async def test_ligada_mas_plano_gratuito_continua_sem_area(client, db):
    tenant = await create_tenant(db, plan=PlanType.FREE, area_medium_liberada=True)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    info = await client.get("/api/v1/admin/subscription", headers=admin.headers)
    assert info.json()["features"]["area_medium"] is False
