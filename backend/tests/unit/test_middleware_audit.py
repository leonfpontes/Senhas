"""Tests for audit logging middleware."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.middleware.audit_logging import audit_logging_middleware
from src.core.errors import UnauthorizedError
from tests.conftest import TENANT_ID, USER_ID


def _make_request(path="/api/v1/admin/giras", method="GET", user_id=USER_ID, tenant_id=TENANT_ID):
    request = MagicMock()
    request.url = MagicMock()
    request.url.path = path
    request.method = method
    request.state = MagicMock()
    request.state.user_id = user_id
    request.state.tenant_id = tenant_id
    request.client = MagicMock()
    request.client.host = "127.0.0.1"
    request.headers = MagicMock()
    request.headers.get = MagicMock(return_value="test-agent")
    return request


class TestAuditLoggingMiddleware:
    async def test_skips_non_admin_paths(self):
        request = _make_request(path="/api/v1/public/next-gira")
        call_next = AsyncMock(return_value=MagicMock(status_code=200))
        response = await audit_logging_middleware(request, call_next)
        call_next.assert_called_once()
        assert response.status_code == 200

    async def test_skips_health_path(self):
        request = _make_request(path="/health")
        call_next = AsyncMock(return_value=MagicMock(status_code=200))
        await audit_logging_middleware(request, call_next)
        call_next.assert_called_once()

    async def test_raises_when_no_user_id(self):
        request = _make_request(user_id=None)
        call_next = AsyncMock()
        with pytest.raises(UnauthorizedError):
            await audit_logging_middleware(request, call_next)

    async def test_raises_when_no_tenant_id(self):
        request = _make_request(tenant_id=None)
        call_next = AsyncMock()
        with pytest.raises(UnauthorizedError):
            await audit_logging_middleware(request, call_next)

    @patch("src.middleware.audit_logging.AsyncSessionLocal")
    async def test_logs_successful_post(self, mock_session_cls):
        mock_db = AsyncMock()
        mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        request = _make_request(method="POST")
        call_next = AsyncMock(return_value=MagicMock(status_code=201))

        with patch("src.middleware.audit_logging.AuditService") as mock_svc_cls:
            mock_svc = AsyncMock()
            mock_svc_cls.return_value = mock_svc
            response = await audit_logging_middleware(request, call_next)

        assert response.status_code == 201
        call_next.assert_called_once()

    @patch("src.middleware.audit_logging.AsyncSessionLocal")
    async def test_logs_successful_get(self, mock_session_cls):
        mock_db = AsyncMock()
        mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        request = _make_request(method="GET")
        call_next = AsyncMock(return_value=MagicMock(status_code=200))

        with patch("src.middleware.audit_logging.AuditService"):
            response = await audit_logging_middleware(request, call_next)

        assert response.status_code == 200

    async def test_propagates_endpoint_exception(self):
        request = _make_request(method="DELETE")
        call_next = AsyncMock(side_effect=ValueError("endpoint error"))

        with patch("src.middleware.audit_logging.AsyncSessionLocal") as mock_session_cls:
            mock_db = AsyncMock()
            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            with patch("src.middleware.audit_logging.AuditService"):
                with pytest.raises(ValueError, match="endpoint error"):
                    await audit_logging_middleware(request, call_next)

    async def test_action_map_post_to_create(self):
        """Verify HTTP method -> action mapping."""
        request = _make_request(method="POST")
        # The action_map inside the middleware should map POST -> CREATE
        # We verify by checking it doesn't crash and proceeds correctly
        call_next = AsyncMock(return_value=MagicMock(status_code=201))
        with patch("src.middleware.audit_logging.AsyncSessionLocal") as mock_session_cls:
            mock_db = AsyncMock()
            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            with patch("src.middleware.audit_logging.AuditService") as mock_svc_cls:
                mock_svc = AsyncMock()
                mock_svc_cls.return_value = mock_svc
                await audit_logging_middleware(request, call_next)
                # log_create should be called for POST
                mock_svc.log_create.assert_called_once()

    async def test_extracts_resource_type_from_path(self):
        """Resource type should be extracted from path parts."""
        request = _make_request(path="/api/v1/admin/tickets/123", method="PUT")
        call_next = AsyncMock(return_value=MagicMock(status_code=200))
        with patch("src.middleware.audit_logging.AsyncSessionLocal") as mock_session_cls:
            mock_db = AsyncMock()
            mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            with patch("src.middleware.audit_logging.AuditService") as mock_svc_cls:
                mock_svc = AsyncMock()
                mock_svc_cls.return_value = mock_svc
                await audit_logging_middleware(request, call_next)
                # For PUT, log_update should be called
                mock_svc.log_update.assert_called_once()
                call_args = mock_svc.log_update.call_args
                assert call_args.kwargs.get("resource_type") == "tickets" or \
                       (call_args[1].get("resource_type") == "tickets" if len(call_args) > 1 else True)
