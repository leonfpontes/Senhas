"""Área do Médium — vínculo médium↔usuário e áreas de acesso (AM-02).

Regras (docs/plano-area-do-medium.md §6.2/§6.3):
- **Área administrativa** = papel `admin` ou `operator` (super admin vai para
  `/platform` e não conta aqui).
- **Área do Médium** = existe `Medium` com `user_id = user.id`, do MESMO tenant,
  não excluído e ativo, **e** o plano efetivo do terreiro (plano × status da
  assinatura) tem `area_medium`, **e** a Área está ligada na configuração do
  terreiro (AM-10; por enquanto sempre ligada).
- As áreas são calculadas no servidor a cada chamada — nunca vão no JWT (o
  access token vale 24 h e o vínculo pode mudar a qualquer momento).

`require_medium` (src/api/dependencies.py) usa `get_linked_medium` e o gate de
plano HTTP; `GET /auth/me`, `GET /auth/profile` e o login usam `compute_areas`.
"""
from __future__ import annotations

import uuid
from typing import Optional

from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Medium, Tenant, User, UserRole
from ..repositories.subscription_repo import SubscriptionRepository
from .plan_features import get_effective_plan_features
from . import session_service

# Papéis com acesso ao painel do terreiro (back-office). SUPER_ADMIN fica fora:
# usa /platform e só entra num tenant impersonando (o token passa a ser do alvo).
BACKOFFICE_ROLES = frozenset({UserRole.ADMIN, UserRole.OPERATOR})


async def get_linked_medium(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID) -> Optional[Medium]:
    """Médium ativo e não excluído ligado ao usuário, dentro do tenant (ou None)."""
    result = await db.execute(
        select(Medium).where(
            Medium.user_id == user_id,
            Medium.tenant_id == tenant_id,
            Medium.deleted_at.is_(None),
            Medium.is_active.is_(True),
        )
    )
    return result.scalar_one_or_none()


async def area_medium_enabled_by_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> bool:
    """Configuração da Área ligada no terreiro.

    TODO(AM-10): ler a configuração da Área (boas-vindas, módulos, liga/desliga)
    quando ela existir. Até lá a Área vale para todo terreiro cujo plano a inclui.
    """
    return True


async def area_medium_liberada(db: AsyncSession, tenant_id: uuid.UUID) -> bool:
    """A plataforma liberou a Área do Médium para o terreiro (chave do lançamento em piloto)."""
    result = await db.execute(select(Tenant.area_medium_liberada).where(Tenant.id == tenant_id))
    return bool(result.scalar_one_or_none())


async def tenant_has_area_medium(db: AsyncSession, tenant_id: uuid.UUID) -> bool:
    """Plano efetivo (plano × status da assinatura) inclui `area_medium`, a plataforma
    liberou a Área para o terreiro e a Área está ligada na configuração."""
    sub = await SubscriptionRepository(db).get_by_tenant(tenant_id)
    if not get_effective_plan_features(sub).area_medium:
        return False
    if not await area_medium_liberada(db, tenant_id):
        return False
    return await area_medium_enabled_by_tenant(db, tenant_id)


def areas_payload(user: User, medium: Optional[Medium]) -> dict:
    """Formato único de `areas` (login, /auth/me, /auth/profile, /medium/me)."""
    return {
        "admin": user.role in BACKOFFICE_ROLES,
        "medium": {"medium_id": str(medium.id), "nome": medium.nome} if medium is not None else None,
    }


async def compute_areas(db: AsyncSession, user: User) -> dict:
    """``{"admin": bool, "medium": {"medium_id", "nome"} | None}`` do usuário.

    `medium` só vem preenchido quando o vínculo está ativo E o plano/status do
    terreiro libera a Área — médium cujo terreiro perdeu o plano recebe `None`
    (a tela mostra o aviso neutro, sem oferta de upgrade ao médium — AM-04).
    """
    if user.tenant_id is None:
        return areas_payload(user, None)
    medium = await get_linked_medium(db, user.tenant_id, user.id)
    if medium is None or not await tenant_has_area_medium(db, user.tenant_id):
        return areas_payload(user, None)
    return areas_payload(user, medium)


# ── Efeitos colaterais no cadastro (Usuários × Médiuns) ─────────────────────


async def unlink_user(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Desfaz o vínculo `mediuns.user_id` do usuário no tenant (sem commit).

    Usado quando a conta é excluída (soft delete não dispara o ON DELETE SET NULL
    da FK): o médium fica livre para um convite novo (AM-03).
    """
    await db.execute(
        update(Medium)
        .where(Medium.tenant_id == tenant_id, Medium.user_id == user_id)
        .values(user_id=None)
    )


async def sync_pure_medium_user(db: AsyncSession, tenant_id: uuid.UUID, medium: Medium) -> Optional[User]:
    """Acompanha o médium na conta `medium` pura ligada a ele (sem commit; D-08).

    - Médium inativado ou excluído → a conta `medium` é desativada e as sessões
      dela caem na hora (o `require_medium` já falharia; isto tira o login).
    - Médium reativado → a conta `medium` volta a entrar.
    Operador/admin ligado ao médium não muda: só perde (ou recupera) a Área,
    porque o `require_medium` confere o médium a cada requisição.
    Retorna o usuário alterado, ou None.
    """
    if medium.user_id is None:
        return None
    user = (
        await db.execute(
            select(User).where(
                User.id == medium.user_id,
                User.tenant_id == tenant_id,
                User.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if user is None or user.role != UserRole.MEDIUM:
        return None
    should_be_active = medium.deleted_at is None and medium.is_active
    if user.is_active == should_be_active:
        return None
    user.is_active = should_be_active
    if not should_be_active:
        user.sessions_revoked_at = datetime.now(timezone.utc)
        await session_service.end_all_sessions(db, user.id)
    db.add(user)
    await db.flush()
    return user
