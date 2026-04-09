"""Stripe integration service."""
import stripe
from datetime import datetime, timezone
from typing import Optional

from ..core.config import settings

# Initialize Stripe with secret key
stripe.api_key = settings.STRIPE_SECRET_KEY


def _price_id_for_plan(plan: str) -> Optional[str]:
    """Return Stripe Price ID for a plan slug."""
    mapping = {
        "basic": settings.STRIPE_PRICE_BASIC,
        "pro": settings.STRIPE_PRICE_PRO,
        "premium": settings.STRIPE_PRICE_PREMIUM,
    }
    return mapping.get(plan.lower())


async def get_or_create_customer(tenant_id: str, email: str, name: str) -> str:
    """Return existing Stripe Customer ID or create a new one."""
    # Search for existing customer by metadata
    customers = stripe.Customer.search(
        query=f'metadata["tenant_id"]:"{tenant_id}"',
    )
    if customers.data:
        return customers.data[0].id

    customer = stripe.Customer.create(
        email=email,
        name=name,
        metadata={"tenant_id": tenant_id},
    )
    return customer.id


async def create_checkout_session(
    customer_id: str,
    plan: str,
    tenant_id: str,
) -> str:
    """Create a Stripe Checkout Session and return the URL."""
    price_id = _price_id_for_plan(plan)
    if not price_id:
        raise ValueError(f"Plano inválido ou sem Price ID configurado: {plan}")

    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{settings.FRONTEND_URL}/admin/billing?session_id={{CHECKOUT_SESSION_ID}}&status=success",
        cancel_url=f"{settings.FRONTEND_URL}/admin/billing?status=cancelled",
        metadata={"tenant_id": tenant_id},
        subscription_data={"metadata": {"tenant_id": tenant_id}},
    )
    return session.url


async def update_subscription(stripe_subscription_id: str, new_plan: str) -> dict:
    """Upgrade or downgrade an existing Stripe subscription immediately."""
    price_id = _price_id_for_plan(new_plan)
    if not price_id:
        raise ValueError(f"Plano inválido ou sem Price ID configurado: {new_plan}")

    subscription = stripe.Subscription.retrieve(stripe_subscription_id)
    item_id = subscription["items"]["data"][0]["id"]

    updated = stripe.Subscription.modify(
        stripe_subscription_id,
        items=[{"id": item_id, "price": price_id}],
        proration_behavior="always_invoice",
    )
    return updated


async def cancel_subscription(stripe_subscription_id: str) -> dict:
    """Cancel a Stripe subscription at period end."""
    updated = stripe.Subscription.modify(
        stripe_subscription_id,
        cancel_at_period_end=True,
    )
    return updated


async def cancel_subscription_immediately(stripe_subscription_id: str) -> dict:
    """Cancel a Stripe subscription immediately (e.g. for bonus tenants)."""
    cancelled = stripe.Subscription.cancel(stripe_subscription_id)
    return cancelled


async def reactivate_subscription(stripe_subscription_id: str) -> dict:
    """Reactivate a subscription that was scheduled to cancel at period end.

    Only valid when cancel_at_period_end=True and the period has not ended yet.
    """
    updated = stripe.Subscription.modify(
        stripe_subscription_id,
        cancel_at_period_end=False,
    )
    return updated


def construct_webhook_event(payload: bytes, sig_header: str) -> stripe.Event:
    """Construct and verify a Stripe webhook event."""
    return stripe.Webhook.construct_event(
        payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
    )
