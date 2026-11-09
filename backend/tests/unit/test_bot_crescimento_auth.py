"""Bot Crescimento — a rota só abre com o GIRAHUB_READ_TOKEN (401 em todo o resto).

O conteúdo da resposta é testado com Postgres real em
tests/integration_pg/test_bot_crescimento.py.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from src.api.v1.bots import crescimento as mod
from src.core.config import settings
from src.core.database import get_db
from src.main import app
from src.models.users import UserRole
from src.security.jwt import create_access_token
from tests.conftest import USER_ID

URL = "/api/v1/bots/crescimento/resumo"
TOKEN = "a" * 64


@pytest.fixture
async def client():
    """App inteiro (middlewares incluídos) sem lifespan; o banco é um mock que só lista vazio."""
    db = MagicMock()
    db.execute = AsyncMock(return_value=MagicMock(all=MagicMock(return_value=[])))

    async def _db():
        yield db

    app.dependency_overrides[get_db] = _db
    mod.limiter.reset()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as c:
        yield c, db
    app.dependency_overrides.pop(get_db, None)


def _com_token(monkeypatch, valor=TOKEN):
    monkeypatch.setattr(settings, "GIRAHUB_READ_TOKEN", valor)


async def test_sem_variavel_a_rota_fica_desligada(client, monkeypatch):
    c, db = client
    _com_token(monkeypatch, "")
    r = await c.get(URL, headers={"Authorization": f"Bearer {TOKEN}"})
    assert r.status_code == 401
    r = await c.get(URL, headers={"Authorization": "Bearer "})
    assert r.status_code == 401
    db.execute.assert_not_called()


async def test_token_curto_demais_conta_como_desligado(client, monkeypatch):
    c, db = client
    _com_token(monkeypatch, "curto")
    assert (await c.get(URL, headers={"Authorization": "Bearer curto"})).status_code == 401
    db.execute.assert_not_called()


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer " + "b" * 64},
        {"Authorization": "Bearer " + TOKEN[:-1]},
        {"Authorization": TOKEN},
        {"Authorization": "Basic " + TOKEN},
        {"X-Token": TOKEN},
    ],
)
async def test_token_errado_ou_ausente_leva_401(client, monkeypatch, headers):
    c, db = client
    _com_token(monkeypatch)
    r = await c.get(URL, headers=headers)
    assert r.status_code == 401
    assert r.headers.get("www-authenticate") == "Bearer"
    db.execute.assert_not_called()


async def test_login_de_super_admin_nao_basta(client, monkeypatch):
    c, db = client
    _com_token(monkeypatch)
    jwt = create_access_token(USER_ID, None, UserRole.SUPER_ADMIN.value)
    assert (await c.get(URL, headers={"Authorization": f"Bearer {jwt}"})).status_code == 401
    c.cookies.set("access_token", jwt)
    assert (await c.get(URL)).status_code == 401
    db.execute.assert_not_called()


async def test_token_certo_le_e_nao_cacheia(client, monkeypatch):
    c, db = client
    _com_token(monkeypatch)
    r = await c.get(URL, headers={"Authorization": f"Bearer {TOKEN}"})
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-store"
    corpo = r.json()
    assert corpo["terreiros"] == []
    assert corpo["totais"]["terreiros"] == 0
    assert corpo["precos_vigentes"] == {"free": 0.0, "basic": 49.0, "pro": 79.0, "premium": 99.0}


async def test_rota_so_aceita_get(client, monkeypatch):
    c, _ = client
    _com_token(monkeypatch)
    for metodo in ("post", "put", "patch", "delete"):
        r = await getattr(c, metodo)(URL, headers={"Authorization": f"Bearer {TOKEN}"})
        assert r.status_code == 405
