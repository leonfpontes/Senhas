"""Nenhuma rota fixa pode ser engolida por uma rota com parâmetro registrada antes.

O Starlette casa rotas na ordem de registro. `GET /api/v1/platform/tenants/{tenant_id}`
vinha antes de `GET /api/v1/platform/tenants/search`, então "search" virava tenant_id e
a busca da plataforma respondia 422 (UUID inválido) — nunca chegava no handler.
"""
import re
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


_PARAM = re.compile(r"\{[^}]+\}")


def _probe_path(path: str) -> str | None:
    """Path concreto para testar a rota contra as anteriores.

    Rota sem parâmetro: o próprio path. Rota com parâmetro e algum segmento fixo
    DEPOIS dele (ex.: ``/flags/{tenant_id}/enabled``): troca cada parâmetro por um
    valor que nenhuma rota fixa usa — se uma rota anterior casar, o segmento fixo
    está sendo lido como parâmetro dela (``/flags/{tenant_id}/{feature}``). Rota
    cujos segmentos depois do primeiro parâmetro são todos parâmetros fica de fora
    (rota com o mesmo formato não é sombreamento de literal).
    """
    segments = path.split("/")
    first_param = next((i for i, seg in enumerate(segments) if _PARAM.search(seg)), None)
    if first_param is None:
        return path
    if not any(not _PARAM.search(seg) and seg for seg in segments[first_param + 1:]):
        return None
    return _PARAM.sub("00000000-0000-0000-0000-000000000000", path)


def _shadowed_routes(app):
    routes = _api_routes(app)
    found = []
    for i, route in enumerate(routes):
        probe = _probe_path(route.path)
        if probe is None:
            continue
        for method in route.methods:
            scope = {"type": "http", "path": probe, "method": method, "root_path": ""}
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


def test_detector_acha_literal_depois_de_parametro():
    """`/{tenant_id}/enabled` registrada depois de `/{tenant_id}/{feature}` é engolida."""
    router = APIRouter(prefix="/api/v1/platform/feature-flags")

    @router.get("/{tenant_id}/{feature}")
    async def flag(tenant_id: str, feature: str):
        return {"handler": "flag"}

    @router.get("/{tenant_id}/enabled")
    async def habilitadas(tenant_id: str):
        return {"handler": "habilitadas"}

    fake = FastAPI()
    fake.include_router(router)

    assert _shadowed_routes(fake) == [
        "GET /api/v1/platform/feature-flags/{tenant_id}/enabled engolida por "
        "/api/v1/platform/feature-flags/{tenant_id}/{feature}"
    ]
    resp = TestClient(fake).get("/api/v1/platform/feature-flags/abc/enabled")
    assert resp.json() == {"handler": "flag"}


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
