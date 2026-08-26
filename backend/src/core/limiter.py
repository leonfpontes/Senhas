"""Shared rate limiter instance.

Defined in a standalone module to avoid circular imports between
src.main (which sets up app.state.limiter) and the endpoint modules
that need to reference the limiter for decorators.
"""
from starlette.requests import Request

from slowapi import Limiter
from slowapi.util import get_remote_address

from src.core.config import settings


def get_client_ip(request: Request) -> str:
    """Resolve the real client IP for rate-limit bucketing.

    Behind nginx the TCP peer seen by uvicorn is the nginx container IP, so
    keying on `request.client.host` alone would put every user in a single
    global bucket (one attacker could exhaust everyone's quota).

    nginx overwrites `X-Real-IP` with `$remote_addr` on every proxied
    location (see nginx/conf.d/senhas.conf), and `$remote_addr` itself is
    resolved by the real_ip module walking X-Forwarded-For from trusted
    proxies only — so through nginx this header cannot be spoofed.

    NOTE: this is only safe while the backend is not directly reachable by
    clients (docker-compose.prod.yml binds port 8000 to 127.0.0.1 for that
    reason). We deliberately do NOT use uvicorn's --forwarded-allow-ips "*":
    uvicorn 0.24 would then take the *first* X-Forwarded-For entry, which is
    attacker-controlled (nginx appends to the incoming header).

    Without nginx (dev/local), the header is absent and we fall back to the
    direct connection IP.
    """
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return get_remote_address(request)


# Uses Redis when REDIS_URL is configured (distributed, multi-process safe).
# Falls back to in-memory when Redis is not available (dev/single-process).
_storage_uri = settings.REDIS_URL if settings.REDIS_URL else None
limiter = Limiter(key_func=get_client_ip, storage_uri=_storage_uri)
