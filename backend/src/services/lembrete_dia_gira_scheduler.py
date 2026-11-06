"""Agendador da beta "Lembrete no dia da gira" (Laboratório, jornadas v2 · J2 07) — a cada 15 min.

Só para terreiro beta tester com a beta `beta_lembrete_dia_gira` ligada. A partir das 8 h (Brasília)
do dia da gira, e até 2 h antes do início, quem tem senha emitida (titular, sem acompanhante)
recebe um e-mail com o número, a hora, o recado da casa e o link para liberar a vaga.

**Uma vez só, mesmo com 2 workers**: a senha é marcada com `UPDATE ... WHERE lembrete_enviado_em IS
NULL RETURNING` e commitada ANTES de enfileirar (migração 104). Se o processo cair entre o commit
e o envio, aquele lembrete se perde — preferível a mandar em dobro.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Optional

from sqlalchemy import and_, select, update

logger = logging.getLogger(__name__)

CHAVE = "beta_lembrete_dia_gira"
INTERVALO_S = 15 * 60
ATRASO_INICIAL_S = 4 * 60
HORA_INICIO = 8
ANTECEDENCIA_MINIMA = timedelta(hours=2)
FILA_LIMITE = 300

Enviar = Callable[[Any], Awaitable[None]]


async def enfileirar(mensagem) -> None:
    from src.services.email.email_queue import EmailQueueItem, email_queue

    while email_queue.qsize() >= FILA_LIMITE:
        await asyncio.sleep(1)
    email_queue.enqueue(EmailQueueItem(message=mensagem))


def _hora(d: datetime) -> str:
    return f"{d.hour}h{d.minute:02d}" if d.minute else f"{d.hour}h"


async def rodada(db, agora: Optional[datetime] = None, enviar: Enviar = enfileirar) -> int:
    """Uma rodada: devolve quantos lembretes foram enfileirados."""
    from src.core.tz import APP_TZ
    from src.models.feature_flags import FeatureFlag
    from src.models.tenants import Tenant

    agora = agora or datetime.now(timezone.utc)
    local = agora.astimezone(APP_TZ)
    if local.hour < HORA_INICIO:
        return 0
    fim_do_dia = local.replace(hour=23, minute=59, second=59, microsecond=0).astimezone(timezone.utc)

    casas = (
        await db.execute(
            select(Tenant)
            .join(FeatureFlag, FeatureFlag.tenant_id == Tenant.id)
            .where(
                and_(
                    Tenant.beta_tester.is_(True),
                    Tenant.is_active.is_(True),
                    FeatureFlag.feature == CHAVE,
                    FeatureFlag.enabled.is_(True),
                    FeatureFlag.deleted_at.is_(None),
                )
            )
        )
    ).scalars().all()

    total = 0
    for casa in casas:
        total += await _rodada_da_casa(db, casa.id, casa, agora, fim_do_dia, enviar)
    return total


async def _rodada_da_casa(db, tenant_id, casa, agora: datetime, fim_do_dia: datetime, enviar: Enviar) -> int:
    """Os lembretes de uma casa: só giras, senhas e configuração do `tenant_id` recebido."""
    from sqlalchemy.orm import selectinload

    from src.core.config import settings
    from src.core.public_links import public_cancel_link, public_ticket_link
    from src.core.tz import APP_TZ
    from src.models.giras import Gira
    from src.models.tenant_config import TenantConfig
    from src.models.tickets import Ticket, TicketStatus, email_de_aviso
    from src.services.email.base import EmailMessage
    from src.services.email.templates.lembrete_dia_gira import gerar_lembrete_html, gerar_lembrete_texto

    total = 0
    giras = (
        await db.execute(
            select(Gira).where(
                and_(
                    Gira.tenant_id == tenant_id,
                    Gira.is_active.is_(True),
                    Gira.deleted_at.is_(None),
                    Gira.data_inicio >= agora + ANTECEDENCIA_MINIMA,
                    Gira.data_inicio <= fim_do_dia,
                )
            )
        )
    ).scalars().all()
    if not giras:
        return total
    config = (await db.execute(select(TenantConfig).where(TenantConfig.tenant_id == tenant_id))).scalar_one_or_none()
    cor = config.primary_color if config else ""
    for gira in giras:
        ids = (
            await db.execute(
                update(Ticket)
                .where(
                    and_(
                        Ticket.tenant_id == tenant_id,
                        Ticket.gira_id == gira.id,
                        Ticket.status == TicketStatus.EMITTED,
                        Ticket.is_acompanhante.is_(False),
                        Ticket.deleted_at.is_(None),
                        Ticket.lembrete_enviado_em.is_(None),
                    )
                )
                .values(lembrete_enviado_em=agora)
                .returning(Ticket.id)
            )
        ).scalars().all()
        await db.commit()
        if not ids:
            continue
        tickets = (
            await db.execute(
                select(Ticket)
                .where(and_(Ticket.tenant_id == tenant_id, Ticket.id.in_(ids)))
                .options(selectinload(Ticket.consulente))
            )
        ).scalars().all()
        hora = _hora(gira.data_inicio.astimezone(APP_TZ))
        for ticket in tickets:
            destino = email_de_aviso(ticket)
            if not destino:
                continue
            numero = f"P{ticket.numero:03d}" if ticket.is_sponsor else f"{ticket.numero:04d}"
            nome = ticket.consulente.nome if ticket.consulente else ""
            link = public_ticket_link(settings.FRONTEND_URL, casa.slug, ticket.id)
            cancelar = public_cancel_link(settings.FRONTEND_URL, ticket.id)
            await enviar(
                EmailMessage(
                    to_email=destino,
                    subject=f"Hoje tem gira: senha {numero} - {casa.name}",
                    html_body=gerar_lembrete_html(
                        nome, numero, gira.nome, hora, casa.name, link, cancelar, gira.recados or "", cor
                    ),
                    text_body=gerar_lembrete_texto(nome, numero, gira.nome, hora, casa.name, link, cancelar),
                )
            )
            total += 1
    return total


class LembreteDiaGiraScheduler:
    def __init__(self) -> None:
        self._task: Optional[asyncio.Task] = None

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run(), name="lembrete-dia-gira-scheduler")
            logger.info("Lembrete do dia da gira (beta) started.")

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _run(self) -> None:
        from src.core.database import AsyncSessionLocal

        await asyncio.sleep(ATRASO_INICIAL_S)
        while True:
            try:
                async with AsyncSessionLocal() as db:
                    enviados = await rodada(db)
                if enviados:
                    logger.info("Lembrete do dia da gira (beta): %s e-mail(s) enfileirado(s)", enviados)
            except Exception:  # noqa: BLE001
                logger.exception("Lembrete do dia da gira (beta): erro inesperado na rodada")
            await asyncio.sleep(INTERVALO_S)


lembrete_dia_gira_scheduler = LembreteDiaGiraScheduler()
