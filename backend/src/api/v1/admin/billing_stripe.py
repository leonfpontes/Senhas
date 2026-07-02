"""Admin API - Stripe Billing endpoint."""
import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

import stripe as stripe_sdk

from src.core.database import get_db
from src.api.dependencies import get_current_user
from src.models import User, UserRole, Subscription, PlanType, Tenant
from src.repositories.subscription_repo import SubscriptionRepository, PLAN_LIMITS
from src.repositories.audit_log_repo import AuditLogRepository
from src.models.audit_logs import AuditAction
from src.services import stripe_service
from src.core.errors import NotFoundError
from src.services.email.base import EmailMessage
from src.services.email.resend_fallback import ResendEmailService
from src.services.email.brevo_provider import BrevoEmailService
from src.services.email.templates.subscription_cancelled import render_subscription_cancelled_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin/billing", tags=["admin-billing"])

PLAN_LABELS = {
    PlanType.FREE: "Gratuito",
    PlanType.BASIC: "Basic",
    PlanType.PRO: "Pro",
    PlanType.PREMIUM: "Premium",
}


async def _send_subscription_cancelled_email(email: str, user_name: str, plan_label: str, access_until: str) -> None:
    """Best-effort notification when a subscription is scheduled for cancellation (fire-and-forget)."""
    html = render_subscription_cancelled_email(user_name, plan_label, access_until)
    msg = EmailMessage(
        to_email=email,
        subject="Cancelamento de assinatura confirmado — GiraHub",
        html_body=html,
        text_body=(
            f"Olá, {user_name}.\n\nConfirmamos o cancelamento da sua assinatura {plan_label}. "
            f"Você continua com acesso até {access_until}, quando sua conta passa para o plano gratuito."
        ),
    )
    try:
        sent = await ResendEmailService().send_async(msg)
        if not sent:
            raise RuntimeError("Resend returned False")
    except Exception:
        try:
            await BrevoEmailService().send_async(msg)
        except Exception as exc:
            logger.warning("Subscription-cancelled notification email failed for %s: %s", email, exc)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class BillingInfoResponse(BaseModel):
    plan: str
    status: str
    is_bonus: bool
    stripe_subscription_id: Optional[str]
    stripe_customer_id: Optional[str]
    current_period_end: Optional[str]
    cancel_at_period_end: bool
    monthly_price: float
    currency: str


class CreateCheckoutRequest(BaseModel):
    plan: str  # "basic" | "pro" | "premium"


class CheckoutResponse(BaseModel):
    checkout_url: str


class ChangePlanRequest(BaseModel):
    plan: str  # "basic" | "pro" | "premium"


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------

def _require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Acesso negado")
    return user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Planos contratáveis via checkout/change-plan (FREE não entra — não se compra).
PAID_PLANS = (PlanType.BASIC, PlanType.PRO, PlanType.PREMIUM)


def _plan_limits_for(plan_str: str) -> dict:
    """Resolve os limites do plano a partir de PLAN_LIMITS (subscription_repo.py),
    a fonte única de verdade — validado contra a landing page pública
    (frontend/src/pages/index.tsx), que é o que realmente é vendido ao cliente.
    """
    try:
        plan = PlanType(plan_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Plano inválido")
    if plan not in PAID_PLANS:
        raise HTTPException(status_code=400, detail="Plano inválido")
    return PLAN_LIMITS[plan]


async def _get_subscription_or_404(tenant_id, db: AsyncSession) -> Subscription:
    repo = SubscriptionRepository(db)
    sub = await repo.get_by_tenant(tenant_id)
    if not sub:
        raise NotFoundError("Subscription not found")
    return sub


async def _get_tenant_or_404(tenant_id, db: AsyncSession) -> Tenant:
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise NotFoundError("Tenant not found")
    return tenant


def _reraise_stripe_error(exc: Exception) -> None:
    """Convert a raw Stripe SDK exception into an HTTPException with a useful
    message, instead of letting it bubble up as an opaque 500.
    """
    if isinstance(exc, stripe_sdk.error.InvalidRequestError):
        raise HTTPException(status_code=400, detail=f"Configuração de cobrança inválida: {exc.user_message or str(exc)}")
    if isinstance(exc, stripe_sdk.error.CardError):
        raise HTTPException(status_code=402, detail=exc.user_message or "Pagamento recusado pelo cartão.")
    if isinstance(exc, (stripe_sdk.error.APIConnectionError, stripe_sdk.error.APIError)):
        raise HTTPException(status_code=503, detail="Serviço de pagamento temporariamente indisponível. Tente novamente em instantes.")
    if isinstance(exc, stripe_sdk.error.StripeError):
        raise HTTPException(status_code=502, detail="Erro ao comunicar com o serviço de pagamento.")
    if isinstance(exc, ValueError):
        raise HTTPException(status_code=400, detail=str(exc))
    raise


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=BillingInfoResponse)
async def get_billing_info(
    current_user: User = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return current billing / subscription info for the tenant."""
    sub = await _get_subscription_or_404(current_user.tenant_id, db)
    return BillingInfoResponse(
        plan=sub.plan.value,
        status=sub.status.value,
        is_bonus=sub.is_bonus,
        stripe_subscription_id=sub.stripe_subscription_id,
        stripe_customer_id=sub.stripe_customer_id,
        current_period_end=sub.current_period_end.isoformat() if sub.current_period_end else None,
        cancel_at_period_end=sub.cancel_at_period_end,
        monthly_price=sub.monthly_price,
        currency=sub.currency,
    )


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout_session(
    body: CreateCheckoutRequest,
    current_user: User = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a Stripe Checkout Session for a new subscription.

    Used when the tenant has no active Stripe subscription yet (FREE plan
    or never subscribed).
    """
    _plan_limits_for(body.plan)  # valida o plano antes de tocar na Stripe

    sub = await _get_subscription_or_404(current_user.tenant_id, db)

    if sub.is_bonus:
        raise HTTPException(status_code=400, detail="Tenant bonificado não precisa de checkout")

    # Prevent double-checkout: if an active subscription already exists, the
    # tenant must use /change-plan instead of creating a duplicate session.
    if sub.stripe_subscription_id and sub.status.value == "active":
        raise HTTPException(
            status_code=400,
            detail="Assinatura ativa já existe. Use 'Alterar Plano' para fazer upgrade ou downgrade.",
        )

    tenant = await _get_tenant_or_404(current_user.tenant_id, db)

    try:
        # Get or create Stripe customer
        customer_id = await stripe_service.get_or_create_customer(
            tenant_id=str(current_user.tenant_id),
            email=current_user.email,
            name=tenant.name,
        )

        # Persist customer id so we can correlate webhooks
        if not sub.stripe_customer_id:
            sub.stripe_customer_id = customer_id
            await db.commit()

        checkout_url = await stripe_service.create_checkout_session(
            customer_id=customer_id,
            plan=body.plan,
            tenant_id=str(current_user.tenant_id),
        )
    except (stripe_sdk.error.StripeError, ValueError) as exc:
        _reraise_stripe_error(exc)

    return CheckoutResponse(checkout_url=checkout_url)


@router.post("/change-plan")
async def change_plan(
    body: ChangePlanRequest,
    current_user: User = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Upgrade or downgrade an existing active Stripe subscription.

    Only valid when there is already an active stripe_subscription_id.
    """
    limits = _plan_limits_for(body.plan)

    sub = await _get_subscription_or_404(current_user.tenant_id, db)

    if sub.is_bonus:
        raise HTTPException(status_code=400, detail="Tenant bonificado: altere o plano pelo painel platform")

    if not sub.stripe_subscription_id:
        raise HTTPException(
            status_code=400,
            detail="Sem assinatura Stripe ativa. Use /checkout para contratar.",
        )

    try:
        await stripe_service.update_subscription(sub.stripe_subscription_id, body.plan)
    except (stripe_sdk.error.StripeError, ValueError) as exc:
        _reraise_stripe_error(exc)

    # Optimistic local update; webhook will confirm and persist definitively
    sub.plan = PlanType(body.plan)
    sub.max_users = limits["max_users"]
    sub.max_giras_per_month = limits["max_giras_per_month"]
    sub.max_mediuns = limits["max_mediuns"]
    sub.monthly_price = limits["price"]

    audit = AuditLogRepository(db)
    await audit.create(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        action=AuditAction.UPDATE,
        resource_type="subscription",
        resource_id=str(sub.id),
        details={"new_plan": body.plan},
    )
    await db.commit()

    return {"detail": f"Plano alterado para {body.plan} com sucesso"}


@router.post("/cancel")
async def cancel_subscription(
    current_user: User = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Cancel the Stripe subscription at period end."""
    sub = await _get_subscription_or_404(current_user.tenant_id, db)

    if not sub.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="Sem assinatura Stripe ativa")

    try:
        await stripe_service.cancel_subscription(sub.stripe_subscription_id)
    except (stripe_sdk.error.StripeError, ValueError) as exc:
        _reraise_stripe_error(exc)

    sub.cancel_at_period_end = True
    await db.commit()

    if sub.current_period_end:
        access_until = sub.current_period_end.strftime("%d/%m/%Y")
        asyncio.create_task(
            _send_subscription_cancelled_email(
                current_user.email,
                current_user.full_name or current_user.username,
                PLAN_LABELS.get(sub.plan, sub.plan.value),
                access_until,
            )
        )

    return {"detail": "Assinatura será cancelada ao final do período"}


@router.post("/reactivate")
async def reactivate_subscription(
    current_user: User = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Reactivate a subscription scheduled for cancellation at period end.

    Only valid when cancel_at_period_end=True and the current period is still
    active. Removes the cancellation schedule so billing resumes normally.
    """
    sub = await _get_subscription_or_404(current_user.tenant_id, db)

    if sub.is_bonus:
        raise HTTPException(status_code=400, detail="Tenant bonificado: sem assinatura Stripe gerenciável")

    if not sub.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="Sem assinatura Stripe ativa")

    if not sub.cancel_at_period_end:
        raise HTTPException(status_code=400, detail="Assinatura não está agendada para cancelamento")

    await stripe_service.reactivate_subscription(sub.stripe_subscription_id)

    sub.cancel_at_period_end = False

    audit = AuditLogRepository(db)
    await audit.create(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        action=AuditAction.UPDATE,
        resource_type="subscription",
        resource_id=str(sub.id),
        details={"action": "reactivate", "plan": sub.plan.value},
    )
    await db.commit()

    return {"detail": "Assinatura reativada com sucesso"}
