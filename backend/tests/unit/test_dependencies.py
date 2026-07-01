"""Tests for API dependencies (auth, RBAC, tenant access)."""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import (
    get_current_user,
    get_tenant_from_request,
    require_role,
    validate_tenant_access,
)
from src.core.errors import (
    UnauthorizedError,
    InsufficientPermissionsError,
    MultiTenantViolationError,
)
from src.models import User, UserRole
from tests.conftest import TENANT_ID, TENANT_B_ID, USER_ID, ADMIN_USER_ID, SUPER_ADMIN_ID


# ── get_current_user ─────────────────────────────────────────────────────────

class TestGetCurrentUser:
    async def test_returns_user_when_found(self, operator_user, mock_db_session):
        request = MagicMock()
        request.state.user_id = USER_ID
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = operator_user
        mock_db_session.execute.return_value = result_mock

        user = await get_current_user(request, mock_db_session)
        assert user.id == USER_ID
        assert user.email == "operator@test.com"

    async def test_raises_when_no_user_id(self, mock_db_session):
        request = MagicMock()
        request.state = MagicMock(spec=[])
        with pytest.raises(UnauthorizedError):
            await get_current_user(request, mock_db_session)

    async def test_raises_when_user_not_found(self, mock_db_session):
        request = MagicMock()
        request.state.user_id = uuid.uuid4()
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = result_mock

        with pytest.raises(UnauthorizedError):
            await get_current_user(request, mock_db_session)

    async def test_raises_when_user_inactive(self, mock_db_session):
        inactive_user = User()
        inactive_user.id = USER_ID
        inactive_user.is_active = False

        request = MagicMock()
        request.state.user_id = USER_ID
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = inactive_user
        mock_db_session.execute.return_value = result_mock

        with pytest.raises(UnauthorizedError):
            await get_current_user(request, mock_db_session)

    async def test_raises_when_token_issued_before_sessions_revoked(self, operator_user, mock_db_session):
        """Password change / logout-all-devices bumps sessions_revoked_at — any
        token minted before that instant must be rejected immediately, even if
        it hasn't hit its own exp yet."""
        operator_user.sessions_revoked_at = datetime.now(timezone.utc) - timedelta(minutes=1)

        request = MagicMock()
        request.state.user_id = USER_ID
        request.state.token = MagicMock(iat=datetime.now(timezone.utc) - timedelta(hours=1))
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = operator_user
        mock_db_session.execute.return_value = result_mock

        with pytest.raises(UnauthorizedError):
            await get_current_user(request, mock_db_session)

    async def test_allows_token_issued_after_sessions_revoked(self, operator_user, mock_db_session):
        """A fresh login performed *after* sessions_revoked_at must keep working."""
        operator_user.sessions_revoked_at = datetime.now(timezone.utc) - timedelta(hours=1)

        request = MagicMock()
        request.state.user_id = USER_ID
        request.state.token = MagicMock(iat=datetime.now(timezone.utc) - timedelta(minutes=1))
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = operator_user
        mock_db_session.execute.return_value = result_mock

        user = await get_current_user(request, mock_db_session)
        assert user.id == USER_ID


# ── get_tenant_from_request ──────────────────────────────────────────────────

class TestGetTenantFromRequest:
    async def test_returns_tenant_id(self):
        request = MagicMock()
        request.state.tenant_id = TENANT_ID
        result = await get_tenant_from_request(request)
        assert result == TENANT_ID

    async def test_raises_when_missing(self):
        request = MagicMock()
        request.state.tenant_id = None
        with pytest.raises(MultiTenantViolationError):
            await get_tenant_from_request(request)


# ── require_role ─────────────────────────────────────────────────────────────

class TestRequireRole:
    async def test_super_admin_accesses_everything(self, super_admin_user):
        checker = await require_role(UserRole.ADMIN)
        # Super admin should not raise
        result = await checker(user=super_admin_user)
        assert result is None

    async def test_admin_accesses_admin_role(self, admin_user):
        checker = await require_role(UserRole.ADMIN)
        result = await checker(user=admin_user)
        assert result is None

    async def test_operator_accesses_operator_role(self, operator_user):
        checker = await require_role(UserRole.OPERATOR)
        result = await checker(user=operator_user)
        assert result is None

    async def test_operator_cannot_access_admin_role(self, operator_user):
        checker = await require_role(UserRole.ADMIN)
        with pytest.raises(InsufficientPermissionsError):
            await checker(user=operator_user)


# ── validate_tenant_access ───────────────────────────────────────────────────

class TestValidateTenantAccess:
    async def test_super_admin_accesses_any_tenant(self, super_admin_user):
        request = MagicMock()
        request.state.tenant_id = TENANT_ID
        result = await validate_tenant_access(request, super_admin_user)
        assert result == TENANT_ID

    async def test_user_accesses_own_tenant(self, operator_user):
        request = MagicMock()
        request.state.tenant_id = TENANT_ID
        result = await validate_tenant_access(request, operator_user)
        assert result == TENANT_ID

    async def test_user_cannot_access_other_tenant(self, operator_user):
        request = MagicMock()
        request.state.tenant_id = TENANT_B_ID
        with pytest.raises(MultiTenantViolationError):
            await validate_tenant_access(request, operator_user)

    async def test_admin_cannot_access_other_tenant(self, admin_user):
        request = MagicMock()
        request.state.tenant_id = TENANT_B_ID
        with pytest.raises(MultiTenantViolationError):
            await validate_tenant_access(request, admin_user)
