"""Fábricas de dados para a suíte Postgres. Gravam direto pelo ORM (com
commit), sem passar pela API, para preparar o cenário de cada teste."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from src.models.giras import Gira
from src.models.permission_groups import GroupPermission, PermissionFeature, PermissionGroup, UserGroupMembership
from src.models.subscriptions import PlanType, Subscription, SubscriptionStatus
from src.models.tenant_config import TenantConfig
from src.models.tenants import Tenant
from src.models.users import User, UserRole
from src.repositories.subscription_repo import SubscriptionRepository
from src.security.jwt import create_access_token


@dataclass
class Actor:
    user: User
    headers: dict


async def create_tenant(
    db, name: str = "Terreiro Teste", plan: PlanType = PlanType.PREMIUM, area_medium_liberada: bool = False
) -> Tenant:
    slug = f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:6]}"
    tenant = Tenant(name=name, slug=slug, is_active=True, area_medium_liberada=area_medium_liberada)
    db.add(tenant)
    await db.flush()
    limits = SubscriptionRepository(db)._get_plan_config(plan)
    db.add(
        Subscription(
            tenant_id=tenant.id,
            plan=plan,
            status=SubscriptionStatus.ACTIVE,
            max_users=limits["max_users"],
            max_giras_per_month=limits["max_giras_per_month"],
            max_mediuns=limits["max_mediuns"],
            monthly_price=limits["price"],
        )
    )
    db.add(TenantConfig(tenant_id=tenant.id))
    await db.commit()
    return tenant


async def create_user(db, tenant: Optional[Tenant], role: UserRole = UserRole.ADMIN, name: str = "usuario") -> Actor:
    suffix = uuid.uuid4().hex[:8]
    user = User(
        tenant_id=tenant.id if tenant else None,
        email=f"{name}-{suffix}@example.com",
        username=f"{name}-{suffix}",
        password_hash="x" * 60,  # nunca usado: autenticação por token gerado no teste
        role=role,
        is_active=True,
        full_name=name.title(),
    )
    db.add(user)
    await db.commit()
    token = create_access_token(user.id, user.tenant_id, role.value)
    return Actor(user=user, headers={"Authorization": f"Bearer {token}"})


async def create_gira(
    db,
    tenant: Tenant,
    max_tickets: int = 10,
    open_now: bool = True,
    nome: str = "Gira de Caboclos",
) -> Gira:
    now = datetime.now(timezone.utc)
    gira = Gira(
        tenant_id=tenant.id,
        nome=nome,
        data_inicio=now + timedelta(days=2),
        is_active=True,
        max_tickets=max_tickets,
        release_start_at=now - timedelta(hours=1) if open_now else now + timedelta(days=1),
        release_end_at=now + timedelta(days=1, hours=23),
    )
    db.add(gira)
    await db.commit()
    return gira


async def grant(db, actor: Actor, tenant: Tenant, feature: PermissionFeature, *actions: str) -> PermissionGroup:
    """Cria um grupo com as ações dadas (view/insert/edit/delete) e põe o usuário nele."""
    group = PermissionGroup(tenant_id=tenant.id, name=f"Grupo {feature.value} {uuid.uuid4().hex[:4]}")
    db.add(group)
    await db.flush()
    db.add(
        GroupPermission(
            group_id=group.id,
            feature=feature,
            can_view="view" in actions,
            can_insert="insert" in actions,
            can_edit="edit" in actions,
            can_delete="delete" in actions,
        )
    )
    db.add(UserGroupMembership(group_id=group.id, user_id=actor.user.id, tenant_id=tenant.id))
    await db.commit()
    return group
