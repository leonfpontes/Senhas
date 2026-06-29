"""Middleware que rastreia respostas 5xx e dispara alertas por email."""

import asyncio
import logging
from typing import Callable

from fastapi import Request
from fastapi.responses import Response

from ..core.config import settings
from ..services.error_alert_service import error_alert_service

logger = logging.getLogger("senhas.error_rate")


async def error_rate_middleware(request: Request, call_next: Callable) -> Response:
    response = await call_next(request)

    if response.status_code >= 500 and settings.ALERT_EMAIL:
        tenant_id = getattr(request.state, "tenant_id", None)
        user_id = getattr(request.state, "user_id", None)
        error_alert_service.record_error(
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            tenant_id=str(tenant_id) if tenant_id else None,
            user_id=str(user_id) if user_id else None,
        )

        if error_alert_service.should_alert(
            threshold=settings.ERROR_RATE_THRESHOLD,
            window_minutes=settings.ERROR_RATE_WINDOW_MINUTES,
            cooldown_minutes=settings.ERROR_ALERT_COOLDOWN_MINUTES,
        ):
            error_alert_service.mark_alert_sent()
            asyncio.create_task(_send_alert())

    return response


async def _send_alert() -> None:
    try:
        from ..services.email.email_queue import email_queue, EmailQueueItem
        from ..services.email.base import EmailMessage
        from ..services.error_alert_service import build_alert_email_html

        errors = error_alert_service.recent_errors(settings.ERROR_RATE_WINDOW_MINUTES)
        html = build_alert_email_html(
            errors=errors,
            window_minutes=settings.ERROR_RATE_WINDOW_MINUTES,
            threshold=settings.ERROR_RATE_THRESHOLD,
        )
        count = len(errors)
        msg = EmailMessage(
            to_email=settings.ALERT_EMAIL,
            subject=f"[GiraHub] ⚠️ {count} erros 5xx nos últimos {settings.ERROR_RATE_WINDOW_MINUTES} min",
            html_body=html,
            text_body=(
                f"Alerta GiraHub: {count} erros 5xx detectados nos últimos "
                f"{settings.ERROR_RATE_WINDOW_MINUTES} minutos. "
                f"Acesse o Sentry para detalhes: {settings.ERROR_RATE_WINDOW_MINUTES} min."
            ),
        )
        email_queue.enqueue(EmailQueueItem(message=msg))
        logger.warning(
            "Alerta de erros enviado para %s (%d erros em %d min)",
            settings.ALERT_EMAIL,
            count,
            settings.ERROR_RATE_WINDOW_MINUTES,
        )
    except Exception as exc:
        logger.exception("Falha ao enviar alerta de erros: %s", exc)
