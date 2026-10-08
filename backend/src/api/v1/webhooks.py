"""Stripe webhook handler — no JWT, validates Stripe signature."""
import asyncio
import logging
from fastapi import APIRouter, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from src.core.database import get_db
from fastapi import Depends
from src.core.config import settings
from src.models import Subscription, PlanType, SubscriptionStatus, StripeEventProcessed, User, UserRole
from src.repositories.subscription_repo import SubscriptionRepository, PLAN_LIMITS, clear_invoice_billing
from src.repositories.audit_log_repo import AuditLogRepository
from src.models.audit_logs import AuditAction
from src.services import stripe_service
from src.services.email.base import EmailMessage
from src.services.email.resend_fallback import ResendEmailService
from src.services.email.brevo_provider import BrevoEmailService
from src.services.email.templates.subscription_reverted_to_free import render_subscription_reverted_to_free_email

logger = logging.getLogger("senhas")


async def _get_tenant_primary_contact(tenant_id, db: AsyncSession) -> "User | None":
    """Best-effort pick of who should receive tenant-level billing notifications:
    the oldest active ADMIN, falling back to the oldest active back-office user
    (never a `medium` account — Área do Médium only, AM-02).
    """
    for role_filter in (User.role == UserRole.ADMIN, User.role != UserRole.MEDIUM):
        conditions = [User.tenant_id == tenant_id, User.is_active.is_(True), User.deleted_at.is_(None), role_filter]
        result = await db.execute(
            select(User).where(and_(*conditions)).order_by(User.created_at.asc()).limit(1)
        )
        user = result.scalar_one_or_none()
        if user:
            return user
    return None


async def _send_subscription_reverted_email(email: str, user_name: str, trial_expired: bool = False) -> None:
    """Best-effort notification when a subscription reverts to FREE (fire-and-forget)."""
    billing_url = f"{settings.FRONTEND_URL}/admin/billing"
    html = render_subscription_reverted_to_free_email(user_name, billing_url, trial_expired=trial_expired)
    text_intro = (
        "Seu trial gratuito de 1 mês no plano Premium terminou e, como nenhum plano foi assinado,"
        if trial_expired
        else "O período pago da sua assinatura terminou e"
    )
    msg = EmailMessage(
        to_email=email,
        subject="Sua conta no GiraHub agora é gratuita",
        html_body=html,
        text_body=(
            f"Olá, {user_name}.\n\n{text_intro} sua conta "
            f"voltou para o plano gratuito. Veja os planos disponíveis em {billing_url}."
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
            logger.warning("Subscription-reverted-to-free notification email failed for %s: %s", email, exc)

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])

_PRICE_TO_PLAN_LIMITS: dict = {}  # populated lazily from settings


def _get_price_plan_map() -> dict:
    """Build price_id → (PlanType, limits) map from settings (lazy, cached).

    Deriva limites de PLAN_LIMITS (subscription_repo) — fonte única de verdade.
    """
    if _PRICE_TO_PLAN_LIMITS:
        return _PRICE_TO_PLAN_LIMITS

    from src.core.config import settings

    for stripe_price, plan_type in [
        (settings.STRIPE_PRICE_BASIC, PlanType.BASIC),
        (settings.STRIPE_PRICE_PRO, PlanType.PRO),
        (settings.STRIPE_PRICE_PREMIUM, PlanType.PREMIUM),
    ]:
        lim = PLAN_LIMITS[plan_type]
        _PRICE_TO_PLAN_LIMITS[stripe_price] = {
            "plan": plan_type,
            "max_users": lim["max_users"],
            "max_giras_per_month": lim["max_giras_per_month"],
            "max_mediuns": lim["max_mediuns"],
            "monthly_price": lim["price"],
        }
    return _PRICE_TO_PLAN_LIMITS


async def _get_subscription_by_customer(customer_id: str, db: AsyncSession):
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_customer_id == customer_id)
    )
    return result.scalar_one_or_none()


async def _lock_subscription_by_customer(customer_id: str, db: AsyncSession):
    """Como `_get_subscription_by_customer`, mas com `SELECT ... FOR UPDATE`.

    Usado pelos eventos de fatura do boleto ($-04): o endpoint `subscribe-invoice` trava a
    mesma linha enquanto cria a assinatura na Stripe, então um `invoice.*` que chegue antes
    do commit dele espera e enxerga o `pending_stripe_subscription_id` já gravado.
    """
    if not customer_id:
        return None
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_customer_id == customer_id).with_for_update()
    )
    return result.scalar_one_or_none()


def _stripe_id(value) -> str | None:
    """ID de um campo da Stripe que pode vir como string ou objeto expandido."""
    if isinstance(value, dict):
        return value.get("id")
    return value or None


def _invoice_subscription_id(invoice: dict) -> str | None:
    """Assinatura da fatura. A API 2025-03-31 (basil) tirou `invoice.subscription` e passou
    para `invoice.parent.subscription_details.subscription`; lê os dois."""
    legacy = _stripe_id(invoice.get("subscription"))
    if legacy:
        return legacy
    details = (invoice.get("parent") or {}).get("subscription_details") or {}
    return _stripe_id(details.get("subscription"))


def _is_invoice_collection(obj: dict) -> bool:
    """Fatura/assinatura cobrada por e-mail (boleto) — o caminho do $-04."""
    return obj.get("collection_method") == stripe_service.COLLECTION_INVOICE


def _extract_period_end_ts(stripe_sub: dict) -> int | None:
    """Timestamp de fim do período corrente da assinatura Stripe.

    A partir da API 2025-03-31 (clover), `current_period_start/end` saíram do
    objeto Subscription e passaram a viver em cada item
    (`items.data[].current_period_end`). Versões antigas ainda trazem o campo
    no topo. Lê o topo primeiro (legado) e cai pro primeiro item — sem isso o
    campo nunca é atualizado nas renovações e `current_period_end` no banco
    fica congelado na data do checkout (visto em produção: período real
    10/09..10/10, banco em 10/06).
    """
    ts = stripe_sub.get("current_period_end")
    if ts:
        return ts
    items = (stripe_sub.get("items") or {}).get("data") or []
    if items:
        return items[0].get("current_period_end") or None
    return None


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
    event_id = event["id"]
    # stripe-python's StripeObject stopped being dict-like (no .get()) — the
    # handlers below rely on plain-dict semantics, so convert once here.
    data = event["data"]["object"].to_dict()

    # Stripe entrega webhooks pelo menos uma vez — o mesmo event_id pode chegar
    # repetido, inclusive em paralelo. Idempotência (item Q-04):
    # a marca do evento é inserida ANTES de processar, na MESMA transação do
    # efeito (os handlers fazem commit; o commit leva a marca junto).
    # - Entrega simultânea: o INSERT da segunda requisição espera o lock do
    #   índice único até a primeira confirmar; aí o conflito faz o
    #   ON CONFLICT DO NOTHING não devolver linha e ela pula sem reprocessar.
    #   (Antes era SELECT → processa → INSERT: as duas passavam pelo SELECT e
    #   aplicavam o efeito duas vezes — teste em tests/integration_pg.)
    # - Falha no processamento: o rollback desfaz a marca junto, então o
    #   reenvio da Stripe é processado normalmente (não "envenena" o evento).
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    claimed = await db.execute(
        pg_insert(StripeEventProcessed)
        .values(event_id=event_id, event_type=event_type)
        .on_conflict_do_nothing(index_elements=[StripeEventProcessed.event_id])
        .returning(StripeEventProcessed.id)
    )
    if claimed.scalar_one_or_none() is None:
        await db.rollback()
        logger.info("Stripe event %s (%s) already processed — skipping", event_id, event_type)
        return {"received": True}

    try:
        if event_type == "checkout.session.completed":
            # Forma de pagamento assíncrona (ex.: boleto no Checkout): o formulário foi
            # enviado, mas nada foi pago ainda — não libera o plano. Quem libera é o
            # checkout.session.async_payment_succeeded. ($-04)
            if data.get("payment_status") == "unpaid":
                logger.info(
                    "checkout.session.completed sem pagamento (payment_status=unpaid) — aguardando "
                    "async_payment_succeeded para a sessão %s", data.get("id"),
                )
            else:
                await _handle_checkout_completed(data, db)

        elif event_type == "checkout.session.async_payment_succeeded":
            await _handle_checkout_completed(data, db)

        elif event_type == "checkout.session.async_payment_failed":
            # Boleto do Checkout vencido sem pagamento: o plano nunca foi liberado, então
            # não há o que desfazer (a assinatura incompleta expira sozinha na Stripe).
            logger.info("checkout.session.async_payment_failed para a sessão %s — nada liberado", data.get("id"))

        elif event_type == "invoice.paid":
            await _handle_invoice_paid(data, db)

        elif event_type == "invoice.finalized":
            await _handle_invoice_finalized(data, db)

        elif event_type == "invoice.overdue":
            await _handle_invoice_overdue(data, db)

        elif event_type in ("customer.subscription.updated", "customer.subscription.created"):
            await _handle_subscription_updated(data, db)

        elif event_type == "customer.subscription.deleted":
            await _handle_subscription_deleted(data, db)

        elif event_type == "invoice.payment_failed":
            await _handle_payment_failed(data, db)

        else:
            logger.debug("Unhandled Stripe event type: %s", event_type)

        # Handlers que retornam cedo (ex.: tenant não encontrado) não fazem
        # commit — este commit grava a marca para não reprocessar o evento.
        await db.commit()
    except Exception as exc:
        await db.rollback()
        logger.error("Error processing Stripe event %s: %s", event_type, exc, exc_info=True)
        # Re-raise as 500 so Stripe will retry delivery (up to 3 days).
        # Internal logic errors (unknown price_id, tenant not found) are already
        # handled inside each _handle_* function with early returns, so only
        # truly transient failures (DB down, network errors) reach here.
        raise HTTPException(
            status_code=500,
            detail="Webhook processing failed — will be retried by Stripe",
        )

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
    import asyncio
    import stripe
    stripe_sub = (await asyncio.to_thread(stripe.Subscription.retrieve, stripe_subscription_id)).to_dict()
    price_id = stripe_sub["items"]["data"][0]["price"]["id"]
    current_period_end_ts = _extract_period_end_ts(stripe_sub)
    trial_end_ts = stripe_sub.get("trial_end")
    stripe_status = stripe_sub.get("status")

    plan_map = _get_price_plan_map()
    limits = plan_map.get(price_id)
    if not limits:
        logger.error(
            "Unknown price_id from Stripe: %s — verificar STRIPE_PRICE_PRO/BASIC/PREMIUM no .env. "
            "Retornando 500 para Stripe retentar.",
            price_id,
        )
        raise ValueError(f"price_id desconhecido: {price_id}")

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
    # Conversão mid-trial: se veio com trial_period_days, a subscription do
    # Stripe está "trialing" (ainda não cobrou) — mantém is_trial=True e
    # sincroniza trial_ends_at com a data real da Stripe (fonte de verdade
    # a partir de agora).
    sub.is_trial = stripe_status == "trialing"
    sub.trial_ends_at = (
        datetime.fromtimestamp(trial_end_ts, tz=timezone.utc) if (sub.is_trial and trial_end_ts) else None
    )
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

    stripe_sub_id = stripe_sub.get("id")
    linked = bool(stripe_sub_id) and stripe_sub_id == sub.stripe_subscription_id
    # $-04 — assinaturas que ainda NÃO estão ligadas ao terreiro não mexem em plano/status:
    # - por boleto (send_invoice): a Stripe já a cria `active` com a 1ª fatura em aberto;
    #   quem liga e libera o plano é o invoice.paid;
    # - incompleta (pagamento inicial pendente/expirado, ex. boleto no Checkout): quem liga
    #   é o checkout.session.completed/async_payment_succeeded.
    if not linked and (
        _is_invoice_collection(stripe_sub)
        or stripe_sub.get("status") in ("incomplete", "incomplete_expired")
    ):
        logger.info(
            "customer.subscription.* da assinatura %s (%s, ainda não ligada ao tenant %s) — ignorado",
            stripe_sub_id, stripe_sub.get("status"), sub.tenant_id,
        )
        return
    if linked and stripe_sub.get("collection_method"):
        sub.collection_method = stripe_sub["collection_method"]

    price_id = stripe_sub["items"]["data"][0]["price"]["id"]
    current_period_end_ts = _extract_period_end_ts(stripe_sub)
    trial_end_ts = stripe_sub.get("trial_end")
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

    if stripe_status == "trialing":
        sub.is_trial = True
        if trial_end_ts:
            from datetime import datetime, timezone
            sub.trial_ends_at = datetime.fromtimestamp(trial_end_ts, tz=timezone.utc)
    elif stripe_status == "active":
        # Cobrança confirmada — trial (se havia) terminou com sucesso.
        sub.status = SubscriptionStatus.ACTIVE
        sub.is_trial = False
        sub.trial_ends_at = None
    elif stripe_status in ("past_due", "unpaid"):
        sub.status = SubscriptionStatus.SUSPENDED

    await db.commit()


async def _handle_subscription_deleted(stripe_sub: dict, db: AsyncSession) -> None:
    """customer.subscription.deleted — mark as CANCELLED and revert to FREE."""
    customer_id = stripe_sub.get("customer")
    sub = await _get_subscription_by_customer(customer_id, db)
    if not sub:
        return

    stripe_sub_id = stripe_sub.get("id")
    # $-04: assinatura por boleto que nunca foi paga (desistência, ou a Stripe encerrou por
    # falta de pagamento). O plano nunca foi liberado — só limpa o pendente, sem rebaixar
    # nem mandar o e-mail de "sua conta voltou ao gratuito".
    if stripe_sub_id and stripe_sub_id != sub.stripe_subscription_id and (
        stripe_sub_id == sub.pending_stripe_subscription_id or _is_invoice_collection(stripe_sub)
    ):
        if stripe_sub_id == sub.pending_stripe_subscription_id:
            clear_invoice_billing(sub, keep_collection_method=True)
        await db.commit()
        logger.info("Assinatura por boleto %s encerrada sem pagamento (tenant %s)", stripe_sub_id, sub.tenant_id)
        return

    await SubscriptionRepository(db).reset_to_free(sub.tenant_id)

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

    contact = await _get_tenant_primary_contact(sub.tenant_id, db)
    if contact:
        asyncio.create_task(
            _send_subscription_reverted_email(contact.email, contact.full_name or contact.username)
        )


async def _handle_payment_failed(invoice: dict, db: AsyncSession) -> None:
    """invoice.payment_failed — suspend subscription, ou rebaixa pra FREE se a
    cobrança que falhou era a primeira tentativa de um trial (sem tolerância:
    decisão de produto foi rebaixar direto, não suspender)."""
    # $-04: na fatura por e-mail (boleto) isto é o boleto que venceu ou um pagamento que não
    # concluiu — a fatura continua em aberto e o cliente gera outro boleto na mesma página
    # até o vencimento. Não é inadimplência: não suspende nem rebaixa o trial. O que suspende
    # é a fatura vencida (invoice.overdue / assinatura past_due).
    if _is_invoice_collection(invoice):
        logger.info(
            "invoice.payment_failed na fatura por boleto %s (cliente %s) — fatura segue em aberto, sem efeito",
            invoice.get("id"), invoice.get("customer"),
        )
        return

    customer_id = invoice.get("customer")
    sub = await _get_subscription_by_customer(customer_id, db)
    if not sub:
        return

    was_trial = sub.is_trial
    tenant_id = sub.tenant_id

    if was_trial:
        await SubscriptionRepository(db).reset_to_free(tenant_id, status=SubscriptionStatus.ACTIVE)
    else:
        sub.status = SubscriptionStatus.SUSPENDED

    audit = AuditLogRepository(db)
    await audit.create(
        tenant_id=tenant_id,
        user_id=None,
        action=AuditAction.UPDATE,
        resource_type="stripe_subscription",
        resource_id=sub.id,
        details={"event": "invoice.payment_failed", "was_trial": was_trial},
    )
    await db.commit()
    if was_trial:
        logger.warning("Payment failed at trial conversion — tenant %s reverted to FREE", tenant_id)
        contact = await _get_tenant_primary_contact(tenant_id, db)
        if contact:
            asyncio.create_task(
                _send_subscription_reverted_email(
                    contact.email, contact.full_name or contact.username, trial_expired=True
                )
            )
    else:
        logger.warning("Payment failed — tenant %s suspended", tenant_id)


# ---------------------------------------------------------------------------
# $-04 — assinatura paga por fatura (boleto)
# ---------------------------------------------------------------------------

def _set_pending_invoice(sub: Subscription, invoice: dict) -> None:
    from datetime import datetime, timezone

    due_ts = invoice.get("due_date")
    sub.pending_invoice_id = invoice.get("id")
    sub.pending_invoice_url = invoice.get("hosted_invoice_url")
    sub.pending_invoice_due_at = datetime.fromtimestamp(due_ts, tz=timezone.utc) if due_ts else None


async def _handle_invoice_paid(invoice: dict, db: AsyncSession) -> None:
    """invoice.paid — fatura por boleto paga: liga a assinatura e libera o plano.

    Só para `collection_method=send_invoice`. O cartão continua sendo acompanhado pelo
    checkout.session.completed e pelo customer.subscription.updated, como sempre.

    Cobre a 1ª fatura (o plano é liberado aqui, nunca antes), a renovação (tira o aviso
    "aguardando pagamento") e a fatura vencida paga depois (reativa SUSPENDED). Como a
    Stripe recomenda, confirma o status da assinatura antes de liberar.
    """
    if not _is_invoice_collection(invoice):
        return
    stripe_sub_id = _invoice_subscription_id(invoice)
    customer_id = invoice.get("customer")
    if not stripe_sub_id:
        return  # fatura avulsa, não é do plano

    sub = await _lock_subscription_by_customer(customer_id, db)
    if not sub:
        logger.warning("invoice.paid de cliente sem assinatura local: %s", customer_id)
        return
    if stripe_sub_id not in (sub.stripe_subscription_id, sub.pending_stripe_subscription_id):
        logger.warning(
            "invoice.paid da assinatura %s, que não é a do tenant %s (ligada %s, pendente %s) — ignorado",
            stripe_sub_id, sub.tenant_id, sub.stripe_subscription_id, sub.pending_stripe_subscription_id,
        )
        return

    import stripe
    from datetime import datetime, timezone

    stripe_sub = (await asyncio.to_thread(stripe.Subscription.retrieve, stripe_sub_id)).to_dict()
    stripe_status = stripe_sub.get("status")
    if stripe_status not in ("active", "trialing"):
        # Ex.: pagou o boleto de uma assinatura já cancelada. Não libera nada; fica no log
        # para o suporte (a Stripe mostra o pagamento no Dashboard).
        logger.warning(
            "invoice.paid %s com a assinatura %s em %s — plano não liberado",
            invoice.get("id"), stripe_sub_id, stripe_status,
        )
        return

    price_id = stripe_sub["items"]["data"][0]["price"]["id"]
    limits = _get_price_plan_map().get(price_id)
    if not limits:
        logger.error("Unknown price_id from Stripe: %s — Retornando 500 para Stripe retentar.", price_id)
        raise ValueError(f"price_id desconhecido: {price_id}")

    was_pending = stripe_sub_id == sub.pending_stripe_subscription_id
    was_suspended = sub.status == SubscriptionStatus.SUSPENDED

    sub.stripe_subscription_id = stripe_sub_id
    sub.stripe_customer_id = customer_id
    sub.stripe_price_id = price_id
    sub.collection_method = stripe_service.COLLECTION_INVOICE
    sub.plan = limits["plan"]
    sub.max_users = limits["max_users"]
    sub.max_giras_per_month = limits["max_giras_per_month"]
    sub.max_mediuns = limits["max_mediuns"]
    sub.monthly_price = limits["monthly_price"]
    sub.status = SubscriptionStatus.ACTIVE
    sub.cancel_at_period_end = bool(stripe_sub.get("cancel_at_period_end", False))
    sub.is_trial = stripe_status == "trialing"
    trial_end_ts = stripe_sub.get("trial_end")
    sub.trial_ends_at = (
        datetime.fromtimestamp(trial_end_ts, tz=timezone.utc) if (sub.is_trial and trial_end_ts) else None
    )
    period_end_ts = _extract_period_end_ts(stripe_sub)
    if period_end_ts:
        sub.current_period_end = datetime.fromtimestamp(period_end_ts, tz=timezone.utc)
    if was_pending:
        sub.pending_stripe_subscription_id = None
    if sub.pending_invoice_id in (None, invoice.get("id")):
        sub.pending_invoice_id = None
        sub.pending_invoice_url = None
        sub.pending_invoice_due_at = None

    audit = AuditLogRepository(db)
    await audit.create(
        tenant_id=sub.tenant_id,
        user_id=None,
        action=AuditAction.UPDATE,
        resource_type="stripe_subscription",
        resource_id=sub.id,
        details={
            "event": "invoice.paid",
            "plan": limits["plan"].value,
            "first_payment": was_pending,
            "reactivated": was_suspended,
            "amount_paid": invoice.get("amount_paid"),
        },
    )
    await db.commit()
    logger.info(
        "Fatura por boleto paga — tenant %s no plano %s (primeira=%s, reativou=%s)",
        sub.tenant_id, limits["plan"].value, was_pending, was_suspended,
    )


async def _handle_invoice_finalized(invoice: dict, db: AsyncSession) -> None:
    """invoice.finalized — fatura por boleto emitida: guarda o link para o painel mostrar
    "Aguardando pagamento" com o "Pagar agora". Não mexe em plano nem em status."""
    if not _is_invoice_collection(invoice):
        return
    if invoice.get("status") != "open" or not invoice.get("amount_due"):
        return  # fatura zerada (ex.: início do teste) já nasce paga
    stripe_sub_id = _invoice_subscription_id(invoice)
    if not stripe_sub_id:
        return
    sub = await _lock_subscription_by_customer(invoice.get("customer"), db)
    if not sub or stripe_sub_id not in (sub.stripe_subscription_id, sub.pending_stripe_subscription_id):
        return
    _set_pending_invoice(sub, invoice)
    await db.commit()


async def _handle_invoice_overdue(invoice: dict, db: AsyncSession) -> None:
    """invoice.overdue — fatura por boleto venceu sem pagamento.

    Assinatura já ligada (plano liberado): suspende, como a falha de pagamento do cartão
    (pagar depois reativa pelo invoice.paid). Assinatura ainda pendente (1ª fatura): o plano
    nunca foi liberado, então nada muda — a fatura segue pagável pelo link.
    """
    if not _is_invoice_collection(invoice):
        return
    stripe_sub_id = _invoice_subscription_id(invoice)
    if not stripe_sub_id:
        return
    sub = await _lock_subscription_by_customer(invoice.get("customer"), db)
    if not sub or stripe_sub_id != sub.stripe_subscription_id:
        return
    if sub.status == SubscriptionStatus.SUSPENDED:
        return
    sub.status = SubscriptionStatus.SUSPENDED
    audit = AuditLogRepository(db)
    await audit.create(
        tenant_id=sub.tenant_id,
        user_id=None,
        action=AuditAction.UPDATE,
        resource_type="stripe_subscription",
        resource_id=sub.id,
        details={"event": "invoice.overdue", "invoice": invoice.get("id")},
    )
    await db.commit()
    logger.warning("Fatura por boleto vencida — tenant %s suspenso", sub.tenant_id)
