"""Tests for auth login endpoint."""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.api.v1.auth.login import (
    LoginRequest, LoginResponse, login, logout, logout_all, refresh_token,
    reset_password, ResetPasswordRequest,
)
from src.core.errors import ValidationError, UnauthorizedError
from src.models import User, UserRole
from src.models.user_sessions import UserSession
from tests.conftest import TENANT_ID, USER_ID


def _mock_request(cookies=None, headers=None):
    req = MagicMock()
    req.cookies = cookies or {}
    req.headers = headers or {}
    return req


# ── LoginRequest model ───────────────────────────────────────────────────────

class TestLoginRequest:
    def test_valid_request(self):
        req = LoginRequest(
            email="user@test.com",
            password="MySecurePass123!",
        )
        assert req.email == "user@test.com"

    def test_invalid_email_raises(self):
        with pytest.raises(Exception):
            LoginRequest(
                email="not-an-email",
                password="pass",
            )


# ── Login endpoint ───────────────────────────────────────────────────────────

class TestLoginEndpoint:
    @patch("src.api.v1.auth.login.settings.DEBUG", False)
    @patch("src.api.v1.auth.login.log_security_event")
    @patch("src.api.v1.auth.login.create_refresh_token", return_value="refresh-jwt")
    @patch("src.api.v1.auth.login.create_access_token", return_value="access-jwt")
    @patch("src.api.v1.auth.login.verify_password", return_value=True)
    async def test_successful_login(self, mock_verify, mock_access, mock_refresh, mock_log, admin_user, mock_db_session):
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = admin_user
        mock_db_session.execute.return_value = result_mock

        request = LoginRequest(
            email="admin@test.com",
            password="ValidPassword123!",
        )
        response = MagicMock()
        request_obj = _mock_request(headers={"user-agent": "pytest"})

        result = await login(request, response, request_obj, mock_db_session)
        assert result.access_token == "access-jwt"
        assert result.token_type == "bearer"
        assert result.user["email"] == "admin@test.com"
        assert response.set_cookie.call_count == 3
        response.set_cookie.assert_any_call(
            key="access_token", value="access-jwt", httponly=True,
            secure=True, samesite="strict", max_age=86400,
        )
        mock_db_session.commit.assert_awaited()
        # A UserSession row must have been created and staged for this login.
        added_types = [type(call.args[0]) for call in mock_db_session.add.call_args_list]
        assert UserSession in added_types

    @patch("src.api.v1.auth.login.log_security_event")
    async def test_user_not_found_raises(self, mock_log, mock_db_session):
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = result_mock

        request = LoginRequest(
            email="noone@test.com",
            password="pass",
        )
        response = MagicMock()
        with pytest.raises(UnauthorizedError):
            await login(request, response, _mock_request(), mock_db_session)

    @patch("src.api.v1.auth.login.log_security_event")
    async def test_inactive_user_raises(self, mock_log, mock_db_session):
        user = User()
        user.id = USER_ID
        user.is_active = False
        user.email = "inactive@test.com"

        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = user
        mock_db_session.execute.return_value = result_mock

        request = LoginRequest(
            email="inactive@test.com",
            password="pass",
        )
        response = MagicMock()
        with pytest.raises(UnauthorizedError):
            await login(request, response, _mock_request(), mock_db_session)

    @patch("src.api.v1.auth.login.log_security_event")
    @patch("src.api.v1.auth.login.verify_password", return_value=False)
    async def test_wrong_password_raises(self, mock_verify, mock_log, admin_user, mock_db_session):
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = admin_user
        mock_db_session.execute.return_value = result_mock

        request = LoginRequest(
            email="admin@test.com",
            password="wrong-password",
        )
        response = MagicMock()
        with pytest.raises(UnauthorizedError):
            await login(request, response, _mock_request(), mock_db_session)


# ── Refresh endpoint ─────────────────────────────────────────────────────────

class TestRefreshEndpoint:
    @patch("src.api.v1.auth.login.settings.DEBUG", False)
    @patch("src.api.v1.auth.login.log_security_event")
    @patch("src.api.v1.auth.login.create_refresh_token", return_value="new-refresh-jwt")
    @patch("src.api.v1.auth.login.create_access_token", return_value="new-access-jwt")
    async def test_rotates_session_and_issues_new_tokens(
        self, mock_access, mock_refresh, mock_log, admin_user, mock_db_session
    ):
        session_id = uuid.uuid4()
        jti = uuid.uuid4()
        payload = MagicMock(
            sub=str(admin_user.id),
            iat=datetime.now(timezone.utc) - timedelta(minutes=5),
            session_id=str(session_id),
            jti=str(jti),
        )
        admin_user.sessions_revoked_at = None

        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = admin_user
        mock_db_session.execute.return_value = result_mock

        new_jti = uuid.uuid4()
        rotation_result = MagicMock(ok=True, new_jti=new_jti)

        with patch("src.security.jwt.decode_refresh_token", return_value=payload), \
             patch("src.services.session_service.rotate_session", new=AsyncMock(return_value=rotation_result)) as mock_rotate:
            response = MagicMock()
            result = await refresh_token(_mock_request(cookies={"refresh_token": "raw"}), response, mock_db_session)

        mock_rotate.assert_awaited_once_with(mock_db_session, admin_user.id, session_id, jti)
        assert result.access_token == "new-access-jwt"
        response.set_cookie.assert_any_call(
            key="access_token", value="new-access-jwt", httponly=True,
            secure=True, samesite="strict", max_age=24 * 3600,
        )

    async def test_missing_cookie_raises_401(self, mock_db_session):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            await refresh_token(_mock_request(), MagicMock(), mock_db_session)
        assert exc_info.value.status_code == 401

    async def test_reuse_detected_raises_401(self, admin_user, mock_db_session):
        from fastapi import HTTPException

        session_id = uuid.uuid4()
        jti = uuid.uuid4()
        payload = MagicMock(
            sub=str(admin_user.id),
            iat=datetime.now(timezone.utc) - timedelta(minutes=5),
            session_id=str(session_id),
            jti=str(jti),
        )
        admin_user.sessions_revoked_at = None

        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = admin_user
        mock_db_session.execute.return_value = result_mock

        rotation_result = MagicMock(ok=False, new_jti=None, revoked=True)

        with patch("src.security.jwt.decode_refresh_token", return_value=payload), \
             patch("src.services.session_service.rotate_session", new=AsyncMock(return_value=rotation_result)):
            with pytest.raises(HTTPException) as exc_info:
                await refresh_token(_mock_request(cookies={"refresh_token": "raw"}), MagicMock(), mock_db_session)
        assert exc_info.value.status_code == 401

    async def test_sessions_revoked_after_token_issued_raises_401(self, admin_user, mock_db_session):
        from fastapi import HTTPException

        payload = MagicMock(
            sub=str(admin_user.id),
            iat=datetime.now(timezone.utc) - timedelta(hours=1),
            session_id=str(uuid.uuid4()),
            jti=str(uuid.uuid4()),
        )
        # Password was changed (or "logout everywhere" was hit) *after* this
        # refresh token was issued — must be rejected even though it hasn't
        # naturally expired yet.
        admin_user.sessions_revoked_at = datetime.now(timezone.utc) - timedelta(minutes=1)

        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = admin_user
        mock_db_session.execute.return_value = result_mock

        with patch("src.security.jwt.decode_refresh_token", return_value=payload):
            with pytest.raises(HTTPException) as exc_info:
                await refresh_token(_mock_request(cookies={"refresh_token": "raw"}), MagicMock(), mock_db_session)
        assert exc_info.value.status_code == 401

    @patch("src.api.v1.auth.login.log_security_event")
    @patch("src.api.v1.auth.login.create_refresh_token", return_value="new-refresh-jwt")
    @patch("src.api.v1.auth.login.create_access_token", return_value="new-access-jwt")
    async def test_legacy_token_without_session_id_upgrades_transparently(
        self, mock_access, mock_refresh, mock_log, admin_user, mock_db_session
    ):
        """A refresh token issued before rotation tracking existed (no session_id/jti)
        must still work — upgraded to a tracked session, not rejected outright."""
        payload = MagicMock(
            sub=str(admin_user.id),
            iat=datetime.now(timezone.utc) - timedelta(hours=1),
            session_id=None,
            jti=None,
        )
        admin_user.sessions_revoked_at = None

        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = admin_user
        mock_db_session.execute.return_value = result_mock

        with patch("src.security.jwt.decode_refresh_token", return_value=payload):
            response = MagicMock()
            result = await refresh_token(_mock_request(cookies={"refresh_token": "raw"}), response, mock_db_session)

        assert result.access_token == "new-access-jwt"
        added_types = [type(call.args[0]) for call in mock_db_session.add.call_args_list]
        assert UserSession in added_types


# ── Logout endpoint ──────────────────────────────────────────────────────────

class TestLogoutEndpoint:
    @patch("src.api.v1.auth.login.log_security_event")
    async def test_logout_clears_all_auth_cookies(self, mock_log, mock_db_session):
        response = MagicMock()
        result = await logout(_mock_request(), response, mock_db_session)

        assert response.delete_cookie.call_count == 3
        cleared_keys = {call.kwargs["key"] for call in response.delete_cookie.call_args_list}
        assert cleared_keys == {"access_token", "refresh_token", "auth_state"}
        assert result["message"] == "Logout realizado com sucesso"

    @patch("src.api.v1.auth.login.log_security_event")
    async def test_logout_revokes_matching_session(self, mock_log, admin_user, mock_db_session):
        session_id = uuid.uuid4()
        payload = MagicMock(sub=str(admin_user.id), session_id=str(session_id))

        with patch("src.security.jwt.decode_refresh_token", return_value=payload), \
             patch("src.services.session_service.end_session", new=AsyncMock()) as mock_end:
            await logout(_mock_request(cookies={"refresh_token": "raw"}), MagicMock(), mock_db_session)

        mock_end.assert_awaited_once_with(mock_db_session, admin_user.id, session_id)

    @patch("src.api.v1.auth.login.log_security_event")
    async def test_logout_tolerates_invalid_refresh_cookie(self, mock_log, mock_db_session):
        """An already-expired/garbage refresh_token cookie must not block logout."""
        with patch("src.security.jwt.decode_refresh_token", side_effect=Exception("bad token")):
            response = MagicMock()
            result = await logout(_mock_request(cookies={"refresh_token": "garbage"}), response, mock_db_session)

        assert result["message"] == "Logout realizado com sucesso"
        assert response.delete_cookie.call_count == 3


# ── Reset password (forgot-password flow) ────────────────────────────────────

class TestResetPassword:
    @patch("src.api.v1.auth.login.log_security_event")
    @patch("src.api.v1.auth.login.hash_password", return_value="new-hash")
    async def test_reset_password_revokes_all_sessions(self, mock_hash, mock_log, admin_user, mock_db_session):
        admin_user.reset_token_hash = "some-hash"
        admin_user.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        admin_user.sessions_revoked_at = None

        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = admin_user
        mock_db_session.execute.return_value = result_mock

        with patch("src.services.session_service.end_all_sessions", new=AsyncMock()) as mock_end_all:
            body = ResetPasswordRequest(token="raw-token", new_password="V@lid1234567")
            await reset_password(body, mock_db_session)

        assert admin_user.password_hash == "new-hash"
        assert admin_user.sessions_revoked_at is not None
        mock_end_all.assert_awaited_once_with(mock_db_session, admin_user.id)


# ── Logout-all endpoint ──────────────────────────────────────────────────────

class TestLogoutAllEndpoint:
    @patch("src.api.v1.auth.login.log_security_event")
    async def test_revokes_all_sessions_and_bumps_sessions_revoked_at(self, mock_log, admin_user, mock_db_session):
        admin_user.sessions_revoked_at = None
        response = MagicMock()

        with patch("src.services.session_service.end_all_sessions", new=AsyncMock()) as mock_end_all:
            result = await logout_all(response, admin_user, mock_db_session)

        assert admin_user.sessions_revoked_at is not None
        mock_end_all.assert_awaited_once_with(mock_db_session, admin_user.id)
        assert response.delete_cookie.call_count == 3
        assert result["message"] == "Todas as sessões foram encerradas"
