"""AM-02 — o papel `medium` (Área do Médium) não entra no painel nem na plataforma.

Varre TODAS as rotas do app (mesma técnica de test_route_shadowing.py) e confere que um
usuário `medium` leva 403 em toda rota `/api/v1/admin/*` e `/api/v1/platform/*` — também
impersonado (a impersonação faria bypass dos grupos de permissão). Rota admin nova que
escape do `admin_router` (e do `require_backoffice`) quebra este teste.

A mesma varredura roda contra o Postgres real em integration_pg/test_area_medium.py.
"""
import re
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from fastapi.routing import APIRoute, iter_route_contexts
from fastapi.testclient import TestClient

from src.api.dependencies import get_current_user
from src.core.database import get_db
from src.main import create_app
from src.models import User, UserRole
from src.security.jwt import create_access_token

TENANT_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")

# Rotas da plataforma SEM autenticação por design (monitoramento externo e página /status).
PUBLIC_PLATFORM_ROUTES = {
    ("GET", "/api/v1/platform/health"),
    ("GET", "/api/v1/platform/status"),
}

_PARAM = re.compile(r"\{[^}]+\}")


@pytest.fixture(scope="module")
def app():
    return create_app()


def _medium_user():
    u = User()
    u.id = uuid.uuid4()
    u.tenant_id = TENANT_ID
    u.email = "medium@example.com"
    u.username = "medium"
    u.role = UserRole.MEDIUM
    u.is_active = True
    u.deleted_at = None
    u.sessions_revoked_at = None
    u.created_at = datetime.now(timezone.utc)
    return u


def protected_routes(app):
    """[(método, path concreto, path declarado)] de toda rota admin/platform autenticada."""
    out = []
    for ctx in iter_route_contexts(app.routes):
        route = ctx.original_route
        if not isinstance(route, APIRoute):
            continue
        path = ctx.path  # path efetivo, com os prefixos dos routers
        if not path.startswith(("/api/v1/admin", "/api/v1/platform")):
            continue
        for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
            if (method, path) in PUBLIC_PLATFORM_ROUTES:
                continue
            out.append((method, _PARAM.sub("00000000-0000-0000-0000-000000000000", path), path))
    return out


def _walk(app, headers):
    user = _medium_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    try:
        client = TestClient(app, base_url="http://localhost", raise_server_exceptions=False)
        found = []
        for method, probe, declared in protected_routes(app):
            resp = client.request(method, probe, headers=headers, json={})
            if resp.status_code != 403:
                found.append(f"{method} {declared} → {resp.status_code}")
        return found
    finally:
        app.dependency_overrides.clear()


def test_varredura_enxerga_as_rotas_admin_e_platform(app):
    routes = protected_routes(app)
    admin = [r for r in routes if r[2].startswith("/api/v1/admin")]
    platform = [r for r in routes if r[2].startswith("/api/v1/platform")]
    # Guarda contra a varredura ficar vazia (o app tem ~180 rotas admin e ~50 de plataforma).
    assert len(admin) > 150 and len(platform) > 40, (len(admin), len(platform))


def test_medium_leva_403_em_toda_rota_admin_e_platform(app):
    token = create_access_token(uuid.uuid4(), TENANT_ID, UserRole.MEDIUM.value)
    assert _walk(app, {"Authorization": f"Bearer {token}"}) == []


def test_medium_impersonado_tambem_leva_403(app):
    """Impersonação faz bypass dos grupos (PermissionService) — o require_backoffice não."""
    token = create_access_token(uuid.uuid4(), TENANT_ID, UserRole.MEDIUM.value, impersonated_by=uuid.uuid4())
    assert _walk(app, {"Authorization": f"Bearer {token}"}) == []


def test_area_do_medium_esta_registrada_no_app(app):
    paths = {
        (method, ctx.path)
        for ctx in iter_route_contexts(app.routes)
        if isinstance(ctx.original_route, APIRoute)
        for method in ctx.original_route.methods
    }
    assert ("GET", "/api/v1/medium/me") in paths


def test_area_do_medium_sem_sessao_leva_401(app):
    resp = TestClient(app, base_url="http://localhost").get("/api/v1/medium/me")
    assert resp.status_code == 401
