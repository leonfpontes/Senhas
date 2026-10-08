"""Web Push com VAPID (AM-16) — envio das notificações no celular da Área do Médium.

Sem serviço pago: o backend assina cada envio com a chave VAPID do GiraHub e manda direto ao
serviço de push do navegador (FCM no Chrome/Android, Mozilla, Apple no iPhone com a Área na tela
inicial). Biblioteca: `pywebpush` (cifra a mensagem com as chaves da inscrição).

- **Ligado só com as três variáveis** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT`
  (`disponivel()`); sem elas nada quebra: a API diz `disponivel: false`, a tela esconde a opção e
  o agendador só manda e-mail. Gerar as chaves: `npx web-push generate-vapid-keys` (a privada em
  base64url crua de 32 bytes ou PEM; ver docs/deployment.md).
- **Limpeza**: resposta 404/410 do serviço de push = inscrição vencida/desfeita → a linha é apagada.
  Outras falhas somam `failures`; `MAX_FALHAS` seguidas também apagam. Sucesso zera e marca
  `last_success_at`.
- **Conteúdo mínimo**: `{"title", "body", "url", "tag"}` — sem dado sensível (os textos saem de
  `services/medium_push.py`). O `sw.js` mostra a notificação e abre a `url` (caminho da Área).

`webpush` é síncrono (requests): roda em `asyncio.to_thread`, um aparelho por vez, com timeout.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass
from typing import Iterable, Optional

from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select, update

from src.core.config import settings

logger = logging.getLogger(__name__)

TIMEOUT_S = 10
TTL_S = 12 * 60 * 60  # celular desligado recebe até 12 h depois; depois disso o aviso perdeu o sentido
MAX_FALHAS = 5
STATUS_SUMIU = (404, 410)


def disponivel() -> bool:
    """Push ligado no servidor (as três variáveis VAPID preenchidas)."""
    return bool(
        (settings.VAPID_PUBLIC_KEY or "").strip()
        and (settings.VAPID_PRIVATE_KEY or "").strip()
        and (settings.VAPID_SUBJECT or "").strip()
    )


def chave_publica() -> Optional[str]:
    return settings.VAPID_PUBLIC_KEY.strip() if disponivel() else None


def _subject() -> str:
    sub = settings.VAPID_SUBJECT.strip()
    if sub.startswith(("mailto:", "https://")):
        return sub
    return f"mailto:{sub}"


@dataclass(frozen=True)
class Notificacao:
    """O que aparece no celular. `url` é um caminho da Área (`/medium/...`)."""

    title: str
    body: str
    url: str
    tag: Optional[str] = None

    def json(self) -> str:
        dados = {"title": self.title, "body": self.body, "url": self.url}
        if self.tag:
            dados["tag"] = self.tag
        return json.dumps(dados, ensure_ascii=False)


@dataclass(frozen=True)
class Envio:
    """Uma notificação para um aparelho (linha de `push_inscricoes`)."""

    inscricao_id: uuid.UUID
    tenant_id: uuid.UUID
    endpoint: str
    p256dh: str
    auth: str
    notificacao: Notificacao


def _enviar_um(envio: Envio) -> Optional[int]:
    """Manda e devolve None (sucesso) ou o status HTTP da falha (0 = sem resposta)."""
    try:
        webpush(
            subscription_info={"endpoint": envio.endpoint, "keys": {"p256dh": envio.p256dh, "auth": envio.auth}},
            data=envio.notificacao.json(),
            vapid_private_key=settings.VAPID_PRIVATE_KEY.strip(),
            # Dict novo a cada envio: o pywebpush preenche `aud`/`exp` nele.
            vapid_claims={"sub": _subject()},
            timeout=TIMEOUT_S,
            ttl=TTL_S,
            headers={"Urgency": "normal"},
        )
        return None
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        return int(status) if status else 0
    except Exception:  # noqa: BLE001 — rede, chave mal formatada: nunca derruba a rodada
        logger.warning("Push: falha inesperada no envio", exc_info=True)
        return 0


async def enviar(envios: Iterable[Envio]) -> int:
    """Manda cada notificação e atualiza as inscrições. Devolve quantas foram aceitas."""
    from src.core.database import AsyncSessionLocal
    from src.core.tz import utc_now
    from src.models import PushInscricao

    envios = list(envios)
    if not envios or not disponivel():
        return 0
    ok: list[Envio] = []
    sumiram: list[Envio] = []
    falharam: list[Envio] = []
    for envio in envios:
        status = await asyncio.to_thread(_enviar_um, envio)
        if status is None:
            ok.append(envio)
        elif status in STATUS_SUMIU:
            sumiram.append(envio)
        else:
            falharam.append(envio)
            logger.info("Push: serviço respondeu %s", status)

    async with AsyncSessionLocal() as db:
        for envio in sumiram:
            await db.execute(
                delete(PushInscricao).where(
                    PushInscricao.tenant_id == envio.tenant_id, PushInscricao.id == envio.inscricao_id
                )
            )
        for envio in ok:
            await db.execute(
                update(PushInscricao)
                .where(PushInscricao.tenant_id == envio.tenant_id, PushInscricao.id == envio.inscricao_id)
                .values(last_success_at=utc_now(), failures=0)
            )
        for envio in falharam:
            await db.execute(
                update(PushInscricao)
                .where(PushInscricao.tenant_id == envio.tenant_id, PushInscricao.id == envio.inscricao_id)
                .values(failures=PushInscricao.failures + 1)
            )
        if falharam:
            await db.execute(
                delete(PushInscricao).where(
                    PushInscricao.tenant_id.in_({e.tenant_id for e in falharam}),
                    PushInscricao.id.in_([e.inscricao_id for e in falharam]),
                    PushInscricao.failures >= MAX_FALHAS,
                )
            )
        await db.commit()
    if sumiram:
        logger.info("Push: %d inscrição(ões) vencida(s) apagada(s)", len(sumiram))
    return len(ok)


async def envios_para(db, tenant_id: uuid.UUID, medium_id: uuid.UUID, notificacao: Notificacao) -> list[Envio]:
    """Uma notificação para todos os aparelhos do médium (do usuário ligado a ele) no terreiro."""
    return [
        Envio(i.id, tenant_id, i.endpoint, i.p256dh, i.auth, notificacao)
        for i in (await inscricoes_do_terreiro(db, tenant_id, medium_ids=[medium_id])).get(medium_id, [])
    ]


async def inscricoes_do_terreiro(db, tenant_id: uuid.UUID, medium_ids: Optional[list[uuid.UUID]] = None) -> dict:
    """medium_id → inscrições, só do usuário que hoje está ligado ao médium (vínculo trocado ou
    desfeito = as inscrições antigas não recebem)."""
    from src.models import Medium, PushInscricao

    stmt = (
        select(PushInscricao)
        .join(Medium, Medium.id == PushInscricao.medium_id)
        .where(
            PushInscricao.tenant_id == tenant_id,
            Medium.tenant_id == tenant_id,
            Medium.user_id == PushInscricao.user_id,
            Medium.deleted_at.is_(None),
        )
        .order_by(PushInscricao.created_at)
    )
    if medium_ids is not None:
        stmt = stmt.where(PushInscricao.medium_id.in_(medium_ids))
    out: dict[uuid.UUID, list] = {}
    for i in (await db.execute(stmt)).scalars().all():
        out.setdefault(i.medium_id, []).append(i)
    return out
