"""Email Queue Service — async in-process queue with Resend rate-limit handling.

Worker serialises email sends (one at a time, 200ms spacing = max 5 req/s).
On Resend 429 or failure, falls back immediately to Brevo — no backoff that
would stall the queue for subsequent emails.

Usage:
    from src.services.email.email_queue import email_queue

    # In lifespan startup:
    email_queue.start()

    # In lifespan shutdown:
    await email_queue.stop()

    # To enqueue (non-blocking, safe inside request handlers):
    email_queue.enqueue(EmailQueueItem(message=msg, ticket_id=str(ticket.id)))
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import update as sa_update

from src.core.database import AsyncSessionLocal
from src.services.email.base import EmailMessage
from src.services.email.brevo_provider import BrevoEmailService
from src.services.email.resend_fallback import ResendEmailService

logger = logging.getLogger(__name__)

# Minimum seconds between Resend sends (1 / 0.2 = 5 req/s ceiling)
_SEND_INTERVAL = 0.2

# Maximum items held in memory before new enqueue calls discard silently
_QUEUE_MAX_SIZE = 500


@dataclass
class EmailQueueItem:
    """A single email job to be processed by the worker."""
    message: EmailMessage
    ticket_id: Optional[str] = None


class EmailQueueService:
    """Singleton service owning an asyncio.Queue and a background worker task."""

    def __init__(self) -> None:
        self._queue: asyncio.Queue[EmailQueueItem] = asyncio.Queue(maxsize=_QUEUE_MAX_SIZE)
        self._worker_task: Optional[asyncio.Task] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Spawn the background worker. Must be called from an async context
        (e.g. FastAPI lifespan startup)."""
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(
                self._run_worker(), name="email-queue-worker"
            )
            logger.info("Email queue worker started.")

    async def stop(self) -> None:
        """Gracefully cancel the worker and drain remaining items."""
        if self._worker_task and not self._worker_task.done():
            remaining = self._queue.qsize()
            if remaining:
                logger.warning(
                    f"Email queue stopping with {remaining} unsent item(s). "
                    "These will be lost (in-memory queue)."
                )
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
            logger.info("Email queue worker stopped.")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def enqueue(self, item: EmailQueueItem) -> None:
        """Non-blocking enqueue. Safe to call from any async handler.

        If the queue is full (> 500 items), the item is discarded and a
        warning is logged — this should never happen in normal operation.
        """
        try:
            self._queue.put_nowait(item)
        except asyncio.QueueFull:
            logger.warning(
                f"Email queue full ({_QUEUE_MAX_SIZE}). "
                f"Dropping email to {item.message.to_email} "
                f"(ticket_id={item.ticket_id}). "
                "Consider investigating traffic spikes."
            )

    # ------------------------------------------------------------------
    # Worker
    # ------------------------------------------------------------------

    async def _run_worker(self) -> None:
        """Process items one by one, respecting the rate limit interval."""
        logger.info("Email queue worker running.")
        while True:
            try:
                item = await self._queue.get()
                try:
                    await self._dispatch(item)
                except Exception as exc:
                    logger.error(
                        f"Unexpected error dispatching email to "
                        f"{item.message.to_email}: {exc}",
                        exc_info=True,
                    )
                finally:
                    self._queue.task_done()

                # Rate-limit spacing between sends
                await asyncio.sleep(_SEND_INTERVAL)

            except asyncio.CancelledError:
                break
            except Exception as exc:
                # Worker-level guard — keep looping
                logger.error(f"Email worker loop exception: {exc}", exc_info=True)
                await asyncio.sleep(1)

    # ------------------------------------------------------------------
    # Dispatch logic
    # ------------------------------------------------------------------

    async def _dispatch(self, item: EmailQueueItem) -> None:
        """Try Resend. On 429 or failure, fall back to Brevo immediately."""
        resend_result = await self._try_resend(item.message)

        if resend_result.success:
            await self._write_email_tracking(
                ticket_id=item.ticket_id,
                provider="resend",
                email_id=resend_result.email_id,
            )
            return

        if resend_result.rate_limited:
            logger.warning(
                f"Resend 429 for {item.message.to_email} — falling back to Brevo."
            )
        else:
            logger.warning(
                f"Resend failed for {item.message.to_email} — falling back to Brevo."
            )

        brevo_ok = await self._try_brevo(item.message)

        if brevo_ok:
            await self._write_email_tracking(
                ticket_id=item.ticket_id,
                provider="brevo",
                email_id=None,
            )
        else:
            logger.error(
                f"Both Resend and Brevo failed for {item.message.to_email} "
                f"(ticket_id={item.ticket_id})."
            )
            await self._write_email_tracking(
                ticket_id=item.ticket_id,
                provider="failed",
                email_id=None,
            )

    async def _try_resend(self, message: EmailMessage):
        """Attempt send via Resend. Returns SendResult."""
        try:
            service = ResendEmailService()
            return await service.send_and_get_id(message)
        except ValueError:
            # RESEND_API_KEY not configured
            from src.services.email.resend_fallback import SendResult
            logger.warning("Resend not configured, skipping.")
            return SendResult(success=False)

    async def _try_brevo(self, message: EmailMessage) -> bool:
        """Attempt send via Brevo. Returns True on success."""
        try:
            service = BrevoEmailService()
            return await service.send_async(message)
        except ValueError:
            # BREVO_API_KEY not configured
            logger.warning("Brevo not configured, skipping.")
            return False
        except Exception as exc:
            logger.error(f"Brevo send exception: {exc}")
            return False

    async def _write_email_tracking(
        self,
        ticket_id: Optional[str],
        provider: str,
        email_id: Optional[str],
    ) -> None:
        """Write email tracking fields back to the ticket row."""
        if not ticket_id:
            return
        try:
            import uuid as _uuid
            from src.models.tickets import Ticket

            async with AsyncSessionLocal() as session:
                await session.execute(
                    sa_update(Ticket)
                    .where(Ticket.id == _uuid.UUID(ticket_id))
                    .values(
                        resend_email_id=email_id,
                        email_sent_at=datetime.now(timezone.utc),
                        email_provider=provider,
                    )
                )
                await session.commit()
        except Exception as exc:
            logger.warning(
                f"Failed to write email tracking for ticket {ticket_id}: {exc}"
            )


# Module-level singleton
email_queue = EmailQueueService()
