"""Tests for admin endpoints: tickets, bulk, analytics, audit, config, exports, health, users, validate."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from starlette.requests import Request as StarletteRequest

from src.core.errors import InsufficientPermissionsError, NotFoundError
from src.models import PlanType
from tests.conftest import TENANT_ID, USER_ID, GIRA_ID, TICKET_ID


def _fake_request() -> StarletteRequest:
    """Minimal real Starlette Request — satisfies slowapi's isinstance check
    on rate-limited endpoints (bulk_mark_used/bulk_cancel), which a MagicMock
    fails since slowapi validates the type explicitly."""
    return StarletteRequest({
        "type": "http",
        "method": "POST",
        "path": "/",
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 12345),
    })


def _admin_user():
    user = MagicMock()
    user.id = USER_ID
    user.tenant_id = TENANT_ID
    user.is_admin = True
    user.is_operator_or_admin = True
    return user


def _operator_user():
    user = MagicMock()
    user.id = USER_ID
    user.tenant_id = TENANT_ID
    user.is_admin = False
    user.is_operator_or_admin = False
    return user


# ── tickets_list.py ──────────────────────────────────────────────────────────

class TestListGiraTickets:
    async def test_non_admin_raises(self):
        from src.api.v1.admin.tickets_list import list_gira_tickets
        with pytest.raises(InsufficientPermissionsError):
            await list_gira_tickets(GIRA_ID, 0, 50, None, _operator_user(), AsyncMock())

    async def test_success(self):
        from src.api.v1.admin.tickets_list import list_gira_tickets
        db = AsyncMock()
        count_result = MagicMock()
        count_result.scalars.return_value.all.return_value = []
        items_result = MagicMock()
        items_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(side_effect=[count_result, items_result])
        result = await list_gira_tickets(GIRA_ID, 0, 50, None, _admin_user(), db)
        assert result.total == 0
        assert result.items == []


class TestGetTicket:
    async def test_non_admin_raises(self):
        from src.api.v1.admin.tickets_list import get_ticket
        with pytest.raises(InsufficientPermissionsError):
            await get_ticket(TICKET_ID, _operator_user(), AsyncMock())

    async def test_not_found(self):
        from src.api.v1.admin.tickets_list import get_ticket
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        db.execute.return_value = result
        with pytest.raises(NotFoundError):
            await get_ticket(TICKET_ID, _admin_user(), db)

    async def test_success(self):
        from src.api.v1.admin.tickets_list import get_ticket
        db = AsyncMock()
        db.refresh = AsyncMock()
        ticket = MagicMock()
        ticket.id = TICKET_ID
        ticket.numero = 1
        ticket.status = "emitted"
        ticket.consulente.nome = "Maria Silva"
        ticket.consulente.email = "maria@example.com"
        ticket.consulente.telefone = None
        ticket.is_sponsor = False
        ticket.is_walk_in = False
        ticket.observacoes = None
        ticket.chamado_em = datetime(2026, 1, 1, tzinfo=timezone.utc)
        ticket.finalizado_em = None
        ticket.medium_nome = None
        ticket.cambone_nome = None
        ticket.atendimento_descricao = None
        ticket.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        ticket.resend_email_id = None
        ticket.email_sent_at = None
        ticket.email_provider = None
        result = MagicMock()
        result.scalar_one_or_none.return_value = ticket
        db.execute.return_value = result
        resp = await get_ticket(TICKET_ID, _admin_user(), db)
        assert resp.id == TICKET_ID
        assert resp.consulente_nome == "Maria Silva"


# ── tickets_bulk.py ──────────────────────────────────────────────────────────

class TestBulkMarkUsed:
    async def test_non_admin_raises(self):
        from src.api.v1.admin.tickets_bulk import bulk_mark_used, BulkOperationRequest
        with pytest.raises(InsufficientPermissionsError):
            await bulk_mark_used(_fake_request(), GIRA_ID, BulkOperationRequest(ticket_ids=[TICKET_ID]), _operator_user(), AsyncMock())

    @patch("src.api.v1.admin.tickets_bulk.AuditService")
    @patch("src.api.v1.admin.tickets_bulk.SenhaControlRepositoryExtended")
    async def test_success(self, MockRepo, MockAudit):
        db = AsyncMock()
        repo_inst = AsyncMock()
        repo_inst.bulk_mark_used.return_value = {"modified": 1, "failed": 0, "errors": []}
        MockRepo.return_value = repo_inst
        MockAudit.return_value = AsyncMock()

        from src.api.v1.admin.tickets_bulk import bulk_mark_used, BulkOperationRequest
        result = await bulk_mark_used(
            _fake_request(), GIRA_ID, BulkOperationRequest(ticket_ids=[TICKET_ID]), _admin_user(), db,
        )
        assert result.modified == 1
        db.commit.assert_called_once()


class TestBulkCancel:
    @patch("src.api.v1.admin.tickets_bulk.AuditService")
    @patch("src.api.v1.admin.tickets_bulk.SenhaControlRepositoryExtended")
    async def test_success(self, MockRepo, MockAudit):
        db = AsyncMock()
        repo_inst = AsyncMock()
        repo_inst.bulk_cancel.return_value = {"modified": 2, "failed": 0, "errors": []}
        MockRepo.return_value = repo_inst
        MockAudit.return_value = AsyncMock()

        from src.api.v1.admin.tickets_bulk import bulk_cancel, BulkOperationRequest
        result = await bulk_cancel(
            _fake_request(), GIRA_ID, BulkOperationRequest(ticket_ids=[TICKET_ID, uuid.uuid4()]), _admin_user(), db,
        )
        assert result.modified == 2


# ── analytics.py ─────────────────────────────────────────────────────────────

class TestGetAnalytics:
    async def test_non_admin_raises(self):
        from src.api.v1.admin.analytics import get_analytics
        with pytest.raises(InsufficientPermissionsError):
            await get_analytics(None, None, None, _operator_user(), AsyncMock())

    @patch("src.api.v1.admin.analytics.TicketAnalyticsRepository")
    async def test_success(self, MockRepo):
        repo_inst = AsyncMock()
        repo_inst.get_total_stats.return_value = {
            "total_emitted": 100, "total_used": 50,
            "total_cancelled": 5, "usage_rate": 0.5,
        }
        repo_inst.get_today_stats.return_value = {"emitted_today": 10, "used_today": 5}
        repo_inst.get_daily_distribution.return_value = []
        repo_inst.get_peak_hours.return_value = []
        repo_inst.get_category_breakdown.return_value = {"common": 40, "sponsor": 5, "walk_in": 5}
        MockRepo.return_value = repo_inst

        from src.api.v1.admin.analytics import get_analytics
        result = await get_analytics(None, None, None, _admin_user(), AsyncMock())
        assert result.total_emitted == 100
        assert result.total_used == 50
        assert result.walk_in_total == 5


# ── audit_trail.py ───────────────────────────────────────────────────────────

class TestListAuditLogs:
    async def test_non_admin_raises(self):
        from src.api.v1.admin.audit_trail import list_audit_logs
        with pytest.raises(InsufficientPermissionsError):
            await list_audit_logs(0, 50, None, None, None, _operator_user(), AsyncMock())

    @patch("src.api.v1.admin.audit_trail.AuditLogRepository")
    async def test_success(self, MockRepo):
        repo_inst = AsyncMock()
        repo_inst.list_filtered.return_value = []
        repo_inst.count_filtered.return_value = 0
        MockRepo.return_value = repo_inst

        from src.api.v1.admin.audit_trail import list_audit_logs
        result = await list_audit_logs(0, 50, None, None, None, _admin_user(), AsyncMock())
        assert result.total == 0
        assert result.items == []


# ── config.py ────────────────────────────────────────────────────────────────

def _mock_tenant_config():
    """MagicMock satisfying TenantConfigResponse's from_orm validation — every
    Optional[str] field needs an explicit string/None, otherwise pydantic
    rejects the auto-generated MagicMock child for that attribute."""
    config = MagicMock()
    config.logo_url = None
    config.logo_data = None
    config.primary_color = "#1976d2"
    config.secondary_color = "#dc004e"
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
    return config


class TestGetDoorConfig:
    """GET /door/config — exposes enable_walk_in under PORTA instead of CONFIGURACOES."""

    async def test_enable_walk_in_true(self):
        from src.api.v1.admin.door_control import get_door_config
        db = AsyncMock()
        config = MagicMock()
        config.enable_walk_in = True
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = config
        db.execute.return_value = result_mock

        result = await get_door_config(_operator_user(), db)
        assert result.enable_walk_in is True

    async def test_enable_walk_in_false(self):
        from src.api.v1.admin.door_control import get_door_config
        db = AsyncMock()
        config = MagicMock()
        config.enable_walk_in = False
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = config
        db.execute.return_value = result_mock

        result = await get_door_config(_operator_user(), db)
        assert result.enable_walk_in is False

    async def test_no_tenant_config_defaults_false(self):
        from src.api.v1.admin.door_control import get_door_config
        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = None
        db.execute.return_value = result_mock

        result = await get_door_config(_operator_user(), db)
        assert result.enable_walk_in is False


class TestGetTenantConfig:
    async def test_non_admin_raises(self):
        from src.api.v1.admin.config import get_tenant_config
        with pytest.raises(InsufficientPermissionsError):
            await get_tenant_config(MagicMock(), _operator_user(), AsyncMock())

    @patch("src.api.v1.admin.config.TenantConfigRepository")
    async def test_success(self, MockRepo):
        repo_inst = AsyncMock()
        config = _mock_tenant_config()
        config.primary_color = "#1976d2"
        repo_inst.get_by_tenant.return_value = config
        MockRepo.return_value = repo_inst

        from src.api.v1.admin.config import get_tenant_config
        result = await get_tenant_config(MagicMock(), _admin_user(), AsyncMock())
        assert result.primary_color == "#1976d2"


class TestGetTenantBranding:
    """GET /tenant/branding — logo/cores sem gate de CONFIGURACOES (só autenticação)."""

    async def test_non_admin_raises(self):
        from src.api.v1.admin.config import get_tenant_branding
        with pytest.raises(InsufficientPermissionsError):
            await get_tenant_branding(MagicMock(), _operator_user(), AsyncMock())

    @patch("src.api.v1.admin.config.TenantConfigRepository")
    async def test_success_with_font_color(self, MockRepo):
        repo_inst = AsyncMock()
        config = _mock_tenant_config()
        config.custom_settings = {"font_color": "#FFFFFF"}
        repo_inst.get_by_tenant.return_value = config
        MockRepo.return_value = repo_inst

        db = AsyncMock()
        tenant_result = MagicMock()
        tenant_result.scalar_one_or_none.return_value = "Terreiro Teste"
        db.execute.return_value = tenant_result

        from src.api.v1.admin.config import get_tenant_branding
        result = await get_tenant_branding(MagicMock(), _admin_user(), db)
        assert result.primary_color == "#1976d2"
        assert result.font_color == "#FFFFFF"

    @patch("src.api.v1.admin.config.TenantConfigRepository")
    async def test_success_no_custom_settings(self, MockRepo):
        repo_inst = AsyncMock()
        config = _mock_tenant_config()
        config.custom_settings = None
        repo_inst.get_by_tenant.return_value = config
        MockRepo.return_value = repo_inst

        db = AsyncMock()
        tenant_result = MagicMock()
        tenant_result.scalar_one_or_none.return_value = "Terreiro Teste"
        db.execute.return_value = tenant_result

        from src.api.v1.admin.config import get_tenant_branding
        result = await get_tenant_branding(MagicMock(), _admin_user(), db)
        assert result.font_color is None

    async def test_no_tenant_id_returns_defaults(self):
        from src.api.v1.admin.config import get_tenant_branding
        user = _admin_user()
        user.tenant_id = None
        result = await get_tenant_branding(MagicMock(), user, AsyncMock())
        assert result.primary_color == "#6366f1"
        assert result.font_color is None


class TestUpdateTenantConfig:
    @patch("src.api.v1.admin.config.AuditService")
    @patch("src.api.v1.admin.config.TenantConfigRepository")
    async def test_success(self, MockRepo, MockAudit):
        db = AsyncMock()
        repo_inst = AsyncMock()
        config = _mock_tenant_config()
        config.primary_color = "#ff0000"
        repo_inst.get_by_tenant.return_value = config
        repo_inst.update_branding.return_value = config
        repo_inst.update_email_config.return_value = config
        repo_inst.update_feature_config.return_value = config
        MockRepo.return_value = repo_inst
        MockAudit.return_value = AsyncMock()

        from src.api.v1.admin.config import update_tenant_config, TenantConfigUpdate
        result = await update_tenant_config(
            TenantConfigUpdate(primary_color="#ff0000"), MagicMock(), _admin_user(), db,
        )
        assert result.primary_color == "#ff0000"

    @patch("src.api.v1.admin.config.AuditService")
    @patch("src.api.v1.admin.config.TenantConfigRepository")
    async def test_enable_time_slot_scheduling_no_plan_gate(self, MockRepo, MockAudit):
        """Unlike enable_waitlist, this toggle has no plan-tier check — every plan can use it."""
        db = AsyncMock()
        repo_inst = AsyncMock()
        config = _mock_tenant_config()
        config.enable_time_slot_scheduling = True
        repo_inst.get_by_tenant.return_value = config
        repo_inst.toggle_feature = AsyncMock(return_value=config)
        MockRepo.return_value = repo_inst
        MockAudit.return_value = AsyncMock()

        from src.api.v1.admin.config import update_tenant_config, TenantConfigUpdate
        result = await update_tenant_config(
            TenantConfigUpdate(enable_time_slot_scheduling=True), MagicMock(), _admin_user(), db,
        )
        repo_inst.toggle_feature.assert_awaited_once_with(
            tenant_id=TENANT_ID, feature_flag="enable_time_slot_scheduling", enabled=True,
        )
        assert result.enable_time_slot_scheduling is True


# ── exports.py ───────────────────────────────────────────────────────────────

class TestExportsCSV:
    async def test_non_admin_raises(self):
        from src.api.v1.admin.exports import export_tickets_csv
        with pytest.raises(InsufficientPermissionsError):
            await export_tickets_csv(GIRA_ID, _operator_user(), AsyncMock())

    async def test_success(self):
        from src.api.v1.admin.exports import export_tickets_csv
        db = AsyncMock()
        ticket = MagicMock()
        ticket.numero = 1
        ticket.consulente_nome = "Test"
        ticket.consulente_email = "t@t.com"
        ticket.status = MagicMock(value="emitted")
        ticket.emitted_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        ticket.used_at = None
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = [ticket]
        db.execute.return_value = result_mock
        resp = await export_tickets_csv(GIRA_ID, _admin_user(), db)
        assert resp.media_type == "text/csv"


# ── health.py ────────────────────────────────────────────────────────────────

class TestHealthCheck:
    async def test_non_admin_raises(self):
        from src.api.v1.admin.health import health_check
        with pytest.raises(InsufficientPermissionsError):
            await health_check(_operator_user(), AsyncMock())

    @patch("src.api.v1.admin.health.ResendEmailService")
    @patch("src.api.v1.admin.health.BrevoEmailService")
    async def test_success(self, MockBrevo, MockResend):
        from src.api.v1.admin.health import health_check
        db = AsyncMock()
        exec_result = MagicMock()
        exec_result.scalar.return_value = 1
        db.execute.return_value = exec_result
        brevo = MagicMock()
        brevo.api_key = "test-key"
        resend = MagicMock()
        resend.api_key = "test-key"
        MockBrevo.return_value = brevo
        MockResend.return_value = resend

        result = await health_check(_admin_user(), db)
        assert result.overall_status == "ok"


# ── users.py ─────────────────────────────────────────────────────────────────

def _mock_user_model():
    u = MagicMock()
    u.id = USER_ID
    u.tenant_id = TENANT_ID
    u.email = "user@test.com"
    u.username = "testuser"
    u.role = "admin"
    u.is_active = True
    u.created_at = "2026-01-01T00:00:00+00:00"
    u.updated_at = "2026-01-01T00:00:00+00:00"
    u.last_login = None
    return u


class TestCreateUser:
    @patch("src.api.v1.admin.users.SubscriptionRepository")
    @patch("src.api.v1.admin.users.AuditService")
    @patch("src.api.v1.admin.users.hash_password")
    @patch("src.api.v1.admin.users.UserRepository")
    async def test_success(self, MockRepo, mock_hash, MockAudit, MockSubRepo):
        from src.api.v1.admin.users import create_user, UserCreate
        db = AsyncMock()
        repo_inst = AsyncMock()
        repo_inst.get_by_email.return_value = None
        repo_inst.get_by_email_including_deleted.return_value = None
        repo_inst.create.return_value = _mock_user_model()
        MockRepo.return_value = repo_inst
        mock_hash.return_value = "hashed"
        MockAudit.return_value = AsyncMock()
        sub_repo_inst = AsyncMock()
        sub_repo_inst.get_by_tenant.return_value = None
        MockSubRepo.return_value = sub_repo_inst

        result = await create_user(
            UserCreate(email="user@test.com", username="testuser", password="SecureP@ss1234"),
            _admin_user(), db,
        )
        assert result.email == "user@test.com"
        db.commit.assert_called_once()

    async def test_non_admin_raises(self):
        from src.api.v1.admin.users import create_user, UserCreate
        with pytest.raises(InsufficientPermissionsError):
            await create_user(
                UserCreate(email="a@b.com", username="testx", password="P@ss12345678"),
                _operator_user(), AsyncMock(),
            )


class TestListUsers:
    @patch("src.api.v1.admin.users.UserRepository")
    async def test_success(self, MockRepo):
        from src.api.v1.admin.users import list_users
        repo_inst = AsyncMock()
        user_mock = _mock_user_model()
        repo_inst.list.return_value = [user_mock]
        MockRepo.return_value = repo_inst

        result = await list_users(0, 50, None, _admin_user(), AsyncMock())
        assert len(result) == 1
        assert result[0].email == "user@test.com"


class TestGetUser:
    @patch("src.api.v1.admin.users.UserRepository")
    async def test_not_found(self, MockRepo):
        from src.api.v1.admin.users import get_user
        repo_inst = AsyncMock()
        repo_inst.get_by_id.return_value = None
        MockRepo.return_value = repo_inst

        with pytest.raises(NotFoundError):
            await get_user(USER_ID, _admin_user(), AsyncMock())


class TestUpdateUser:
    @patch("src.api.v1.admin.users.AuditService")
    @patch("src.api.v1.admin.users.UserRepository")
    async def test_success(self, MockRepo, MockAudit):
        from src.api.v1.admin.users import update_user, UserUpdate
        db = AsyncMock()
        repo_inst = AsyncMock()
        existing = _mock_user_model()
        repo_inst.get_by_id.return_value = existing
        MockRepo.return_value = repo_inst
        MockAudit.return_value = AsyncMock()
        # After refresh, the existing mock should still be valid
        db.refresh = AsyncMock()

        result = await update_user(USER_ID, UserUpdate(username="updated_user"), _admin_user(), db)
        # The function sets attr on existing_user then returns from_orm(existing_user)
        assert result is not None

    @patch("src.api.v1.admin.users.AuditService")
    @patch("src.api.v1.admin.users.UserRepository")
    async def test_password_change_revokes_existing_sessions(self, MockRepo, MockAudit):
        from src.api.v1.admin.users import update_user, UserUpdate
        db = AsyncMock()
        repo_inst = AsyncMock()
        existing = _mock_user_model()
        existing.sessions_revoked_at = None
        repo_inst.get_by_id.return_value = existing
        MockRepo.return_value = repo_inst
        MockAudit.return_value = AsyncMock()
        db.refresh = AsyncMock()

        with patch("src.api.v1.admin.users.session_service.end_all_sessions", new=AsyncMock()) as mock_end_all:
            await update_user(USER_ID, UserUpdate(password="NewPass456!"), _admin_user(), db)

        assert existing.sessions_revoked_at is not None
        mock_end_all.assert_awaited_once_with(db, existing.id)


class TestDeleteUser:
    @patch("src.api.v1.admin.users.AuditService")
    @patch("src.api.v1.admin.users.UserRepository")
    async def test_success(self, MockRepo, MockAudit):
        from src.api.v1.admin.users import delete_user
        db = AsyncMock()
        repo_inst = AsyncMock()
        repo_inst.delete_soft.return_value = True
        MockRepo.return_value = repo_inst
        MockAudit.return_value = AsyncMock()

        await delete_user(USER_ID, _admin_user(), db)
        db.commit.assert_called_once()


# ── validate_bulk.py ─────────────────────────────────────────────────────────

class TestValidateBulk:
    async def test_non_admin_raises(self):
        from src.api.v1.admin.validate_bulk import validate_bulk_operation, ValidateBulkRequest
        with pytest.raises(InsufficientPermissionsError):
            await validate_bulk_operation(
                ValidateBulkRequest(ticket_ids=[TICKET_ID], operation="mark_used"),
                _operator_user(), AsyncMock(),
            )

    @patch("src.api.v1.admin.validate_bulk.SenhaControlRepositoryExtended")
    async def test_success(self, MockRepo):
        from src.api.v1.admin.validate_bulk import validate_bulk_operation, ValidateBulkRequest
        repo_inst = AsyncMock()
        repo_inst.bulk_mark_used.return_value = {"modified": 1, "failed": 0, "errors": []}
        MockRepo.return_value = repo_inst

        result = await validate_bulk_operation(
            ValidateBulkRequest(ticket_ids=[TICKET_ID], operation="mark_used"),
            _admin_user(), AsyncMock(),
        )
        assert result.valid is True


# ── email_resend.py ──────────────────────────────────────────────────────────

def _mock_ticket_row():
    t = MagicMock()
    t.id = TICKET_ID
    t.numero = 1
    t.gira_id = GIRA_ID
    t.consulente_id = uuid.uuid4()
    t.is_sponsor = False
    t.priority_category = None
    return t


def _mock_consulente_row():
    c = MagicMock()
    c.nome = "Maria Silva"
    c.email = "maria@example.com"
    c.telefone = None
    return c


def _mock_gira_row(recados=None):
    g = MagicMock()
    g.nome = "Gira de Caboclos"
    g.data_inicio = datetime(2026, 7, 1, tzinfo=timezone.utc)
    g.local = "Salão principal"
    g.recados = recados
    return g


def _mock_tenant_row():
    t = MagicMock()
    t.slug = "terreiro-modelo"
    t.name = "Terreiro Modelo"
    return t


class TestResendTicketEmail:
    async def test_non_admin_raises(self):
        from src.api.v1.admin.email_resend import resend_ticket_email
        with pytest.raises(InsufficientPermissionsError):
            await resend_ticket_email(TICKET_ID, _operator_user(), AsyncMock())

    async def test_ticket_not_found(self):
        from src.api.v1.admin import email_resend as mod
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        db.execute.return_value = result
        sub = MagicMock()
        sub.plan = PlanType.PREMIUM
        with patch.object(mod, "SubscriptionRepository") as MockSubRepo:
            sub_repo_inst = AsyncMock()
            sub_repo_inst.get_by_tenant.return_value = sub
            MockSubRepo.return_value = sub_repo_inst
            with pytest.raises(NotFoundError):
                await mod.resend_ticket_email(TICKET_ID, _admin_user(), db)

    async def _run_resend_success(self, recados):
        """Drives resend_ticket_email through a full success path and returns
        the kwargs the email template functions were called with."""
        from src.api.v1.admin import email_resend as mod
        from src.api.v1.admin.email_resend import resend_ticket_email

        db = AsyncMock()

        def _result_for(value):
            r = MagicMock()
            r.scalar_one_or_none.return_value = value
            return r

        db.execute = AsyncMock(
            side_effect=[
                _result_for(_mock_ticket_row()),       # Ticket
                _result_for(_mock_consulente_row()),   # Consulente
                _result_for(_mock_gira_row(recados)),  # Gira
                _result_for(_mock_tenant_row()),       # Tenant
                _result_for(None),                     # TenantConfig
            ]
        )

        sub = MagicMock()
        sub.plan = PlanType.PREMIUM

        with patch.object(mod, "generate_ticket_emission_html", return_value="<html></html>") as mock_html, \
             patch.object(mod, "generate_plain_text_fallback", return_value="text") as mock_text, \
             patch.object(mod, "SubscriptionRepository") as MockSubRepo, \
             patch.object(mod.email_queue, "enqueue"):
            sub_repo_inst = AsyncMock()
            sub_repo_inst.get_by_tenant.return_value = sub
            MockSubRepo.return_value = sub_repo_inst

            result = await resend_ticket_email(TICKET_ID, _admin_user(), db)

        assert result.success is True
        return mock_html, mock_text

    async def test_success_forwards_gira_recados_to_email(self):
        mock_html, mock_text = await self._run_resend_success(
            recados="Investimento sugerido: R$ 20."
        )
        assert mock_html.call_args.kwargs["recados"] == "Investimento sugerido: R$ 20."
        assert mock_text.call_args.kwargs["recados"] == "Investimento sugerido: R$ 20."

    async def test_success_without_recados_passes_none(self):
        mock_html, mock_text = await self._run_resend_success(recados=None)
        assert mock_html.call_args.kwargs["recados"] is None
        assert mock_text.call_args.kwargs["recados"] is None
