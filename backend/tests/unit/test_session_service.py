"""Tests for refresh-token session rotation/reuse-detection (src.services.session_service)."""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from src.models.user_sessions import UserSession
from src.services import session_service
from tests.conftest import USER_ID, TENANT_ID


def _make_session_row(current_jti, previous_jti=None, previous_jti_valid_until=None, expires_in_days=14):
    now = datetime.now(timezone.utc)
    return UserSession(
        id=uuid.uuid4(),
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        current_jti=str(current_jti),
        previous_jti=str(previous_jti) if previous_jti else None,
        previous_jti_valid_until=previous_jti_valid_until,
        orig_iat=now - timedelta(days=1),
        expires_at=now + timedelta(days=expires_in_days),
        last_used_at=now - timedelta(hours=1),
        user_agent="pytest",
    )


class TestStartSession:
    async def test_creates_row_and_stages_it(self, admin_user, mock_db_session):
        session_id, jti = await session_service.start_session(mock_db_session, admin_user, user_agent="pytest-agent")

        assert isinstance(session_id, uuid.UUID)
        assert isinstance(jti, uuid.UUID)
        mock_db_session.add.assert_called_once()
        row = mock_db_session.add.call_args[0][0]
        assert isinstance(row, UserSession)
        assert row.user_id == admin_user.id
        assert row.current_jti == str(jti)
        assert row.expires_at > datetime.now(timezone.utc) + timedelta(days=13)


class TestRotateSession:
    async def test_matching_jti_rotates_and_sets_grace_window(self, mock_db_session):
        current_jti = uuid.uuid4()
        row = _make_session_row(current_jti)
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = row
        mock_db_session.execute.return_value = result_mock

        result = await session_service.rotate_session(mock_db_session, USER_ID, row.id, current_jti)

        assert result.ok
        assert result.new_jti != current_jti
        assert row.current_jti == str(result.new_jti)
        assert row.previous_jti == str(current_jti)
        assert row.previous_jti_valid_until is not None

    async def test_previous_jti_within_grace_window_is_accepted_without_rotating_again(self, mock_db_session):
        current_jti = uuid.uuid4()
        previous_jti = uuid.uuid4()
        row = _make_session_row(
            current_jti,
            previous_jti=previous_jti,
            previous_jti_valid_until=datetime.now(timezone.utc) + timedelta(seconds=20),
        )
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = row
        mock_db_session.execute.return_value = result_mock

        # A second tab/device presents the just-superseded jti (benign race).
        result = await session_service.rotate_session(mock_db_session, USER_ID, row.id, previous_jti)

        assert result.ok
        assert result.new_jti == current_jti  # converges to the current generation, no further rotation
        assert row.current_jti == str(current_jti)  # unchanged

    async def test_previous_jti_after_grace_window_is_treated_as_reuse(self, mock_db_session):
        current_jti = uuid.uuid4()
        previous_jti = uuid.uuid4()
        row = _make_session_row(
            current_jti,
            previous_jti=previous_jti,
            previous_jti_valid_until=datetime.now(timezone.utc) - timedelta(seconds=1),  # grace already elapsed
        )
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = row
        mock_db_session.execute.return_value = result_mock

        result = await session_service.rotate_session(mock_db_session, USER_ID, row.id, previous_jti)

        assert not result.ok
        assert result.revoked
        mock_db_session.delete.assert_awaited_once_with(row)

    async def test_unknown_jti_revokes_session(self, mock_db_session):
        row = _make_session_row(uuid.uuid4())
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = row
        mock_db_session.execute.return_value = result_mock

        result = await session_service.rotate_session(mock_db_session, USER_ID, row.id, uuid.uuid4())

        assert not result.ok
        assert result.revoked
        assert result.reason == "reuse_detected"
        mock_db_session.delete.assert_awaited_once_with(row)

    async def test_missing_row_returns_not_ok(self, mock_db_session):
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = result_mock

        result = await session_service.rotate_session(mock_db_session, USER_ID, uuid.uuid4(), uuid.uuid4())

        assert not result.ok
        assert result.reason == "session_not_found"

    async def test_absolute_cap_exceeded_deletes_row_and_returns_not_ok(self, mock_db_session):
        current_jti = uuid.uuid4()
        row = _make_session_row(current_jti, expires_in_days=-1)  # already past its absolute cap
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = row
        mock_db_session.execute.return_value = result_mock

        result = await session_service.rotate_session(mock_db_session, USER_ID, row.id, current_jti)

        assert not result.ok
        assert result.reason == "max_session_age_exceeded"
        mock_db_session.delete.assert_awaited_once_with(row)


class TestEndSessions:
    async def test_end_session_issues_delete(self, mock_db_session):
        await session_service.end_session(mock_db_session, USER_ID, uuid.uuid4())
        mock_db_session.execute.assert_awaited_once()

    async def test_end_all_sessions_issues_delete(self, mock_db_session):
        await session_service.end_all_sessions(mock_db_session, USER_ID)
        mock_db_session.execute.assert_awaited_once()
