"""Tests for DELETE /api/v1/auth/account — LGPD self-account deletion."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from starlette.requests import Request as StarletteRequest

from src.api.v1.auth.profile import DeleteAccountRequest, delete_own_account
from src.core.errors import InsufficientPermissionsError, UnauthorizedError
from src.models import User, UserRole
from tests.conftest import TENANT_ID, USER_ID, ADMIN_USER_ID, SUPER_ADMIN_ID


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_starlette_request(impersonated_by: str | None = None) -> StarletteRequest:
    """Build a minimal real Starlette Request (satisfies slowapi isinstance check).

    Sets request.state attributes directly to simulate the JWT middleware output.
    """
    scope = {
        "type": "http",
        "method": "DELETE",
        "path": "/api/v1/auth/account",
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 12345),
    }
    req = StarletteRequest(scope)
    req.state.user_id = USER_ID
    req.state.tenant_id = TENANT_ID
    token = MagicMock()
    token.impersonated_by = impersonated_by
    req.state.token = token
    return req


def _make_response():
    return MagicMock()


def _make_user(
    role: UserRole = UserRole.OPERATOR,
    tenant_id=TENANT_ID,
) -> User:
    u = User()
    u.id = USER_ID
    u.tenant_id = tenant_id
    u.email = "user@test.com"
    u.username = "testuser"
    u.password_hash = "$2b$12$fakehash"
    u.role = role
    u.is_active = True
    return u


@pytest.fixture(autouse=True)
def _bypass_rate_limit():
    """Disable slowapi rate-limit enforcement for all tests in this module.

    Setting limiter.enabled=False makes the async_wrapper skip all checks,
    including the isinstance(request, Request) guard.
    """
    import src.api.v1.auth.profile as profile_module
    original = profile_module.limiter.enabled
    profile_module.limiter.enabled = False
    yield
    profile_module.limiter.enabled = original


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_starlette_request(impersonated_by: str | None = None):
    """Build a mock FastAPI request with optional impersonation claim."""
    req = MagicMock()
    req.state = MagicMock()
    token = MagicMock()
    token.impersonated_by = impersonated_by
    req.state.token = token
    # slowapi reads the client host from request.client
    req.client = MagicMock()
    req.client.host = "127.0.0.1"
    return req


def _make_response():
    return MagicMock()


def _make_user(
    role: UserRole = UserRole.OPERATOR,
    tenant_id=TENANT_ID,
    password_hash: str = "$2b$12$fakehash",
) -> User:
    u = User()
    u.id = USER_ID
    u.tenant_id = tenant_id
    u.email = "user@test.com"
    u.username = "testuser"
    u.password_hash = password_hash
    u.role = role
    u.is_active = True
    return u


# ── DeleteAccountRequest schema ───────────────────────────────────────────────

class TestDeleteAccountRequest:
    def test_requires_password(self):
        with pytest.raises(Exception):
            DeleteAccountRequest()

    def test_valid_payload(self):
        req = DeleteAccountRequest(password="MySecret123!")
        assert req.password == "MySecret123!"


# ── Guard: SUPER_ADMIN blocked ────────────────────────────────────────────────

class TestDeleteAccountSuperAdminBlocked:
    async def test_super_admin_raises_403(self, mock_db_session):
        user = _make_user(role=UserRole.SUPER_ADMIN, tenant_id=None)
        payload = DeleteAccountRequest(password="anypass")

        with pytest.raises(InsufficientPermissionsError):
            await delete_own_account(
                request=_make_starlette_request(),
                response=_make_response(),
                payload=payload,
                current_user=user,
                db=mock_db_session,
            )

        mock_db_session.delete.assert_not_called()


# ── Guard: Impersonation blocked ─────────────────────────────────────────────

class TestDeleteAccountImpersonationBlocked:
    async def test_impersonated_session_raises_403(self, mock_db_session):
        user = _make_user(role=UserRole.OPERATOR)
        payload = DeleteAccountRequest(password="anypass")

        with pytest.raises(InsufficientPermissionsError):
            await delete_own_account(
                request=_make_starlette_request(impersonated_by=str(SUPER_ADMIN_ID)),
                response=_make_response(),
                payload=payload,
                current_user=user,
                db=mock_db_session,
            )

        mock_db_session.delete.assert_not_called()


# ── Guard: Wrong password ─────────────────────────────────────────────────────

class TestDeleteAccountWrongPassword:
    @patch("src.api.v1.auth.profile.verify_password", return_value=False)
    async def test_wrong_password_raises_401(self, mock_verify, mock_db_session):
        user = _make_user(role=UserRole.OPERATOR)
        payload = DeleteAccountRequest(password="wrongpass")

        with pytest.raises(UnauthorizedError):
            await delete_own_account(
                request=_make_starlette_request(),
                response=_make_response(),
                payload=payload,
                current_user=user,
                db=mock_db_session,
            )

        mock_db_session.delete.assert_not_called()

    @patch("src.api.v1.auth.profile.verify_password", return_value=True)
    async def test_correct_password_proceeds(self, mock_verify, mock_db_session):
        """Correct password should not raise UnauthorizedError at the password check."""
        user = _make_user(role=UserRole.OPERATOR)
        payload = DeleteAccountRequest(password="correctpass")

        # Mock scalar to return > 0 admins remaining (not the last admin check path)
        scalar_mock = AsyncMock(return_value=1)
        mock_db_session.scalar = scalar_mock

        with patch("src.api.v1.auth.profile.asyncio.create_task"):
            result = await delete_own_account(
                request=_make_starlette_request(),
                response=_make_response(),
                payload=payload,
                current_user=user,
                db=mock_db_session,
            )

        assert result["message"] == "Sua conta foi excluída permanentemente."
        mock_db_session.delete.assert_called_once_with(user)
        mock_db_session.commit.assert_called_once()


# ── Guard: Last admin blocked ─────────────────────────────────────────────────

class TestDeleteAccountLastAdminBlocked:
    @patch("src.api.v1.auth.profile.verify_password", return_value=True)
    async def test_last_admin_raises_409(self, mock_verify, mock_db_session):
        """Deleting the last admin of a tenant must be blocked."""
        user = _make_user(role=UserRole.ADMIN)
        payload = DeleteAccountRequest(password="correctpass")

        # After flush, 0 admins remain
        mock_db_session.scalar = AsyncMock(return_value=0)

        with pytest.raises(HTTPException) as exc_info:
            await delete_own_account(
                request=_make_starlette_request(),
                response=_make_response(),
                payload=payload,
                current_user=user,
                db=mock_db_session,
            )

        assert exc_info.value.status_code == 409
        mock_db_session.rollback.assert_called_once()
        mock_db_session.commit.assert_not_called()

    @patch("src.api.v1.auth.profile.verify_password", return_value=True)
    async def test_admin_with_other_admin_remaining_succeeds(self, mock_verify, mock_db_session):
        """Admin deletion succeeds when at least one other admin remains."""
        user = _make_user(role=UserRole.ADMIN)
        payload = DeleteAccountRequest(password="correctpass")

        # 1 other admin remains after flush
        mock_db_session.scalar = AsyncMock(return_value=1)

        with patch("src.api.v1.auth.profile.asyncio.create_task"):
            result = await delete_own_account(
                request=_make_starlette_request(),
                response=_make_response(),
                payload=payload,
                current_user=user,
                db=mock_db_session,
            )

        assert result["message"] == "Sua conta foi excluída permanentemente."
        mock_db_session.commit.assert_called_once()

    @patch("src.api.v1.auth.profile.verify_password", return_value=True)
    async def test_operator_deletion_skips_admin_count_check(self, mock_verify, mock_db_session):
        """OPERATOR users bypass the admin count check entirely."""
        user = _make_user(role=UserRole.OPERATOR)
        payload = DeleteAccountRequest(password="correctpass")

        # scalar should NOT be called for OPERATOR
        mock_db_session.scalar = AsyncMock(return_value=0)

        with patch("src.api.v1.auth.profile.asyncio.create_task"):
            result = await delete_own_account(
                request=_make_starlette_request(),
                response=_make_response(),
                payload=payload,
                current_user=user,
                db=mock_db_session,
            )

        assert result["message"] == "Sua conta foi excluída permanentemente."
        # scalar must NOT have been called (no admin check for OPERATOR)
        mock_db_session.scalar.assert_not_called()


# ── Success path ──────────────────────────────────────────────────────────────

class TestDeleteAccountSuccess:
    @patch("src.api.v1.auth.profile.asyncio.create_task")
    @patch("src.api.v1.auth.profile.verify_password", return_value=True)
    async def test_hard_delete_called(self, mock_verify, mock_task, mock_db_session):
        user = _make_user(role=UserRole.OPERATOR)
        payload = DeleteAccountRequest(password="correctpass")
        mock_db_session.scalar = AsyncMock(return_value=1)

        await delete_own_account(
            request=_make_starlette_request(),
            response=_make_response(),
            payload=payload,
            current_user=user,
            db=mock_db_session,
        )

        mock_db_session.delete.assert_called_once_with(user)
        mock_db_session.flush.assert_called_once()
        mock_db_session.commit.assert_called_once()

    @patch("src.api.v1.auth.profile.asyncio.create_task")
    @patch("src.api.v1.auth.profile.verify_password", return_value=True)
    async def test_audit_log_added_before_commit(self, mock_verify, mock_task, mock_db_session):
        """AuditLog must be added to the session before commit."""
        from src.models.audit_logs import AuditLog

        user = _make_user(role=UserRole.OPERATOR)
        payload = DeleteAccountRequest(password="correctpass")
        mock_db_session.scalar = AsyncMock(return_value=1)

        added_objects = []
        mock_db_session.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))

        await delete_own_account(
            request=_make_starlette_request(),
            response=_make_response(),
            payload=payload,
            current_user=user,
            db=mock_db_session,
        )

        audit_entries = [o for o in added_objects if isinstance(o, AuditLog)]
        assert len(audit_entries) == 1
        assert audit_entries[0].resource_type == "User"
        assert audit_entries[0].resource_id == user.id

    @patch("src.api.v1.auth.profile.asyncio.create_task")
    @patch("src.api.v1.auth.profile.verify_password", return_value=True)
    async def test_refresh_cookie_cleared(self, mock_verify, mock_task, mock_db_session):
        """Response must delete the refresh_token cookie on success."""
        user = _make_user(role=UserRole.OPERATOR)
        payload = DeleteAccountRequest(password="correctpass")
        mock_db_session.scalar = AsyncMock(return_value=1)
        response = _make_response()

        await delete_own_account(
            request=_make_starlette_request(),
            response=response,
            payload=payload,
            current_user=user,
            db=mock_db_session,
        )

        response.delete_cookie.assert_called_once_with(
            key="refresh_token",
            httponly=True,
            secure=True,
            samesite="strict",
        )

    @patch("src.api.v1.auth.profile.asyncio.create_task")
    @patch("src.api.v1.auth.profile.verify_password", return_value=True)
    async def test_notification_email_dispatched(self, mock_verify, mock_task, mock_db_session):
        """Notification email must be scheduled as a fire-and-forget task."""
        user = _make_user(role=UserRole.OPERATOR)
        payload = DeleteAccountRequest(password="correctpass")
        mock_db_session.scalar = AsyncMock(return_value=1)

        await delete_own_account(
            request=_make_starlette_request(),
            response=_make_response(),
            payload=payload,
            current_user=user,
            db=mock_db_session,
        )

        mock_task.assert_called_once()

    @patch("src.api.v1.auth.profile.asyncio.create_task")
    @patch("src.api.v1.auth.profile.verify_password", return_value=True)
    async def test_rollback_on_unexpected_exception(self, mock_verify, mock_task, mock_db_session):
        """Any unexpected exception inside the transaction must trigger rollback."""
        user = _make_user(role=UserRole.OPERATOR)
        payload = DeleteAccountRequest(password="correctpass")

        mock_db_session.flush = AsyncMock(side_effect=RuntimeError("db error"))

        with pytest.raises(RuntimeError):
            await delete_own_account(
                request=_make_starlette_request(),
                response=_make_response(),
                payload=payload,
                current_user=user,
                db=mock_db_session,
            )

        mock_db_session.rollback.assert_called_once()
        mock_db_session.commit.assert_not_called()
