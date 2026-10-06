"""Tests for src/api/v1/auth/profile.py — change-password session revocation."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.api.v1.auth.profile import ChangePasswordRequest, change_password
from src.core.errors import InsufficientPermissionsError, UnauthorizedError


def _request(impersonated_by=None):
    req = MagicMock()
    token = MagicMock()
    token.impersonated_by = impersonated_by
    req.state.token = token
    return req


class TestChangePassword:
    @patch("src.api.v1.auth.profile.validate_password_policy")
    @patch("src.api.v1.auth.profile.hash_password", return_value="new-hash")
    @patch("src.api.v1.auth.profile.verify_password", return_value=True)
    async def test_revokes_all_sessions_on_success(
        self, mock_verify, mock_hash, mock_validate, admin_user, mock_db_session
    ):
        admin_user.sessions_revoked_at = None
        payload = ChangePasswordRequest(current_password="OldPass123!", new_password="NewPass456!")
        response = MagicMock()

        with patch("src.services.session_service.end_all_sessions", new=AsyncMock()) as mock_end_all:
            result = await change_password(_request(), response, payload, admin_user, mock_db_session)

        assert admin_user.password_hash == "new-hash"
        assert admin_user.sessions_revoked_at is not None
        mock_end_all.assert_awaited_once_with(mock_db_session, admin_user.id)
        assert result["message"] == "Senha alterada com sucesso"
        # A sessão atual também foi revogada: os 3 cookies de auth são apagados.
        cleared = {c.kwargs["key"] for c in response.delete_cookie.call_args_list}
        assert cleared == {"access_token", "refresh_token", "auth_state"}

    @patch("src.api.v1.auth.profile.verify_password", return_value=False)
    async def test_wrong_current_password_raises_and_does_not_revoke(
        self, mock_verify, admin_user, mock_db_session
    ):
        payload = ChangePasswordRequest(current_password="wrong", new_password="NewPass456!")
        response = MagicMock()

        with patch("src.services.session_service.end_all_sessions", new=AsyncMock()) as mock_end_all:
            with pytest.raises(UnauthorizedError):
                await change_password(_request(), response, payload, admin_user, mock_db_session)

        mock_end_all.assert_not_awaited()
        response.delete_cookie.assert_not_called()

    async def test_blocked_during_impersonation(self, admin_user, mock_db_session):
        """Impersonando, apagar cookies deslogaria o super-admin da plataforma."""
        payload = ChangePasswordRequest(current_password="OldPass123!", new_password="NewPass456!")
        response = MagicMock()

        with patch("src.services.session_service.end_all_sessions", new=AsyncMock()) as mock_end_all:
            with pytest.raises(InsufficientPermissionsError):
                await change_password(
                    _request(impersonated_by="super-admin-id"), response, payload, admin_user, mock_db_session
                )

        mock_end_all.assert_not_awaited()
        response.delete_cookie.assert_not_called()
