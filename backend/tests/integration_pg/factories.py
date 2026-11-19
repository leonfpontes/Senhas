"""Fábricas de dados para a suíte Postgres. Gravam direto pelo ORM (com
commit), sem passar pela API, para preparar o cenário de cada teste."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from src.models.feature_flags import FeatureFlag
from src.models.giras import Gira
from src.models.permission_groups import GroupPermission, PermissionFeature, PermissionGroup, UserGroupMembership
from src.models.subscriptions import PlanType, Subscription, SubscriptionStatus
from src.models.tenant_config import TenantConfig
from src.models.tenants import Tenant
from src.models.users import User, UserRole
from src.repositories.subscription_repo import SubscriptionRepository
from src.security.jwt import create_access_token
from src.services.laboratorio import BETA_AREA_MEDIUM


async def set_area_medium(db, tenant_id, ligada: bool) -> None:
    """Liga ou desliga a Área do Médium do terreiro (beta tester + beta no Laboratório), sem commit."""
    from sqlalchemy import delete, update

    if ligada:
        await db.execute(update(Tenant).where(Tenant.id == tenant_id).values(beta_tester=True))
        await db.execute(delete(FeatureFlag).where(FeatureFlag.tenant_id == tenant_id, FeatureFlag.feature == BETA_AREA_MEDIUM))
        db.add(FeatureFlag(tenant_id=tenant_id, feature=BETA_AREA_MEDIUM, enabled=True))
        await db.flush()
    else:
        await db.execute(
            update(FeatureFlag)
            .where(FeatureFlag.tenant_id == tenant_id, FeatureFlag.feature == BETA_AREA_MEDIUM)
            .values(enabled=False)
        )


@dataclass
class Actor:
    user: User
    headers: dict


async def create_tenant(
    db, name: str = "Terreiro Teste", plan: PlanType = PlanType.PREMIUM, area_medium_liberada: bool = False
) -> Tenant:
    """`area_medium_liberada=True` deixa a Área do Médium valendo como em produção desde a migração 110:
    terreiro beta tester com a beta `beta_area_medium` ligada no Laboratório."""
    slug = f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:6]}"
    tenant = Tenant(name=name, slug=slug, is_active=True, beta_tester=area_medium_liberada)
    db.add(tenant)
    await db.flush()
    if area_medium_liberada:
        db.add(FeatureFlag(tenant_id=tenant.id, feature=BETA_AREA_MEDIUM, enabled=True))
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


async def deactivate_tenant(db, tenant: Tenant, by: Optional[User]) -> None:
    """Estado que o POST /auth/deactivate-account deixa: terreiro marcado e o autor em
    `self_deactivated_by` — só ele reativa (pentest H1). `by=None` = desativação
    anterior à migração 095 (sem autor)."""
    from sqlalchemy import update

    agora = datetime.now(timezone.utc)
    await db.execute(
        update(Tenant)
        .where(Tenant.id == tenant.id)
        .values(is_active=False, deleted_at=agora, self_deactivated_at=agora, self_deactivated_by=by.id if by else None)
    )
    await db.commit()


class _Resposta:
    """Resposta mínima (status_code + json()) no formato da antiga criação com senha."""

    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload
        self.text = str(payload)

    def json(self) -> dict:
        return self._payload


async def convidar_e_aceitar(client, headers: dict, body: dict):
    """Cria uma pessoa do painel como na vida real (11/2026): convite + aceite com senha nova.

    `body` no formato antigo ({email, username, password, role}). Recusa do convite (403,
    409, 422...) volta como veio; aceite volta 201 com {id, role} da conta criada. Os cookies
    da sessão aberta no aceite são descartados (o teste segue com os headers de quem convidou).
    """
    from unittest.mock import patch

    from src.services.email.email_queue import email_queue

    enviados: list = []
    with patch.object(email_queue, "enqueue", lambda item: enviados.append(item.message)):
        convite = await client.post(
            "/api/v1/admin/users/convites",
            headers=headers,
            json={"email": body["email"], "nome": body.get("username") or body.get("nome"), "role": body.get("role", "operator")},
        )
    if convite.status_code != 201:
        return convite
    token = enviados[-1].text_body.split("/convite-equipe/", 1)[1].split()[0]
    aceite = await client.post(
        f"/api/v1/public/convite-equipe/{token}/aceitar",
        json={"modo": "senha_nova", "senha": body.get("password", "Senha-forte-123"), "aceite_termos": True},
    )
    client.cookies.clear()
    if aceite.status_code != 200:
        return aceite
    user = aceite.json()["user"]
    return _Resposta(201, {"id": user["id"], "role": user["role"], "email": user["email"]})
