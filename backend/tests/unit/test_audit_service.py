"""Tests for AuditService."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.services.audit_service import AuditService
from src.models import AuditAction
from tests.conftest import TENANT_ID, USER_ID, GIRA_ID


@pytest.fixture
def audit_service(mock_db_session):
    """Create AuditService with mock DB."""
    with patch("src.services.audit_service.AuditLogRepository") as mock_repo_cls:
        mock_repo = AsyncMock()
        mock_repo.create.return_value = MagicMock(id=uuid.uuid4())
        mock_repo_cls.return_value = mock_repo
        service = AuditService(mock_db_session)
        service.repo = mock_repo
        yield service


class TestLogCreate:
    async def test_creates_audit_log(self, audit_service):
        result = await audit_service.log_create(
            tenant_id=TENANT_ID,
            user_id=USER_ID,
            resource_type="Gira",
            resource_id=GIRA_ID,
            details={"name": "Test Gira"},
        )
        assert result is not None
        audit_service.repo.create.assert_called_once()
        call_kwargs = audit_service.repo.create.call_args.kwargs
        assert call_kwargs["action"] == AuditAction.CREATE
        assert call_kwargs["resource_type"] == "Gira"

    async def test_default_details_is_empty(self, audit_service):
        await audit_service.log_create(
            tenant_id=TENANT_ID,
            user_id=USER_ID,
            resource_type="Ticket",
            resource_id=uuid.uuid4(),
        )
        call_kwargs = audit_service.repo.create.call_args.kwargs
        assert call_kwargs["details"] == {}


class TestLogUpdate:
    async def test_logs_update_with_states(self, audit_service):
        await audit_service.log_update(
            tenant_id=TENANT_ID,
            user_id=USER_ID,
            resource_type="Gira",
            resource_id=GIRA_ID,
            previous_state={"name": "Old"},
            new_state={"name": "New"},
        )
        call_kwargs = audit_service.repo.create.call_args.kwargs
        assert call_kwargs["action"] == AuditAction.UPDATE
        assert "previous_state" in call_kwargs["details"]
        assert "new_state" in call_kwargs["details"]

    async def test_default_states_are_empty(self, audit_service):
        await audit_service.log_update(
            tenant_id=TENANT_ID,
            user_id=USER_ID,
            resource_type="Gira",
            resource_id=GIRA_ID,
        )
        call_kwargs = audit_service.repo.create.call_args.kwargs
        assert call_kwargs["details"]["previous_state"] == {}
        assert call_kwargs["details"]["new_state"] == {}


class TestLogDelete:
    async def test_logs_delete(self, audit_service):
        await audit_service.log_delete(
            tenant_id=TENANT_ID,
            user_id=USER_ID,
            resource_type="Ticket",
            resource_id=uuid.uuid4(),
            previous_state={"status": "EMITTED"},
        )
        call_kwargs = audit_service.repo.create.call_args.kwargs
        assert call_kwargs["action"] == AuditAction.DELETE


class TestLogBulkOperation:
    async def test_logs_bulk_op(self, audit_service):
        ids = [str(uuid.uuid4()) for _ in range(3)]
        await audit_service.log_bulk_operation(
            tenant_id=TENANT_ID,
            user_id=USER_ID,
            operation_type="bulk_cancel",
            resource_type="Ticket",
            count=3,
            resource_ids=ids,
        )
        call_kwargs = audit_service.repo.create.call_args.kwargs
        assert call_kwargs["action"] == AuditAction.UPDATE
        assert call_kwargs["details"]["count"] == 3


class TestLogLogin:
    async def test_logs_successful_login(self, audit_service):
        await audit_service.log_login(
            tenant_id=TENANT_ID,
            user_id=USER_ID,
            success=True,
            ip_address="192.168.1.1",
        )
        call_kwargs = audit_service.repo.create.call_args.kwargs
        assert call_kwargs["action"] == AuditAction.LOGIN
        assert call_kwargs["details"]["success"] is True

    async def test_logs_failed_login(self, audit_service):
        await audit_service.log_login(
            tenant_id=TENANT_ID,
            user_id=USER_ID,
            success=False,
        )
        call_kwargs = audit_service.repo.create.call_args.kwargs
        assert call_kwargs["details"]["success"] is False


class TestLogConfigChange:
    async def test_logs_config_change(self, audit_service):
        await audit_service.log_config_change(
            tenant_id=TENANT_ID,
            user_id=USER_ID,
            config_type="branding",
            previous_values={"primary": "#000"},
            new_values={"primary": "#fff"},
        )
        call_kwargs = audit_service.repo.create.call_args.kwargs
        assert call_kwargs["action"] == AuditAction.UPDATE
        assert call_kwargs["resource_type"] == "TenantConfig"
        assert call_kwargs["details"]["config_type"] == "branding"
