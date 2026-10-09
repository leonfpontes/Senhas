"""Stripe Connect para a mensalidade dos médiuns (F-02/AM-22) — só chamadas ao Stripe, sem banco.

Decisões (docs/fluxo-pagamento-mensalidade.md §5a; documentação do Stripe lida em 09/10/2026):

- **Conta conectada "Express" com propriedades de controlador**, criada pelo GiraHub com
  ``controller.stripe_dashboard.type = express``, ``controller.fees.payer = account``,
  ``controller.losses.payments = stripe`` e ``controller.requirement_collection = stripe``:
  * o Stripe faz o cadastro (KYC) num fluxo hospedado (Account Links), com CPF **ou** CNPJ —
    a casa escolhe pessoa física ou jurídica no próprio cadastro (não forçamos `business_type`);
  * a casa paga as taxas do Stripe direto ao Stripe (``fees.payer=account``) e o Stripe — não o
    GiraHub — responde por saldo negativo (``losses.payments=stripe``): "custo zero" e nenhum
    risco financeiro para a plataforma. (Combinação aceita: só ``requirement_collection =
    application`` é incompatível com o painel Express — docs.stripe.com/connect/migrate-to-controller-properties.)
  * com o painel Express **a plataforma pede as capacidades** ``pix_payments`` e
    ``boleto_payments`` (docs.stripe.com/payments/pix#connect: em conta com o Dashboard completo —
    "Standard" — é o dono quem liga o PIX no painel dele, e o GiraHub não teria como pedir).
  * Também pedimos ``card_payments`` e ``transfers`` (capacidades base do Connect).
- **Cobrança direta** na conta da casa (``stripe_account=acct_...``): a casa é a vendedora, o
  dinheiro cai no saldo Stripe dela e é repassado ao banco no cronograma padrão. **Sem
  application_fee** (o GiraHub não cobra comissão — decisão do dono).
- PIX: ``payment_method_types=["pix"]``, confirmado no servidor; o QR/copia-e-cola vem em
  ``next_action.pix_display_qr_code`` (``data``, ``expires_at``). Expira em 24 h
  (``payment_method_options.pix.expires_after_seconds``, 60 s a 14 dias; padrão do Stripe 4 h).
  Valor do PIX: R$ 0,50 a R$ 3.000.
- Boleto: CPF/CNPJ e endereço do pagador são obrigatórios (``payment_method_data.boleto.tax_id``
  e ``billing_details.address``); os dados vão direto ao Stripe e não são gravados.
- Eventos das contas conectadas chegam num endpoint de webhook do Connect, com segredo próprio
  (``STRIPE_CONNECT_WEBHOOK_SECRET``).

Fontes: https://docs.stripe.com/payments/pix · https://docs.stripe.com/payments/pix/accept-a-payment
· https://docs.stripe.com/payments/boleto/accept-a-payment · https://docs.stripe.com/connect/express-accounts
· https://docs.stripe.com/connect/migrate-to-controller-properties · https://docs.stripe.com/connect/direct-charges
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Optional

import stripe

from src.core.config import settings

logger = logging.getLogger(__name__)

PIX_EXPIRA_SEGUNDOS = 24 * 60 * 60
BOLETO_EXPIRA_DIAS = 3
PIX_MIN = Decimal("0.50")
PIX_MAX = Decimal("3000.00")

CAPACIDADES_BASE = ("card_payments", "transfers")
CAPACIDADES_MENSALIDADE = ("pix_payments", "boleto_payments")


class StripeConnectErro(RuntimeError):
    """Falha ao falar com o Stripe (rede, conta, parâmetro). Mensagem já pode ir ao usuário."""

    def __init__(self, mensagem: str, *, codigo: str = "STRIPE_ERRO", param: Optional[str] = None):
        super().__init__(mensagem)
        self.codigo = codigo
        self.param = param


def disponivel() -> bool:
    """A opção "Stripe" aparece só com a chave da API e o segredo do webhook do Connect."""
    return bool(settings.STRIPE_SECRET_KEY and settings.STRIPE_CONNECT_WEBHOOK_SECRET)


def _dict(obj: Any) -> dict:
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    to_dict = getattr(obj, "to_dict", None)
    return to_dict() if callable(to_dict) else dict(obj)


async def _chamar(fn, *args, **kwargs):
    kwargs.setdefault("api_key", settings.STRIPE_SECRET_KEY)
    try:
        return await asyncio.to_thread(fn, *args, **kwargs)
    except stripe.StripeError as exc:  # type: ignore[attr-defined]
        param = getattr(exc, "param", None)
        logger.warning("Stripe Connect: %s (%s, param=%s)", type(exc).__name__, getattr(exc, "code", None), param)
        raise StripeConnectErro(
            "O Stripe não aceitou o pedido agora. Tente de novo em alguns minutos.",
            codigo=getattr(exc, "code", None) or "STRIPE_ERRO",
            param=param,
        ) from exc


# ── Conta conectada ──────────────────────────────────────────────────────────


@dataclass(frozen=True)
class EstadoConta:
    cadastro_completo: bool
    recebimentos_ativos: bool
    pix_disponivel: bool
    boleto_disponivel: bool


def estado_da_conta(account: dict) -> EstadoConta:
    """Lê do objeto Account (API ou evento `account.updated`) o que a tela precisa."""
    caps = account.get("capabilities") or {}
    return EstadoConta(
        cadastro_completo=bool(account.get("details_submitted")),
        recebimentos_ativos=bool(account.get("charges_enabled")),
        pix_disponivel=caps.get("pix_payments") == "active",
        boleto_disponivel=caps.get("boleto_payments") == "active",
    )


async def criar_conta(*, tenant_id: str, tenant_nome: str, email: Optional[str]) -> str:
    """Cria a conta conectada da casa (Express, controlador "casa paga as taxas, Stripe cobre perdas")."""
    params: dict[str, Any] = {
        "country": "BR",
        "default_currency": "brl",
        "controller": {
            "stripe_dashboard": {"type": "express"},
            "fees": {"payer": "account"},
            "losses": {"payments": "stripe"},
            "requirement_collection": "stripe",
        },
        "capabilities": {cap: {"requested": True} for cap in CAPACIDADES_BASE},
        # MCC 8661 = organizações religiosas. O texto aparece no cadastro do Stripe.
        "business_profile": {
            "mcc": "8661",
            "product_description": "Mensalidade dos membros da casa, cobrada pelo GiraHub",
            "name": (tenant_nome or "")[:100] or None,
        },
        "metadata": {"tenant_id": tenant_id, "origem": "girahub_mensalidade"},
    }
    if email:
        params["email"] = email
    conta = _dict(await _chamar(stripe.Account.create, **params))
    account_id = conta["id"]
    await solicitar_capacidades(account_id)
    return account_id


async def solicitar_capacidades(account_id: str) -> None:
    """Pede PIX e boleto. Falha aqui não impede o cadastro (o Stripe pode liberar depois)."""
    for cap in CAPACIDADES_MENSALIDADE:
        try:
            await _chamar(stripe.Account.modify_capability, account_id, cap, requested=True)
        except StripeConnectErro:
            logger.warning("Capacidade %s não pôde ser pedida para a conta conectada.", cap)


async def link_cadastro(account_id: str, *, refresh_url: str, return_url: str) -> str:
    """URL de uso único do cadastro hospedado pelo Stripe (expira em minutos)."""
    link = _dict(
        await _chamar(
            stripe.AccountLink.create,
            account=account_id,
            refresh_url=refresh_url,
            return_url=return_url,
            type="account_onboarding",
        )
    )
    return link["url"]


async def buscar_conta(account_id: str) -> dict:
    return _dict(await _chamar(stripe.Account.retrieve, account_id))


# ── Cobranças (cobrança direta na conta da casa) ─────────────────────────────


@dataclass(frozen=True)
class CobrancaCriada:
    external_id: str
    status_externo: str
    copia_e_cola: Optional[str] = None
    boleto_url: Optional[str] = None
    boleto_linha_digitavel: Optional[str] = None
    expira_em: Optional[datetime] = None


def centavos(valor: Decimal) -> int:
    return int((Decimal(valor) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _ts(valor: Any) -> Optional[datetime]:
    if not valor:
        return None
    try:
        return datetime.fromtimestamp(int(valor), tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


def ler_cobranca(pi: dict) -> CobrancaCriada:
    """Extrai do PaymentIntent confirmado o que a Área mostra (QR do PIX ou o boleto)."""
    nxt = pi.get("next_action") or {}
    pix = nxt.get("pix_display_qr_code") or {}
    boleto = nxt.get("boleto_display_details") or {}
    return CobrancaCriada(
        external_id=pi["id"],
        status_externo=pi.get("status") or "",
        copia_e_cola=pix.get("data"),
        boleto_url=boleto.get("hosted_voucher_url") or boleto.get("pdf"),
        boleto_linha_digitavel=boleto.get("number"),
        expira_em=_ts(pix.get("expires_at") or boleto.get("expires_at")),
    )


async def criar_cobranca(
    *,
    account_id: str,
    metodo: str,
    valor: Decimal,
    descricao: str,
    metadata: dict[str, str],
    idempotency_key: str,
    nome: str,
    email: Optional[str],
    cpf: Optional[str] = None,
    endereco: Optional[dict[str, str]] = None,
) -> CobrancaCriada:
    """Cria e confirma o PaymentIntent na conta da casa (`stripe_account`), sem taxa da plataforma."""
    billing: dict[str, Any] = {"name": nome[:100]}
    if email:
        billing["email"] = email
    pm_data: dict[str, Any] = {"type": metodo, "billing_details": billing}
    if metodo == "pix":
        if cpf:
            billing["tax_id"] = cpf
        options = {"pix": {"expires_after_seconds": PIX_EXPIRA_SEGUNDOS}}
    else:
        pm_data["boleto"] = {"tax_id": cpf or ""}
        billing["address"] = {**(endereco or {}), "country": "BR"}
        options = {"boleto": {"expires_after_days": BOLETO_EXPIRA_DIAS}}
    pi = _dict(
        await _chamar(
            stripe.PaymentIntent.create,
            amount=centavos(valor),
            currency="brl",
            payment_method_types=[metodo],
            payment_method_data=pm_data,
            payment_method_options=options,
            confirm=True,
            description=descricao[:500],
            metadata=metadata,
            stripe_account=account_id,
            idempotency_key=idempotency_key,
        )
    )
    return ler_cobranca(pi)


# ── Webhook do Connect ───────────────────────────────────────────────────────


def construir_evento(payload: bytes, assinatura: str) -> dict:
    """Valida a assinatura com `STRIPE_CONNECT_WEBHOOK_SECRET` e devolve o evento como dict.

    Sem segredo configurado, recusa sempre (nunca processa evento sem assinatura conferida).
    """
    segredo = settings.STRIPE_CONNECT_WEBHOOK_SECRET
    if not segredo:
        raise ValueError("STRIPE_CONNECT_WEBHOOK_SECRET não configurado")
    evento = stripe.Webhook.construct_event(payload, assinatura, segredo)
    return _dict(evento)
