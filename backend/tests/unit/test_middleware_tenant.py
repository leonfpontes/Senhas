"""Tests for middleware - tenant context, JWT, and audit logging."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.middleware.tenant_context import tenant_context_middleware, get_tenant_id
from src.core.errors import MultiTenantViolationError
from tests.conftest import TENANT_ID


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_request(path="/api/v1/admin/giras", tenant_id=None, query_params=None):
    """Create a mock request with configurable path and state."""
    request = MagicMock()
    request.url = MagicMock()
    request.url.path = path
    request.query_params = query_params or {}
    state = MagicMock()
    if tenant_id is not None:
        state.tenant_id = tenant_id
    else:
        # Simulate no tenant_id set yet
        del state.tenant_id
        type(state).tenant_id = property(lambda s: getattr(s, "_tenant_id", None), lambda s, v: setattr(s, "_tenant_id", v))
    request.state = state
    return request


def _make_call_next(response=None):
    """Create a mock call_next that returns a response."""
    resp = response or MagicMock(status_code=200)
    return AsyncMock(return_value=resp)


# ── TenantContextMiddleware ──────────────────────────────────────────────────

class TestTenantContextMiddleware:
    async def test_skips_health_path(self):
        request = _make_request(path="/health")
        call_next = _make_call_next()
        response = await tenant_context_middleware(request, call_next)
        call_next.assert_called_once_with(request)
        assert response.status_code == 200

    async def test_skips_docs_path(self):
        request = _make_request(path="/docs")
        call_next = _make_call_next()
        await tenant_context_middleware(request, call_next)
        call_next.assert_called_once()

    async def test_skips_openapi_path(self):
        request = _make_request(path="/openapi.json")
        call_next = _make_call_next()
        await tenant_context_middleware(request, call_next)
        call_next.assert_called_once()

    async def test_uses_jwt_tenant_id(self):
        request = _make_request(path="/api/v1/admin/giras", tenant_id=TENANT_ID)
        call_next = _make_call_next()
        await tenant_context_middleware(request, call_next)
        call_next.assert_called_once()

    async def test_public_endpoint_with_valid_query_param(self):
        request = _make_request(
            path="/api/v1/public/next-gira",
            query_params={"tenant_id": str(TENANT_ID)},
        )
        # Simulate no tenant_id set from JWT
        request.state = MagicMock(spec=[])
        request.state.tenant_id = None
        call_next = _make_call_next()
        await tenant_context_middleware(request, call_next)
        call_next.assert_called_once()

    async def test_public_endpoint_with_invalid_uuid_passes_through(self):
        """Public paths are not validated by the middleware; endpoints handle it."""
        request = _make_request(
            path="/api/v1/public/next-gira",
            query_params={"tenant_id": "not-a-uuid"},
        )
        request.state = MagicMock(spec=[])
        request.state.tenant_id = None
        call_next = _make_call_next()
        await tenant_context_middleware(request, call_next)
        call_next.assert_called_once()

    async def test_public_endpoint_without_tenant_id_passes_through(self):
        """Public paths are not validated by the middleware; tenant resolved in endpoint."""
        request = _make_request(path="/api/v1/public/next-gira", query_params={})
        request.state = MagicMock(spec=[])
        request.state.tenant_id = None
        call_next = _make_call_next()
        await tenant_context_middleware(request, call_next)
        call_next.assert_called_once()


# ── GetTenantId ──────────────────────────────────────────────────────────────

class TestGetTenantId:
    def test_returns_tenant_id_from_state(self):
        request = MagicMock()
        request.state.tenant_id = TENANT_ID
        result = get_tenant_id(request)
        assert result == TENANT_ID

    def test_raises_when_no_tenant_id(self):
        request = MagicMock(spec=[])
        request.state = MagicMock(spec=[])
        with pytest.raises(MultiTenantViolationError):
            get_tenant_id(request)

    def test_raises_when_tenant_id_is_none(self):
        request = MagicMock()
        request.state.tenant_id = None
        with pytest.raises(MultiTenantViolationError):
            get_tenant_id(request)
