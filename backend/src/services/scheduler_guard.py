"""Proteções para agendadores in-process (asyncio) num backend multi-worker.

O backend roda `uvicorn --workers 2` e cada worker executa o lifespan de
`main.py`, então cada agendador existe uma vez POR WORKER (confirmado nos
logs de produção de 2026-10-05: "Senhas API started" duas vezes por deploy).
Estado em memória não impede envio duplicado nem sobrevive a deploy.

- `advisory_lock(key)`: `pg_try_advisory_lock` por rodada — só o worker que
  pega o lock processa; o outro pula. O lock é de sessão e é liberado ao fim
  (ou quando a conexão cai).
- `claim_once(...)`: marca persistente em `tenant_configs.custom_settings`,
  gravada sob `SELECT ... FOR UPDATE` ANTES do envio. Use para "no máximo uma
  vez" por tenant/item. `scope` reinicia as marcas quando muda (ex.: data de
  fim do trial, dia do digest).

Chaves de lock em uso (bigint, prefixo "girahub"):
  0x6769726168756201 onboarding_email_scheduler
  0x6769726168756202 trial_scheduler
  0x6769726168756203 birthday_scheduler
  0x6769726168756204 presenca_scheduler (encerramento automático da chamada, AM-17)
  0x6769726168756205 (reservada para um futuro retorno_scheduler)
  0x6769726168756206 medium_lembrete_scheduler (lembretes e avisos por e-mail da Área, AM-15)
"""

from __future__ import annotations

import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncIterator, Optional

logger = logging.getLogger(__name__)

TRIAL_LOCK_KEY = 0x6769726168756202
BIRTHDAY_LOCK_KEY = 0x6769726168756203
PRESENCA_LOCK_KEY = 0x6769726168756204
MEDIUM_LEMBRETE_LOCK_KEY = 0x6769726168756206


@asynccontextmanager
async def advisory_lock(key: int) -> AsyncIterator[bool]:
    """Tenta o lock sem esperar. Rende True se esta instância deve processar."""
    from sqlalchemy import text

    from src.core.database import engine

    async with engine.connect() as conn:
        acquired = bool((await conn.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": key})).scalar())
        try:
            yield acquired
        finally:
            if acquired:
                await conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": key})


async def claim_once(
    tenant_id: uuid.UUID,
    namespace: str,
    item: str,
    scope: Optional[str] = None,
    now: Optional[datetime] = None,
) -> bool:
    """Marca `item` como enviado em `custom_settings[namespace]`.

    Retorna False se já estava marcado no mesmo `scope`. Formato gravado:
    `{"scope": scope, "sent": {item: iso_timestamp}}`. Tenant sem
    TenantConfig: libera (True) e loga — o advisory lock da rodada ainda
    evita a duplicação entre workers.
    """
    from sqlalchemy import select

    from src.core.database import AsyncSessionLocal
    from src.models.tenant_config import TenantConfig

    now = now or datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        cfg = (
            await db.execute(
                select(TenantConfig)
                .where(TenantConfig.tenant_id == tenant_id, TenantConfig.deleted_at.is_(None))
                .with_for_update()
            )
        ).scalar_one_or_none()
        if cfg is None:
            logger.warning("claim_once: tenant %s sem TenantConfig — liberando %s/%s", tenant_id, namespace, item)
            return True

        settings = dict(cfg.custom_settings or {})
        entry = settings.get(namespace)
        if not isinstance(entry, dict) or entry.get("scope") != scope:
            entry = {"scope": scope, "sent": {}}
        sent = dict(entry.get("sent") or {})
        if item in sent:
            return False
        sent[item] = now.isoformat()
        settings[namespace] = {"scope": scope, "sent": sent}
        cfg.custom_settings = settings  # dict novo — o tipo JSON não rastreia mutação in-place
        await db.commit()
        return True
