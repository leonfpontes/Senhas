"""Tests for admin endpoints: tickets, bulk, analytics, audit, config, exports, health, users, validate."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.core.errors import InsufficientPermissionsError, NotFoundError
from tests.conftest import TENANT_ID, USER_ID, GIRA_ID, TICKET_ID


def _admin_user():
    user = MagicMock()
    user.id = USER_ID
    user.tenant_id = TENANT_ID
    user.is_admin = True
    return user


def _operator_user():
    user = MagicMock()
    user.id = USER_ID
    user.tenant_id = TENANT_ID
    user.is_admin = False
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
        ticket = MagicMock()
        ticket.id = TICKET_ID
        ticket.numero = 1
        ticket.status = "emitted"
        ticket.email = "t@t.com"
        ticket.name = "Test"
        ticket.chamado_em = datetime(2026, 1, 1, tzinfo=timezone.utc)
        ticket.finalizado_em = None
        ticket.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        result = MagicMock()
        result.scalar_one_or_none.return_value = ticket
        db.execute.return_value = result
        resp = await get_ticket(TICKET_ID, _admin_user(), db)
        assert resp.id == TICKET_ID


# ── tickets_bulk.py ──────────────────────────────────────────────────────────

class TestBulkMarkUsed:
    async def test_non_admin_raises(self):
        from src.api.v1.admin.tickets_bulk import bulk_mark_used, BulkOperationRequest
        with pytest.raises(InsufficientPermissionsError):
            await bulk_mark_used(GIRA_ID, BulkOperationRequest(ticket_ids=[TICKET_ID]), _operator_user(), AsyncMock())

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
            GIRA_ID, BulkOperationRequest(ticket_ids=[TICKET_ID]), _admin_user(), db,
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
            GIRA_ID, BulkOperationRequest(ticket_ids=[TICKET_ID, uuid.uuid4()]), _admin_user(), db,
        )
        assert result.modified == 2


# ── analytics.py ─────────────────────────────────────────────────────────────

class TestGetAnalytics:
    async def test_non_admin_raises(self):
        from src.api.v1.admin.analytics import get_analytics
        with pytest.raises(InsufficientPermissionsError):
            await get_analytics("week", None, _operator_user(), AsyncMock())

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
        MockRepo.return_value = repo_inst

        from src.api.v1.admin.analytics import get_analytics
        result = await get_analytics("week", None, _admin_user(), AsyncMock())
        assert result.total_emitted == 100
        assert result.total_used == 50


# ── audit_trail.py ───────────────────────────────────────────────────────────

class TestListAuditLogs:
    async def test_non_admin_raises(self):
        from src.api.v1.admin.audit_trail import list_audit_logs
        with pytest.raises(InsufficientPermissionsError):
            await list_audit_logs(0, 50, None, None, None, _operator_user(), AsyncMock())

    @patch("src.api.v1.admin.audit_trail.AuditLogRepository")
    async def test_success(self, MockRepo):
        repo_inst = AsyncMock()
        repo_inst.list_filtered.return_value = ([], 0)
        MockRepo.return_value = repo_inst

        from src.api.v1.admin.audit_trail import list_audit_logs
        result = await list_audit_logs(0, 50, None, None, None, _admin_user(), AsyncMock())
        assert result.total == 0
        assert result.items == []


# ── config.py ────────────────────────────────────────────────────────────────

class TestGetTenantConfig:
    async def test_non_admin_raises(self):
        from src.api.v1.admin.config import get_tenant_config
        with pytest.raises(InsufficientPermissionsError):
            await get_tenant_config(_operator_user(), AsyncMock())

    @patch("src.api.v1.admin.config.TenantConfigRepository")
    async def test_success(self, MockRepo):
        repo_inst = AsyncMock()
        config = MagicMock()
        config.logo_url = None
        config.primary_color = "#1976d2"
        config.secondary_color = "#dc004e"
        config.reply_to_email = None
        config.email_signature = None
        config.enable_bulk_operations = True
        config.enable_analytics = True
        config.enable_webhooks = False
        config.custom_settings = None
        repo_inst.get_by_tenant.return_value = config
        MockRepo.return_value = repo_inst

        from src.api.v1.admin.config import get_tenant_config
        result = await get_tenant_config(_admin_user(), AsyncMock())
        assert result.primary_color == "#1976d2"


class TestUpdateTenantConfig:
    @patch("src.api.v1.admin.config.AuditService")
    @patch("src.api.v1.admin.config.TenantConfigRepository")
    async def test_success(self, MockRepo, MockAudit):
        db = AsyncMock()
        repo_inst = AsyncMock()
        config = MagicMock()
        config.logo_url = None
        config.primary_color = "#ff0000"
        config.secondary_color = "#dc004e"
        config.reply_to_email = None
        config.email_signature = None
        config.enable_bulk_operations = True
        config.enable_analytics = True
        config.enable_webhooks = False
        config.custom_settings = None
        repo_inst.get_by_tenant.return_value = config
        repo_inst.update_branding.return_value = config
        repo_inst.update_email_config.return_value = config
        repo_inst.update_feature_config.return_value = config
        MockRepo.return_value = repo_inst
        MockAudit.return_value = AsyncMock()

        from src.api.v1.admin.config import update_tenant_config, TenantConfigUpdate
        result = await update_tenant_config(
            TenantConfigUpdate(primary_color="#ff0000"), _admin_user(), db,
        )
        assert result.primary_color == "#ff0000"


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
    @patch("src.api.v1.admin.users.AuditService")
    @patch("src.api.v1.admin.users.hash_password")
    @patch("src.api.v1.admin.users.UserRepository")
    async def test_success(self, MockRepo, mock_hash, MockAudit):
        from src.api.v1.admin.users import create_user, UserCreate
        db = AsyncMock()
        repo_inst = AsyncMock()
        repo_inst.get_by_email.return_value = None
        repo_inst.create.return_value = _mock_user_model()
        MockRepo.return_value = repo_inst
        mock_hash.return_value = "hashed"
        MockAudit.return_value = AsyncMock()

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

class TestResendTicketEmail:
    async def test_non_admin_raises(self):
        from src.api.v1.admin.email_resend import resend_ticket_email
        with pytest.raises(InsufficientPermissionsError):
            await resend_ticket_email(TICKET_ID, MagicMock(), _operator_user(), AsyncMock())

    async def test_ticket_not_found(self):
        from src.api.v1.admin.email_resend import resend_ticket_email
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        db.execute.return_value = result
        with pytest.raises(NotFoundError):
            await resend_ticket_email(TICKET_ID, MagicMock(), _admin_user(), db)
