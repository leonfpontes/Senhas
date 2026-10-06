"""Gate de plano da marca (tema_personalizado) e tenant_nome nas respostas de config.

- Mudar cor principal/de apoio/cor do texto exige o plano com tema_personalizado.
- A tela reenvia as cores em todo salvamento: sem mudança real, plano menor
  continua salvando os demais campos.
- Enviar logo exige o plano; remover nunca.
- Operador com CONFIGURACOES:edit (grupo) não leva 403 por não ser admin.
- PUT /tenant/config e POST/DELETE /tenant/logo devolvem tenant_nome.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from tests.conftest import TENANT_ID, USER_ID


def _user(is_admin=True):
    user = MagicMock()
    user.id = USER_ID
    user.tenant_id = TENANT_ID
    user.is_admin = is_admin
    user.is_operator_or_admin = True
    return user


def _config(**overrides):
    config = MagicMock()
    config.tenant_id = TENANT_ID
    config.logo_url = None
    config.logo_data = None
    config.primary_color = "#1976D2"
    config.secondary_color = "#DC004E"
    config.endereco = None
    config.tenant_nome = None
    config.reply_to_email = None
    config.email_signature = None
    config.enable_bulk_operations = True
    config.enable_analytics = True
    config.enable_walk_in = False
    config.custom_settings = None
    config.sponsor_priority_mode = "first"
    config.validate_associado_on_emit = False
    config.enable_estoque_log = True
    config.enable_mensalidade_associado = False
    config.enable_waitlist = False
    config.enable_time_slot_scheduling = False
    for k, v in overrides.items():
        setattr(config, k, v)
    return config


def _db_with_tenant_name(name="Terreiro Teste"):
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = name
    db.execute.return_value = result
    return db


def _sub(plan):
    from src.models.subscriptions import SubscriptionStatus
    return MagicMock(plan=plan, status=SubscriptionStatus.ACTIVE, is_trial=False, is_bonus=False)


@patch("src.api.dependencies.SubscriptionRepository")
@patch("src.api.v1.admin.config.AuditService")
@patch("src.api.v1.admin.config.TenantConfigRepository")
class TestBrandingGateOnPut:
    async def test_basic_plan_cannot_change_primary_color(self, MockRepo, MockAudit, MockSubRepo):
        from src.models.subscriptions import PlanType
        from src.api.v1.admin.config import TenantConfigUpdate, update_tenant_config

        MockRepo.return_value = AsyncMock(get_by_tenant=AsyncMock(return_value=_config()))
        MockAudit.return_value = AsyncMock()
        MockSubRepo.return_value.get_by_tenant = AsyncMock(return_value=_sub(PlanType.BASIC))

        with pytest.raises(HTTPException) as exc:
            await update_tenant_config(
                TenantConfigUpdate(primary_color="#000000"), MagicMock(), _user(), _db_with_tenant_name()
            )
        assert exc.value.status_code == 403
        assert "Cores e logo" in exc.value.detail
        MockRepo.return_value.update_branding.assert_not_called()

    async def test_basic_plan_cannot_change_font_color(self, MockRepo, MockAudit, MockSubRepo):
        from src.models.subscriptions import PlanType
        from src.api.v1.admin.config import TenantConfigUpdate, update_tenant_config

        MockRepo.return_value = AsyncMock(get_by_tenant=AsyncMock(return_value=_config()))
        MockAudit.return_value = AsyncMock()
        MockSubRepo.return_value.get_by_tenant = AsyncMock(return_value=_sub(PlanType.BASIC))

        with pytest.raises(HTTPException) as exc:
            await update_tenant_config(
                TenantConfigUpdate(custom_settings={"font_color": "#111111"}),
                MagicMock(), _user(), _db_with_tenant_name(),
            )
        assert exc.value.status_code == 403

    async def test_basic_plan_saves_other_fields_when_colors_unchanged(self, MockRepo, MockAudit, MockSubRepo):
        """A tela reenvia as cores atuais (e a cor de texto padrão) em todo salvamento."""
        from src.models.subscriptions import PlanType
        from src.api.v1.admin.config import TenantConfigUpdate, update_tenant_config

        repo = AsyncMock(get_by_tenant=AsyncMock(return_value=_config()))
        MockRepo.return_value = repo
        MockAudit.return_value = AsyncMock()
        MockSubRepo.return_value.get_by_tenant = AsyncMock(return_value=_sub(PlanType.BASIC))

        result = await update_tenant_config(
            TenantConfigUpdate(
                primary_color="#1976d2",
                secondary_color="#dc004e",
                custom_settings={"font_color": "#ffffff"},
                endereco="Rua Nova, 1",
            ),
            MagicMock(), _user(), _db_with_tenant_name(),
        )
        assert result.tenant_nome == "Terreiro Teste"
        MockSubRepo.assert_not_called()

    async def test_pro_plan_can_change_colors(self, MockRepo, MockAudit, MockSubRepo):
        from src.models.subscriptions import PlanType
        from src.api.v1.admin.config import TenantConfigUpdate, update_tenant_config

        repo = AsyncMock(get_by_tenant=AsyncMock(return_value=_config()))
        MockRepo.return_value = repo
        MockAudit.return_value = AsyncMock()
        MockSubRepo.return_value.get_by_tenant = AsyncMock(return_value=_sub(PlanType.PRO))

        await update_tenant_config(
            TenantConfigUpdate(primary_color="#000000"), MagicMock(), _user(), _db_with_tenant_name()
        )
        repo.update_branding.assert_awaited_once()

    async def test_operator_with_group_permission_is_not_blocked_as_non_admin(self, MockRepo, MockAudit, MockSubRepo):
        from src.api.v1.admin.config import TenantConfigUpdate, update_tenant_config

        MockRepo.return_value = AsyncMock(get_by_tenant=AsyncMock(return_value=_config()))
        MockAudit.return_value = AsyncMock()

        result = await update_tenant_config(
            TenantConfigUpdate(endereco="Rua X"), MagicMock(), _user(is_admin=False), _db_with_tenant_name()
        )
        assert result is not None


@patch("src.api.dependencies.SubscriptionRepository")
@patch("src.api.v1.admin.config.TenantConfigRepository")
class TestLogoGate:
    async def test_upload_requires_theme_plan(self, MockRepo, MockSubRepo):
        from src.models.subscriptions import PlanType
        from src.api.v1.admin.config import upload_tenant_logo

        MockRepo.return_value = AsyncMock(get_by_tenant=AsyncMock(return_value=_config()))
        MockSubRepo.return_value.get_by_tenant = AsyncMock(return_value=_sub(PlanType.BASIC))
        file = MagicMock(content_type="image/png")
        file.read = AsyncMock(return_value=b"png")

        with pytest.raises(HTTPException) as exc:
            await upload_tenant_logo(MagicMock(), file, _user(), _db_with_tenant_name())
        assert exc.value.status_code == 403
        file.read.assert_not_awaited()

    async def test_upload_on_pro_returns_tenant_nome(self, MockRepo, MockSubRepo):
        from src.models.subscriptions import PlanType
        from src.api.v1.admin.config import upload_tenant_logo

        MockRepo.return_value = AsyncMock(get_by_tenant=AsyncMock(return_value=_config()))
        MockSubRepo.return_value.get_by_tenant = AsyncMock(return_value=_sub(PlanType.PRO))
        file = MagicMock(content_type="image/png")
        file.read = AsyncMock(return_value=b"png")
        request = MagicMock()
        request.base_url = "http://api/"

        result = await upload_tenant_logo(request, file, _user(is_admin=False), _db_with_tenant_name())
        assert result.tenant_nome == "Terreiro Teste"

    async def test_delete_never_checks_plan_and_returns_tenant_nome(self, MockRepo, MockSubRepo):
        from src.api.v1.admin.config import delete_tenant_logo

        MockRepo.return_value = AsyncMock(get_by_tenant=AsyncMock(return_value=_config()))

        result = await delete_tenant_logo(MagicMock(), _user(is_admin=False), _db_with_tenant_name())
        assert result.tenant_nome == "Terreiro Teste"
        MockSubRepo.assert_not_called()
