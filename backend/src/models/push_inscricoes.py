"""Notificação no celular da Área do Médium (AM-16, migração 082) — inscrições de Web Push.

Uma linha por aparelho/navegador em que o médium tocou em "Receber notificações neste celular":
o `endpoint` do serviço de push do navegador (FCM, Mozilla, Apple) e as duas chaves da inscrição
(`p256dh`, `auth`) que cifram a mensagem. O `endpoint` é único no banco: o mesmo navegador
inscrito de novo por outra conta passa a ser dessa conta (quem tem o endpoint é o aparelho).

- `tenant_id`, `user_id` e `medium_id` dizem de quem é; o agendador do AM-15 só manda para as
  inscrições do usuário ligado ao médium naquele terreiro.
- `last_success_at` / `failures`: o envio marca sucesso e conta falhas seguidas. Resposta 404/410
  do serviço de push (inscrição vencida ou desfeita) apaga a linha; falhas seguidas demais também.
- `user_agent`: curto (só para o médium reconhecer o aparelho, nunca para rastreio).

O conteúdo das notificações nunca fica guardado aqui.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.tz import utc_now
from .base import Base

ENDPOINT_MAX = 1000
CHAVE_MAX = 200
USER_AGENT_MAX = 120


class PushInscricao(Base):
    __tablename__ = "push_inscricoes"
    __table_args__ = (
        UniqueConstraint("endpoint", name="uq_push_inscricoes_endpoint"),
        Index("ix_push_inscricoes_tenant_medium", "tenant_id", "medium_id"),
        Index("ix_push_inscricoes_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    medium_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mediuns.id", ondelete="CASCADE"), nullable=False
    )
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    p256dh: Mapped[str] = mapped_column(String(CHAVE_MAX), nullable=False)
    auth: Mapped[str] = mapped_column(String(CHAVE_MAX), nullable=False)
    user_agent: Mapped[Optional[str]] = mapped_column(String(USER_AGENT_MAX), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, server_default=func.now()
    )
    last_success_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))

    def __repr__(self) -> str:
        return f"<PushInscricao(medium_id={self.medium_id}, failures={self.failures})>"
