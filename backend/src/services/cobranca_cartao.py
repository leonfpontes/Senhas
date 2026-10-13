"""Tolerância na cobrança do plano no cartão (dunning) — decisão do dono de 2026-10-13.

Motivo: um cliente pagante foi suspenso na PRIMEIRA recusa da renovação (saldo insuficiente),
mas a Stripe tenta cobrar de novo alguns dias depois e a nova tentativa costuma passar.

Regra (só assinatura no cartão, `collection_method=charge_automatically` ou NULL/antiga):

| Quando | O que acontece |
|---|---|
| `invoice.payment_failed` (sem trial) | Plano CONTINUA ACTIVE. Grava `pagamento_pendente_desde` (1ª recusa) e a fatura; e-mail aos admins uma vez por fatura; painel mostra "Pagamento pendente" + "Atualizar cartão" |
| assinatura Stripe `past_due` | Igual: só aviso, sem suspender |
| assinatura Stripe `unpaid` (a Stripe desistiu) | SUSPENDED + e-mail "plano suspenso por falta de pagamento" |
| Rede de segurança (rodada diária) | Pendente há mais de `TOLERANCIA_DIAS` (10) e a Stripe ainda não está `active` (reconsultada pela API) → SUSPENDED + e-mail. Cobre conta Stripe que nunca marca `unpaid` |
| Pago depois (`active` / `invoice.paid`) | Limpa o pendente e volta a ACTIVE na hora (reativa SUSPENDED, como sempre) |

Fica como era: falha na conversão do trial (`reset_to_free`), boleto (`send_invoice`: quem suspende
é o `invoice.overdue`/`past_due`) e PIX mês a mês (sem assinatura Stripe; vencimento próprio).

Acesso e métricas: em tolerância o status segue ACTIVE, então o gate de plano libera tudo e o MRR
continua contando o terreiro como pagante (a Stripe ainda vai cobrar); suspenso perde as features
pagas (402) e sai do MRR — mesmas regras de sempre (`plan_features`, `billing_metrics`).

E-mails: `claim_once(tenant, "cobranca_cartao_avisos", "falha"|"suspenso", scope=<fatura>)`
gravado ANTES do envio — reentrega do webhook, `payment_failed` + `past_due` da mesma fatura ou duas
rodadas não mandam de novo; fatura nova (outro mês) reinicia as marcas.

Rodada diária: chamada pelo trial_scheduler às 09:00 BRT, com lock próprio
(`COBRANCA_CARTAO_LOCK_KEY`, ver scheduler_guard).
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.audit_logs import AuditAction
from ..models.subscriptions import PlanType, Subscription, SubscriptionStatus
from ..repositories.audit_log_repo import AuditLogRepository
from ..repositories.subscription_repo import clear_card_dunning

logger = logging.getLogger(__name__)

TOLERANCIA_DIAS = 10
AVISOS_NAMESPACE = "cobranca_cartao_avisos"
AVISO_FALHA = "falha"
AVISO_SUSPENSO = "suspenso"

_COLLECTION_INVOICE = "send_invoice"   # espelho de stripe_service.COLLECTION_INVOICE
_COLLECTION_PIX = "pix_mensal"         # espelho de stripe_service.COLLECTION_PIX_MENSAL
_PLANO_LABEL = {PlanType.BASIC: "Basic", PlanType.PRO: "Pro", PlanType.PREMIUM: "Premium"}

# Referência às tarefas de e-mail disparadas pelo webhook (fire-and-forget): sem isso o asyncio
# pode coletar a tarefa no meio. Os testes aguardam com `aguardar_avisos()`.
_avisos_pendentes: set[asyncio.Task] = set()


# ── Regras puras ─────────────────────────────────────────────────────────────

def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if not isinstance(dt, datetime):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def cobra_no_cartao(collection_method: Optional[str]) -> bool:
    """Forma de cobrança do cartão (renovação automática). NULL = assinatura antiga = cartão."""
    return collection_method not in (_COLLECTION_INVOICE, _COLLECTION_PIX)


def pendente_desde(sub) -> Optional[datetime]:
    return _aware(getattr(sub, "pagamento_pendente_desde", None))


def em_tolerancia(sub) -> bool:
    """Cartão recusado, plano ainda ACTIVE enquanto a Stripe tenta de novo (o aviso do painel)."""
    return (
        sub is not None
        and getattr(sub, "status", None) == SubscriptionStatus.ACTIVE
        and pendente_desde(sub) is not None
    )


def tolerancia_vencida(sub, agora: Optional[datetime] = None) -> bool:
    """Pendente há mais de TOLERANCIA_DIAS — a rede de segurança reconsulta a Stripe."""
    desde = pendente_desde(sub)
    return (
        em_tolerancia(sub)
        and desde is not None
        and (agora or datetime.now(timezone.utc)) - desde >= timedelta(days=TOLERANCIA_DIAS)
    )


def marcar_pendente(sub: Subscription, invoice_id: Optional[str], agora: Optional[datetime] = None) -> None:
    """Grava o pendente. A data é a da PRIMEIRA recusa (não anda em cada nova tentativa)."""
    if pendente_desde(sub) is None:
        sub.pagamento_pendente_desde = agora or datetime.now(timezone.utc)
    if invoice_id:
        sub.pagamento_pendente_invoice_id = invoice_id


def limpar_pendente(sub: Subscription) -> bool:
    """Pagou: limpa o pendente. True se havia algo pendente."""
    havia = pendente_desde(sub) is not None or isinstance(getattr(sub, "pagamento_pendente_invoice_id", None), str)
    clear_card_dunning(sub)
    return havia


def escopo_aviso(sub) -> str:
    """Escopo das marcas de e-mail: a fatura recusada (ou, sem ela, a data da 1ª recusa)."""
    invoice_id = getattr(sub, "pagamento_pendente_invoice_id", None)
    if isinstance(invoice_id, str) and invoice_id:
        return invoice_id
    desde = pendente_desde(sub)
    return desde.isoformat() if desde else "sem-fatura"


# ── E-mails ──────────────────────────────────────────────────────────────────

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
            logger.warning("Cobrança do cartão: e-mail para %s falhou: %s", msg.to_email, exc)


def _fmt(dt: Optional[datetime]) -> str:
    from zoneinfo import ZoneInfo

    return dt.astimezone(ZoneInfo("America/Sao_Paulo")).strftime("%d/%m/%Y") if dt else ""


async def avisar(
    tenant_id: uuid.UUID,
    tipo: str,
    escopo: str,
    plano: PlanType,
    desde: Optional[datetime] = None,
) -> bool:
    """E-mail aos administradores ativos — no máximo uma vez por `tipo` e fatura (`escopo`).

    A marca é gravada antes do envio (falha do provedor não reenvia — mesmo critério dos
    lembretes do PIX). True se esta chamada enviou.
    """
    from ..core.config import settings
    from .assinatura_pix import _contatos_admin
    from .email.base import EmailMessage
    from .email.templates.cartao_pagamento_pendente import render_cartao_pagamento_pendente_email
    from .scheduler_guard import claim_once

    contatos = await _contatos_admin(tenant_id)
    if not contatos:
        return False
    if not await claim_once(tenant_id, AVISOS_NAMESPACE, tipo, scope=escopo):
        return False
    billing_url = f"{settings.FRONTEND_URL}/admin/billing"
    plano_label = _PLANO_LABEL.get(plano, getattr(plano, "value", str(plano)))
    suspenso = tipo == AVISO_SUSPENSO
    if suspenso:
        assunto = f"Plano {plano_label} suspenso por falta de pagamento — atualize o cartão para reativar"
        texto = (
            "Não conseguimos cobrar o plano no cartão, mesmo depois das novas tentativas, e o plano foi "
            f"suspenso por falta de pagamento. Atualize o cartão em {billing_url} para reativar — assim que "
            "o pagamento passar, tudo volta a funcionar."
        )
    else:
        assunto = "O pagamento do plano não passou — confira o saldo ou troque o cartão"
        texto = (
            f"O pagamento do plano {plano_label} no cartão não passou. O plano continua funcionando enquanto "
            "tentamos cobrar de novo nos próximos dias. Confira o saldo ou troque o cartão em "
            f"{billing_url}."
        )
    for email, nome in contatos:
        await _enviar(EmailMessage(
            to_email=email,
            subject=assunto,
            html_body=render_cartao_pagamento_pendente_email(
                nome, plano_label, billing_url, suspenso=suspenso, desde=_fmt(desde)
            ),
            text_body=f"Olá, {nome}.\n\n{texto}",
        ))
    return True


def disparar_aviso(tenant_id: uuid.UUID, tipo: str, escopo: str, plano: PlanType, desde: Optional[datetime]) -> None:
    """Fire-and-forget a partir do webhook (depois do commit): o e-mail não atrasa a resposta à Stripe."""

    async def _run():
        try:
            await avisar(tenant_id, tipo, escopo, plano, desde)
        except Exception:
            logger.exception("Cobrança do cartão: falha ao avisar o tenant %s (%s)", tenant_id, tipo)

    task = asyncio.create_task(_run())
    _avisos_pendentes.add(task)
    task.add_done_callback(_avisos_pendentes.discard)


async def aguardar_avisos() -> None:
    """Espera os e-mails disparados pelo webhook (usado nos testes)."""
    while _avisos_pendentes:
        await asyncio.gather(*list(_avisos_pendentes), return_exceptions=True)


# ── Suspensão ────────────────────────────────────────────────────────────────

async def suspender(db: AsyncSession, sub: Subscription, motivo: str, detalhes: Optional[dict] = None) -> bool:
    """SUSPENDED por falta de pagamento (não faz commit). Mantém o pendente (escopo do e-mail;
    o pagamento limpa). False se já estava suspensa."""
    if sub.status == SubscriptionStatus.SUSPENDED:
        return False
    sub.status = SubscriptionStatus.SUSPENDED
    await AuditLogRepository(db).create(
        tenant_id=sub.tenant_id, user_id=None, action=AuditAction.UPDATE, resource_type="stripe_subscription",
        resource_id=sub.id,
        details={
            "event": motivo,
            "pagamento_pendente_desde": pendente_desde(sub).isoformat() if pendente_desde(sub) else None,
            **(detalhes or {}),
        },
    )
    logger.warning("Cartão sem pagamento — tenant %s suspenso (%s)", sub.tenant_id, motivo)
    return True


# ── Rede de segurança (rodada diária junto do trial_scheduler) ───────────────

async def _status_na_stripe(stripe_subscription_id: str) -> Optional[str]:
    import stripe

    # StripeObject deixou de ser dict-like (sem .get) — converte como o webhook faz.
    stripe_sub = (await asyncio.to_thread(stripe.Subscription.retrieve, stripe_subscription_id)).to_dict()
    return stripe_sub.get("status")


async def verificar_tolerancia(db: AsyncSession, tenant_id: uuid.UUID, agora: Optional[datetime] = None) -> Optional[str]:
    """Um terreiro com a tolerância vencida: reconsulta a Stripe e decide. Faz commit.

    Retorna "suspenso", "pago" (a Stripe já está active — o webhook se perdeu: limpa) ou None
    (nada a fazer / Stripe indisponível — tenta de novo na próxima rodada).
    """
    sub = (
        await db.execute(select(Subscription).where(Subscription.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if not sub or not tolerancia_vencida(sub, agora) or not isinstance(sub.stripe_subscription_id, str):
        return None
    stripe_sub_id = sub.stripe_subscription_id
    await db.rollback()  # não segura a linha durante a chamada à Stripe
    try:
        status = await _status_na_stripe(stripe_sub_id)
    except Exception as exc:
        logger.warning("Cobrança do cartão: Stripe indisponível para %s (tenant %s): %s", stripe_sub_id, tenant_id, exc)
        return None

    # Confere de novo sob FOR UPDATE: um webhook (pago/suspenso) no meio da rodada ganha.
    sub = (
        await db.execute(select(Subscription).where(Subscription.tenant_id == tenant_id).with_for_update())
    ).scalar_one_or_none()
    if not sub or not tolerancia_vencida(sub, agora) or sub.stripe_subscription_id != stripe_sub_id:
        await db.rollback()
        return None
    if status in ("active", "trialing"):
        limpar_pendente(sub)
        await AuditLogRepository(db).create(
            tenant_id=tenant_id, user_id=None, action=AuditAction.UPDATE, resource_type="stripe_subscription",
            resource_id=sub.id, details={"event": "cobranca_cartao_pago_conferido", "stripe_status": status},
        )
        await db.commit()
        logger.info("Cobrança do cartão: tenant %s já está pago na Stripe — pendente limpo", tenant_id)
        return "pago"
    await suspender(
        db, sub, "cobranca_cartao_tolerancia_vencida",
        {"stripe_status": status, "tolerancia_dias": TOLERANCIA_DIAS},
    )
    await db.commit()
    return "suspenso"


async def processar_tolerancia_cartao(agora: Optional[datetime] = None) -> None:
    """Rodada diária: suspende quem passou da tolerância sem pagar. Um worker por rodada."""
    from .scheduler_guard import COBRANCA_CARTAO_LOCK_KEY, advisory_lock

    async with advisory_lock(COBRANCA_CARTAO_LOCK_KEY) as acquired:
        if not acquired:
            logger.info("Cobrança do cartão: outra instância está processando — pulando rodada.")
            return
        await _processar_locked(agora)


async def _processar_locked(agora: Optional[datetime] = None) -> None:
    from ..core.database import AsyncSessionLocal

    agora = agora or datetime.now(timezone.utc)
    limite = agora - timedelta(days=TOLERANCIA_DIAS)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Subscription.tenant_id).where(
                and_(
                    Subscription.status == SubscriptionStatus.ACTIVE,
                    Subscription.pagamento_pendente_desde.isnot(None),
                    Subscription.pagamento_pendente_desde <= limite,
                    Subscription.stripe_subscription_id.isnot(None),
                    or_(
                        Subscription.collection_method.is_(None),
                        Subscription.collection_method.notin_([_COLLECTION_INVOICE, _COLLECTION_PIX]),
                    ),
                )
            )
        )
        tenant_ids = [row[0] for row in result.all()]

    for tenant_id in tenant_ids:
        try:
            async with AsyncSessionLocal() as db:
                resultado = await verificar_tolerancia(db, tenant_id, agora)
                if resultado == "suspenso":
                    sub = (
                        await db.execute(select(Subscription).where(Subscription.tenant_id == tenant_id))
                    ).scalar_one()
                    escopo, plano, desde = escopo_aviso(sub), sub.plan, pendente_desde(sub)
            if resultado == "suspenso":
                await avisar(tenant_id, AVISO_SUSPENSO, escopo, plano, desde)
        except Exception:
            logger.exception("Cobrança do cartão: falha ao processar o tenant %s", tenant_id)
