"""Tests for auth login endpoint."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.api.v1.auth.login import LoginRequest, LoginResponse, login, logout
from src.core.errors import ValidationError, UnauthorizedError
from src.models import User, UserRole
from tests.conftest import TENANT_ID, USER_ID


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

        result = await login(request, response, mock_db_session)
        assert result.access_token == "access-jwt"
        assert result.token_type == "bearer"
        assert result.user["email"] == "admin@test.com"
        response.set_cookie.assert_called_once()

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
            await login(request, response, mock_db_session)

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
            await login(request, response, mock_db_session)

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
            await login(request, response, mock_db_session)


# ── Logout endpoint ──────────────────────────────────────────────────────────

class TestLogoutEndpoint:
    @patch("src.api.v1.auth.login.log_security_event")
    async def test_logout_clears_cookie(self, mock_log):
        response = MagicMock()
        result = await logout(response)
        response.delete_cookie.assert_called_once_with(
            key="refresh_token",
            httponly=True,
            secure=True,
            samesite="strict",
        )
        assert result["message"] == "Logout realizado com sucesso"
