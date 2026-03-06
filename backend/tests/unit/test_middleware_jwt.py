"""Tests for JWT validation middleware."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

import pytest

from src.middleware.jwt_middleware import jwt_middleware
from src.core.errors import UnauthorizedError, InvalidTokenError
from tests.conftest import TENANT_ID, USER_ID


def _make_request(path="/api/v1/admin/giras", auth_header=None):
    """Create a mock request."""
    headers_dict = {}
    if auth_header is not None:
        headers_dict["Authorization"] = auth_header
    request = MagicMock()
    request.url = MagicMock()
    request.url.path = path
    request.headers = MagicMock()
    request.headers.get = MagicMock(side_effect=lambda k, d=None: headers_dict.get(k, d))
    request.state = MagicMock()
    return request


def _make_call_next():
    return AsyncMock(return_value=MagicMock(status_code=200))


class TestJwtMiddlewareSkipPaths:
    async def test_skips_health(self):
        request = _make_request(path="/health")
        call_next = _make_call_next()
        await jwt_middleware(request, call_next)
        call_next.assert_called_once()

    async def test_skips_docs(self):
        request = _make_request(path="/docs")
        call_next = _make_call_next()
        await jwt_middleware(request, call_next)
        call_next.assert_called_once()

    async def test_skips_openapi(self):
        request = _make_request(path="/openapi.json")
        call_next = _make_call_next()
        await jwt_middleware(request, call_next)
        call_next.assert_called_once()

    async def test_skips_login(self):
        request = _make_request(path="/api/v1/auth/login")
        call_next = _make_call_next()
        await jwt_middleware(request, call_next)
        call_next.assert_called_once()

    async def test_skips_public_endpoints(self):
        request = _make_request(path="/api/v1/public/next-gira")
        call_next = _make_call_next()
        await jwt_middleware(request, call_next)
        call_next.assert_called_once()


class TestJwtMiddlewareAuth:
    async def test_no_auth_header_raises(self):
        request = _make_request(path="/api/v1/admin/giras", auth_header=None)
        call_next = _make_call_next()
        with pytest.raises(UnauthorizedError):
            await jwt_middleware(request, call_next)

    async def test_invalid_format_raises(self):
        request = _make_request(path="/api/v1/admin/giras", auth_header="InvalidFormat")
        call_next = _make_call_next()
        with pytest.raises(UnauthorizedError):
            await jwt_middleware(request, call_next)

    async def test_non_bearer_scheme_raises(self):
        request = _make_request(path="/api/v1/admin/giras", auth_header="Basic abc123")
        call_next = _make_call_next()
        with pytest.raises(UnauthorizedError):
            await jwt_middleware(request, call_next)

    @patch("src.middleware.jwt_middleware.decode_token")
    async def test_valid_token_sets_state(self, mock_decode):
        token_data = MagicMock()
        token_data.sub = str(USER_ID)
        token_data.tenant_id = str(TENANT_ID)
        token_data.role = "admin"
        mock_decode.return_value = token_data

        request = _make_request(
            path="/api/v1/admin/giras",
            auth_header="Bearer valid-token-here",
        )
        call_next = _make_call_next()
        await jwt_middleware(request, call_next)

        assert request.state.user_id == USER_ID
        assert request.state.tenant_id == TENANT_ID
        assert request.state.role == "admin"
        call_next.assert_called_once()

    @patch("src.middleware.jwt_middleware.decode_token")
    @patch("src.middleware.jwt_middleware.log_security_event")
    async def test_invalid_token_raises_unauthorized(self, mock_log, mock_decode):
        mock_decode.side_effect = InvalidTokenError("Token expirado")

        request = _make_request(
            path="/api/v1/admin/giras",
            auth_header="Bearer expired-token",
        )
        call_next = _make_call_next()
        with pytest.raises(UnauthorizedError):
            await jwt_middleware(request, call_next)
        mock_log.assert_called_once()

    @patch("src.middleware.jwt_middleware.decode_token")
    @patch("src.middleware.jwt_middleware.log_security_event")
    async def test_unexpected_error_raises_unauthorized(self, mock_log, mock_decode):
        mock_decode.side_effect = RuntimeError("unexpected")

        request = _make_request(
            path="/api/v1/admin/giras",
            auth_header="Bearer bad-token",
        )
        call_next = _make_call_next()
        with pytest.raises(UnauthorizedError):
            await jwt_middleware(request, call_next)
