"""Webhooks da mensalidade com baixa automática (F-02/AM-22) — sem JWT, assinatura conferida aqui.

    POST /api/v1/webhooks/stripe-connect   eventos das contas conectadas (casas) no Stripe Connect

É um endpoint SEPARADO do webhook da assinatura do GiraHub (`webhooks.py`, `/webhooks/stripe`):
no Dashboard do Stripe, o destino de eventos "contas conectadas" tem o próprio segredo
(`STRIPE_CONNECT_WEBHOOK_SECRET`). Eventos tratados: `payment_intent.succeeded`,
`payment_intent.payment_failed`, `payment_intent.canceled` e `account.updated`.

- Assinatura inválida (ou segredo não configurado) → 400, nada é processado.
- Idempotência no padrão Q-04 (`webhooks.py`): a marca do evento em `stripe_events_processed`
  (ids `evt_...` são únicos no Stripe, plataforma e contas conectadas) é inserida ANTES de
  processar, na MESMA transação do efeito — entrega repetida ou simultânea não dá baixa duas vezes;
  falha no processamento desfaz a marca e o reenvio do Stripe é processado.
- O tenant vem da NOSSA cobrança (id do PaymentIntent) e a conta do evento (`event.account`)
  precisa ser a gravada na cobrança — `services/mensalidade_gateway.processar_evento_stripe_connect`.
- Evento de conta/cobrança que não conhecemos → 200 (o Stripe não deve reenviar).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.models import StripeEventProcessed
from src.services import stripe_connect
from src.services.mensalidade_gateway import processar_evento_stripe_connect

logger = logging.getLogger("senhas")

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])

EVENTOS_CONNECT = frozenset(
    {
        "payment_intent.succeeded",
        "payment_intent.payment_failed",
        "payment_intent.canceled",
        "account.updated",
    }
)


@router.post("/stripe-connect")
async def stripe_connect_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.body()
    assinatura = request.headers.get("stripe-signature", "")
    try:
        evento = stripe_connect.construir_evento(payload, assinatura)
    except Exception as exc:
        logger.warning("Webhook do Stripe Connect recusado: %s", type(exc).__name__)
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")

    tipo = evento.get("type") or ""
    event_id = evento.get("id") or ""
    if tipo not in EVENTOS_CONNECT or not event_id:
        return {"received": True, "ignored": True}

    claimed = await db.execute(
        pg_insert(StripeEventProcessed)
        .values(event_id=event_id, event_type=tipo)
        .on_conflict_do_nothing(index_elements=["event_id"])
        .returning(StripeEventProcessed.id)
    )
    if claimed.scalar_one_or_none() is None:
        await db.rollback()
        return {"received": True, "duplicate": True}

    resultado = await processar_evento_stripe_connect(db, evento)
    await db.commit()
    logger.info("Stripe Connect %s → %s", tipo, resultado)
    return {"received": True, "result": resultado}
