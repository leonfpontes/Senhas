"""Laboratório (jornadas v2) — betas por casa, só para terreiro beta tester, com Postgres real.

- Sem `tenants.beta_tester`, GET/PUT respondem 403 e a gira pública não anuncia beta nenhuma.
- Beta tester: o catálogo vem desligado; ligar/desligar exige CONFIGURACOES edit e fica na auditoria.
- Isolamento: ligar uma beta numa casa não liga na outra.
"""
from __future__ import annotations

from sqlalchemy import select

from src.models.audit_logs import AuditLog
from src.models.permission_groups import PermissionFeature
from src.models.users import UserRole
from src.services.laboratorio import CHAVES, betas_ligadas

from .factories import create_tenant, create_user, grant

LAB = "/api/v1/admin/config/laboratorio"


async def _beta_tester(db, tenant):
    tenant.beta_tester = True
    db.add(tenant)
    await db.commit()
    return tenant


async def test_sem_beta_tester_o_laboratorio_nao_existe(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    assert (await client.get(LAB, headers=admin.headers)).status_code == 403
    r = await client.put(LAB, headers=admin.headers, json={"chave": "beta_bilhete_offline", "ligada": True})
    assert r.status_code == 403
    assert await betas_ligadas(db, tenant.id) == set()


async def test_beta_tester_liga_desliga_e_audita(client, db):
    tenant = await _beta_tester(db, await create_tenant(db))
    outra = await _beta_tester(db, await create_tenant(db, name="Outra Casa"))
    admin = await create_user(db, tenant, UserRole.ADMIN)

    r = await client.get(LAB, headers=admin.headers)
    assert r.status_code == 200, r.text
    betas = r.json()["betas"]
    assert {b["chave"] for b in betas} == set(CHAVES)
    assert not any(b["ligada"] for b in betas)

    r = await client.put(LAB, headers=admin.headers, json={"chave": "beta_bilhete_offline", "ligada": True})
    assert r.status_code == 200, r.text
    assert await betas_ligadas(db, tenant.id) == {"beta_bilhete_offline"}
    assert await betas_ligadas(db, outra.id) == set()

    assert (await client.put(LAB, headers=admin.headers, json={"chave": "beta_inexistente", "ligada": True})).status_code == 422

    logs = (await db.execute(select(AuditLog).where(AuditLog.tenant_id == tenant.id))).scalars().all()
    assert any((log.details or {}).get("config_type") == "laboratorio" for log in logs)

    # Perder o status de beta tester esconde as betas sem apagar a escolha.
    tenant.beta_tester = False
    db.add(tenant)
    await db.commit()
    assert await betas_ligadas(db, tenant.id) == set()


async def test_grupos_de_permissao(client, db):
    tenant = await _beta_tester(db, await create_tenant(db))
    leitor = await create_user(db, tenant, UserRole.OPERATOR, name="leitor")
    await grant(db, leitor, tenant, PermissionFeature.CONFIGURACOES, "view")
    assert (await client.get(LAB, headers=leitor.headers)).status_code == 200
    r = await client.put(LAB, headers=leitor.headers, json={"chave": "beta_bilhete_offline", "ligada": True})
    assert r.status_code == 403
    sem_grupo = await create_user(db, tenant, UserRole.OPERATOR, name="semgrupo")
    assert (await client.get(LAB, headers=sem_grupo.headers)).status_code == 403
