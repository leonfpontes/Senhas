"""Auditoria das ações do super-admin na plataforma.

O middleware de auditoria só registra rotas ``/api/v1/admin``; impersonação e as
ações de ``/api/v1/platform`` (suspender, trocar plano, editar terreiro, CRUD de
super-admins, redefinir senha de usuário de terreiro) ficavam sem rastro.

``log_platform_action`` só faz ``db.add`` — quem chama precisa fazer o commit
DEPOIS (o log vai na mesma transação da ação; se a ação falhar, o log some junto).

Não existe valor de ``AuditAction`` específico para cada ação de plataforma e não
criamos migração para isso: usamos o valor genérico mais próximo (create, update,
delete, login) e o detalhe vai em ``details``:

- ``platform_action``: identificador estável (``impersonation_start``,
  ``subscription_suspend``...), marca o log como ação da plataforma;
- ``description``: frase pronta para a tela de auditoria;
- demais campos da ação (plano anterior/novo, valores alterados...).

``tenant_id`` é o terreiro afetado (aparece na auditoria do terreiro e no filtro
por terreiro da auditoria consolidada); ``None`` para ações só da plataforma
(CRUD de super-admins).
"""
from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.models.audit_logs import AuditAction, AuditLog


def log_platform_action(
    db: AsyncSession,
    *,
    actor_id: UUID,
    action: AuditAction,
    platform_action: str,
    description: str,
    tenant_id: Optional[UUID],
    resource_type: str,
    resource_id: Optional[UUID] = None,
    **details: Any,
) -> AuditLog:
    """Adiciona na sessão o log de uma ação da plataforma (sem commit)."""
    log = AuditLog(
        tenant_id=tenant_id,
        user_id=actor_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details={"platform_action": platform_action, "description": description, **details},
    )
    db.add(log)
    return log
