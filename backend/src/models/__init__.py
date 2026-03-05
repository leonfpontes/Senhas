"""Database models package."""
from .base import Base, SoftDeleteModel, TimestampedModel
from .tenants import Tenant
from .users import User, UserRole
from .giras import Gira
from .consulentes import Consulente
from .tickets import Ticket, TicketStatus
from .senha_controls import SenhaControl
from .audit_logs import AuditLog, AuditAction

__all__ = [
    "Base",
    "SoftDeleteModel",
    "TimestampedModel",
    "Tenant",
    "User",
    "UserRole",
    "Gira",
    "Consulente",
    "Ticket",
    "TicketStatus",
    "SenhaControl",
    "AuditLog",
    "AuditAction",
]
