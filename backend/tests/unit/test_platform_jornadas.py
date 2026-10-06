"""Jornadas do super-admin (itens 6, 9, 12 e 14 da revisão da plataforma).

- CRUD de super-admin: política de senha, nada de desativar/excluir a si mesmo
  nem o último super-admin ativo.
- Ações da plataforma geram AuditLog na mesma transação (antes do commit).
- Editar terreiro: ``description: null`` limpa; campo ausente fica como está.
- Novo terreiro: sem ``data_retention_days`` (campo ignorado, removido).
"""
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from src.models import UserRole
from src.models.audit_logs import AuditAction, AuditLog
from tests.conftest import SUPER_ADMIN_ID, TENANT_ID, USER_ID


def _super_admin(user_id=SUPER_ADMIN_ID):
    user = MagicMock()
    user.id = user_id
    user.email = "root@girahub.test"
    user.tenant_id = None
    user.role = UserRole.SUPER_ADMIN
    return user


def _target(user_id=None, active=True):
    target = MagicMock()
    target.id = user_id or uuid4()
    target.email = "outro@girahub.test"
    target.username = "outro"
    target.is_active = active
    return target


def _added_audit_logs(db) -> list[AuditLog]:
    return [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], AuditLog)]


def _db():
    db = AsyncMock()
    db.add = MagicMock()
    return db


# ── Super-admins: política de senha ──────────────────────────────────────────

class TestSuperAdminPasswordPolicy:
    def test_senha_fraca_recusada(self):
        from src.api.v1.platform.users_global import CreatePlatformUserRequest

        with pytest.raises(ValidationError):
            CreatePlatformUserRequest(email="a@b.com", username="a", password="curta")

    def test_senha_acima_de_72_bytes_recusada(self):
        from src.api.v1.platform.users_global import CreatePlatformUserRequest

        with pytest.raises(ValidationError):
            CreatePlatformUserRequest(email="a@b.com", username="a", password="Aa1!" + "x" * 80)

    def test_senha_forte_aceita(self):
        from src.api.v1.platform.users_global import CreatePlatformUserRequest

        req = CreatePlatformUserRequest(email="a@b.com", username="a", password="Forte@Senha123")
        assert req.password == "Forte@Senha123"


# ── Super-admins: travas de auto-exclusão e último ativo ────────────────────

@patch("src.api.v1.platform.users_global.PlatformUserRepository")
class TestSuperAdminGuards:
    async def test_nao_exclui_a_si_mesmo(self, MockRepo):
        from src.api.v1.platform.users_global import delete_platform_user

        me = _super_admin()
        repo = MockRepo.return_value
        repo.get_by_id = AsyncMock(return_value=_target(user_id=me.id))
        repo.count_active = AsyncMock(return_value=5)
        repo.soft_delete = AsyncMock()
        db = _db()

        with pytest.raises(HTTPException) as exc:
            await delete_platform_user(me.id, me, db)
        assert exc.value.status_code == 400
        repo.soft_delete.assert_not_called()
        db.commit.assert_not_called()

    async def test_nao_desativa_a_si_mesmo(self, MockRepo):
        from src.api.v1.platform.users_global import UpdatePlatformUserRequest, update_platform_user

        me = _super_admin()
        repo = MockRepo.return_value
        repo.get_by_id = AsyncMock(return_value=_target(user_id=me.id))
        repo.count_active = AsyncMock(return_value=5)
        repo.update = AsyncMock()
        db = _db()

        with pytest.raises(HTTPException) as exc:
            await update_platform_user(me.id, UpdatePlatformUserRequest(is_active=False), me, db)
        assert exc.value.status_code == 400
        repo.update.assert_not_called()

    async def test_nao_exclui_o_ultimo_ativo(self, MockRepo):
        from src.api.v1.platform.users_global import delete_platform_user

        repo = MockRepo.return_value
        target = _target(active=True)
        repo.get_by_id = AsyncMock(return_value=target)
        repo.count_active = AsyncMock(return_value=1)
        repo.soft_delete = AsyncMock()

        with pytest.raises(HTTPException) as exc:
            await delete_platform_user(target.id, _super_admin(), _db())
        assert exc.value.status_code == 400
        assert "último" in exc.value.detail
        repo.soft_delete.assert_not_called()

    async def test_nao_desativa_o_ultimo_ativo(self, MockRepo):
        from src.api.v1.platform.users_global import UpdatePlatformUserRequest, update_platform_user

        repo = MockRepo.return_value
        target = _target(active=True)
        repo.get_by_id = AsyncMock(return_value=target)
        repo.count_active = AsyncMock(return_value=1)
        repo.update = AsyncMock()

        with pytest.raises(HTTPException) as exc:
            await update_platform_user(target.id, UpdatePlatformUserRequest(is_active=False), _super_admin(), _db())
        assert exc.value.status_code == 400
        repo.update.assert_not_called()

    async def test_exclui_inativo_mesmo_com_um_ativo_so(self, MockRepo):
        from src.api.v1.platform.users_global import delete_platform_user

        repo = MockRepo.return_value
        target = _target(active=False)
        repo.get_by_id = AsyncMock(return_value=target)
        repo.count_active = AsyncMock(return_value=1)
        repo.soft_delete = AsyncMock(return_value=target)
        db = _db()

        await delete_platform_user(target.id, _super_admin(), db)
        repo.soft_delete.assert_awaited_once()
        logs = _added_audit_logs(db)
        assert len(logs) == 1
        assert logs[0].action == AuditAction.DELETE
        assert logs[0].tenant_id is None
        assert logs[0].details["platform_action"] == "super_admin_delete"
        db.commit.assert_awaited_once()

    async def test_exclui_outro_com_dois_ativos_e_audita(self, MockRepo):
        from src.api.v1.platform.users_global import delete_platform_user

        repo = MockRepo.return_value
        target = _target(active=True)
        repo.get_by_id = AsyncMock(return_value=target)
        repo.count_active = AsyncMock(return_value=2)
        repo.soft_delete = AsyncMock(return_value=target)
        db = _db()

        await delete_platform_user(target.id, _super_admin(), db)
        assert [log.details["platform_action"] for log in _added_audit_logs(db)] == ["super_admin_delete"]


# ── Auditoria das ações da plataforma ────────────────────────────────────────

class TestPlatformAudit:
    async def test_impersonacao_gera_log_no_tenant_antes_do_token(self):
        from src.api.v1.platform.impersonate import impersonate_user

        target = MagicMock()
        target.id = USER_ID
        target.email = "admin@terreiro.test"
        target.username = "admin"
        target.is_active = True
        target.role = UserRole.ADMIN
        target.tenant_id = TENANT_ID
        tenant = MagicMock(id=TENANT_ID, slug="terreiro")
        tenant.name = "Terreiro"

        db = _db()
        r_user, r_tenant = MagicMock(), MagicMock()
        r_user.scalar_one_or_none.return_value = target
        r_tenant.scalar_one_or_none.return_value = tenant
        db.execute = AsyncMock(side_effect=[r_user, r_tenant])

        resp = await impersonate_user(USER_ID, _super_admin(), db)

        assert resp.access_token
        logs = _added_audit_logs(db)
        assert len(logs) == 1
        log = logs[0]
        assert log.tenant_id == TENANT_ID
        assert log.user_id == SUPER_ADMIN_ID
        assert log.action == AuditAction.LOGIN
        assert log.details["platform_action"] == "impersonation_start"
        assert "admin@terreiro.test" in log.details["description"]
        db.commit.assert_awaited_once()

    @pytest.mark.parametrize("endpoint,service_method,platform_action", [
        ("suspend_subscription", "suspend_subscription", "subscription_suspend"),
        ("reactivate_subscription", "reactivate_subscription", "subscription_reactivate"),
    ])
    async def test_suspender_reativar_auditados(self, endpoint, service_method, platform_action):
        import src.api.v1.platform.subscriptions as mod

        result = {
            "id": str(uuid4()), "tenant_id": str(TENANT_ID), "plan": "pro", "status": "active",
            "max_users": 5, "max_giras_per_month": 10, "current_users": 1, "monthly_price": 99.0,
            "is_trial": False, "trial_ends_at": None, "auto_renew": True, "created_at": "2026-01-01T00:00:00",
        }
        db = _db()
        with patch.object(mod, "SubscriptionService") as MockSvc:
            setattr(MockSvc.return_value, service_method, AsyncMock(return_value=result))
            await getattr(mod, endpoint)(TENANT_ID, _super_admin(), db)

        logs = _added_audit_logs(db)
        assert [log.details["platform_action"] for log in logs] == [platform_action]
        assert logs[0].tenant_id == TENANT_ID
        db.commit.assert_awaited_once()

    async def test_troca_de_plano_auditada_com_antes_e_depois(self):
        import src.api.v1.platform.subscriptions as mod
        from src.models import PlanType

        base = {
            "id": str(uuid4()), "tenant_id": str(TENANT_ID), "status": "active",
            "max_users": 5, "max_giras_per_month": 10, "current_users": 1, "monthly_price": 99.0,
            "is_trial": False, "trial_ends_at": None, "auto_renew": True, "created_at": "2026-01-01T00:00:00",
        }
        db = _db()
        with patch.object(mod, "SubscriptionService") as MockSvc:
            MockSvc.return_value.get_subscription = AsyncMock(return_value={**base, "plan": "basic"})
            MockSvc.return_value.upgrade_plan = AsyncMock(return_value={**base, "plan": "pro"})
            await mod.upgrade_subscription(TENANT_ID, mod.UpgradePlanRequest(plan=PlanType.PRO), _super_admin(), db)

        (log,) = _added_audit_logs(db)
        assert log.details["previous_values"] == {"plan": "basic"}
        assert log.details["new_values"] == {"plan": "pro"}

    @patch("src.api.v1.platform.tenants.log_security_event")
    @patch("src.api.v1.platform.tenants.hash_password", return_value="hash")
    @patch("src.api.v1.platform.tenants.TenantRepository")
    async def test_redefinir_senha_auditado(self, MockRepo, _hash, _log):
        from src.api.v1.platform.tenants import ResetPasswordRequest, reset_tenant_user_password

        MockRepo.return_value.get_by_id = AsyncMock(return_value=MagicMock())
        user = MagicMock(id=USER_ID, email="op@terreiro.test")
        db = _db()
        res = MagicMock()
        res.scalar_one_or_none.return_value = user
        db.execute = AsyncMock(return_value=res)

        await reset_tenant_user_password(TENANT_ID, USER_ID, ResetPasswordRequest(new_password="V@lid1234567"), _super_admin(), db)

        (log,) = _added_audit_logs(db)
        assert log.details["platform_action"] == "user_password_reset"
        assert log.tenant_id == TENANT_ID
        assert "V@lid1234567" not in str(log.details)


# ── Editar terreiro: limpar descrição ────────────────────────────────────────

def _tenant_dict(**over):
    base = {
        "id": str(TENANT_ID), "slug": "t", "name": "Terreiro", "description": "Antiga",
        "is_active": True, "created_at": "2026-01-01T00:00:00", "updated_at": "2026-01-01T00:00:00",
    }
    base.update(over)
    return base


@patch("src.api.v1.platform.tenants.TenantService")
class TestUpdateTenant:
    async def test_description_null_limpa(self, MockSvc):
        from src.api.v1.platform.tenants import UpdateTenantRequest, update_tenant

        svc = MockSvc.return_value
        svc.get_tenant = AsyncMock(return_value=_tenant_dict())
        svc.update_tenant = AsyncMock(return_value=_tenant_dict(description=None))
        db = _db()

        req = UpdateTenantRequest.model_validate({"description": None})
        resp = await update_tenant(TENANT_ID, req, _super_admin(), db)

        svc.update_tenant.assert_awaited_once_with(TENANT_ID, description=None)
        assert resp.description is None
        (log,) = _added_audit_logs(db)
        assert log.details["previous_values"] == {"description": "Antiga"}
        assert log.details["new_values"] == {"description": None}

    async def test_campo_ausente_nao_e_enviado(self, MockSvc):
        from src.api.v1.platform.tenants import UpdateTenantRequest, update_tenant

        svc = MockSvc.return_value
        svc.get_tenant = AsyncMock(return_value=_tenant_dict())
        svc.update_tenant = AsyncMock(return_value=_tenant_dict(name="Novo"))

        await update_tenant(TENANT_ID, UpdateTenantRequest(name="Novo"), _super_admin(), _db())
        svc.update_tenant.assert_awaited_once_with(TENANT_ID, name="Novo")

    async def test_nome_nulo_recusado(self, MockSvc):
        from src.api.v1.platform.tenants import UpdateTenantRequest, update_tenant

        req = UpdateTenantRequest.model_validate({"name": None})
        with pytest.raises(HTTPException) as exc:
            await update_tenant(TENANT_ID, req, _super_admin(), _db())
        assert exc.value.status_code == 422


def test_novo_terreiro_sem_data_retention_days():
    from src.api.v1.platform.tenants import CreateTenantRequest

    assert "data_retention_days" not in CreateTenantRequest.model_fields
