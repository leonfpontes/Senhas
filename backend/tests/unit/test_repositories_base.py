"""Tests for BaseRepository CRUD operations."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

import pytest

from src.repositories.base import BaseRepository
from src.models.giras import Gira
from tests.conftest import TENANT_ID, GIRA_ID


@pytest.fixture
def repo(mock_db_session):
    """Create a BaseRepository instance for Gira model."""
    return BaseRepository(mock_db_session, Gira)


class TestGetById:
    async def test_returns_model_when_found(self, repo, gira, mock_db_session):
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = gira
        mock_db_session.execute.return_value = result_mock

        result = await repo.get_by_id(GIRA_ID, TENANT_ID)
        assert result == gira
        mock_db_session.execute.assert_called_once()

    async def test_returns_none_when_not_found(self, repo, mock_db_session):
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = result_mock

        result = await repo.get_by_id(uuid.uuid4(), TENANT_ID)
        assert result is None


class TestList:
    async def test_returns_list(self, repo, gira, mock_db_session):
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = [gira]
        mock_db_session.execute.return_value = result_mock

        result = await repo.list(TENANT_ID)
        assert len(result) == 1
        assert result[0] == gira

    async def test_empty_list(self, repo, mock_db_session):
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = []
        mock_db_session.execute.return_value = result_mock

        result = await repo.list(TENANT_ID)
        assert result == []

    async def test_pagination(self, repo, mock_db_session):
        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = []
        mock_db_session.execute.return_value = result_mock

        await repo.list(TENANT_ID, skip=10, limit=5)
        mock_db_session.execute.assert_called_once()


class TestCreate:
    async def test_creates_and_returns_model(self, repo, mock_db_session):
        mock_db_session.refresh = AsyncMock()
        result = await repo.create(TENANT_ID, nome="New Gira", is_active=True)
        assert result is not None
        mock_db_session.add.assert_called_once()
        mock_db_session.commit.assert_called_once()
        mock_db_session.refresh.assert_called_once()


class TestUpdate:
    async def test_updates_existing_model(self, repo, gira, mock_db_session):
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = gira
        mock_db_session.execute.return_value = result_mock
        mock_db_session.refresh = AsyncMock()

        result = await repo.update(GIRA_ID, TENANT_ID, nome="Updated Gira")
        assert result is not None
        assert gira.nome == "Updated Gira"
        mock_db_session.commit.assert_called_once()

    async def test_returns_none_when_not_found(self, repo, mock_db_session):
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = result_mock

        result = await repo.update(uuid.uuid4(), TENANT_ID, nome="No")
        assert result is None


class TestDelete:
    async def test_soft_delete(self, repo, gira, mock_db_session):
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = gira
        mock_db_session.execute.return_value = result_mock

        result = await repo.delete(GIRA_ID, TENANT_ID, soft=True)
        assert result is True
        assert gira.deleted_at is not None
        mock_db_session.commit.assert_called_once()

    async def test_hard_delete(self, repo, gira, mock_db_session):
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = gira
        mock_db_session.execute.return_value = result_mock

        result = await repo.delete(GIRA_ID, TENANT_ID, soft=False)
        assert result is True
        mock_db_session.delete.assert_called_once_with(gira)

    async def test_returns_false_when_not_found(self, repo, mock_db_session):
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = result_mock

        result = await repo.delete(uuid.uuid4(), TENANT_ID)
        assert result is False


class TestCount:
    async def test_returns_count(self, repo, mock_db_session):
        result_mock = MagicMock()
        result_mock.scalar.return_value = 5
        mock_db_session.execute.return_value = result_mock

        count = await repo.count(TENANT_ID)
        assert count == 5

    async def test_returns_zero_when_empty(self, repo, mock_db_session):
        result_mock = MagicMock()
        result_mock.scalar.return_value = 0
        mock_db_session.execute.return_value = result_mock

        count = await repo.count(TENANT_ID)
        assert count == 0

    async def test_returns_zero_for_none(self, repo, mock_db_session):
        result_mock = MagicMock()
        result_mock.scalar.return_value = None
        mock_db_session.execute.return_value = result_mock

        count = await repo.count(TENANT_ID)
        assert count == 0


class TestExists:
    async def test_returns_true_when_found(self, repo, gira, mock_db_session):
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = gira
        mock_db_session.execute.return_value = result_mock

        exists = await repo.exists(GIRA_ID, TENANT_ID)
        assert exists is True

    async def test_returns_false_when_not_found(self, repo, mock_db_session):
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = result_mock

        exists = await repo.exists(uuid.uuid4(), TENANT_ID)
        assert exists is False
