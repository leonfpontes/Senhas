"""Shared rate limiter instance.

Defined in a standalone module to avoid circular imports between
src.main (which sets up app.state.limiter) and the endpoint modules
that need to reference the limiter for decorators.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from src.core.config import settings

# Rate limiter keyed by client IP (real IP resolved by nginx X-Forwarded-For).
# Uses Redis when REDIS_URL is configured (distributed, multi-process safe).
# Falls back to in-memory when Redis is not available (dev/single-process).
_storage_uri = settings.REDIS_URL if settings.REDIS_URL else None
limiter = Limiter(key_func=get_remote_address, storage_uri=_storage_uri)
