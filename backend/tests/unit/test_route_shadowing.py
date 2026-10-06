"""Nenhuma rota fixa pode ser engolida por uma rota com parâmetro registrada antes.

O Starlette casa rotas na ordem de registro. `GET /api/v1/platform/tenants/{tenant_id}`
vinha antes de `GET /api/v1/platform/tenants/search`, então "search" virava tenant_id e
a busca da plataforma respondia 422 (UUID inválido) — nunca chegava no handler.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from starlette.routing import Match

from src.api.dependencies import require_super_admin
from src.core.database import get_db
from src.main import create_app


@pytest.fixture(scope="module")
def app():
    return create_app()


def _shadowed_routes(app):
    routes = [r for r in app.routes if isinstance(r, APIRoute)]
    found = []
    for i, route in enumerate(routes):
        if "{" in route.path:
            continue
        for method in route.methods:
            scope = {"type": "http", "path": route.path, "method": method, "root_path": ""}
            for earlier in routes[:i]:
                if method not in earlier.methods or earlier.path == route.path:
                    continue
                match, _ = earlier.matches(scope)
                if match == Match.FULL:
                    found.append(f"{method} {route.path} engolida por {earlier.path}")
                    break
    return found


def test_nenhuma_rota_fixa_sombreada(app):
    assert _shadowed_routes(app) == []


def test_busca_de_terreiros_chega_no_handler(app):
    tenant = MagicMock(id="11111111-1111-1111-1111-111111111111", slug="tenda-x", is_active=True)
    tenant.name = "Tenda X"
    repo = MagicMock()
    repo.search = AsyncMock(return_value=[tenant])
    repo.count_all = AsyncMock(return_value=1)

    app.dependency_overrides[require_super_admin] = lambda: MagicMock()
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    try:
        with patch("src.api.v1.platform.tenants_search.TenantRepository", return_value=repo):
            resp = TestClient(app, base_url="http://localhost").get("/api/v1/platform/tenants/search?q=tenda")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200, resp.text
    assert resp.json()["query"] == "tenda"
    repo.search.assert_awaited_once()
    assert repo.search.await_args.kwargs["query"] == "tenda"


def test_detalhe_do_terreiro_continua_validando_uuid(app):
    app.dependency_overrides[require_super_admin] = lambda: MagicMock()
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    try:
        resp = TestClient(app, base_url="http://localhost").get("/api/v1/platform/tenants/nao-e-uuid")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 422
