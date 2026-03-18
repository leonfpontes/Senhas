"""Logging configuration and utilities."""
import logging
import json
from datetime import datetime
from typing import Any, Optional

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
        "timestamp": datetime.utcnow().isoformat(),
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
        "timestamp": datetime.utcnow().isoformat(),
        "event_type": event_type,
        "user_id": str(user_id) if user_id else None,
        "tenant_id": str(tenant_id) if tenant_id else None,
        "success": success,
        "details": details or {},
    }
    level = logging.INFO if success else logging.WARNING
    logger.log(level, f"SECURITY: {json.dumps(log_data)}")
