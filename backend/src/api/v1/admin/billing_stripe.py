"""Admin API - Stripe Billing endpoint."""
import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

import stripe as stripe_sdk

from src.core.database import get_db
from src.api.dependencies import get_current_user
from src.core.config import settings
from src.models import User, UserRole, Subscription, PlanType, SubscriptionStatus, Tenant
from src.repositories.subscription_repo import SubscriptionRepository, PLAN_LIMITS, clear_invoice_billing
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
    # Trial local (sem assinatura Stripe): o front deixa assinar o próprio
    # plano do teste, preservando os dias restantes no checkout.
    is_trial: bool = False
    trial_ends_at: Optional[str] = None
    # $-04 — cobrança por fatura (boleto). `collection_method`: "charge_automatically"
    # (cartão) | "send_invoice" (boleto) | None (sem assinatura Stripe / antiga = cartão).
    collection_method: Optional[str] = None
    # Assinatura por boleto criada e ainda sem a 1ª fatura paga (plano ainda não liberado).
    awaiting_first_payment: bool = False
    # Fatura em aberto (1ª ou renovação): link da página de pagamento da Stripe.
    pending_invoice_url: Optional[str] = None
    pending_invoice_due_at: Optional[str] = None
    # Formas oferecidas na fatura (STRIPE_INVOICE_PAYMENT_METHODS) — o painel escreve
    # "Boleto" ou "PIX ou boleto" conforme o que a conta Stripe realmente aceita.
    invoice_payment_methods: list[str] = []
    invoice_days_until_due: int = 5


class CreateCheckoutRequest(BaseModel):
    plan: str  # "basic" | "pro" | "premium"


class CheckoutResponse(BaseModel):
    checkout_url: str


class ChangePlanRequest(BaseModel):
    plan: str  # "basic" | "pro" | "premium"


class SubscribeInvoiceResponse(BaseModel):
    # "pending": 1ª fatura emitida, plano liberado quando pagar (invoice.paid).
    # "trialing": dias de teste preservados; a 1ª fatura chega por e-mail no fim do teste.
    status: str
    hosted_invoice_url: Optional[str] = None
    due_at: Optional[str] = None
    trial_ends_at: Optional[str] = None
    detail: str


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


_INVOICE_METHOD_NOT_ENABLED = (
    "O pagamento por boleto ainda não está liberado na nossa conta de pagamentos. "
    "Por enquanto, assine com cartão de crédito — ou fale com o suporte."
)


def _is_payment_method_not_enabled(exc: Exception) -> bool:
    """A Stripe recusa `payment_method_types` com uma forma que não está ativada na conta."""
    if not isinstance(exc, stripe_sdk.error.InvalidRequestError):
        return False
    param = (getattr(exc, "param", None) or "").lower()
    msg = str(exc).lower()
    return "payment_method_types" in param or "payment method type" in msg or "payment_method_types" in msg


async def _lock_subscription_or_404(tenant_id, db: AsyncSession) -> Subscription:
    """Linha da assinatura com `SELECT ... FOR UPDATE` — serializa dois cliques em
    "Assinar com boleto" e faz os webhooks `invoice.*` da assinatura recém-criada
    esperarem o commit (webhooks.py::_lock_subscription_by_customer)."""
    result = await db.execute(
        select(Subscription).where(Subscription.tenant_id == tenant_id).with_for_update()
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise NotFoundError("Subscription not found")
    return sub


def _remaining_trial_days(sub: Subscription) -> Optional[int]:
    """Dias de teste local que faltam (preservados na assinatura da Stripe)."""
    if sub.is_trial and sub.trial_ends_at and not sub.stripe_subscription_id:
        remaining = (sub.trial_ends_at - datetime.now(timezone.utc)).days
        if remaining > 0:
            return remaining
    return None


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
        is_trial=bool(sub.is_trial),
        trial_ends_at=sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
        collection_method=sub.collection_method if isinstance(sub.collection_method, str) else None,
        awaiting_first_payment=isinstance(sub.pending_stripe_subscription_id, str),
        pending_invoice_url=sub.pending_invoice_url if isinstance(sub.pending_invoice_url, str) else None,
        pending_invoice_due_at=(
            sub.pending_invoice_due_at.isoformat() if isinstance(sub.pending_invoice_due_at, datetime) else None
        ),
        invoice_payment_methods=stripe_service.invoice_payment_method_types(),
        invoice_days_until_due=settings.STRIPE_INVOICE_DAYS_UNTIL_DUE,
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

    if sub.pending_stripe_subscription_id:
        raise HTTPException(
            status_code=409,
            detail="Há uma assinatura por boleto aguardando pagamento. Pague o boleto ou cancele o pedido para escolher o cartão.",
        )

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

        # Se o tenant ainda está no trial local (sem stripe_subscription_id),
        # preserva os dias restantes no checkout — o "1 mês grátis" vale os
        # 30 dias corridos desde o cadastro, não a partir de quando ele
        # decide adicionar cartão.
        trial_period_days = None
        if sub.is_trial and sub.trial_ends_at:
            remaining = (sub.trial_ends_at - datetime.now(timezone.utc)).days
            if remaining > 0:
                trial_period_days = remaining

        checkout_url = await stripe_service.create_checkout_session(
            customer_id=customer_id,
            plan=body.plan,
            tenant_id=str(current_user.tenant_id),
            trial_period_days=trial_period_days,
        )
    except (stripe_sdk.error.StripeError, ValueError) as exc:
        _reraise_stripe_error(exc)

    return CheckoutResponse(checkout_url=checkout_url)


@router.post("/subscribe-invoice", response_model=SubscribeInvoiceResponse)
async def subscribe_with_invoice(
    body: CreateCheckoutRequest,
    current_user: User = Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
):
    """$-04 — assina o plano pagando por fatura (boleto), sem cartão.

    Cria na Stripe uma assinatura `collection_method=send_invoice`: todo mês a Stripe manda
    a fatura por e-mail com o link de pagamento e STRIPE_INVOICE_DAYS_UNTIL_DUE dias para
    pagar. O plano só é liberado quando a fatura é paga (webhook `invoice.paid`); até lá a
    assinatura fica em `pending_stripe_subscription_id` e o painel mostra "Pagar agora".

    Durante o teste local, os dias que faltam viram teste na Stripe (como no cartão): o
    plano escolhido vale na hora e a 1ª fatura sai no fim do teste.
    """
    _plan_limits_for(body.plan)

    sub = await _lock_subscription_or_404(current_user.tenant_id, db)

    if sub.is_bonus:
        raise HTTPException(status_code=400, detail="Tenant bonificado não precisa assinar")
    if sub.pending_stripe_subscription_id:
        raise HTTPException(
            status_code=409,
            detail="Já existe uma assinatura por boleto aguardando pagamento. Pague o boleto ou cancele o pedido.",
        )
    if sub.stripe_subscription_id:
        # Mais restrito que o /checkout de propósito: com uma assinatura já ligada (mesmo
        # suspensa), criar outra deixaria duas cobranças correndo na Stripe.
        raise HTTPException(
            status_code=400,
            detail=(
                "Assinatura ativa já existe. Use 'Alterar Plano' para fazer upgrade ou downgrade."
                if sub.status.value == "active"
                else "Já existe uma assinatura na Stripe para este terreiro. Para trocar a forma de pagamento, fale com o suporte."
            ),
        )

    tenant = await _get_tenant_or_404(current_user.tenant_id, db)
    trial_period_days = _remaining_trial_days(sub)

    try:
        customer_id = await stripe_service.get_or_create_customer(
            tenant_id=str(current_user.tenant_id),
            email=current_user.email,
            name=tenant.name,
        )
        stripe_sub = await stripe_service.create_invoice_subscription(
            customer_id=customer_id,
            plan=body.plan,
            tenant_id=str(current_user.tenant_id),
            trial_period_days=trial_period_days,
        )
    except (stripe_sdk.error.StripeError, ValueError) as exc:
        await db.rollback()
        if _is_payment_method_not_enabled(exc):
            logger.error("Boleto não ativado na conta Stripe (STRIPE_INVOICE_PAYMENT_METHODS): %s", exc)
            raise HTTPException(status_code=400, detail=_INVOICE_METHOD_NOT_ENABLED)
        _reraise_stripe_error(exc)

    sub.stripe_customer_id = customer_id
    stripe_sub_id = stripe_sub["id"]
    invoice = stripe_sub.get("latest_invoice")
    invoice = invoice if isinstance(invoice, dict) else {}

    if stripe_sub.get("status") == "trialing":
        # Mesmo resultado do checkout no meio do teste: assinatura ligada, plano escolhido
        # já vale, teste segue até a data da Stripe. A 1ª cobrança sai no fim do teste.
        limits = _plan_limits_for(body.plan)
        trial_end_ts = stripe_sub.get("trial_end")
        sub.stripe_subscription_id = stripe_sub_id
        sub.stripe_price_id = stripe_service._price_id_for_plan(body.plan)
        sub.collection_method = stripe_service.COLLECTION_INVOICE
        sub.plan = PlanType(body.plan)
        sub.max_users = limits["max_users"]
        sub.max_giras_per_month = limits["max_giras_per_month"]
        sub.max_mediuns = limits["max_mediuns"]
        sub.monthly_price = limits["price"]
        sub.status = SubscriptionStatus.ACTIVE
        sub.cancel_at_period_end = False
        sub.is_trial = True
        if trial_end_ts:
            sub.trial_ends_at = datetime.fromtimestamp(trial_end_ts, tz=timezone.utc)
        response = SubscribeInvoiceResponse(
            status="trialing",
            trial_ends_at=sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
            detail="Assinatura registrada. Os dias de teste continuam grátis; a primeira fatura chega por e-mail no fim do teste.",
        )
    else:
        # Sem teste: a Stripe já emitiu a 1ª fatura. O plano NÃO é liberado aqui.
        sub.pending_stripe_subscription_id = stripe_sub_id
        due_ts = invoice.get("due_date")
        sub.pending_invoice_id = invoice.get("id")
        sub.pending_invoice_url = invoice.get("hosted_invoice_url")
        sub.pending_invoice_due_at = datetime.fromtimestamp(due_ts, tz=timezone.utc) if due_ts else None
        response = SubscribeInvoiceResponse(
            status="pending",
            hosted_invoice_url=sub.pending_invoice_url,
            due_at=sub.pending_invoice_due_at.isoformat() if sub.pending_invoice_due_at else None,
            detail="Fatura emitida e enviada por e-mail. O plano é liberado assim que o pagamento for confirmado.",
        )

    audit = AuditLogRepository(db)
    await audit.create(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        action=AuditAction.CREATE,
        resource_type="subscription",
        resource_id=str(sub.id),
        details={"action": "subscribe_invoice", "plan": body.plan, "status": response.status},
    )
    await db.commit()
    return response


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
    """Cancel the Stripe subscription at period end.

    $-04: com uma assinatura por boleto ainda sem a 1ª fatura paga (nada liberado), o
    "cancelar" desiste do pedido na hora — cancela na Stripe e anula a fatura em aberto.
    """
    sub = await _get_subscription_or_404(current_user.tenant_id, db)

    if sub.pending_stripe_subscription_id and not sub.stripe_subscription_id:
        try:
            await stripe_service.cancel_pending_invoice_subscription(
                sub.pending_stripe_subscription_id, sub.pending_invoice_id
            )
        except stripe_sdk.error.InvalidRequestError as exc:
            # Já cancelada na Stripe (ex.: venceu e a Stripe encerrou): só limpa aqui.
            logger.info("Assinatura pendente %s já não existe na Stripe: %s", sub.pending_stripe_subscription_id, exc)
        except (stripe_sdk.error.StripeError, ValueError) as exc:
            _reraise_stripe_error(exc)
        cancelled_id = sub.pending_stripe_subscription_id
        clear_invoice_billing(sub)
        audit = AuditLogRepository(db)
        await audit.create(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            action=AuditAction.UPDATE,
            resource_type="subscription",
            resource_id=str(sub.id),
            details={"action": "cancel_pending_invoice", "stripe_subscription_id": cancelled_id},
        )
        await db.commit()
        return {"detail": "Pedido de assinatura por boleto cancelado. Nenhuma cobrança foi feita."}

    if not sub.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="Sem assinatura Stripe ativa")

    # Já agendado: não chama a Stripe de novo nem reenvia o e-mail de cancelamento.
    if sub.cancel_at_period_end:
        raise HTTPException(
            status_code=409,
            detail="O cancelamento já está agendado para o fim do período. Para continuar no plano, use Reativar.",
        )

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

    try:
        await stripe_service.reactivate_subscription(sub.stripe_subscription_id)
    except (stripe_sdk.error.StripeError, ValueError) as exc:
        _reraise_stripe_error(exc)

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
