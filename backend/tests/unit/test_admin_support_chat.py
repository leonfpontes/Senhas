"""Tests for admin support_chat endpoints (own conversation + tenant-admin aggregate view)."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.api.v1.admin.support_chat import (
    SendMessageRequest,
    get_my_conversation,
    send_my_message,
    mark_my_conversation_read,
    list_tenant_conversations,
    get_tenant_conversation_messages,
)
from src.core.errors import InsufficientPermissionsError, NotFoundError
from src.models.support_chat import SupportConversationStatus
from tests.conftest import TENANT_ID, TENANT_B_ID, USER_ID


def _operator_user():
    user = MagicMock()
    user.id = USER_ID
    user.tenant_id = TENANT_ID
    user.full_name = "Operador Teste"
    user.username = "operador"
    user.is_admin = False
    user.is_operator_or_admin = True
    return user


def _admin_user():
    user = MagicMock()
    user.id = USER_ID
    user.tenant_id = TENANT_ID
    user.full_name = None
    user.username = "admin"
    user.is_admin = True
    user.is_operator_or_admin = True
    return user


def _super_admin_no_tenant():
    user = MagicMock()
    user.id = USER_ID
    user.tenant_id = None
    user.is_admin = True
    user.is_operator_or_admin = True
    return user


def _mock_conversation(status=SupportConversationStatus.OPEN, tenant_id=TENANT_ID):
    c = MagicMock()
    c.id = uuid4()
    c.tenant_id = tenant_id
    c.owner_user_id = USER_ID
    c.owner_name_snapshot = "Operador Teste"
    c.status = status
    c.last_message_at = None
    c.owner_last_read_at = None
    c.support_last_read_at = None
    return c


def _mock_message(is_from_support=False, body="oi"):
    m = MagicMock()
    m.id = uuid4()
    m.body = body
    m.is_from_support = is_from_support
    m.sender_name_snapshot = "Operador Teste"
    m.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return m


class TestGetMyConversation:
    @patch("src.api.v1.admin.support_chat.SupportChatRepository")
    async def test_success(self, MockRepo):
        db = AsyncMock()
        conversation = _mock_conversation()
        repo_inst = AsyncMock()
        repo_inst.get_or_create_conversation.return_value = conversation
        repo_inst.list_messages.return_value = [_mock_message()]
        MockRepo.return_value = repo_inst

        result = await get_my_conversation(_operator_user(), db)

        assert result.conversation.id == conversation.id
        assert len(result.messages) == 1
        db.commit.assert_called_once()

    async def test_super_admin_without_tenant_raises(self):
        with pytest.raises(InsufficientPermissionsError):
            await get_my_conversation(_super_admin_no_tenant(), AsyncMock())


class TestSendMyMessage:
    @patch("src.api.v1.admin.support_chat.SupportChatRepository")
    async def test_creates_message_as_self(self, MockRepo):
        db = AsyncMock()
        conversation = _mock_conversation()
        repo_inst = AsyncMock()
        repo_inst.get_or_create_conversation.return_value = conversation
        repo_inst.add_message.return_value = _mock_message(body="preciso de ajuda")
        MockRepo.return_value = repo_inst

        result = await send_my_message(SendMessageRequest(body="preciso de ajuda"), _operator_user(), db)

        assert result.body == "preciso de ajuda"
        assert result.is_from_support is False
        call_kwargs = repo_inst.add_message.call_args.kwargs
        assert call_kwargs["sender_user_id"] == USER_ID
        assert call_kwargs["is_from_support"] is False
        db.commit.assert_called_once()


class TestMarkMyConversationRead:
    @patch("src.api.v1.admin.support_chat.SupportChatRepository")
    async def test_marks_read(self, MockRepo):
        db = AsyncMock()
        conversation = _mock_conversation()
        repo_inst = AsyncMock()
        repo_inst.get_or_create_conversation.return_value = conversation
        MockRepo.return_value = repo_inst

        await mark_my_conversation_read(_operator_user(), db)

        repo_inst.mark_read.assert_called_once_with(db, conversation, as_support=False)
        db.commit.assert_called_once()


class TestListTenantConversations:
    async def test_operator_denied(self):
        with pytest.raises(InsufficientPermissionsError):
            await list_tenant_conversations(_operator_user(), AsyncMock())

    @patch("src.api.v1.admin.support_chat.SupportChatRepository")
    async def test_admin_sees_all_tenant_conversations(self, MockRepo):
        db = AsyncMock()
        conversations = [_mock_conversation(), _mock_conversation()]
        repo_inst = AsyncMock()
        repo_inst.list_conversations_for_tenant.return_value = conversations
        repo_inst.list_messages.return_value = [_mock_message(body="última mensagem")]
        MockRepo.return_value = repo_inst

        result = await list_tenant_conversations(_admin_user(), db)

        assert len(result) == 2
        assert result[0].last_message_preview == "última mensagem"
        repo_inst.list_conversations_for_tenant.assert_called_once_with(db, TENANT_ID)


class TestGetTenantConversationMessages:
    async def test_operator_denied(self):
        with pytest.raises(InsufficientPermissionsError):
            await get_tenant_conversation_messages(uuid4(), _operator_user(), AsyncMock())

    @patch("src.api.v1.admin.support_chat.SupportChatRepository")
    async def test_conversation_from_other_tenant_404s(self, MockRepo):
        """Isolamento de tenant: get_conversation(tenant_id=...) já filtra, mas
        o endpoint precisa tratar o None como 404, não vazar a conversa."""
        db = AsyncMock()
        repo_inst = AsyncMock()
        repo_inst.get_conversation.return_value = None
        MockRepo.return_value = repo_inst

        with pytest.raises(NotFoundError):
            await get_tenant_conversation_messages(uuid4(), _admin_user(), db)

        repo_inst.get_conversation.assert_called_once()
        assert repo_inst.get_conversation.call_args.kwargs["tenant_id"] == TENANT_ID

    @patch("src.api.v1.admin.support_chat.SupportChatRepository")
    async def test_admin_reads_own_tenant_conversation(self, MockRepo):
        db = AsyncMock()
        conversation = _mock_conversation()
        repo_inst = AsyncMock()
        repo_inst.get_conversation.return_value = conversation
        repo_inst.list_messages.return_value = [_mock_message(), _mock_message(is_from_support=True)]
        MockRepo.return_value = repo_inst

        result = await get_tenant_conversation_messages(conversation.id, _admin_user(), db)

        assert len(result) == 2
