"""Shared rate limiter instance.

Defined in a standalone module to avoid circular imports between
src.main (which sets up app.state.limiter) and the endpoint modules
that need to reference the limiter for decorators.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

# Rate limiter — keyed by client IP (real IP resolved by nginx X-Forwarded-For).
# Uses in-memory storage which is sufficient for a single-process deployment.
# To scale horizontally, replace storage_uri with a Redis connection string.
limiter = Limiter(key_func=get_remote_address)
