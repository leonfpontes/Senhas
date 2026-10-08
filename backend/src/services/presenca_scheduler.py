"""Encerramento automático da chamada (AM-17, decisão D-12) — a cada 30 min.

A chamada que ninguém encerrou fecha sozinha 48 h depois do fim da atividade, **só** se houve
sinal de que ela aconteceu: alguma presença registrada ("Cheguei", chamada) ou, no modo
confiança, alguma confirmação "vou" (ali a confirmação é a presença). Sem sinal, a atividade
fica "sem chamada" e não entra no relatório.

Mesmo padrão dos outros agendadores (`asyncio.create_task`, sem dependência externa). O backend
roda 2 workers e cada um inicia este agendador (ver `services/scheduler_guard.py`): o advisory
lock por rodada deixa um só processar, e o encerramento é idempotente por si (a atividade é
travada com `FOR UPDATE` e `chamada_encerrada_em` preenchido não muda mais) — rodar duas vezes
nunca duplica nem desfaz nada.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

INTERVALO_S = 30 * 60
ATRASO_INICIAL_S = 5 * 60


class PresencaScheduler:
    def __init__(self) -> None:
        self._task: Optional[asyncio.Task] = None

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run(), name="presenca-scheduler")
            logger.info("Presença scheduler started.")

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            logger.info("Presença scheduler stopped.")

    async def _run(self) -> None:
        await asyncio.sleep(ATRASO_INICIAL_S)
        while True:
            try:
                await self.rodada()
            except Exception:  # noqa: BLE001
                logger.exception("Presença scheduler: erro inesperado na rodada")
            await asyncio.sleep(INTERVALO_S)

    async def rodada(self, agora: Optional[datetime] = None) -> int:
        """Uma rodada (um worker por vez). Devolve quantas chamadas encerrou."""
        from src.services.scheduler_guard import PRESENCA_LOCK_KEY, advisory_lock

        async with advisory_lock(PRESENCA_LOCK_KEY) as acquired:
            if not acquired:
                logger.info("Presença scheduler: outra instância está processando — pulando rodada.")
                return 0
            return await encerrar_vencidas(agora)


async def encerrar_vencidas(agora: Optional[datetime] = None) -> int:
    """Encerra as chamadas vencidas de todos os terreiros (cada uma na sua transação)."""
    from src.core.database import AsyncSessionLocal
    from src.core.tz import utc_now
    from src.services.presenca import (
        candidatos_ao_encerramento,
        config_presenca,
        ctx_da_atividade,
        deve_encerrar_sozinha,
        encerrar_chamada,
        modo_efetivo,
    )

    agora = agora or utc_now()
    async with AsyncSessionLocal() as db:
        candidatos = await candidatos_ao_encerramento(db, agora)

    encerradas = 0
    for c in candidatos:
        try:
            async with AsyncSessionLocal() as db:
                modo_casa, _ = await config_presenca(db, c.tenant_id)
                modo = modo_efetivo(c.tipo_modo, modo_casa)
                if not deve_encerrar_sozinha(c.registradas, c.confirmadas, modo):
                    continue
                ctx = await ctx_da_atividade(db, c.tenant_id, c.atividade_id)
                resultado = await encerrar_chamada(db, c.tenant_id, ctx, por=None, modo=modo, agora=agora)
                await db.commit()
                if resultado.encerrada_agora:
                    encerradas += 1
        except Exception:  # noqa: BLE001
            logger.exception("Presença scheduler: falha ao encerrar a atividade %s", c.atividade_id)
    if encerradas:
        logger.info("Presença scheduler: %d chamada(s) encerrada(s) automaticamente", encerradas)
    return encerradas


presenca_scheduler = PresencaScheduler()
