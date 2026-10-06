"""Nenhuma rota fixa pode ser engolida por uma rota com parâmetro registrada antes.

O Starlette casa rotas na ordem de registro. `GET /api/v1/platform/tenants/{tenant_id}`
vinha antes de `GET /api/v1/platform/tenants/search`, então "search" virava tenant_id e
a busca da plataforma respondia 422 (UUID inválido) — nunca chegava no handler.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.routing import APIRoute, iter_route_contexts
from fastapi.testclient import TestClient
from starlette.routing import Match

from src.api.dependencies import require_super_admin
from src.core.database import get_db
from src.main import create_app


@pytest.fixture(scope="module")
def app():
    return create_app()


def _api_routes(app):
    """Rotas da API na ordem em que o roteador as testa.

    Desde o fastapi 0.137 `app.routes` é uma árvore: cada `include_router` vira
    um nó `_IncludedRouter` em vez de copiar as rotas. `iter_route_contexts`
    achata a árvore em profundidade — a mesma ordem do despacho — e cada contexto
    já carrega o path efetivo (com prefixos) e o `matches()` da rota incluída.
    Iterar `app.routes` direto passaria a ver só as 2 rotas do próprio app e o
    teste ficaria verde sem checar nada.
    """
    return [
        ctx for ctx in iter_route_contexts(app.routes)
        if isinstance(ctx.original_route, APIRoute)
    ]


def _shadowed_routes(app):
    routes = _api_routes(app)
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
    # Guarda contra o teste ficar vazio: o app tem ~240 rotas de API.
    assert len(_api_routes(app)) > 200
    assert _shadowed_routes(app) == []


def test_detector_acha_sombreamento_em_routers_aninhados():
    """O detector enxerga rotas dentro de routers incluídos em routers incluídos."""
    inner = APIRouter(prefix="/tenants")

    @inner.get("/{tenant_id}")
    async def detalhe(tenant_id: str):
        return {"handler": "detalhe"}

    @inner.get("/search")
    async def busca():
        return {"handler": "busca"}

    outer = APIRouter(prefix="/api/v1/platform")
    outer.include_router(inner)
    fake = FastAPI()
    fake.include_router(outer)

    assert _shadowed_routes(fake) == [
        "GET /api/v1/platform/tenants/search engolida por /api/v1/platform/tenants/{tenant_id}"
    ]
    # E o despacho real concorda com o detector: "search" cai no handler de detalhe.
    resp = TestClient(fake).get("/api/v1/platform/tenants/search")
    assert resp.json() == {"handler": "detalhe"}


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
