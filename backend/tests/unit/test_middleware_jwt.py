"""Tests for JWT validation middleware."""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

import jwt as pyjwt
import pytest

from src.core.config import settings
from src.middleware.jwt_middleware import jwt_middleware
from src.core.errors import InvalidTokenError
from src.security.jwt import create_access_token, create_refresh_token
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
    request.cookies = {}  # real dict — jwt_middleware falls back to cookies.get("access_token")
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
    async def test_no_auth_header_passes_through(self):
        request = _make_request(path="/api/v1/admin/giras", auth_header=None)
        call_next = _make_call_next()
        await jwt_middleware(request, call_next)
        call_next.assert_called_once()

    async def test_invalid_format_returns_401(self):
        request = _make_request(path="/api/v1/admin/giras", auth_header="InvalidFormat")
        call_next = _make_call_next()
        response = await jwt_middleware(request, call_next)
        assert response.status_code == 401

    async def test_non_bearer_scheme_returns_401(self):
        request = _make_request(path="/api/v1/admin/giras", auth_header="Basic abc123")
        call_next = _make_call_next()
        response = await jwt_middleware(request, call_next)
        assert response.status_code == 401

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
    async def test_invalid_token_returns_401(self, mock_log, mock_decode):
        mock_decode.side_effect = InvalidTokenError("Token expirado")

        request = _make_request(
            path="/api/v1/admin/giras",
            auth_header="Bearer expired-token",
        )
        call_next = _make_call_next()
        response = await jwt_middleware(request, call_next)
        assert response.status_code == 401
        mock_log.assert_called_once()

    @patch("src.middleware.jwt_middleware.decode_token")
    @patch("src.middleware.jwt_middleware.log_security_event")
    async def test_unexpected_error_returns_401(self, mock_log, mock_decode):
        mock_decode.side_effect = RuntimeError("unexpected")

        request = _make_request(
            path="/api/v1/admin/giras",
            auth_header="Bearer bad-token",
        )
        call_next = _make_call_next()
        response = await jwt_middleware(request, call_next)
        assert response.status_code == 401


def _token(tipo):
    """JWT assinado com o segredo real; `tipo=None` → sem claim `type`."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(USER_ID),
        "tenant_id": str(TENANT_ID),
        "role": "admin",
        "exp": now + timedelta(minutes=5),
        "iat": now,
    }
    if tipo is not None:
        payload["type"] = tipo
    return pyjwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


class TestJwtMiddlewareTokenType:
    """T-02: com o decode_token real, só access tipado autentica."""

    async def test_access_tipado_no_cookie_autentica(self):
        request = _make_request()
        request.cookies = {"access_token": create_access_token(USER_ID, TENANT_ID, "admin")}
        call_next = _make_call_next()
        await jwt_middleware(request, call_next)
        call_next.assert_called_once()
        assert request.state.user_id == USER_ID
        assert request.state.tenant_id == TENANT_ID

    async def test_impersonacao_via_bearer_autentica_e_preserva_impersonated_by(self):
        super_id = uuid.uuid4()
        token = create_access_token(
            USER_ID, TENANT_ID, "admin", expires_delta=timedelta(hours=1), impersonated_by=super_id
        )
        request = _make_request(auth_header=f"Bearer {token}")
        call_next = _make_call_next()
        await jwt_middleware(request, call_next)
        call_next.assert_called_once()
        assert request.state.user_id == USER_ID
        assert request.state.token.impersonated_by == str(super_id)

    @pytest.mark.parametrize("tipo", ["account_select", "mfa_pending", "invite", "refresh"])
    @patch("src.middleware.jwt_middleware.log_security_event")
    async def test_tipo_nao_access_recebe_401(self, mock_log, tipo):
        request = _make_request(auth_header=f"Bearer {_token(tipo)}")
        call_next = _make_call_next()
        response = await jwt_middleware(request, call_next)
        assert response.status_code == 401
        call_next.assert_not_called()

    @patch("src.middleware.jwt_middleware.log_security_event")
    async def test_refresh_token_real_no_cookie_recebe_401(self, mock_log):
        request = _make_request()
        request.cookies = {
            "access_token": create_refresh_token(USER_ID, TENANT_ID, "admin", uuid.uuid4(), uuid.uuid4())
        }
        call_next = _make_call_next()
        response = await jwt_middleware(request, call_next)
        assert response.status_code == 401
        call_next.assert_not_called()

    @patch("src.middleware.jwt_middleware.log_security_event")
    async def test_sem_type_recebe_401(self, mock_log):
        request = _make_request(auth_header=f"Bearer {_token(None)}")
        call_next = _make_call_next()
        response = await jwt_middleware(request, call_next)
        assert response.status_code == 401
        call_next.assert_not_called()
