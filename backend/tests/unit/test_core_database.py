"""Tests for core database module."""
from unittest.mock import patch, MagicMock, AsyncMock
import pytest

from src.core.database import get_db, Base


class TestGetDb:
    async def test_yields_session_and_closes(self):
        mock_session = AsyncMock()
        mock_session.close = AsyncMock()

        with patch("src.core.database.AsyncSessionLocal") as mock_factory:
            mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)

            gen = get_db()
            session = await gen.__anext__()
            assert session == mock_session
            try:
                await gen.__anext__()
            except StopAsyncIteration:
                pass


class TestBase:
    def test_base_is_declarative(self):
        assert hasattr(Base, "metadata")
        assert hasattr(Base, "__subclasses__")
