"""Platform (superadmin) endpoints for the support chat inbox — cross-tenant.

Todos os endpoints exigem SUPER_ADMIN (`require_super_admin`, importado do
canônico em `platform/dashboard.py`, mesmo padrão de `tenant_observatory.py`).
"""
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query
from pydantic import BaseModel, Field

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.errors import NotFoundError
from src.models import User
from src.models.support_chat import SupportConversation, SupportConversationStatus
from src.repositories.support_chat_repo import SupportChatRepository
from src.api.v1.platform.dashboard import require_super_admin

router = APIRouter(prefix="/api/v1/platform/support-chat", tags=["platform-support-chat"])


# ── Schemas ──────────────────────────────────────────────────────────────

class SupportMessageResponse(BaseModel):
    id: UUID
    body: str
    is_from_support: bool
    sender_name_snapshot: str
    created_at: datetime

    class Config:
        from_attributes = True


class PlatformConversationResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    tenant_name: str
    owner_name_snapshot: str
    status: SupportConversationStatus
    last_message_at: Optional[datetime]
    last_message_preview: Optional[str] = None
    unread: bool


class SendMessageRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)


class SetStatusRequest(BaseModel):
    status: SupportConversationStatus


class UnreadCountResponse(BaseModel):
    count: int


def _to_platform_response(conversation: SupportConversation, preview: Optional[str]) -> PlatformConversationResponse:
    unread = bool(
        conversation.last_message_at
        and (
            conversation.support_last_read_at is None
            or conversation.last_message_at > conversation.support_last_read_at
        )
    )
    return PlatformConversationResponse(
        id=conversation.id,
        tenant_id=conversation.tenant_id,
        tenant_name=conversation.tenant.name if conversation.tenant else "—",
        owner_name_snapshot=conversation.owner_name_snapshot,
        status=conversation.status,
        last_message_at=conversation.last_message_at,
        last_message_preview=preview,
        unread=unread,
    )


# ── Inbox ────────────────────────────────────────────────────────────────

@router.get("/conversations", response_model=List[PlatformConversationResponse])
async def list_conversations(
    status: Optional[SupportConversationStatus] = Query(None),
    tenant_id: Optional[UUID] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> List[PlatformConversationResponse]:
    repo = SupportChatRepository(db)
    conversations = await repo.list_all_conversations(
        db, status=status, tenant_id=tenant_id, limit=limit, offset=offset
    )

    result = []
    for c in conversations:
        messages = await repo.list_messages(db, c.id)
        preview = messages[-1].body[:140] if messages else None
        result.append(_to_platform_response(c, preview))
    return result


@router.get("/conversations/{conversation_id}/messages", response_model=List[SupportMessageResponse])
async def get_conversation_messages(
    conversation_id: UUID = Path(...),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> List[SupportMessageResponse]:
    repo = SupportChatRepository(db)
    conversation = await repo.get_conversation(db, conversation_id)
    if not conversation:
        raise NotFoundError("Conversa")

    messages = await repo.list_messages(db, conversation_id)
    return [SupportMessageResponse.from_orm(m) for m in messages]


@router.post("/conversations/{conversation_id}/messages", response_model=SupportMessageResponse)
async def reply_to_conversation(
    body: SendMessageRequest,
    conversation_id: UUID = Path(...),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> SupportMessageResponse:
    repo = SupportChatRepository(db)
    conversation = await repo.get_conversation(db, conversation_id)
    if not conversation:
        raise NotFoundError("Conversa")

    message = await repo.add_message(
        db, conversation,
        tenant_id=conversation.tenant_id,
        sender_user_id=current_user.id,
        sender_name=current_user.full_name or current_user.username,
        is_from_support=True,
        body=body.body,
    )
    await db.commit()
    await db.refresh(message)
    return SupportMessageResponse.from_orm(message)


@router.post("/conversations/{conversation_id}/read", status_code=204)
async def mark_conversation_read(
    conversation_id: UUID = Path(...),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    repo = SupportChatRepository(db)
    conversation = await repo.get_conversation(db, conversation_id)
    if not conversation:
        raise NotFoundError("Conversa")

    await repo.mark_read(db, conversation, as_support=True)
    await db.commit()


@router.patch("/conversations/{conversation_id}/status", response_model=PlatformConversationResponse)
async def set_conversation_status(
    body: SetStatusRequest,
    conversation_id: UUID = Path(...),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> PlatformConversationResponse:
    repo = SupportChatRepository(db)
    conversation = await repo.get_conversation(db, conversation_id)
    if not conversation:
        raise NotFoundError("Conversa")

    conversation = await repo.set_status(db, conversation, body.status)
    await db.commit()

    messages = await repo.list_messages(db, conversation.id)
    preview = messages[-1].body[:140] if messages else None
    return _to_platform_response(conversation, preview)


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> UnreadCountResponse:
    repo = SupportChatRepository(db)
    count = await repo.count_unread_global(db)
    return UnreadCountResponse(count=count)
