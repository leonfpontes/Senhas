"""Tests for platform (superadmin) support_chat inbox endpoints — cross-tenant."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.api.v1.platform.support_chat import (
    SendMessageRequest,
    SetStatusRequest,
    list_conversations,
    get_conversation_messages,
    reply_to_conversation,
    mark_conversation_read,
    set_conversation_status,
    get_unread_count,
)
from src.core.errors import NotFoundError
from src.models.support_chat import SupportConversationStatus
from tests.conftest import SUPER_ADMIN_ID, TENANT_ID


def _super_admin():
    user = MagicMock()
    user.id = SUPER_ADMIN_ID
    user.tenant_id = None
    user.full_name = "Suporte GiraHub"
    user.username = "suporte"
    return user


def _mock_conversation(status=SupportConversationStatus.OPEN):
    c = MagicMock()
    c.id = uuid4()
    c.tenant_id = TENANT_ID
    c.tenant = MagicMock(name="Terreiro Test")
    c.tenant.name = "Terreiro Test"
    c.owner_name_snapshot = "Operador Teste"
    c.status = status
    c.last_message_at = None
    c.owner_last_read_at = None
    c.support_last_read_at = None
    return c


def _mock_message(is_from_support=True, body="oi"):
    m = MagicMock()
    m.id = uuid4()
    m.body = body
    m.is_from_support = is_from_support
    m.sender_name_snapshot = "Suporte GiraHub"
    m.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return m


class TestListConversations:
    @patch("src.api.v1.platform.support_chat.SupportChatRepository")
    async def test_lists_cross_tenant(self, MockRepo):
        db = AsyncMock()
        repo_inst = AsyncMock()
        repo_inst.list_all_conversations.return_value = [_mock_conversation()]
        repo_inst.list_messages.return_value = [_mock_message(body="tenho uma dúvida")]
        MockRepo.return_value = repo_inst

        result = await list_conversations(None, None, 50, 0, _super_admin(), db)

        assert len(result) == 1
        assert result[0].tenant_name == "Terreiro Test"
        assert result[0].last_message_preview == "tenho uma dúvida"


class TestGetConversationMessages:
    @patch("src.api.v1.platform.support_chat.SupportChatRepository")
    async def test_missing_conversation_404s(self, MockRepo):
        db = AsyncMock()
        repo_inst = AsyncMock()
        repo_inst.get_conversation.return_value = None
        MockRepo.return_value = repo_inst

        with pytest.raises(NotFoundError):
            await get_conversation_messages(uuid4(), _super_admin(), db)

    @patch("src.api.v1.platform.support_chat.SupportChatRepository")
    async def test_returns_full_thread(self, MockRepo):
        db = AsyncMock()
        conversation = _mock_conversation()
        repo_inst = AsyncMock()
        repo_inst.get_conversation.return_value = conversation
        repo_inst.list_messages.return_value = [_mock_message(is_from_support=False), _mock_message(is_from_support=True)]
        MockRepo.return_value = repo_inst

        result = await get_conversation_messages(conversation.id, _super_admin(), db)

        assert len(result) == 2
        # get_conversation aqui é cross-tenant — sem tenant_id no kwarg
        assert "tenant_id" not in repo_inst.get_conversation.call_args.kwargs


class TestReplyToConversation:
    @patch("src.api.v1.platform.support_chat.SupportChatRepository")
    async def test_reply_marked_as_support(self, MockRepo):
        db = AsyncMock()
        conversation = _mock_conversation()
        repo_inst = AsyncMock()
        repo_inst.get_conversation.return_value = conversation
        repo_inst.add_message.return_value = _mock_message(body="já te ajudo")
        MockRepo.return_value = repo_inst

        result = await reply_to_conversation(SendMessageRequest(body="já te ajudo"), conversation.id, _super_admin(), db)

        assert result.body == "já te ajudo"
        call_kwargs = repo_inst.add_message.call_args.kwargs
        assert call_kwargs["is_from_support"] is True
        assert call_kwargs["sender_user_id"] == SUPER_ADMIN_ID
        assert call_kwargs["tenant_id"] == TENANT_ID
        db.commit.assert_called_once()

    @patch("src.api.v1.platform.support_chat.SupportChatRepository")
    async def test_missing_conversation_404s(self, MockRepo):
        db = AsyncMock()
        repo_inst = AsyncMock()
        repo_inst.get_conversation.return_value = None
        MockRepo.return_value = repo_inst

        with pytest.raises(NotFoundError):
            await reply_to_conversation(SendMessageRequest(body="oi"), uuid4(), _super_admin(), db)


class TestMarkConversationRead:
    @patch("src.api.v1.platform.support_chat.SupportChatRepository")
    async def test_marks_support_side(self, MockRepo):
        db = AsyncMock()
        conversation = _mock_conversation()
        repo_inst = AsyncMock()
        repo_inst.get_conversation.return_value = conversation
        MockRepo.return_value = repo_inst

        await mark_conversation_read(conversation.id, _super_admin(), db)

        repo_inst.mark_read.assert_called_once_with(db, conversation, as_support=True)


class TestSetConversationStatus:
    @patch("src.api.v1.platform.support_chat.SupportChatRepository")
    async def test_resolves_conversation(self, MockRepo):
        db = AsyncMock()
        conversation = _mock_conversation(status=SupportConversationStatus.RESOLVED)
        repo_inst = AsyncMock()
        repo_inst.get_conversation.return_value = _mock_conversation(status=SupportConversationStatus.OPEN)
        repo_inst.set_status.return_value = conversation
        repo_inst.list_messages.return_value = []
        MockRepo.return_value = repo_inst

        result = await set_conversation_status(SetStatusRequest(status=SupportConversationStatus.RESOLVED), conversation.id, _super_admin(), db)

        assert result.status == SupportConversationStatus.RESOLVED
        repo_inst.set_status.assert_called_once()


class TestGetUnreadCount:
    @patch("src.api.v1.platform.support_chat.SupportChatRepository")
    async def test_returns_count(self, MockRepo):
        db = AsyncMock()
        repo_inst = AsyncMock()
        repo_inst.count_unread_global.return_value = 5
        MockRepo.return_value = repo_inst

        result = await get_unread_count(_super_admin(), db)

        assert result.count == 5
