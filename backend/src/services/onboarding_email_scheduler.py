"""E-mails de onboarding D+1 e D+3 — roda todo dia às 10:00 BRT.

Contexto (análise de produção de 2026-10-05): dos cadastros self-service,
a maioria cria a conta e some no mesmo dia; nenhum contato acontecia entre o
e-mail de boas-vindas e o lembrete de fim de trial (D-7).

Regras (ver `classify`):
- D+1 — conta com 20h a 68h e **sem nenhuma gira** → "sua primeira gira".
- D+3 — conta com 68h a 7 dias e **nenhuma senha pelo link público**
  (`emitido_por_id IS NULL`) → "mande o link para os consulentes".
- Cada e-mail sai no máximo uma vez por tenant. Contas com 7 dias ou mais
  nunca recebem — o primeiro deploy não dispara para a base antiga.

Anti-duplicação (o backend roda com `--workers 2`, e cada worker inicia o
seu próprio agendador — ao contrário de trial/birthday_scheduler, aqui não
basta estado em memória):
1. `pg_try_advisory_lock` por rodada: só um worker processa; o outro sai.
2. Marca persistente por tenant em `tenant_configs.custom_settings.onboarding_emails`
   (`{"d1": iso, "d3": iso}`), gravada sob `SELECT ... FOR UPDATE` **antes**
   do envio — sobrevive a restart/deploy. Se o envio falhar depois da marca,
   o e-mail não é reenviado (no máximo uma vez, por desenho).

Desligar: `ONBOARDING_EMAILS_ENABLED=false`. Ver quem receberia, sem enviar:
`python -m src.services.onboarding_email_scheduler --dry-run`.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

_TZ_BRT = ZoneInfo("America/Sao_Paulo")
RUN_HOUR_BRT = 10

D1_MIN_AGE = timedelta(hours=20)
D3_MIN_AGE = timedelta(hours=68)
MAX_AGE = timedelta(days=7)

SENT_KEY = "onboarding_emails"
# Chave fixa do advisory lock (bigint) — "girahub" + 0x01.
ADVISORY_LOCK_KEY = 0x6769726168756201


def classify(age: timedelta, has_gira: bool, public_tickets: int, sent: dict) -> Optional[str]:
    """Qual e-mail (se algum) o tenant deve receber nesta rodada."""
    if age < D1_MIN_AGE or age >= MAX_AGE:
        return None
    if age >= D3_MIN_AGE:
        return "d3" if public_tickets == 0 and "d3" not in sent else None
    return "d1" if not has_gira and "d1" not in sent else None


def sent_markers(custom_settings: dict | None) -> dict:
    if not isinstance(custom_settings, dict):
        return {}
    value = custom_settings.get(SENT_KEY)
    return value if isinstance(value, dict) else {}


@dataclass
class Candidate:
    tenant_id: uuid.UUID
    name: str
    slug: str
    created_at: datetime
    has_gira: bool
    public_tickets: int
    custom_settings: dict | None = field(default=None)


def _seconds_until_next_run() -> float:
    now = datetime.now(_TZ_BRT)
    target = now.replace(hour=RUN_HOUR_BRT, minute=0, second=0, microsecond=0)
    if now >= target:
        target += timedelta(days=1)
    return (target - now).total_seconds()


async def load_candidates(db, now: datetime) -> list[Candidate]:
    """Tenants ativos criados na janela [now-7d, now-20h], com os sinais de uso."""
    from sqlalchemy import exists, func, select

    from src.models.giras import Gira
    from src.models.tenant_config import TenantConfig
    from src.models.tenants import Tenant
    from src.models.tickets import Ticket

    has_gira = (
        exists()
        .where(Gira.tenant_id == Tenant.id, Gira.deleted_at.is_(None))
        .correlate(Tenant)
    )
    public_tickets = (
        select(func.count(Ticket.id))
        .where(Ticket.tenant_id == Tenant.id, Ticket.deleted_at.is_(None), Ticket.emitido_por_id.is_(None))
        .correlate(Tenant)
        .scalar_subquery()
    )
    custom_settings = (
        select(TenantConfig.custom_settings)
        .where(TenantConfig.tenant_id == Tenant.id, TenantConfig.deleted_at.is_(None))
        .correlate(Tenant)
        .limit(1)
        .scalar_subquery()
    )
    stmt = select(
        Tenant.id, Tenant.name, Tenant.slug, Tenant.created_at, has_gira, public_tickets, custom_settings
    ).where(
        Tenant.created_at >= now - MAX_AGE,
        Tenant.created_at <= now - D1_MIN_AGE,
        Tenant.deleted_at.is_(None),
        Tenant.is_active.is_(True),
        Tenant.self_deactivated_at.is_(None),
    )
    rows = (await db.execute(stmt)).all()
    return [
        Candidate(
            tenant_id=r[0],
            name=r[1],
            slug=r[2],
            created_at=r[3],
            has_gira=bool(r[4]),
            public_tickets=int(r[5] or 0),
            custom_settings=r[6],
        )
        for r in rows
    ]


async def claim(tenant_id: uuid.UUID, kind: str, now: datetime) -> bool:
    """Grava a marca de envio sob lock de linha. False se já enviado (ou sem config)."""
    from sqlalchemy import select

    from src.core.database import AsyncSessionLocal
    from src.models.tenant_config import TenantConfig

    async with AsyncSessionLocal() as db:
        cfg = (
            await db.execute(
                select(TenantConfig)
                .where(TenantConfig.tenant_id == tenant_id, TenantConfig.deleted_at.is_(None))
                .with_for_update()
            )
        ).scalar_one_or_none()
        if cfg is None:
            return False
        settings = dict(cfg.custom_settings or {})
        sent = dict(sent_markers(settings))
        if kind in sent:
            return False
        sent[kind] = now.isoformat()
        settings[SENT_KEY] = sent
        cfg.custom_settings = settings  # dict novo — o tipo JSON não rastreia mutação in-place
        await db.commit()
        return True


async def send_email(to_email: str, subject: str, html: str, text: str) -> bool:
    """Resend com fallback Brevo (mesmo padrão do trial_scheduler)."""
    from src.services.email.base import EmailMessage
    from src.services.email.brevo_provider import BrevoEmailService
    from src.services.email.resend_fallback import ResendEmailService

    msg = EmailMessage(to_email=to_email, subject=subject, html_body=html, text_body=text)
    try:
        if await ResendEmailService().send_async(msg):
            return True
        raise RuntimeError("Resend returned False")
    except Exception:
        try:
            return bool(await BrevoEmailService().send_async(msg))
        except Exception as exc:  # pragma: no cover - log de falha de provedor
            logger.warning("Onboarding email failed for %s: %s", to_email, exc)
            return False


def render(kind: str, cand: Candidate, contact_name: str, frontend_url: str) -> tuple[str, str, str]:
    from src.core.onboarding import read_principal_dor
    from src.services.email.templates.onboarding_nudge import (
        render_onboarding_d1_email,
        render_onboarding_d3_email,
    )

    if kind == "d1":
        return render_onboarding_d1_email(
            contact_name, cand.name, frontend_url, read_principal_dor(cand.custom_settings)
        )
    public_link = f"{frontend_url.rstrip('/')}/public/{cand.slug}/senha" if cand.slug else None
    return render_onboarding_d3_email(contact_name, cand.name, frontend_url, public_link, cand.has_gira)


async def run_once(now: datetime | None = None, dry_run: bool = False) -> list[tuple[str, str]]:
    """Uma rodada. Retorna [(slug, kind)] enviados (ou que seriam, em dry_run)."""
    from sqlalchemy import text

    from src.core.config import settings
    from src.core.database import AsyncSessionLocal, engine
    from src.services.trial_scheduler import get_tenant_primary_contact

    now = now or datetime.now(timezone.utc)

    async def _process() -> list[tuple[str, str]]:
        async with AsyncSessionLocal() as db:
            candidates = await load_candidates(db, now)
        done: list[tuple[str, str]] = []
        for cand in candidates:
            created = cand.created_at if cand.created_at.tzinfo else cand.created_at.replace(tzinfo=timezone.utc)
            kind = classify(now - created, cand.has_gira, cand.public_tickets, sent_markers(cand.custom_settings))
            if not kind:
                continue
            if dry_run:
                done.append((cand.slug, kind))
                continue
            try:
                contact = await get_tenant_primary_contact(cand.tenant_id)
                if not contact:
                    continue
                if not await claim(cand.tenant_id, kind, now):
                    continue
                subject, html, body = render(kind, cand, contact[1], settings.FRONTEND_URL)
                ok = await send_email(contact[0], subject, html, body)
                logger.info("Onboarding %s para tenant %s: %s", kind, cand.slug, "enviado" if ok else "FALHOU")
                done.append((cand.slug, kind))
            except Exception:
                logger.exception("Onboarding email: erro no tenant %s", cand.tenant_id)
        return done

    if dry_run:
        return await _process()

    async with engine.connect() as conn:
        locked = (await conn.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": ADVISORY_LOCK_KEY})).scalar()
        if not locked:
            logger.info("Onboarding emails: outra instância está processando — pulando rodada.")
            return []
        try:
            return await _process()
        finally:
            await conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": ADVISORY_LOCK_KEY})


class OnboardingEmailScheduler:
    def __init__(self) -> None:
        self._task: Optional[asyncio.Task] = None

    def start(self) -> None:
        from src.core.config import settings

        if not settings.ONBOARDING_EMAILS_ENABLED:
            logger.info("Onboarding email scheduler desligado (ONBOARDING_EMAILS_ENABLED=false).")
            return
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run(), name="onboarding-email-scheduler")
            logger.info("Onboarding email scheduler started.")

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            logger.info("Onboarding email scheduler stopped.")

    async def _run(self) -> None:
        while True:
            wait = _seconds_until_next_run()
            logger.info("Onboarding email scheduler: sleeping %.0fs until %02d:00 BRT", wait, RUN_HOUR_BRT)
            await asyncio.sleep(wait)
            try:
                sent = await run_once()
                logger.info("Onboarding email scheduler: %d e-mail(s) nesta rodada", len(sent))
            except Exception:
                logger.exception("Onboarding email scheduler: erro inesperado na rodada")


onboarding_email_scheduler = OnboardingEmailScheduler()


if __name__ == "__main__":  # pragma: no cover - ferramenta de operação
    parser = argparse.ArgumentParser(description="E-mails de onboarding D+1/D+3")
    parser.add_argument("--dry-run", action="store_true", help="lista quem receberia, sem enviar nem marcar")
    args = parser.parse_args()
    if not args.dry_run:
        raise SystemExit("Use --dry-run. O envio real acontece só pelo agendador do backend.")
    for slug, kind in asyncio.run(run_once(dry_run=True)):
        print(f"{kind}\t{slug}")
