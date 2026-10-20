"""Jornadas do super-admin contra Postgres real (revisão da plataforma, 2026-10-06).

- Exclusão definitiva (LGPD) de terreiro que se desativou pelo painel (soft delete), inclusive de
  terreiro com os dados de uso real (grupos de permissão, médiuns, associados, mensalidade, escala,
  duplas): em 08/10/2026 a exclusão dava 500 porque o ORM tentava pôr NULL em `permission_groups.tenant_id`.
- Auditoria consolidada inclui o último dia do período (fim = dia inteiro em Brasília).
- Impersonação gera AuditLog no terreiro e não conta como atividade do terreiro.
- Aba Giras do Tenant 360 busca as giras DO terreiro, não o top 50 global.
- Trava do último super-admin.
"""
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select, update

from src.core.database import AsyncSessionLocal
from src.core.tz import APP_TZ
from src.models.audit_logs import AuditAction, AuditLog
from src.models.subscriptions import PlanType
from src.models.tenants import Tenant
from src.models.users import User, UserRole

from decimal import Decimal

from src.models import Associado, GiraDupla, Medium, MensalidadeConfig
from src.models.permission_groups import PermissionFeature, PermissionGroup
from src.services.atividades import atividade_da_gira, ensure_default_atividade_tipos

from .factories import create_gira, create_tenant, create_user, grant


async def _self_deactivate(db, tenant, admin):
    """Mesmo efeito de POST /auth/deactivate-account (api/v1/auth/deactivation.py)."""
    now = datetime.now(timezone.utc)
    await db.execute(
        update(Tenant).where(Tenant.id == tenant.id).values(deleted_at=now, is_active=False, self_deactivated_at=now)
    )
    await db.execute(update(User).where(User.id == admin.user.id).values(is_active=False))
    await db.commit()


async def test_tenant_360_abre_terreiro_desativado_pelo_proprio(client, db):
    tenant = await create_tenant(db, "Desativado", PlanType.BASIC)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="admin")
    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")
    await _self_deactivate(db, tenant, admin)

    resp = await client.get(f"/api/v1/platform/tenants/{tenant.id}", headers=root.headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["deleted_at"] is not None
    assert body["self_deactivated_at"] is not None
    assert body["is_active"] is False

    resp = await client.get(f"/api/v1/platform/tenants/{tenant.id}/users", headers=root.headers)
    assert resp.status_code == 200, resp.text
    assert [u["email"] for u in resp.json()] == [admin.user.email]


async def test_hard_delete_de_terreiro_soft_deleted(client, db):
    tenant = await create_tenant(db, "Pede exclusao", PlanType.BASIC)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="admin")
    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")
    await create_gira(db, tenant)
    await _self_deactivate(db, tenant, admin)
    tenant_id, slug = tenant.id, tenant.slug

    resp = await client.request(
        "DELETE", f"/api/v1/platform/tenants/{tenant_id}", json={"confirm_slug": slug}, headers=root.headers
    )
    assert resp.status_code == 204, resp.text

    async with AsyncSessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(Tenant).where(Tenant.id == tenant_id)) == 0
        assert await s.scalar(select(func.count()).select_from(User).where(User.tenant_id == tenant_id)) == 0
        log = (
            await s.execute(select(AuditLog).where(AuditLog.action == AuditAction.TENANT_DELETED))
        ).scalar_one()
        assert log.tenant_id is None
        assert log.resource_id == tenant_id
        assert log.details["was_soft_deleted"] is True
        assert log.details["self_deactivated_at"] is not None


async def test_hard_delete_de_terreiro_com_dados_de_uso_real(client, db):
    tenant = await create_tenant(db, "Casa completa", PlanType.PRO)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="admin")
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="operador")
    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")
    await grant(db, operador, tenant, PermissionFeature.PORTA, "view", "edit")
    gira = await create_gira(db, tenant)
    medium = Medium(tenant_id=tenant.id, nome="Mãe Rita", is_atendimento=True)
    cambone = Medium(tenant_id=tenant.id, nome="Ana", is_atendimento=False)
    db.add_all([medium, cambone])
    db.add(Associado(tenant_id=tenant.id, nome="Associado", email="a@example.com", email_normalized="a@example.com"))
    db.add(MensalidadeConfig(tenant_id=tenant.id, valor_mensal=Decimal("50"), dia_vencimento=10, ativo=True))
    await db.flush()
    db.add(GiraDupla(tenant_id=tenant.id, gira_id=gira.id, medium_id=medium.id, cambone_id=cambone.id))
    await ensure_default_atividade_tipos(db, tenant.id)
    await atividade_da_gira(db, tenant.id, gira.id)
    await db.commit()
    await _self_deactivate(db, tenant, admin)
    tenant_id, slug = tenant.id, tenant.slug

    resp = await client.request(
        "DELETE", f"/api/v1/platform/tenants/{tenant_id}", json={"confirm_slug": slug}, headers=root.headers
    )
    assert resp.status_code == 204, resp.text

    async with AsyncSessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(Tenant).where(Tenant.id == tenant_id)) == 0
        for model in (User, PermissionGroup, Medium, Associado, MensalidadeConfig, GiraDupla):
            assert await s.scalar(select(func.count()).select_from(model).where(model.tenant_id == tenant_id)) == 0, model


async def test_hard_delete_continua_exigindo_slug(client, db):
    tenant = await create_tenant(db, "Slug errado", PlanType.BASIC)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="admin")
    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")
    await _self_deactivate(db, tenant, admin)

    resp = await client.request(
        "DELETE", f"/api/v1/platform/tenants/{tenant.id}", json={"confirm_slug": "outro"}, headers=root.headers
    )
    assert resp.status_code == 422, resp.text


async def test_feed_de_auditoria_inclui_o_dia_final(client, db):
    tenant = await create_tenant(db, "Auditado", PlanType.BASIC)
    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")
    db.add(AuditLog(tenant_id=tenant.id, action=AuditAction.UPDATE, resource_type="Gira",
                    created_at=datetime.now(timezone.utc)))
    await db.commit()
    hoje = datetime.now(APP_TZ).date().isoformat()

    resp = await client.get(
        "/api/v1/platform/audit-logs/feed",
        params={"start_date": hoje, "end_date": hoje, "tenant_id": str(tenant.id)},
        headers=root.headers,
    )
    assert resp.status_code == 200, resp.text
    assert len(resp.json()) == 1

    resp = await client.get(
        "/api/v1/platform/audit-logs", params={"start_date": hoje, "end_date": hoje}, headers=root.headers
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["total"] == 1


async def test_impersonacao_auditada_e_nao_conta_como_atividade(client, db):
    tenant = await create_tenant(db, "Impersonado", PlanType.BASIC)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="admin")
    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")

    resp = await client.post(f"/api/v1/platform/impersonate/{admin.user.id}", headers=root.headers)
    assert resp.status_code == 200, resp.text

    async with AsyncSessionLocal() as s:
        log = (await s.execute(select(AuditLog).where(AuditLog.tenant_id == tenant.id))).scalar_one()
        assert log.user_id == root.user.id
        assert log.details["platform_action"] == "impersonation_start"

    resp = await client.get("/api/v1/platform/tenant-observatory", headers=root.headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["retention_grace_days"] == 15
    row = next(t for t in body["activation"]["tenants"] if t["tenant_id"] == str(tenant.id))
    # A impersonação não é "última atividade" do terreiro
    assert row["last_activity_at"] is None


async def test_giras_do_tenant_360_sao_do_proprio_terreiro(client, db):
    alvo = await create_tenant(db, "Alvo", PlanType.BASIC)
    outro = await create_tenant(db, "Outro", PlanType.BASIC)
    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")
    gira_alvo = await create_gira(db, alvo, nome="Gira do alvo")
    await create_gira(db, outro, nome="Gira do outro")

    resp = await client.get(f"/api/v1/platform/tenant-observatory/tenants/{alvo.id}/giras", headers=root.headers)
    assert resp.status_code == 200, resp.text
    giras = resp.json()
    assert [g["id"] for g in giras] == [str(gira_alvo.id)]
    assert giras[0]["tenant_id"] == str(alvo.id)


async def test_ultimo_super_admin_nao_se_exclui(client, db):
    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")

    resp = await client.delete(f"/api/v1/platform/users/{root.user.id}", headers=root.headers)
    assert resp.status_code == 400, resp.text

    outro = await create_user(db, None, UserRole.SUPER_ADMIN, name="outro")
    resp = await client.put(f"/api/v1/platform/users/{outro.user.id}", json={"is_active": False}, headers=root.headers)
    assert resp.status_code == 200, resp.text

    # Agora root é o único ativo: excluir o inativo pode, desativar root (por outro) não.
    async with AsyncSessionLocal() as s:
        assert await s.scalar(
            select(func.count()).select_from(AuditLog).where(AuditLog.details["platform_action"].astext == "super_admin_update")
        ) == 1
    resp = await client.delete(f"/api/v1/platform/users/{outro.user.id}", headers=root.headers)
    assert resp.status_code == 204, resp.text
    async with AsyncSessionLocal() as s:
        assert (await s.get(User, UUID(str(outro.user.id)))).deleted_at is not None
