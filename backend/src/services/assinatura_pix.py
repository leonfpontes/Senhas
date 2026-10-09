"""PIX mês a mês — plano do GiraHub pago com um PIX por mês ($-04, decisão de 2026-10-09).

Por que não é assinatura da Stripe: a conta Stripe BR só aceita Pix como pagamento avulso
(Checkout `mode=payment`); Pix Automático (recorrente) não existe na conta BR e Pix não entra em
Invoicing/Subscriptions. Então cada pagamento é um Checkout avulso e o GiraHub controla o prazo.

Representação (mesmo molde do teste local — plano com prazo sem assinatura Stripe):
- `subscriptions.collection_method = "pix_mensal"`, `stripe_subscription_id` NULL,
  `current_period_end` = pago até, `status` ACTIVE, `is_trial` False;
- cada pagamento confirmado vira uma linha em `assinatura_pix_pagamentos` (checkout_session_id
  único = idempotência; histórico do painel).

Regras:
- Período: cada PIX libera 30 dias a partir de max(agora, pago até, fim do teste local) — pagar
  antes estende sem perder dia, e quem paga no meio do teste não perde os dias grátis (mesma
  promessa do cartão/boleto, que levam os dias que faltam como trial da Stripe).
- Plano: enquanto o mês pago vale, o PIX só renova o MESMO plano (trocar de plano no meio do
  mês exigiria proporcionalidade — fica para o fim do mês ou para o suporte).
- Cartão/boleto × PIX: com assinatura Stripe (ou boleto pendente) o PIX é recusado (409); com mês
  PIX vigente o cartão/boleto é recusado (409) até o fim do mês pago. Trocar antes: suporte.
- Lembretes: e-mail aos administradores 5 dias e 1 dia antes do fim (uma vez cada, marca em
  `tenant_configs.custom_settings.pix_mensal_lembretes` com escopo no "pago até").
- Vencimento: 3 dias de tolerância com o plano ainda liberado; depois, volta ao gratuito como no
  fim de uma assinatura não renovada (`reset_to_free`, status CANCELLED + e-mail "sua conta agora
  é gratuita"). Não suspende: SUSPENDED tira até o que o gratuito dá, e não há cobrança em aberto
  para "regularizar" — basta pagar um PIX de novo, que religa o plano na hora.
- Métricas: mês PIX pago e vigente conta como pagante (billing_metrics); vencido, não.

Agendador: roda junto do trial_scheduler (09:00 BRT) com advisory lock próprio
(`PIX_MENSAL_LOCK_KEY`, ver scheduler_guard).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.assinatura_pix import AssinaturaPixPagamento
from ..models.audit_logs import AuditAction
from ..models.subscriptions import PlanType, Subscription, SubscriptionStatus
from ..repositories.audit_log_repo import AuditLogRepository
from ..repositories.subscription_repo import PLAN_LIMITS, SubscriptionRepository

logger = logging.getLogger(__name__)

COLLECTION_PIX_MENSAL = "pix_mensal"  # espelho de stripe_service.COLLECTION_PIX_MENSAL
PIX_MENSAL_DIAS = 30
PIX_TOLERANCIA_DIAS = 3
# Lembretes por e-mail: dias que faltam (arredondados para cima) para o fim do mês pago.
PIX_LEMBRETE_DIAS = (5, 1)
PIX_PLANOS = (PlanType.BASIC, PlanType.PRO, PlanType.PREMIUM)

# Resultado de registrar_pagamento_pix
APLICADO = "aplicado"
DUPLICADO = "duplicado"
NAO_APLICADO = "nao_aplicado"  # pago, registrado, mas não virou mês de plano (suporte devolve)
IGNORADO = "ignorado"          # não confere com o que o GiraHub criou — nada gravado


# ── Regras puras (testadas em tests/unit/test_assinatura_pix.py) ─────────────

def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if not isinstance(dt, datetime):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def novo_periodo(
    agora: datetime,
    pago_ate: Optional[datetime] = None,
    fim_teste: Optional[datetime] = None,
) -> tuple[datetime, datetime]:
    """Mês liberado por um pagamento: 30 dias a partir de max(agora, pago até, fim do teste)."""
    inicio = max(d for d in (_aware(agora), _aware(pago_ate), _aware(fim_teste)) if d is not None)
    return inicio, inicio + timedelta(days=PIX_MENSAL_DIAS)


def pix_mensal_vigente(sub) -> bool:
    """O plano do terreiro é cobrado por PIX mês a mês (com ou sem o mês ainda valendo)."""
    if sub is None:
        return False
    return (
        getattr(sub, "collection_method", None) == COLLECTION_PIX_MENSAL
        and not isinstance(getattr(sub, "stripe_subscription_id", None), str)
        and getattr(sub, "is_bonus", False) is not True
        and isinstance(getattr(sub, "current_period_end", None), datetime)
    )


def pix_pago_ate(sub) -> Optional[datetime]:
    return _aware(sub.current_period_end) if pix_mensal_vigente(sub) else None


def tolerancia_ate(pago_ate: datetime) -> datetime:
    return _aware(pago_ate) + timedelta(days=PIX_TOLERANCIA_DIAS)


def pix_mes_ativo(sub, agora: Optional[datetime] = None) -> bool:
    """Mês PIX pago e ainda valendo (antes do "pago até") — é o que conta como pagante."""
    pago_ate = pix_pago_ate(sub)
    return pago_ate is not None and pago_ate > (agora or datetime.now(timezone.utc))


def pix_expirado(sub, agora: Optional[datetime] = None) -> bool:
    """Passou o "pago até" + a tolerância sem novo PIX: o plano pago não vale mais."""
    pago_ate = pix_pago_ate(sub)
    return pago_ate is not None and (agora or datetime.now(timezone.utc)) >= tolerancia_ate(pago_ate)


def lembrete_devido(dias_restantes: int) -> Optional[int]:
    """Qual lembrete cabe hoje (5 ou 1), ou None.

    Por faixa e não por igualdade: se uma rodada diária falhar (deploy às 09:00), o lembrete sai
    na rodada seguinte. A marca persistente garante uma vez cada.
    """
    if dias_restantes <= 0:
        return None
    if dias_restantes <= PIX_LEMBRETE_DIAS[1]:
        return PIX_LEMBRETE_DIAS[1]
    if dias_restantes <= PIX_LEMBRETE_DIAS[0]:
        return PIX_LEMBRETE_DIAS[0]
    return None


def _em_teste_local(sub) -> bool:
    return (
        getattr(sub, "is_trial", False) is True
        and getattr(sub, "is_bonus", False) is not True
        and not isinstance(getattr(sub, "stripe_subscription_id", None), str)
    )


# ── Pagamento confirmado (webhook) ───────────────────────────────────────────

def _stripe_id(value) -> Optional[str]:
    if isinstance(value, dict):
        return value.get("id")
    return value or None


async def _registrar_linha(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    session_id: str,
    payment_intent_id: Optional[str],
    plan: str,
    amount_cents: int,
    aplicado: bool,
    period_start: Optional[datetime],
    period_end: Optional[datetime],
) -> bool:
    """INSERT idempotente pela sessão do Checkout. False = esse pagamento já foi registrado."""
    result = await db.execute(
        pg_insert(AssinaturaPixPagamento)
        .values(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            checkout_session_id=session_id,
            payment_intent_id=payment_intent_id,
            plan=plan,
            amount_cents=amount_cents,
            aplicado=aplicado,
            period_start=period_start,
            period_end=period_end,
            paid_at=datetime.now(timezone.utc),
            created_at=datetime.now(timezone.utc),
        )
        .on_conflict_do_nothing(index_elements=[AssinaturaPixPagamento.checkout_session_id])
        .returning(AssinaturaPixPagamento.id)
    )
    return result.scalar_one_or_none() is not None


async def registrar_pagamento_pix(db: AsyncSession, tenant_id: uuid.UUID, session: dict) -> str:
    """Aplica um Checkout PIX pago: libera 30 dias do plano. Não faz commit (o webhook faz).

    Segurança: o tenant vem do `metadata.tenant_id` que o GiraHub gravou, e só vale se o
    `customer` da sessão for o cliente Stripe gravado na assinatura desse tenant (a sessão foi
    criada por `POST /admin/billing/pix-checkout` com esse cliente). Valor e moeda conferidos
    contra PLAN_LIMITS. Idempotente pela sessão (linha única em assinatura_pix_pagamentos).
    """
    session_id = session.get("id")
    meta = session.get("metadata") or {}
    if session.get("payment_status") != "paid" or not session_id:
        logger.info("PIX mensal: sessão %s ainda sem pagamento — nada liberado", session_id)
        return IGNORADO
    try:
        plan = PlanType(meta.get("plan"))
    except ValueError:
        plan = None
    if plan not in PIX_PLANOS:
        logger.error("PIX mensal: sessão %s com plano inválido %r — ignorada", session_id, meta.get("plan"))
        return IGNORADO

    sub = (
        await db.execute(select(Subscription).where(Subscription.tenant_id == tenant_id).with_for_update())
    ).scalar_one_or_none()
    customer_id = _stripe_id(session.get("customer"))
    if not sub or not customer_id or sub.stripe_customer_id != customer_id:
        logger.warning(
            "PIX mensal: sessão %s do cliente %s não confere com a assinatura do tenant %s — ignorada",
            session_id, customer_id, tenant_id,
        )
        return IGNORADO

    limits = PLAN_LIMITS[plan]
    esperado = int(round(limits["price"] * 100))
    amount = int(session.get("amount_total") or 0)
    payment_intent_id = _stripe_id(session.get("payment_intent"))
    audit = AuditLogRepository(db)

    motivo = None
    if (session.get("currency") or "").lower() != "brl" or amount < esperado:
        motivo = f"valor {amount} {session.get('currency')} abaixo do plano ({esperado} brl)"
    elif sub.is_bonus:
        motivo = "terreiro em cortesia"
    elif isinstance(sub.stripe_subscription_id, str) or isinstance(sub.pending_stripe_subscription_id, str):
        motivo = "terreiro já tem assinatura por cartão/boleto"
    if motivo:
        if not await _registrar_linha(db, tenant_id, session_id, payment_intent_id, plan.value, amount, False, None, None):
            return DUPLICADO
        await audit.create(
            tenant_id=tenant_id, user_id=None, action=AuditAction.UPDATE, resource_type="assinatura_pix",
            resource_id=sub.id,
            details={"event": "pix_pago_nao_aplicado", "session": session_id, "motivo": motivo, "amount": amount},
        )
        logger.error(
            "PIX mensal pago e NÃO aplicado (tenant %s, sessão %s): %s — devolver pelo Dashboard da Stripe",
            tenant_id, session_id, motivo,
        )
        return NAO_APLICADO

    agora = datetime.now(timezone.utc)
    inicio, fim = novo_periodo(
        agora,
        pago_ate=pix_pago_ate(sub),
        fim_teste=sub.trial_ends_at if _em_teste_local(sub) else None,
    )
    if not await _registrar_linha(db, tenant_id, session_id, payment_intent_id, plan.value, amount, True, inicio, fim):
        logger.info("PIX mensal: sessão %s já aplicada — ignorando reentrega", session_id)
        return DUPLICADO

    sub.plan = plan
    sub.max_users = limits["max_users"]
    sub.max_giras_per_month = limits["max_giras_per_month"]
    sub.max_mediuns = limits["max_mediuns"]
    sub.monthly_price = limits["price"]
    sub.status = SubscriptionStatus.ACTIVE
    sub.collection_method = COLLECTION_PIX_MENSAL
    sub.current_period_end = fim
    sub.cancel_at_period_end = False
    sub.stripe_price_id = None
    sub.is_trial = False
    sub.trial_ends_at = None

    await audit.create(
        tenant_id=tenant_id, user_id=None, action=AuditAction.UPDATE, resource_type="assinatura_pix",
        resource_id=sub.id,
        details={
            "event": "pix_mensal_pago", "plan": plan.value, "session": session_id,
            "pago_ate": fim.isoformat(), "amount": amount,
        },
    )
    logger.info("PIX mensal pago — tenant %s no plano %s até %s", tenant_id, plan.value, fim.isoformat())
    return APLICADO


async def listar_pagamentos(db: AsyncSession, tenant_id: uuid.UUID, limite: int = 6) -> list[AssinaturaPixPagamento]:
    """Últimos pagamentos PIX do terreiro (mais recente primeiro) para o painel."""
    result = await db.execute(
        select(AssinaturaPixPagamento)
        .where(AssinaturaPixPagamento.tenant_id == tenant_id)
        .order_by(AssinaturaPixPagamento.paid_at.desc())
        .limit(limite)
    )
    return list(result.scalars().all())


# ── Vencimento ───────────────────────────────────────────────────────────────

async def expirar_pix(db: AsyncSession, tenant_id: uuid.UUID, agora: Optional[datetime] = None) -> bool:
    """Mês PIX vencido além da tolerância → plano gratuito (como assinatura não renovada).

    Confere de novo sob `FOR UPDATE` (um PIX pago no meio da rodada ganha). Um pedido de boleto
    aberto na tolerância (`pending_*`) é preservado: o `reset_to_free` limparia o vínculo.
    Faz commit. True se rebaixou.
    """
    sub = (
        await db.execute(select(Subscription).where(Subscription.tenant_id == tenant_id).with_for_update())
    ).scalar_one_or_none()
    if not sub or not pix_expirado(sub, agora):
        await db.rollback()
        return False
    pago_ate = pix_pago_ate(sub)
    pendente = (
        sub.pending_stripe_subscription_id, sub.pending_invoice_id,
        sub.pending_invoice_url, sub.pending_invoice_due_at,
    )
    await SubscriptionRepository(db).reset_to_free(tenant_id, status=SubscriptionStatus.CANCELLED)
    (
        sub.pending_stripe_subscription_id, sub.pending_invoice_id,
        sub.pending_invoice_url, sub.pending_invoice_due_at,
    ) = pendente
    await AuditLogRepository(db).create(
        tenant_id=tenant_id, user_id=None, action=AuditAction.UPDATE, resource_type="assinatura_pix",
        resource_id=sub.id,
        details={"event": "pix_mensal_vencido", "pago_ate": pago_ate.isoformat() if pago_ate else None},
    )
    await db.commit()
    logger.info("PIX mensal vencido — tenant %s voltou ao gratuito (pago até %s)", tenant_id, pago_ate)
    return True


# ── Agendador (rodada diária junto do trial_scheduler) ───────────────────────

async def _contatos_admin(tenant_id: uuid.UUID) -> list[tuple[str, str]]:
    """(e-mail, nome) dos administradores ativos do terreiro; sem admin, o contato principal."""
    from ..core.database import AsyncSessionLocal
    from ..models import User, UserRole
    from .trial_scheduler import get_tenant_primary_contact

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(
                and_(
                    User.tenant_id == tenant_id,
                    User.role == UserRole.ADMIN,
                    User.is_active.is_(True),
                    User.deleted_at.is_(None),
                )
            ).order_by(User.created_at.asc())
        )
        admins = [(u.email, u.full_name or u.username) for u in result.scalars().all() if u.email]
    if admins:
        return admins
    contato = await get_tenant_primary_contact(tenant_id)
    return [contato] if contato else []


async def _enviar(msg) -> None:
    from .email.brevo_provider import BrevoEmailService
    from .email.resend_fallback import ResendEmailService

    try:
        if not await ResendEmailService().send_async(msg):
            raise RuntimeError("Resend returned False")
    except Exception:
        try:
            await BrevoEmailService().send_async(msg)
        except Exception as exc:
            logger.warning("PIX mensal: e-mail para %s falhou: %s", msg.to_email, exc)


def _fmt(dt: datetime) -> str:
    from zoneinfo import ZoneInfo

    return dt.astimezone(ZoneInfo("America/Sao_Paulo")).strftime("%d/%m/%Y")


async def _enviar_lembrete(tenant_id: uuid.UUID, plano: PlanType, dias: int, pago_ate: datetime) -> None:
    from ..core.config import settings
    from .email.base import EmailMessage
    from .email.templates.pix_mensal_lembrete import render_pix_mensal_lembrete_email
    from .scheduler_guard import claim_once

    contatos = await _contatos_admin(tenant_id)
    if not contatos:
        return
    if not await claim_once(tenant_id, "pix_mensal_lembretes", str(dias), scope=pago_ate.isoformat()):
        return
    billing_url = f"{settings.FRONTEND_URL}/admin/billing"
    plano_label = {PlanType.BASIC: "Basic", PlanType.PRO: "Pro", PlanType.PREMIUM: "Premium"}.get(plano, plano.value)
    quando = "amanhã" if dias == 1 else f"em {dias} dias"
    for email, nome in contatos:
        await _enviar(EmailMessage(
            to_email=email,
            subject=f"Seu plano {plano_label} vence {quando} — pague o próximo mês por PIX",
            html_body=render_pix_mensal_lembrete_email(
                nome, plano_label, dias, _fmt(pago_ate), _fmt(tolerancia_ate(pago_ate)), billing_url
            ),
            text_body=(
                f"Olá, {nome}.\n\nO mês do plano {plano_label} pago por PIX vence {quando} "
                f"(pago até {_fmt(pago_ate)}). Pague o próximo mês em {billing_url} — cada PIX libera "
                f"mais 30 dias a partir do fim do mês atual. Sem pagamento, a conta volta para o plano "
                f"gratuito em {_fmt(tolerancia_ate(pago_ate))}."
            ),
        ))


async def _enviar_vencido(tenant_id: uuid.UUID) -> None:
    from ..core.config import settings
    from .email.base import EmailMessage
    from .email.templates.subscription_reverted_to_free import render_subscription_reverted_to_free_email

    billing_url = f"{settings.FRONTEND_URL}/admin/billing"
    for email, nome in await _contatos_admin(tenant_id):
        await _enviar(EmailMessage(
            to_email=email,
            subject="Sua conta no GiraHub agora é gratuita",
            html_body=render_subscription_reverted_to_free_email(nome, billing_url, trial_expired=False),
            text_body=(
                f"Olá, {nome}.\n\nO período pago da sua assinatura terminou e sua conta voltou para o "
                f"plano gratuito. Para voltar ao plano, pague um PIX em {billing_url}."
            ),
        ))


async def processar_pix_mensal(agora: Optional[datetime] = None) -> None:
    """Rodada diária: lembretes (5 e 1 dia antes) e vencimento. Um worker por rodada."""
    from .scheduler_guard import PIX_MENSAL_LOCK_KEY, advisory_lock

    async with advisory_lock(PIX_MENSAL_LOCK_KEY) as acquired:
        if not acquired:
            logger.info("PIX mensal: outra instância está processando — pulando rodada.")
            return
        await _processar_pix_mensal_locked(agora)


async def _processar_pix_mensal_locked(agora: Optional[datetime] = None) -> None:
    from ..core.database import AsyncSessionLocal
    from .trial_scheduler import days_left

    agora = agora or datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Subscription).where(
                and_(
                    Subscription.collection_method == COLLECTION_PIX_MENSAL,
                    Subscription.stripe_subscription_id.is_(None),
                    Subscription.is_bonus.isnot(True),
                    Subscription.current_period_end.isnot(None),
                )
            )
        )
        subs = list(result.scalars().all())

    for sub in subs:
        tenant_id = sub.tenant_id
        try:
            pago_ate = pix_pago_ate(sub)
            if pago_ate is None:
                continue
            if pago_ate > agora:
                dias = lembrete_devido(days_left(pago_ate - agora))
                if dias is not None and sub.status == SubscriptionStatus.ACTIVE:
                    await _enviar_lembrete(tenant_id, sub.plan, dias, pago_ate)
            elif pix_expirado(sub, agora):
                async with AsyncSessionLocal() as db:
                    rebaixou = await expirar_pix(db, tenant_id, agora)
                if rebaixou:
                    await _enviar_vencido(tenant_id)
        except Exception:
            logger.exception("PIX mensal: falha ao processar o tenant %s", tenant_id)
