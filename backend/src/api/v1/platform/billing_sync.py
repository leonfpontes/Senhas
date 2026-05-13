"""Platform API - Sync manual de subscription Stripe para um tenant (SUPER_ADMIN)."""
import asyncio
import logging
from uuid import UUID
from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.api.dependencies import get_current_user
from src.models import User, UserRole, SubscriptionStatus
from src.repositories.subscription_repo import SubscriptionRepository
from src.repositories.audit_log_repo import AuditLogRepository
from src.models.audit_logs import AuditAction
from src.api.v1.webhooks import _get_price_plan_map

logger = logging.getLogger("senhas")

router = APIRouter(prefix="/api/v1/platform/tenants", tags=["platform-billing-sync"])


class SyncStripeRequest(BaseModel):
    stripe_subscription_id: str


class SyncStripeResponse(BaseModel):
    tenant_id: str
    plan: str
    status: str
    stripe_subscription_id: str
    stripe_customer_id: str


async def _require_super_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.SUPER_ADMIN or user.tenant_id is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas SUPER_ADMIN pode acessar esta operação",
        )
    return user


@router.post(
    "/{tenant_id}/billing/sync-stripe",
    response_model=SyncStripeResponse,
    summary="Sincroniza manualmente a subscription Stripe de um tenant",
)
async def sync_stripe_subscription(
    tenant_id: UUID,
    body: SyncStripeRequest,
    current_user: User = Depends(_require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> SyncStripeResponse:
    """Força a sincronização de uma subscription Stripe com o plano local do tenant.

    Use quando o webhook não foi processado corretamente (ex: price_id desconhecido
    no momento da entrega, .env errado, etc.).

    Requer SUPER_ADMIN. Busca a subscription diretamente na API Stripe e atualiza
    o registro local.
    """
    repo = SubscriptionRepository(db)
    sub = await repo.get_by_tenant(tenant_id)
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Subscription não encontrada para tenant {tenant_id}",
        )

    # Fetch from Stripe (blocking call wrapped in thread)
    try:
        stripe_sub = await asyncio.to_thread(
            stripe.Subscription.retrieve, body.stripe_subscription_id
        )
    except stripe.error.InvalidRequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Stripe não encontrou a subscription: {exc}",
        )
    except stripe.error.StripeError as exc:
        logger.error("Erro ao buscar subscription %s no Stripe: %s", body.stripe_subscription_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha na comunicação com a Stripe",
        )

    price_id = stripe_sub["items"]["data"][0]["price"]["id"]
    customer_id = stripe_sub.get("customer")
    current_period_end_ts = stripe_sub.get("current_period_end")
    cancel_at_end = stripe_sub.get("cancel_at_period_end", False)
    stripe_status = stripe_sub.get("status")

    plan_map = _get_price_plan_map()
    limits = plan_map.get(price_id)
    if not limits:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"price_id '{price_id}' retornado pelo Stripe não está mapeado no sistema. "
                "Verifique STRIPE_PRICE_PRO/BASIC/PREMIUM no .env do servidor."
            ),
        )

    sub.stripe_subscription_id = body.stripe_subscription_id
    sub.stripe_customer_id = customer_id
    sub.stripe_price_id = price_id
    sub.plan = limits["plan"]
    sub.max_users = limits["max_users"]
    sub.max_giras_per_month = limits["max_giras_per_month"]
    sub.max_mediuns = limits["max_mediuns"]
    sub.monthly_price = limits["monthly_price"]
    sub.cancel_at_period_end = cancel_at_end

    if stripe_status == "active":
        sub.status = SubscriptionStatus.ACTIVE
    elif stripe_status in ("past_due", "unpaid"):
        sub.status = SubscriptionStatus.SUSPENDED
    elif stripe_status == "canceled":
        sub.status = SubscriptionStatus.CANCELLED

    if current_period_end_ts:
        sub.current_period_end = datetime.fromtimestamp(current_period_end_ts, tz=timezone.utc)

    audit = AuditLogRepository(db)
    await audit.create(
        tenant_id=tenant_id,
        user_id=current_user.id,
        action=AuditAction.UPDATE,
        resource_type="stripe_subscription",
        resource_id=sub.id,
        details={
            "event": "manual_sync",
            "synced_by": str(current_user.id),
            "plan": limits["plan"].value,
            "stripe_status": stripe_status,
        },
    )

    await db.commit()
    logger.info(
        "Sync manual Stripe realizado por %s — tenant %s → plano %s",
        current_user.id,
        tenant_id,
        limits["plan"].value,
    )

    return SyncStripeResponse(
        tenant_id=str(tenant_id),
        plan=limits["plan"].value,
        status=sub.status.value,
        stripe_subscription_id=body.stripe_subscription_id,
        stripe_customer_id=str(customer_id),
    )
