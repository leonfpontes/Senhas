"""Tests for app-level rate limiting on abuse-prone public endpoints.

Two things are covered:

1. `get_client_ip` — the limiter key function must bucket by the real client
   IP forwarded by nginx (X-Real-IP), never by the TCP peer address, which
   behind the proxy is always the nginx container IP (a single global bucket
   would let one attacker exhaust everyone's quota — or, inverted, let an
   attacker rotate fake IPs to evade the limit).

2. The `@limiter.limit` decorators are actually registered on the endpoints
   that were open to credential stuffing / e-mail bombing: login,
   forgot-password, reset-password and the public resend-ticket-email.
"""
from starlette.requests import Request as StarletteRequest

from src.core.limiter import get_client_ip, limiter

# Importing the endpoint modules runs the decorators, which is what registers
# the limits on the shared limiter instance.
import src.api.v1.auth.login  # noqa: F401
import src.api.v1.public.resend_email  # noqa: F401


def _make_request(headers: dict[str, str] | None = None, client_host: str = "172.18.0.5"):
    raw_headers = [
        (k.lower().encode("latin1"), v.encode("latin1")) for k, v in (headers or {}).items()
    ]
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/v1/auth/login",
        "query_string": b"",
        "headers": raw_headers,
        "client": (client_host, 54321),
    }
    return StarletteRequest(scope)


# ── Key function ─────────────────────────────────────────────────────────────

class TestGetClientIp:
    def test_prefers_x_real_ip_over_peer_address(self):
        """Behind nginx the peer is the proxy container — X-Real-IP wins."""
        req = _make_request(headers={"X-Real-IP": "203.0.113.7"})
        assert get_client_ip(req) == "203.0.113.7"

    def test_strips_whitespace(self):
        req = _make_request(headers={"X-Real-IP": " 203.0.113.7 "})
        assert get_client_ip(req) == "203.0.113.7"

    def test_falls_back_to_peer_address_without_header(self):
        """Dev/local without nginx: no header, use the direct connection IP."""
        req = _make_request(client_host="192.168.1.10")
        assert get_client_ip(req) == "192.168.1.10"

    def test_two_clients_behind_same_proxy_get_distinct_keys(self):
        a = _make_request(headers={"X-Real-IP": "203.0.113.7"})
        b = _make_request(headers={"X-Real-IP": "198.51.100.9"})
        assert get_client_ip(a) != get_client_ip(b)

    def test_limiter_uses_get_client_ip(self):
        assert limiter._key_func is get_client_ip


# ── Decorator registration ───────────────────────────────────────────────────

def _registered_limits(endpoint_path: str) -> list[str]:
    """Return the human-readable limits registered for a decorated function."""
    return [str(lim.limit) for lim in limiter._route_limits.get(endpoint_path, [])]


class TestRateLimitRegistration:
    def test_login_limited_10_per_minute(self):
        assert _registered_limits("src.api.v1.auth.login.login") == ["10 per 1 minute"]

    def test_forgot_password_limited_5_per_hour(self):
        assert _registered_limits("src.api.v1.auth.login.forgot_password") == ["5 per 1 hour"]

    def test_reset_password_limited_10_per_hour(self):
        assert _registered_limits("src.api.v1.auth.login.reset_password") == ["10 per 1 hour"]

    def test_public_sitemap_sites_limited_30_per_minute(self):
        assert _registered_limits("src.api.v1.public.sitemap.list_sitemap_sites") == ["30 per 1 minute"]

    def test_public_stats_limited_60_per_minute(self):
        assert _registered_limits("src.api.v1.public.stats.get_public_stats") == ["60 per 1 minute"]

    def test_public_resend_ticket_email_limited_15_per_hour(self):
        assert _registered_limits(
            "src.api.v1.public.resend_email.resend_ticket_email"
        ) == ["15 per 1 hour"]

    def test_public_onboarding_limited_like_login(self):
        """Com `conta_existente` o cadastro confere a senha de uma conta (2026-10-08):
        mesmo limite do login, para não virar oráculo de senha."""
        import src.api.v1.public.onboarding  # noqa: F401

        assert _registered_limits("src.api.v1.public.onboarding.onboarding") == ["10 per 1 minute"]


def test_nginx_puts_onboarding_in_the_login_zone():
    """O prefixo /api/v1/public/ está na public_limit (30/min); o cadastro tem bloco exato na login_limit."""
    import re
    from pathlib import Path

    conf = (Path(__file__).resolve().parents[3] / "nginx" / "conf.d" / "senhas.conf").read_text(encoding="utf-8")
    bloco = re.search(r"location = /api/v1/public/onboarding \{(.*?)\}", conf, re.S)
    assert bloco, "falta o bloco `location = /api/v1/public/onboarding` no nginx"
    assert "limit_req zone=login_limit" in bloco.group(1)
