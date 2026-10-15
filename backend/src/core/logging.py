"""Logging configuration and utilities."""
import logging
import json
import re
from typing import Any, Optional
from .tz import utc_now

# Configure logger
logger = logging.getLogger("senhas")
logger.setLevel(logging.DEBUG)

# Console handler with formatting
handler = logging.StreamHandler()
formatter = logging.Formatter(
    "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
handler.setFormatter(formatter)
logger.addHandler(handler)


# E-mail em log vira "a***@dominio.com" (pentest, item informativo "PII em log"). Aplicado na
# CRIAÇÃO de todo LogRecord (qualquer logger, inclusive os que propagam para a raiz e o que
# vai para o Sentry), em vez de mexer em cada chamada que loga um destinatário.
_EMAIL_RE = re.compile(r"\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b")


def mask_emails(text: str) -> str:
    return _EMAIL_RE.sub(r"\1***@\2", text)


def _install_email_masking() -> None:
    base = logging.getLogRecordFactory()
    if getattr(base, "_masks_emails", False):
        return

    def factory(*args, **kwargs):
        record = base(*args, **kwargs)
        try:
            message = record.getMessage()
        except Exception:
            return record
        masked = mask_emails(message)
        if masked != message:
            record.msg, record.args = masked, None
        return record

    factory._masks_emails = True  # type: ignore[attr-defined]
    logging.setLogRecordFactory(factory)


_install_email_masking()


def log_audit_event(
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    user_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
) -> None:
    """Log an audit event.
    
    Args:
        action: Action performed (create, read, update, delete)
        resource_type: Type of resource (User, Ticket, etc)
        resource_id: ID of the resource
        user_id: ID of the user performing the action
        tenant_id: ID of the tenant
        details: Additional details about the action
    """
    log_data = {
        "timestamp": utc_now().isoformat(),
        "action": action,
        "resource_type": resource_type,
        "resource_id": str(resource_id) if resource_id else None,
        "user_id": str(user_id) if user_id else None,
        "tenant_id": str(tenant_id) if tenant_id else None,
        "details": details or {},
    }
    logger.info(f"AUDIT: {json.dumps(log_data)}")


def log_security_event(
    event_type: str,
    user_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    success: bool = True,
    details: Optional[dict[str, Any]] = None,
) -> None:
    """Log a security event.
    
    Args:
        event_type: Type of security event (login, logout, token_refresh, permission_denied)
        user_id: ID of the user
        tenant_id: ID of the tenant
        success: Whether the event was successful
        details: Additional details
    """
    log_data = {
        "timestamp": utc_now().isoformat(),
        "event_type": event_type,
        "user_id": str(user_id) if user_id else None,
        "tenant_id": str(tenant_id) if tenant_id else None,
        "success": success,
        "details": details or {},
    }
    level = logging.INFO if success else logging.WARNING
    logger.log(level, f"SECURITY: {json.dumps(log_data)}")
