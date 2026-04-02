"""Birthday notification scheduler — fires daily at 08:00 BRT.

Uses asyncio.create_task (same pattern as email_queue). No external
scheduler dependency required.

Anti-duplicate guard: a per-tenant dict tracks the BRT date of the last
successful digest send. In a multi-worker setup each worker has an
independent guard — emails could be sent up to once per worker per day.
For production use behind a single worker (gunicorn with 1 sync worker
or uvicorn), this is sufficient.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

_TZ_BRT = ZoneInfo("America/Sao_Paulo")


def _seconds_until_next_8am_brt() -> float:
    """Seconds from now until 08:00 BRT (next occurrence)."""
    now = datetime.now(_TZ_BRT)
    target = now.replace(hour=8, minute=0, second=0, microsecond=0)
    if now >= target:
        target += timedelta(days=1)
    return (target - now).total_seconds()


class BirthdayScheduler:
    """Singleton-style scheduler for daily birthday digest emails."""

    def __init__(self) -> None:
        self._task: Optional[asyncio.Task] = None
        # tenant_id (str) -> "YYYY-MM-DD" of last sent date in BRT
        self._last_sent_date: Dict[str, str] = {}

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Spawn the background task. Call from async context (lifespan)."""
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run(), name="birthday-scheduler")
            logger.info("Birthday scheduler started.")

    async def stop(self) -> None:
        """Cancel the background task gracefully."""
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            logger.info("Birthday scheduler stopped.")

    # ------------------------------------------------------------------
    # Internal loop
    # ------------------------------------------------------------------

    async def _run(self) -> None:
        """Main loop: sleep until 08:00 BRT, send digests, repeat."""
        while True:
            wait = _seconds_until_next_8am_brt()
            logger.info("Birthday scheduler: sleeping %.0fs until 08:00 BRT", wait)
            await asyncio.sleep(wait)
            try:
                await self._send_all_digests()
            except Exception:
                logger.exception("Birthday scheduler: unexpected error in _send_all_digests")

    async def _send_all_digests(self) -> None:
        """Iterate all tenants with mediuns feature and send birthday digests."""
        from sqlalchemy import select as sa_select, and_

        from src.core.database import AsyncSessionLocal
        from src.models.subscriptions import Subscription
        from src.repositories.config_repo import TenantConfigRepository
        from src.repositories.mediun_repo import MediumRepository
        from src.repositories.tenant_repo import TenantRepository
        from src.repositories.user_repo import UserRepository
        from src.services.email.base import EmailMessage
        from src.services.email.email_queue import EmailQueueItem, email_queue
        from src.services.email.templates.birthday_digest import render_birthday_digest

        today_brt_str = datetime.now(_TZ_BRT).strftime("%Y-%m-%d")

        async with AsyncSessionLocal() as db:
            # Fetch all subscriptions that have the mediuns feature enabled
            stmt = sa_select(Subscription).where(Subscription.max_mediuns > 0)
            result = await db.execute(stmt)
            subscriptions = list(result.scalars().all())

        for sub in subscriptions:
            tenant_id = sub.tenant_id
            tid_str = str(tenant_id)

            # Anti-duplicate guard: skip if already sent today
            if self._last_sent_date.get(tid_str) == today_brt_str:
                logger.debug("Birthday scheduler: already sent for tenant %s today, skipping", tid_str)
                continue

            try:
                await self._send_digest_for_tenant(
                    tenant_id=tenant_id,
                    today_brt_str=today_brt_str,
                )
                self._last_sent_date[tid_str] = today_brt_str
            except Exception:
                logger.exception(
                    "Birthday scheduler: failed to process tenant %s", tid_str
                )

    async def _send_digest_for_tenant(self, tenant_id, today_brt_str: str) -> None:
        from src.core.database import AsyncSessionLocal
        from src.repositories.config_repo import TenantConfigRepository
        from src.repositories.mediun_repo import MediumRepository
        from src.repositories.tenant_repo import TenantRepository
        from src.repositories.user_repo import UserRepository
        from src.services.email.base import EmailMessage
        from src.services.email.email_queue import EmailQueueItem, email_queue
        from src.services.email.templates.birthday_digest import render_birthday_digest

        async with AsyncSessionLocal() as db:
            tenant_repo = TenantRepository(db)
            tenant = await tenant_repo.get_by_id(tenant_id)
            if tenant is None or tenant.deleted_at is not None:
                return

            mediun_repo = MediumRepository(db)
            aniversariantes = await mediun_repo.list_aniversariantes(tenant_id, dias=7)
            if not aniversariantes:
                logger.debug(
                    "Birthday scheduler: no aniversariantes for tenant %s on %s",
                    tenant_id,
                    today_brt_str,
                )
                return

            config_repo = TenantConfigRepository(db)
            config = await config_repo.get_by_tenant(tenant_id)
            primary_color = (
                config.primary_color if config and config.primary_color else "#1976d2"
            )
            tenant_name = tenant.name or "Senhas"

            user_repo = UserRepository(db)
            admins = await user_repo.get_admins(tenant_id)
            recipients = [
                u for u in admins if u.is_active and u.email
            ]
            if not recipients:
                logger.info(
                    "Birthday scheduler: no active admins with email for tenant %s",
                    tenant_id,
                )
                return

            html_body = render_birthday_digest(
                mediuns=aniversariantes,
                tenant_name=tenant_name,
                primary_color=primary_color,
            )
            count = len(aniversariantes)
            plural = "aniversariante" if count == 1 else "aniversariantes"
            subject = f"🎂 {count} {plural} esta semana — {tenant_name}"

            for admin in recipients:
                msg = EmailMessage(
                    to_email=admin.email,
                    subject=subject,
                    html_body=html_body,
                )
                email_queue.enqueue(EmailQueueItem(message=msg))

            logger.info(
                "Birthday scheduler: queued birthday digest for tenant %s (%d mediuns, %d admins)",
                tenant_id,
                count,
                len(recipients),
            )


birthday_scheduler = BirthdayScheduler()
