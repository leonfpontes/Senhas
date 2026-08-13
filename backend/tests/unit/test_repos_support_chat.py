"""Unit tests for SupportChatRepository."""
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.models.support_chat import SupportConversationStatus
from src.repositories.support_chat_repo import SupportChatRepository
from tests.conftest import TENANT_ID, USER_ID


def _mock_db():
    db = AsyncMock()
    db.execute = AsyncMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    return db


def _mock_result_scalar(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    result.scalar_one.return_value = value
    result.scalar.return_value = value
    return result


def _mock_conversation(status=SupportConversationStatus.OPEN):
    c = MagicMock()
    c.id = uuid4()
    c.tenant_id = TENANT_ID
    c.owner_user_id = USER_ID
    c.status = status
    c.last_message_at = None
    c.owner_last_read_at = None
    c.support_last_read_at = None
    return c


@pytest.fixture
def repo():
    db = _mock_db()
    return SupportChatRepository(db), db


class TestGetOrCreateConversation:
    async def test_returns_existing(self, repo):
        r, db = repo
        existing = _mock_conversation()
        db.execute.return_value = _mock_result_scalar(existing)

        result = await r.get_or_create_conversation(db, TENANT_ID, USER_ID, "Fulano")

        assert result is existing
        db.add.assert_not_called()

    async def test_creates_new_when_absent(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)

        result = await r.get_or_create_conversation(db, TENANT_ID, USER_ID, "Fulano")

        db.add.assert_called_once()
        added = db.add.call_args.args[0]
        assert added.tenant_id == TENANT_ID
        assert added.owner_user_id == USER_ID
        assert added.owner_name_snapshot == "Fulano"
        assert added.status == SupportConversationStatus.OPEN


class TestAddMessage:
    async def test_reopens_resolved_conversation_on_tenant_message(self, repo):
        r, db = repo
        conversation = _mock_conversation(status=SupportConversationStatus.RESOLVED)

        await r.add_message(
            db, conversation, tenant_id=TENANT_ID, sender_user_id=USER_ID,
            sender_name="Fulano", is_from_support=False, body="oi, preciso de ajuda",
        )

        assert conversation.status == SupportConversationStatus.OPEN
        assert conversation.last_message_at is not None
        db.add.assert_called_once()

    async def test_owner_message_marks_owner_side_read(self, repo):
        """Regressão: mandar uma mensagem não pode deixar a PRÓPRIA conversa
        marcada como não lida pra quem acabou de mandar — só a resposta do
        outro lado conta como não lida."""
        r, db = repo
        conversation = _mock_conversation()

        await r.add_message(
            db, conversation, tenant_id=TENANT_ID, sender_user_id=USER_ID,
            sender_name="Fulano", is_from_support=False, body="oi",
        )

        assert conversation.owner_last_read_at == conversation.last_message_at
        assert conversation.support_last_read_at is None

    async def test_support_message_marks_support_side_read(self, repo):
        r, db = repo
        conversation = _mock_conversation()

        await r.add_message(
            db, conversation, tenant_id=TENANT_ID, sender_user_id=USER_ID,
            sender_name="Suporte", is_from_support=True, body="já te ajudo",
        )

        assert conversation.support_last_read_at == conversation.last_message_at
        assert conversation.owner_last_read_at is None

    async def test_does_not_reopen_on_support_message(self, repo):
        r, db = repo
        conversation = _mock_conversation(status=SupportConversationStatus.RESOLVED)

        await r.add_message(
            db, conversation, tenant_id=TENANT_ID, sender_user_id=USER_ID,
            sender_name="Suporte", is_from_support=True, body="já resolvemos",
        )

        assert conversation.status == SupportConversationStatus.RESOLVED

    async def test_open_conversation_stays_open(self, repo):
        r, db = repo
        conversation = _mock_conversation(status=SupportConversationStatus.OPEN)

        await r.add_message(
            db, conversation, tenant_id=TENANT_ID, sender_user_id=USER_ID,
            sender_name="Fulano", is_from_support=False, body="oi",
        )

        assert conversation.status == SupportConversationStatus.OPEN


class TestMarkRead:
    async def test_marks_owner_side(self, repo):
        r, db = repo
        conversation = _mock_conversation()
        await r.mark_read(db, conversation, as_support=False)
        assert conversation.owner_last_read_at is not None
        assert conversation.support_last_read_at is None

    async def test_marks_support_side(self, repo):
        r, db = repo
        conversation = _mock_conversation()
        await r.mark_read(db, conversation, as_support=True)
        assert conversation.support_last_read_at is not None
        assert conversation.owner_last_read_at is None


class TestCounts:
    async def test_count_unread_for_tenant_admin_returns_scalar(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(3)
        result = await r.count_unread_for_tenant_admin(db, TENANT_ID)
        assert result == 3

    async def test_count_unread_global_returns_scalar(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(7)
        result = await r.count_unread_global(db)
        assert result == 7

    async def test_count_unread_defaults_to_zero_when_none(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.count_unread_global(db)
        assert result == 0
