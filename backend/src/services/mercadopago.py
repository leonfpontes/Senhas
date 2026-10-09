"""Mercado Pago para a mensalidade dos médiuns (F-02/AM-22) — só chamadas HTTP, sem banco.

Modelo (decisão do dono de 09/10: cada casa escolhe Stripe ou Mercado Pago):

- **OAuth (Authorization Code)**: a casa autoriza a aplicação do GiraHub na conta Mercado Pago
  dela; o GiraHub recebe `access_token` + `refresh_token` do vendedor (180 dias) e cria as
  cobranças NA CONTA DA CASA. Os tokens só são gravados cifrados (`core/secret_box.py`).
  - autorização: ``https://auth.mercadopago.com/authorization?client_id=…&response_type=code
    &platform_id=mp&state=…&redirect_uri=…`` — `state` é um JWT curto (10 min) assinado com a
    `SECRET_KEY` do GiraHub, com tenant + usuário + nonce (`criar_state`/`ler_state`);
  - troca do código (válido por 10 min): ``POST https://api.mercadopago.com/oauth/token`` com
    `client_id`, `client_secret`, `grant_type=authorization_code`, `code`, `redirect_uri`;
  - renovação: mesmo endpoint com `grant_type=refresh_token` + `refresh_token` (o refresh token
    muda a cada renovação — gravar o novo).
- **PIX**: ``POST https://api.mercadopago.com/v1/payments`` com o token da casa e
  ``X-Idempotency-Key``: `transaction_amount`, `payment_method_id="pix"`, `payer.email`,
  `description`, `external_reference` (= id da NOSSA cobrança), `notification_url` (rota única
  `/api/v1/webhooks/mercadopago`, igual para todas as casas) e `date_of_expiration` (24 h; o
  Mercado Pago aceita de 30 min a 30 dias). O QR vem em
  ``point_of_interaction.transaction_data.qr_code`` (copia-e-cola) e ``qr_code_base64``.
  Sem `application_fee`/`marketplace_fee`: o GiraHub não cobra comissão.
- **Webhook**: cabeçalho ``x-signature: ts=…,v1=…`` + ``x-request-id``; o manifesto é
  ``id:<data.id em minúsculas>;request-id:<x-request-id>;ts:<ts>;`` (partes ausentes saem do
  manifesto) e ``v1`` = HMAC-SHA256 hex com `MERCADOPAGO_WEBHOOK_SECRET`. Mesmo com a assinatura
  certa, o GiraHub **nunca confia no corpo**: busca o pagamento no Mercado Pago com o token da casa
  (``GET /v1/payments/{id}``) e confere `external_reference` e `collector_id`.

Fontes (lidas em 09/10/2026):
https://www.mercadopago.com.br/developers/pt/docs/security/oauth/creation ·
https://www.mercadopago.com.br/developers/pt/docs/security/oauth/renewal ·
https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix ·
https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional
from urllib.parse import urlencode

import httpx
import jwt

from src.core import secret_box
from src.core.config import settings
from src.services.stripe_connect import CobrancaCriada

logger = logging.getLogger(__name__)

AUTH_URL = "https://auth.mercadopago.com/authorization"
API_URL = "https://api.mercadopago.com"
STATE_TYPE = "mp_oauth_state"
STATE_TTL = timedelta(minutes=10)
PIX_EXPIRA = timedelta(hours=24)
TIMEOUT = httpx.Timeout(15.0)
# Renova o token do vendedor quando faltar menos que isto para vencer (vale 180 dias).
RENOVAR_ANTES = timedelta(days=7)


class MercadoPagoErro(RuntimeError):
    """Falha ao falar com o Mercado Pago. A mensagem já pode ir para a tela."""

    def __init__(self, mensagem: str, *, status: Optional[int] = None, codigo: str = "MERCADOPAGO_ERRO"):
        super().__init__(mensagem)
        self.status = status
        self.codigo = codigo


def disponivel() -> bool:
    """A opção aparece só com a aplicação configurada E o segredo em repouso ligado."""
    return bool(
        settings.MERCADOPAGO_CLIENT_ID
        and settings.MERCADOPAGO_CLIENT_SECRET
        and settings.MERCADOPAGO_REDIRECT_URI
        and settings.MERCADOPAGO_WEBHOOK_SECRET
        and secret_box.disponivel()
    )


def notification_url() -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/api/v1/webhooks/mercadopago"


# ── state do OAuth ───────────────────────────────────────────────────────────


@dataclass(frozen=True)
class EstadoOAuth:
    tenant_id: uuid.UUID
    user_id: uuid.UUID


def criar_state(tenant_id: uuid.UUID, user_id: uuid.UUID) -> str:
    agora = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "type": STATE_TYPE,
            "tid": str(tenant_id),
            "uid": str(user_id),
            "n": secrets.token_urlsafe(12),
            "iat": agora,
            "exp": agora + STATE_TTL,
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def ler_state(state: str) -> Optional[EstadoOAuth]:
    """Valida assinatura, validade e tipo. Inválido → None."""
    try:
        payload = jwt.decode(state, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != STATE_TYPE:
            return None
        return EstadoOAuth(tenant_id=uuid.UUID(payload["tid"]), user_id=uuid.UUID(payload["uid"]))
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        return None


def url_autorizacao(state: str) -> str:
    query = urlencode(
        {
            "client_id": settings.MERCADOPAGO_CLIENT_ID,
            "response_type": "code",
            "platform_id": "mp",
            "state": state,
            "redirect_uri": settings.MERCADOPAGO_REDIRECT_URI,
        }
    )
    return f"{AUTH_URL}?{query}"


# ── Tokens ───────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class TokensMP:
    access_token: str
    refresh_token: Optional[str]
    user_id: str
    expira_em: datetime


def _tokens(body: dict) -> TokensMP:
    try:
        expira = datetime.now(timezone.utc) + timedelta(seconds=int(body.get("expires_in") or 15552000))
        return TokensMP(
            access_token=str(body["access_token"]),
            refresh_token=body.get("refresh_token"),
            user_id=str(body["user_id"]),
            expira_em=expira,
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise MercadoPagoErro("O Mercado Pago não devolveu a autorização esperada.") from exc


async def _post(path: str, json: dict, *, token: Optional[str] = None, idempotency_key: Optional[str] = None) -> dict:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if idempotency_key:
        headers["X-Idempotency-Key"] = idempotency_key
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(f"{API_URL}{path}", json=json, headers=headers)
    except httpx.HTTPError as exc:
        raise MercadoPagoErro("Não conseguimos falar com o Mercado Pago agora. Tente de novo.") from exc
    if resp.status_code >= 400:
        logger.warning("Mercado Pago %s → %s", path, resp.status_code)
        raise MercadoPagoErro("O Mercado Pago não aceitou o pedido agora. Tente de novo.", status=resp.status_code)
    return resp.json()


async def trocar_codigo(code: str) -> TokensMP:
    return _tokens(
        await _post(
            "/oauth/token",
            {
                "client_id": settings.MERCADOPAGO_CLIENT_ID,
                "client_secret": settings.MERCADOPAGO_CLIENT_SECRET,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.MERCADOPAGO_REDIRECT_URI,
            },
        )
    )


async def renovar(refresh_token: str) -> TokensMP:
    return _tokens(
        await _post(
            "/oauth/token",
            {
                "client_id": settings.MERCADOPAGO_CLIENT_ID,
                "client_secret": settings.MERCADOPAGO_CLIENT_SECRET,
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            },
        )
    )


# ── Pagamentos ───────────────────────────────────────────────────────────────


def _iso_mp(dt: datetime) -> str:
    """Formato do Mercado Pago: 2026-10-10T12:00:00.000-03:00."""
    return dt.astimezone(timezone(timedelta(hours=-3))).isoformat(timespec="milliseconds")


def _data(valor: Any) -> Optional[datetime]:
    if not valor:
        return None
    try:
        return datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
    except ValueError:
        return None


def ler_pagamento(pagamento: dict) -> CobrancaCriada:
    dados = (pagamento.get("point_of_interaction") or {}).get("transaction_data") or {}
    return CobrancaCriada(
        external_id=str(pagamento["id"]),
        status_externo=pagamento.get("status") or "",
        copia_e_cola=dados.get("qr_code"),
        expira_em=_data(pagamento.get("date_of_expiration")),
    )


async def criar_pix(
    *,
    access_token: str,
    valor: Decimal,
    descricao: str,
    external_reference: str,
    idempotency_key: str,
    email: str,
    nome: str,
    cpf: Optional[str] = None,
) -> CobrancaCriada:
    """Cria o pagamento PIX na conta da casa (token do vendedor), sem comissão da plataforma."""
    partes = (nome or "").split()
    payer: dict[str, Any] = {"email": email}
    if partes:
        payer["first_name"] = partes[0][:60]
        if len(partes) > 1:
            payer["last_name"] = " ".join(partes[1:])[:60]
    if cpf:
        payer["identification"] = {"type": "CNPJ" if len(cpf) == 14 else "CPF", "number": cpf}
    body = {
        "transaction_amount": float(Decimal(valor).quantize(Decimal("0.01"))),
        "description": descricao[:250],
        "payment_method_id": "pix",
        "payer": payer,
        "external_reference": external_reference,
        "notification_url": notification_url(),
        "date_of_expiration": _iso_mp(datetime.now(timezone.utc) + PIX_EXPIRA),
    }
    return ler_pagamento(await _post("/v1/payments", body, token=access_token, idempotency_key=idempotency_key))


async def buscar_pagamento(access_token: str, payment_id: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(
                f"{API_URL}/v1/payments/{payment_id}", headers={"Authorization": f"Bearer {access_token}"}
            )
    except httpx.HTTPError as exc:
        raise MercadoPagoErro("Não conseguimos falar com o Mercado Pago agora.") from exc
    if resp.status_code >= 400:
        raise MercadoPagoErro("Pagamento não encontrado no Mercado Pago.", status=resp.status_code)
    return resp.json()


# ── Webhook ──────────────────────────────────────────────────────────────────


def assinatura_valida(
    x_signature: Optional[str],
    x_request_id: Optional[str],
    data_id: Optional[str],
    segredo: Optional[str] = None,
) -> bool:
    """Confere o ``x-signature`` (HMAC-SHA256 hex do manifesto) com o segredo da aplicação."""
    segredo = settings.MERCADOPAGO_WEBHOOK_SECRET if segredo is None else segredo
    if not segredo or not x_signature:
        return False
    partes: dict[str, str] = {}
    for pedaco in x_signature.split(","):
        chave, _, valor = pedaco.strip().partition("=")
        if chave and valor:
            partes[chave.strip()] = valor.strip()
    ts, v1 = partes.get("ts"), partes.get("v1")
    if not ts or not v1:
        return False
    manifesto = ""
    if data_id:
        manifesto += f"id:{str(data_id).lower()};"
    if x_request_id:
        manifesto += f"request-id:{x_request_id};"
    manifesto += f"ts:{ts};"
    esperado = hmac.new(segredo.encode(), manifesto.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperado, v1)
