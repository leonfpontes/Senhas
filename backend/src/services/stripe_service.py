"""Stripe integration service."""
import asyncio
import logging

import stripe
from datetime import datetime, timezone
from typing import Optional

from ..core.config import settings

logger = logging.getLogger(__name__)

# Initialize Stripe with secret key
stripe.api_key = settings.STRIPE_SECRET_KEY

# $-04: formas de cobrança da assinatura do plano.
COLLECTION_CARD = "charge_automatically"   # cartão, renovação automática (Checkout)
COLLECTION_INVOICE = "send_invoice"         # fatura por e-mail todo mês (boleto)


def invoice_payment_method_types() -> list[str]:
    """Formas de pagamento oferecidas na fatura da assinatura "por boleto".

    Vem de STRIPE_INVOICE_PAYMENT_METHODS (padrão "boleto"). Lista explícita de propósito:
    se a forma não estiver ativada na conta Stripe, a criação falha com erro claro em vez
    de a fatura sair só com cartão.
    """
    raw = settings.STRIPE_INVOICE_PAYMENT_METHODS or "boleto"
    types = [t.strip().lower() for t in raw.split(",") if t.strip()]
    return types or ["boleto"]


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
    trial_period_days: Optional[int] = None,
) -> str:
    """Create a Stripe Checkout Session and return the URL.

    trial_period_days: when the tenant converts mid local-trial, pass the
    remaining trial days here so Stripe doesn't charge immediately — keeps
    the "1 month free" promise intact regardless of when they add a card.
    """
    price_id = _price_id_for_plan(plan)
    if not price_id:
        raise ValueError(f"Plano inválido ou sem Price ID configurado: {plan}")

    subscription_data: dict = {"metadata": {"tenant_id": tenant_id}}
    if trial_period_days and trial_period_days > 0:
        subscription_data["trial_period_days"] = trial_period_days

    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        # "Cartão de crédito" é só cartão (carteiras como Apple/Google Pay entram como
        # card). Sem isso, ativar o Boleto na conta (para as faturas do $-04) faria ele
        # aparecer também aqui, como assinatura de cobrança automática por boleto —
        # um fluxo que o painel não acompanha. Boleto vai por create_invoice_subscription.
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{settings.FRONTEND_URL}/admin/billing?session_id={{CHECKOUT_SESSION_ID}}&status=success",
        cancel_url=f"{settings.FRONTEND_URL}/admin/billing?status=cancelled",
        metadata={"tenant_id": tenant_id},
        subscription_data=subscription_data,
    )
    return session.url


async def create_invoice_subscription(
    customer_id: str,
    plan: str,
    tenant_id: str,
    trial_period_days: Optional[int] = None,
) -> dict:
    """Cria a assinatura cobrada por fatura (boleto) e devolve o objeto como dict.

    `collection_method="send_invoice"`: a cada período a Stripe finaliza uma fatura e manda
    por e-mail com o link da página de pagamento (hosted_invoice_url), com
    STRIPE_INVOICE_DAYS_UNTIL_DUE dias para pagar. Sem Checkout: a Stripe cria a assinatura
    já `active` (ou `trialing`) mesmo com a fatura em aberto — quem libera o plano no
    GiraHub é o webhook `invoice.paid` (webhooks.py), não este retorno.

    `latest_invoice` vem expandido para o painel já mostrar o link "Pagar agora".
    """
    price_id = _price_id_for_plan(plan)
    if not price_id:
        raise ValueError(f"Plano inválido ou sem Price ID configurado: {plan}")

    params: dict = {
        "customer": customer_id,
        "items": [{"price": price_id, "quantity": 1}],
        "collection_method": COLLECTION_INVOICE,
        "days_until_due": settings.STRIPE_INVOICE_DAYS_UNTIL_DUE,
        "payment_settings": {"payment_method_types": invoice_payment_method_types()},
        "metadata": {"tenant_id": tenant_id, "girahub_collection": COLLECTION_INVOICE},
        "expand": ["latest_invoice"],
    }
    if trial_period_days and trial_period_days > 0:
        params["trial_period_days"] = trial_period_days

    created = await asyncio.to_thread(stripe.Subscription.create, **params)
    return created.to_dict() if hasattr(created, "to_dict") else dict(created)


async def cancel_pending_invoice_subscription(
    stripe_subscription_id: str, invoice_id: Optional[str] = None
) -> None:
    """Desiste de uma assinatura por boleto que nunca foi paga.

    Cancela a assinatura na hora e anula (void) a fatura em aberto, para o boleto já
    emitido não poder mais ser pago. A anulação é best-effort: a fatura pode já ter sido
    paga/anulada — o cancelamento é o que importa.
    """
    await asyncio.to_thread(stripe.Subscription.cancel, stripe_subscription_id)
    if invoice_id:
        try:
            await asyncio.to_thread(stripe.Invoice.void_invoice, invoice_id)
        except stripe.error.StripeError as exc:
            logger.warning("Não foi possível anular a fatura %s: %s", invoice_id, exc)


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
