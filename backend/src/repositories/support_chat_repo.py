"""SupportChatRepository — conversas e mensagens do chat de suporte.

Cobre dois consumidores bem diferentes: o tenant (sempre escopado por
tenant_id) e a inbox do superadmin (cross-tenant, sem filtro de tenant_id —
mesmo padrão de `platform/dashboard.py::_tenant_counts`). Métodos
explicitamente cross-tenant deixam isso claro no nome/docstring; todos os
outros exigem tenant_id.
"""
from datetime import datetime, timezone
from typing import Optional, Sequence
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.support_chat import SupportConversation, SupportConversationStatus, SupportMessage
from src.models.tenants import Tenant


class SupportChatRepository:
    """Repositório único para SupportConversation + SupportMessage."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Conversa própria (tenant) ───────────────────────────────────────

    async def get_or_create_conversation(
        self,
        session: AsyncSession,
        tenant_id: UUID,
        owner_user_id: UUID,
        owner_name: str,
    ) -> SupportConversation:
        """Get-or-create idempotente da conversa 1:1 do usuário com o suporte."""
        stmt = select(SupportConversation).where(
            and_(
                SupportConversation.tenant_id == tenant_id,
                SupportConversation.owner_user_id == owner_user_id,
            )
        )
        result = await session.execute(stmt)
        conversation = result.scalar_one_or_none()
        if conversation:
            return conversation

        conversation = SupportConversation(
            tenant_id=tenant_id,
            owner_user_id=owner_user_id,
            owner_name_snapshot=owner_name,
            status=SupportConversationStatus.OPEN,
        )
        session.add(conversation)
        await session.flush()
        await session.refresh(conversation)
        return conversation

    async def get_conversation(
        self,
        session: AsyncSession,
        conversation_id: UUID,
        tenant_id: Optional[UUID] = None,
    ) -> Optional[SupportConversation]:
        """`tenant_id=None` é uso exclusivo do router platform (cross-tenant).

        Sempre eager-loada `tenant` (selectinload) — barato e evita
        MissingGreenlet caso o caller (ex: inbox do superadmin) acesse
        `conversation.tenant.name` depois, fora de um `await` explícito."""
        conditions = [SupportConversation.id == conversation_id]
        if tenant_id is not None:
            conditions.append(SupportConversation.tenant_id == tenant_id)
        stmt = (
            select(SupportConversation)
            .options(selectinload(SupportConversation.tenant))
            .where(and_(*conditions))
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    # ── Visão do ADMIN (todas as conversas do próprio tenant) ───────────

    async def list_conversations_for_tenant(
        self,
        session: AsyncSession,
        tenant_id: UUID,
    ) -> Sequence[SupportConversation]:
        stmt = (
            select(SupportConversation)
            .where(SupportConversation.tenant_id == tenant_id)
            .order_by(SupportConversation.last_message_at.desc().nullslast())
        )
        result = await session.execute(stmt)
        return result.scalars().all()

    async def count_unread_for_tenant_admin(self, session: AsyncSession, tenant_id: UUID) -> int:
        """Conversas do tenant com resposta do suporte ainda não vista pelo dono."""
        stmt = select(func.count()).select_from(SupportConversation).where(
            and_(
                SupportConversation.tenant_id == tenant_id,
                SupportConversation.last_message_at.is_not(None),
                (SupportConversation.owner_last_read_at.is_(None))
                | (SupportConversation.last_message_at > SupportConversation.owner_last_read_at),
            )
        )
        result = await session.execute(stmt)
        return result.scalar_one() or 0

    # ── Inbox do superadmin (cross-tenant) ──────────────────────────────

    async def list_all_conversations(
        self,
        session: AsyncSession,
        status: Optional[SupportConversationStatus] = None,
        tenant_id: Optional[UUID] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[SupportConversation]:
        """Lista cross-tenant (sem filtro de tenant_id por padrão) — uso exclusivo
        do router platform, guardado por require_super_admin."""
        conditions = []
        if status is not None:
            conditions.append(SupportConversation.status == status)
        if tenant_id is not None:
            conditions.append(SupportConversation.tenant_id == tenant_id)

        stmt = (
            select(SupportConversation)
            .options(selectinload(SupportConversation.tenant))
            .order_by(SupportConversation.last_message_at.desc().nullslast())
            .offset(offset)
            .limit(limit)
        )
        if conditions:
            stmt = stmt.where(and_(*conditions))

        result = await session.execute(stmt)
        return result.scalars().all()

    async def count_unread_global(self, session: AsyncSession) -> int:
        """Conversas com mensagem do tenant ainda não vista pelo suporte — badge da inbox."""
        stmt = select(func.count()).select_from(SupportConversation).where(
            and_(
                SupportConversation.last_message_at.is_not(None),
                (SupportConversation.support_last_read_at.is_(None))
                | (SupportConversation.last_message_at > SupportConversation.support_last_read_at),
            )
        )
        result = await session.execute(stmt)
        return result.scalar_one() or 0

    # ── Mensagens ────────────────────────────────────────────────────────

    async def list_messages(self, session: AsyncSession, conversation_id: UUID) -> Sequence[SupportMessage]:
        stmt = (
            select(SupportMessage)
            .where(SupportMessage.conversation_id == conversation_id)
            .order_by(SupportMessage.created_at.asc())
        )
        result = await session.execute(stmt)
        return result.scalars().all()

    async def add_message(
        self,
        session: AsyncSession,
        conversation: SupportConversation,
        tenant_id: UUID,
        sender_user_id: Optional[UUID],
        sender_name: str,
        is_from_support: bool,
        body: str,
    ) -> SupportMessage:
        """Cria a mensagem, atualiza last_message_at e reabre a conversa se
        ela estava 'resolved' e a mensagem é do lado tenant — senão ela
        desaparece dos filtros 'abertas' da inbox do superadmin sem que
        ninguém veja a resposta pendente.

        Também marca a mensagem como lida do lado de quem a enviou (quem
        manda uma mensagem, por definição, já viu tudo até ali) — senão o
        badge de "não lida" do próprio remetente acende na hora, já que
        `last_message_at` avança mas o `*_last_read_at` dele não."""
        message = SupportMessage(
            tenant_id=tenant_id,
            conversation_id=conversation.id,
            sender_user_id=sender_user_id,
            sender_name_snapshot=sender_name,
            is_from_support=is_from_support,
            body=body,
        )
        session.add(message)

        now = datetime.now(timezone.utc)
        conversation.last_message_at = now
        if is_from_support:
            conversation.support_last_read_at = now
        else:
            conversation.owner_last_read_at = now
        if not is_from_support and conversation.status == SupportConversationStatus.RESOLVED:
            conversation.status = SupportConversationStatus.OPEN

        await session.flush()
        await session.refresh(message)
        return message

    async def mark_read(self, session: AsyncSession, conversation: SupportConversation, as_support: bool) -> None:
        now = datetime.now(timezone.utc)
        if as_support:
            conversation.support_last_read_at = now
        else:
            conversation.owner_last_read_at = now
        await session.flush()

    async def set_status(
        self, session: AsyncSession, conversation: SupportConversation, status: SupportConversationStatus
    ) -> SupportConversation:
        conversation.status = status
        await session.flush()
        await session.refresh(conversation)
        return conversation
