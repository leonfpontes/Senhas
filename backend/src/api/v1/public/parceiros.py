"""Public API — Programa de Parceiros GiraHub (C-06).

Endpoint:
    POST /api/v1/public/parceiros/interesse  → pedido de interesse em ser parceiro (sem auth)

Antiabuso (mesmo padrão dos formulários públicos): limite por IP no slowapi (5/hora) e campo
isca (``website``, escondido na página): preenchido = robô → responde 201 igual, sem gravar nem
avisar ninguém. O IP nunca é gravado em claro — só o HMAC (``ip_hash``).

A página ``/parceiros`` fica atrás da chave ``NEXT_PUBLIC_PARCEIROS_PUBLICADO`` (desligada por
padrão); o endpoint aceita sempre — sem a página, ninguém chega aqui pelo site.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.database import get_db
from src.core.limiter import get_client_ip, limiter
from src.core.tz import utc_now
from src.models.parceiro_interesse import (
    CIDADE_MAX,
    COMO_DIVULGAR_MAX,
    NEGOCIO_MAX,
    NOME_MAX,
    TIPO_LABELS,
    TIPOS_PARCEIRO,
    UFS,
    ParceiroInteresse,
)
from src.services.email.base import EmailMessage
from src.services.email.email_queue import EmailQueueItem, email_queue
from src.services.email.templates.parceiro_interesse import (
    generate_parceiro_interesse_html,
    generate_parceiro_interesse_text,
)

router = APIRouter(prefix="/api/v1/public/parceiros", tags=["public-parceiros"])
logger = logging.getLogger(__name__)

MENSAGEM_OK = (
    "Recebemos o seu pedido! A equipe GiraHub responde em até 2 dias úteis, "
    "pelo WhatsApp ou e-mail, com o seu cupom e o material de divulgação."
)


def hash_ip(ip: str) -> Optional[str]:
    """HMAC-SHA256 do IP com chave derivada do SECRET_KEY — reconhece o mesmo endereço sem guardá-lo."""
    if not ip:
        return None
    chave = hmac.new(settings.SECRET_KEY.encode(), b"girahub:parceiros-ip:v1", hashlib.sha256).digest()
    return hmac.new(chave, ip.encode(), hashlib.sha256).hexdigest()


def _limpar(v):
    return v.strip() if isinstance(v, str) else v


class ParceiroInteresseRequest(BaseModel):
    nome: str = Field(..., min_length=3, max_length=NOME_MAX)
    tipo: str
    nome_negocio: Optional[str] = Field(None, max_length=NEGOCIO_MAX)
    cidade: str = Field(..., min_length=2, max_length=CIDADE_MAX)
    uf: str
    whatsapp: str = Field(..., max_length=30)
    email: EmailStr = Field(..., max_length=255)
    como_divulgar: str = Field(..., min_length=3, max_length=COMO_DIVULGAR_MAX)
    aceite_regulamento: bool
    # Campo isca: invisível para pessoas, robôs preenchem.
    website: Optional[str] = Field(None, max_length=500)

    @field_validator("nome", "nome_negocio", "cidade", "como_divulgar", "uf", "tipo", mode="before")
    @classmethod
    def _strip(cls, v):
        return _limpar(v)

    @field_validator("tipo")
    @classmethod
    def _tipo_valido(cls, v: str) -> str:
        if v not in TIPOS_PARCEIRO:
            raise ValueError("Escolha o tipo de parceiro.")
        return v

    @field_validator("uf")
    @classmethod
    def _uf_valida(cls, v: str) -> str:
        v = v.upper()
        if v not in UFS:
            raise ValueError("Escolha a UF.")
        return v

    @field_validator("whatsapp")
    @classmethod
    def _whatsapp_valido(cls, v: str) -> str:
        digitos = re.sub(r"\D", "", v or "")
        if not 10 <= len(digitos) <= 13:
            raise ValueError("Informe o WhatsApp com DDD.")
        return digitos

    @field_validator("nome_negocio")
    @classmethod
    def _negocio_vazio_vira_none(cls, v: Optional[str]) -> Optional[str]:
        return v or None


class ParceiroInteresseResponse(BaseModel):
    message: str


def _avisar_equipe(p: ParceiroInteresse) -> None:
    """Enfileira o aviso para a equipe (ALERT_EMAIL). Sem endereço configurado, só registra no log."""
    if not settings.ALERT_EMAIL:
        logger.info("Pedido de parceria %s recebido; ALERT_EMAIL vazio, aviso por e-mail não enviado.", p.id)
        return
    dados = dict(
        nome=p.nome,
        tipo_label=TIPO_LABELS.get(p.tipo, p.tipo),
        nome_negocio=p.nome_negocio or "",
        cidade=p.cidade,
        uf=p.uf,
        whatsapp=p.whatsapp,
        email=p.email,
        como_divulgar=p.como_divulgar,
        platform_url=f"{settings.FRONTEND_URL.rstrip('/')}/platform/parceiros?pedido={p.id}",
    )
    try:
        email_queue.enqueue(
            EmailQueueItem(
                message=EmailMessage(
                    to_email=settings.ALERT_EMAIL,
                    subject=f"[GiraHub] Novo pedido de parceria — {p.nome} ({p.cidade}/{p.uf})",
                    html_body=generate_parceiro_interesse_html(**dados),
                    text_body=generate_parceiro_interesse_text(**dados),
                    reply_to=p.email,
                )
            )
        )
    except Exception:  # o aviso nunca derruba o pedido
        logger.exception("Falha ao enfileirar o aviso do pedido de parceria %s", p.id)


@router.post("/interesse", response_model=ParceiroInteresseResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/hour")
async def criar_interesse(
    request: Request,
    body: ParceiroInteresseRequest,
    db: AsyncSession = Depends(get_db),
) -> ParceiroInteresseResponse:
    """Grava o pedido de interesse e avisa a equipe GiraHub por e-mail."""
    if body.website and body.website.strip():
        logger.info("Pedido de parceria descartado: campo isca preenchido.")
        return ParceiroInteresseResponse(message=MENSAGEM_OK)

    if not body.aceite_regulamento:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Para enviar, aceite o regulamento do Programa de Parceiros.",
        )

    pedido = ParceiroInteresse(
        nome=body.nome,
        tipo=body.tipo,
        nome_negocio=body.nome_negocio,
        cidade=body.cidade,
        uf=body.uf,
        whatsapp=body.whatsapp,
        email=str(body.email).lower(),
        como_divulgar=body.como_divulgar,
        aceite_regulamento_em=utc_now(),
        ip_hash=hash_ip(get_client_ip(request)),
    )
    db.add(pedido)
    await db.commit()
    await db.refresh(pedido)

    _avisar_equipe(pedido)
    return ParceiroInteresseResponse(message=MENSAGEM_OK)
