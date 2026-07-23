"""Trial expiration scheduler — fires daily at 09:00 BRT.

Handles tenants on the 1-month Premium trial that never added a card (no
Stripe subscription was ever created for them — see public/onboarding.py).
Trials that DO convert to a real Stripe subscription are entirely handled by
webhooks.py instead (checkout.session.completed / subscription.updated /
invoice.payment_failed) and are excluded here via the
`stripe_subscription_id IS NULL` filter.

Uses asyncio.create_task (same pattern as birthday_scheduler.py). No
external scheduler dependency required.

Anti-duplicate guard: a per-tenant dict tracks which reminder thresholds
were already sent. Same multi-worker caveat as birthday_scheduler.py — in a
single-worker deployment this is sufficient.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Set
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

_TZ_BRT = ZoneInfo("America/Sao_Paulo")

# Days-remaining thresholds at which we send a reminder e-mail.
REMINDER_THRESHOLDS = (7, 3)


def _seconds_until_next_9am_brt() -> float:
    """Seconds from now until 09:00 BRT (next occurrence)."""
    now = datetime.now(_TZ_BRT)
    target = now.replace(hour=9, minute=0, second=0, microsecond=0)
    if now >= target:
        target += timedelta(days=1)
    return (target - now).total_seconds()


class TrialScheduler:
    """Singleton-style scheduler for trial expiration + reminder e-mails."""

    def __init__(self) -> None:
        self._task: Optional[asyncio.Task] = None
        # tenant_id (str) -> set of reminder thresholds (days) already sent
        self._reminders_sent: Dict[str, Set[int]] = {}

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Spawn the background task. Call from async context (lifespan)."""
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run(), name="trial-scheduler")
            logger.info("Trial scheduler started.")

    async def stop(self) -> None:
        """Cancel the background task gracefully."""
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            logger.info("Trial scheduler stopped.")

    # ------------------------------------------------------------------
    # Internal loop
    # ------------------------------------------------------------------

    async def _run(self) -> None:
        """Main loop: sleep until 09:00 BRT, process trials, repeat."""
        while True:
            wait = _seconds_until_next_9am_brt()
            logger.info("Trial scheduler: sleeping %.0fs until 09:00 BRT", wait)
            await asyncio.sleep(wait)
            try:
                await self._process_trials()
            except Exception:
                logger.exception("Trial scheduler: unexpected error in _process_trials")

    async def _process_trials(self) -> None:
        """Expire past-due local trials and send reminder e-mails."""
        from sqlalchemy import select as sa_select, and_

        from src.core.database import AsyncSessionLocal
        from src.models.subscriptions import Subscription

        async with AsyncSessionLocal() as db:
            stmt = sa_select(Subscription).where(
                and_(
                    Subscription.is_trial.is_(True),
                    Subscription.stripe_subscription_id.is_(None),
                    Subscription.trial_ends_at.isnot(None),
                )
            )
            result = await db.execute(stmt)
            trials = list(result.scalars().all())

        now = datetime.now(timezone.utc)
        for sub in trials:
            tenant_id = sub.tenant_id
            days_remaining = (sub.trial_ends_at - now).days

            try:
                if days_remaining <= 0:
                    await self._expire_trial(tenant_id)
                    self._reminders_sent.pop(str(tenant_id), None)
                elif days_remaining in REMINDER_THRESHOLDS:
                    await self._maybe_send_reminder(tenant_id, days_remaining)
            except Exception:
                logger.exception("Trial scheduler: failed to process tenant %s", tenant_id)

    async def _expire_trial(self, tenant_id) -> None:
        from src.core.database import AsyncSessionLocal
        from src.models.subscriptions import SubscriptionStatus
        from src.repositories.subscription_repo import SubscriptionRepository

        async with AsyncSessionLocal() as db:
            await SubscriptionRepository(db).reset_to_free(tenant_id, status=SubscriptionStatus.ACTIVE)
            await db.commit()

        logger.info("Trial scheduler: tenant %s trial expired — reverted to FREE", tenant_id)

        contact = await self._get_primary_contact(tenant_id)
        if contact:
            await self._send_expired_email(contact_email=contact[0], contact_name=contact[1])

    async def _maybe_send_reminder(self, tenant_id, days_remaining: int) -> None:
        tid_str = str(tenant_id)
        sent = self._reminders_sent.setdefault(tid_str, set())
        if days_remaining in sent:
            return

        contact = await self._get_primary_contact(tenant_id)
        if contact:
            await self._send_reminder_email(
                contact_email=contact[0], contact_name=contact[1], dias_restantes=days_remaining
            )
        sent.add(days_remaining)

    async def _get_primary_contact(self, tenant_id):
        """Returns (email, display_name) for the tenant's primary contact, or None."""
        from sqlalchemy import select as sa_select, and_

        from src.core.database import AsyncSessionLocal
        from src.models import User, UserRole

        async with AsyncSessionLocal() as db:
            for role_filter in (User.role == UserRole.ADMIN, None):
                conditions = [User.tenant_id == tenant_id, User.is_active.is_(True), User.deleted_at.is_(None)]
                if role_filter is not None:
                    conditions.append(role_filter)
                result = await db.execute(
                    sa_select(User).where(and_(*conditions)).order_by(User.created_at.asc()).limit(1)
                )
                user = result.scalar_one_or_none()
                if user:
                    return (user.email, user.full_name or user.username)
        return None

    async def _send_reminder_email(self, contact_email: str, contact_name: str, dias_restantes: int) -> None:
        from src.core.config import settings
        from src.services.email.base import EmailMessage
        from src.services.email.brevo_provider import BrevoEmailService
        from src.services.email.resend_fallback import ResendEmailService
        from src.services.email.templates.trial_reminder import render_trial_reminder_email

        billing_url = f"{settings.FRONTEND_URL}/admin/billing"
        html = render_trial_reminder_email(contact_name, dias_restantes, billing_url)
        dias_label = "1 dia" if dias_restantes == 1 else f"{dias_restantes} dias"
        msg = EmailMessage(
            to_email=contact_email,
            subject=f"⏳ Faltam {dias_label} para o fim do seu trial Premium",
            html_body=html,
            text_body=(
                f"Olá, {contact_name}.\n\nFaltam {dias_label} para o fim do seu trial Premium no GiraHub. "
                f"Assine um plano em {billing_url} para continuar com acesso ilimitado."
            ),
        )
        try:
            sent = await ResendEmailService().send_async(msg)
            if not sent:
                raise RuntimeError("Resend returned False")
        except Exception:
            try:
                await BrevoEmailService().send_async(msg)
            except Exception as exc:
                logger.warning("Trial reminder email failed for %s: %s", contact_email, exc)

    async def _send_expired_email(self, contact_email: str, contact_name: str) -> None:
        from src.core.config import settings
        from src.services.email.base import EmailMessage
        from src.services.email.brevo_provider import BrevoEmailService
        from src.services.email.resend_fallback import ResendEmailService
        from src.services.email.templates.subscription_reverted_to_free import (
            render_subscription_reverted_to_free_email,
        )

        billing_url = f"{settings.FRONTEND_URL}/admin/billing"
        html = render_subscription_reverted_to_free_email(contact_name, billing_url, trial_expired=True)
        msg = EmailMessage(
            to_email=contact_email,
            subject="Sua conta no GiraHub agora é gratuita",
            html_body=html,
            text_body=(
                f"Olá, {contact_name}.\n\nSeu trial gratuito de 1 mês no plano Premium terminou e, "
                f"como nenhum plano foi assinado, sua conta voltou para o plano gratuito. "
                f"Veja os planos disponíveis em {billing_url}."
            ),
        )
        try:
            sent = await ResendEmailService().send_async(msg)
            if not sent:
                raise RuntimeError("Resend returned False")
        except Exception:
            try:
                await BrevoEmailService().send_async(msg)
            except Exception as exc:
                logger.warning("Trial expired email failed for %s: %s", contact_email, exc)


trial_scheduler = TrialScheduler()
