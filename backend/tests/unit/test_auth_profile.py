"""Tests for src/api/v1/auth/profile.py — change-password session revocation."""
from unittest.mock import AsyncMock, patch

import pytest

from src.api.v1.auth.profile import ChangePasswordRequest, change_password
from src.core.errors import UnauthorizedError, ValidationError


class TestChangePassword:
    @patch("src.api.v1.auth.profile.validate_password_policy")
    @patch("src.api.v1.auth.profile.hash_password", return_value="new-hash")
    @patch("src.api.v1.auth.profile.verify_password", return_value=True)
    async def test_revokes_all_sessions_on_success(
        self, mock_verify, mock_hash, mock_validate, admin_user, mock_db_session
    ):
        admin_user.sessions_revoked_at = None
        payload = ChangePasswordRequest(current_password="OldPass123!", new_password="NewPass456!")

        with patch("src.services.session_service.end_all_sessions", new=AsyncMock()) as mock_end_all:
            result = await change_password(payload, admin_user, mock_db_session)

        assert admin_user.password_hash == "new-hash"
        assert admin_user.sessions_revoked_at is not None
        mock_end_all.assert_awaited_once_with(mock_db_session, admin_user.id)
        assert result["message"] == "Senha alterada com sucesso"

    @patch("src.api.v1.auth.profile.verify_password", return_value=False)
    async def test_wrong_current_password_raises_and_does_not_revoke(
        self, mock_verify, admin_user, mock_db_session
    ):
        payload = ChangePasswordRequest(current_password="wrong", new_password="NewPass456!")

        with patch("src.services.session_service.end_all_sessions", new=AsyncMock()) as mock_end_all:
            with pytest.raises(UnauthorizedError):
                await change_password(payload, admin_user, mock_db_session)

        mock_end_all.assert_not_awaited()
