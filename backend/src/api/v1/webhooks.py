"""Stripe webhook handler — no JWT, validates Stripe signature."""
import logging
from fastapi import APIRouter, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.core.database import get_db
from fastapi import Depends
from src.models import Subscription, PlanType, SubscriptionStatus
from src.repositories.subscription_repo import SubscriptionRepository
from src.repositories.audit_log_repo import AuditLogRepository
from src.models.audit_logs import AuditAction
from src.services import stripe_service

logger = logging.getLogger("senhas")

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])

PLAN_LIMITS = {
    "price_basic":   {},  # resolved dynamically below
}

_PRICE_TO_PLAN_LIMITS: dict = {}  # populated lazily from settings


def _get_price_plan_map() -> dict:
    """Build price_id → (PlanType, limits) map from settings (lazy, cached)."""
    if _PRICE_TO_PLAN_LIMITS:
        return _PRICE_TO_PLAN_LIMITS

    from src.core.config import settings

    _PRICE_TO_PLAN_LIMITS.update({
        settings.STRIPE_PRICE_BASIC: {
            "plan": PlanType.BASIC, "max_users": 5, "max_giras_per_month": 10, "max_mediuns": 20, "monthly_price": 49.0,
        },
        settings.STRIPE_PRICE_PRO: {
            "plan": PlanType.PRO, "max_users": 20, "max_giras_per_month": 50, "max_mediuns": 100, "monthly_price": 79.0,
        },
        settings.STRIPE_PRICE_PREMIUM: {
            "plan": PlanType.PREMIUM, "max_users": -1, "max_giras_per_month": -1, "max_mediuns": -1, "monthly_price": 99.0,
        },
    })
    return _PRICE_TO_PLAN_LIMITS


async def _get_subscription_by_customer(customer_id: str, db: AsyncSession):
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_customer_id == customer_id)
    )
    return result.scalar_one_or_none()


@router.post("/stripe")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Stripe webhook events.

    Endpoint is excluded from JWT middleware (public_paths in jwt_middleware.py).
    Stripe signature is validated here before any processing.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe_service.construct_webhook_event(payload, sig_header)
    except Exception as exc:
        logger.warning("Stripe webhook signature validation failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")

    event_type = event["type"]
    data = event["data"]["object"]

    try:
        if event_type == "checkout.session.completed":
            await _handle_checkout_completed(data, db)

        elif event_type in ("customer.subscription.updated", "customer.subscription.created"):
            await _handle_subscription_updated(data, db)

        elif event_type == "customer.subscription.deleted":
            await _handle_subscription_deleted(data, db)

        elif event_type == "invoice.payment_failed":
            await _handle_payment_failed(data, db)

        else:
            logger.debug("Unhandled Stripe event type: %s", event_type)

    except Exception as exc:
        logger.error("Error processing Stripe event %s: %s", event_type, exc, exc_info=True)
        # Return 200 to Stripe so it does not retry — we log internally
        return {"received": True, "warning": "processing error logged"}

    return {"received": True}


# ---------------------------------------------------------------------------
# Event handlers
# ---------------------------------------------------------------------------

async def _handle_checkout_completed(session: dict, db: AsyncSession) -> None:
    """checkout.session.completed — link Stripe subscription to tenant."""
    tenant_id_str = (session.get("metadata") or {}).get("tenant_id")
    stripe_subscription_id = session.get("subscription")
    customer_id = session.get("customer")

    if not tenant_id_str or not stripe_subscription_id:
        logger.warning("checkout.session.completed missing metadata/subscription")
        return

    from uuid import UUID
    tenant_id = UUID(tenant_id_str)
    repo = SubscriptionRepository(db)
    sub = await repo.get_by_tenant(tenant_id)
    if not sub:
        logger.warning("Subscription not found for tenant %s", tenant_id_str)
        return

    # Retrieve subscription details from Stripe to get price/period
    import stripe
    stripe_sub = stripe.Subscription.retrieve(stripe_subscription_id)
    price_id = stripe_sub["items"]["data"][0]["price"]["id"]
    current_period_end_ts = stripe_sub.get("current_period_end")

    plan_map = _get_price_plan_map()
    limits = plan_map.get(price_id)
    if not limits:
        logger.warning("Unknown price_id from Stripe: %s", price_id)
        return

    from datetime import datetime, timezone
    sub.stripe_subscription_id = stripe_subscription_id
    sub.stripe_customer_id = customer_id
    sub.stripe_price_id = price_id
    sub.plan = limits["plan"]
    sub.max_users = limits["max_users"]
    sub.max_giras_per_month = limits["max_giras_per_month"]
    sub.max_mediuns = limits["max_mediuns"]
    sub.monthly_price = limits["monthly_price"]
    sub.status = SubscriptionStatus.ACTIVE
    sub.cancel_at_period_end = False
    if current_period_end_ts:
        sub.current_period_end = datetime.fromtimestamp(current_period_end_ts, tz=timezone.utc)

    audit = AuditLogRepository(db)
    await audit.create(
        tenant_id=tenant_id,
        user_id=None,
        action=AuditAction.CREATE,
        resource_type="stripe_subscription",
        resource_id=sub.id,
        details={"event": "checkout.session.completed", "plan": limits["plan"].value},
    )
    await db.commit()
    logger.info("Checkout completed for tenant %s — plan %s", tenant_id_str, limits["plan"].value)


async def _handle_subscription_updated(stripe_sub: dict, db: AsyncSession) -> None:
    """customer.subscription.updated/created — sync plan + status + period."""
    customer_id = stripe_sub.get("customer")
    sub = await _get_subscription_by_customer(customer_id, db)
    if not sub:
        logger.debug("No local subscription for Stripe customer %s", customer_id)
        return

    price_id = stripe_sub["items"]["data"][0]["price"]["id"]
    current_period_end_ts = stripe_sub.get("current_period_end")
    cancel_at_end = stripe_sub.get("cancel_at_period_end", False)
    stripe_status = stripe_sub.get("status")

    plan_map = _get_price_plan_map()
    limits = plan_map.get(price_id)
    if limits:
        sub.stripe_price_id = price_id
        sub.plan = limits["plan"]
        sub.max_users = limits["max_users"]
        sub.max_giras_per_month = limits["max_giras_per_month"]
        sub.max_mediuns = limits["max_mediuns"]
        sub.monthly_price = limits["monthly_price"]

    sub.cancel_at_period_end = cancel_at_end
    if current_period_end_ts:
        from datetime import datetime, timezone
        sub.current_period_end = datetime.fromtimestamp(current_period_end_ts, tz=timezone.utc)

    if stripe_status == "active":
        sub.status = SubscriptionStatus.ACTIVE
    elif stripe_status in ("past_due", "unpaid"):
        sub.status = SubscriptionStatus.SUSPENDED

    await db.commit()


async def _handle_subscription_deleted(stripe_sub: dict, db: AsyncSession) -> None:
    """customer.subscription.deleted — mark as CANCELLED and revert to FREE."""
    customer_id = stripe_sub.get("customer")
    sub = await _get_subscription_by_customer(customer_id, db)
    if not sub:
        return

    sub.status = SubscriptionStatus.CANCELLED
    sub.plan = PlanType.FREE
    sub.stripe_subscription_id = None
    sub.stripe_price_id = None
    sub.cancel_at_period_end = False
    sub.max_users = 1
    sub.max_giras_per_month = 2
    sub.max_mediuns = 0
    sub.monthly_price = 0.0

    audit = AuditLogRepository(db)
    await audit.create(
        tenant_id=sub.tenant_id,
        user_id=None,
        action=AuditAction.DELETE,
        resource_type="stripe_subscription",
        resource_id=sub.id,
        details={"event": "customer.subscription.deleted"},
    )
    await db.commit()
    logger.info("Subscription cancelled for tenant %s", sub.tenant_id)


async def _handle_payment_failed(invoice: dict, db: AsyncSession) -> None:
    """invoice.payment_failed — suspend subscription."""
    customer_id = invoice.get("customer")
    sub = await _get_subscription_by_customer(customer_id, db)
    if not sub:
        return

    sub.status = SubscriptionStatus.SUSPENDED
    audit = AuditLogRepository(db)
    await audit.create(
        tenant_id=sub.tenant_id,
        user_id=None,
        action=AuditAction.UPDATE,
        resource_type="stripe_subscription",
        resource_id=sub.id,
        details={"event": "invoice.payment_failed"},
    )
    await db.commit()
    logger.warning("Payment failed — tenant %s suspended", sub.tenant_id)
