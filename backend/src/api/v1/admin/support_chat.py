"""Admin endpoints for the tenant-side support chat.

Two audiences:
- Qualquer usuário autenticado do tenant: conversa própria com o suporte
  (`/support-chat/me*`). Intencionalmente SEM require_group_permission —
  ver CLAUDE.md, mesma exceção documentada para `config.py::get_tenant_branding`.
- ADMIN do tenant: visão agregada de TODAS as conversas do terreiro,
  read-only (não responde em nome de outro usuário — cada usuário só
  escreve na própria conversa). Guard manual `current_user.is_admin`, sem
  PermissionFeature dedicado (visão binária admin/não-admin).
"""
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel, Field

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.errors import InsufficientPermissionsError, NotFoundError
from src.models import User
from src.models.support_chat import SupportConversation, SupportConversationStatus
from src.repositories.support_chat_repo import SupportChatRepository
from src.api.dependencies import get_current_user

router = APIRouter(prefix="/api/v1/admin/support-chat", tags=["admin-support-chat"])


# ── Schemas ──────────────────────────────────────────────────────────────

class SupportMessageResponse(BaseModel):
    id: UUID
    body: str
    is_from_support: bool
    sender_name_snapshot: str
    created_at: datetime

    class Config:
        from_attributes = True


class SupportConversationResponse(BaseModel):
    id: UUID
    status: SupportConversationStatus
    owner_name_snapshot: str
    last_message_at: Optional[datetime]
    unread: bool

    class Config:
        from_attributes = True


class SupportConversationSummaryResponse(SupportConversationResponse):
    last_message_preview: Optional[str] = None


class SupportConversationWithMessagesResponse(BaseModel):
    conversation: SupportConversationResponse
    messages: List[SupportMessageResponse]


class SendMessageRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)


def _owner_name(user: User) -> str:
    return user.full_name or user.username


def _to_conversation_response(conversation: SupportConversation, *, as_support: bool) -> SupportConversationResponse:
    """`unread` depende de qual lado está olhando: o dono da conversa compara
    contra owner_last_read_at, o suporte contra support_last_read_at."""
    last_read = conversation.support_last_read_at if as_support else conversation.owner_last_read_at
    unread = bool(
        conversation.last_message_at
        and (last_read is None or conversation.last_message_at > last_read)
    )
    return SupportConversationResponse(
        id=conversation.id,
        status=conversation.status,
        owner_name_snapshot=conversation.owner_name_snapshot,
        last_message_at=conversation.last_message_at,
        unread=unread,
    )


# ── Conversa própria (qualquer usuário autenticado do tenant) ───────────

@router.get("/me", response_model=SupportConversationWithMessagesResponse)
async def get_my_conversation(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SupportConversationWithMessagesResponse:
    """Chat de suporte é canal universal do usuário autenticado com a
    plataforma — ver exceção documentada em CLAUDE.md."""
    if not current_user.is_operator_or_admin or current_user.tenant_id is None:
        raise InsufficientPermissionsError("Usuário do tenant necessário")

    repo = SupportChatRepository(db)
    conversation = await repo.get_or_create_conversation(
        db, current_user.tenant_id, current_user.id, _owner_name(current_user)
    )
    await db.commit()
    await db.refresh(conversation)

    messages = await repo.list_messages(db, conversation.id)
    return SupportConversationWithMessagesResponse(
        conversation=_to_conversation_response(conversation, as_support=False),
        messages=[SupportMessageResponse.from_orm(m) for m in messages],
    )


@router.post("/me/messages", response_model=SupportMessageResponse)
async def send_my_message(
    body: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SupportMessageResponse:
    if not current_user.is_operator_or_admin or current_user.tenant_id is None:
        raise InsufficientPermissionsError("Usuário do tenant necessário")

    repo = SupportChatRepository(db)
    conversation = await repo.get_or_create_conversation(
        db, current_user.tenant_id, current_user.id, _owner_name(current_user)
    )
    message = await repo.add_message(
        db, conversation,
        tenant_id=current_user.tenant_id,
        sender_user_id=current_user.id,
        sender_name=_owner_name(current_user),
        is_from_support=False,
        body=body.body,
    )
    await db.commit()
    await db.refresh(message)
    return SupportMessageResponse.from_orm(message)


@router.post("/me/read", status_code=204)
async def mark_my_conversation_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    if not current_user.is_operator_or_admin or current_user.tenant_id is None:
        raise InsufficientPermissionsError("Usuário do tenant necessário")

    repo = SupportChatRepository(db)
    conversation = await repo.get_or_create_conversation(
        db, current_user.tenant_id, current_user.id, _owner_name(current_user)
    )
    await repo.mark_read(db, conversation, as_support=False)
    await db.commit()


# ── Visão agregada (ADMIN do tenant, read-only) ──────────────────────────

@router.get("/conversations", response_model=List[SupportConversationSummaryResponse])
async def list_tenant_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[SupportConversationSummaryResponse]:
    """Todas as conversas do terreiro — só leitura. O admin tem sua própria
    conversa via /me para falar com o suporte; aqui ele só acompanha."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Apenas administradores do terreiro")

    repo = SupportChatRepository(db)
    conversations = await repo.list_conversations_for_tenant(db, current_user.tenant_id)

    result = []
    for c in conversations:
        base = _to_conversation_response(c, as_support=False)
        messages = await repo.list_messages(db, c.id)
        preview = messages[-1].body[:140] if messages else None
        result.append(SupportConversationSummaryResponse(**base.model_dump(), last_message_preview=preview))
    return result


@router.get("/conversations/{conversation_id}/messages", response_model=List[SupportMessageResponse])
async def get_tenant_conversation_messages(
    conversation_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[SupportMessageResponse]:
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Apenas administradores do terreiro")

    repo = SupportChatRepository(db)
    conversation = await repo.get_conversation(db, conversation_id, tenant_id=current_user.tenant_id)
    if not conversation:
        raise NotFoundError("Conversa")

    messages = await repo.list_messages(db, conversation_id)
    return [SupportMessageResponse.from_orm(m) for m in messages]
