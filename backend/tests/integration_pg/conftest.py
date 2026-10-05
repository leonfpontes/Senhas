"""Suíte de integração com Postgres real (item Q-01 do plano de execução).

Diferente de tests/unit/ (banco mockado, endpoints chamados como função),
aqui o app FastAPI inteiro roda via httpx.ASGITransport — middlewares, JWT,
`Depends(require_group_permission)` e o banco Postgres de verdade, com o
schema criado pelas migrações do Alembic (não por `create_all`).

Como rodar localmente:
    docker run -d --rm --name senhas-test-pg -e POSTGRES_USER=senhas_test \\
        -e POSTGRES_PASSWORD=senhas_test -e POSTGRES_DB=senhas_test -p 55432:5432 postgres:15-alpine
    cd backend && INTEGRATION_PG=1 DEBUG=true STRIPE_WEBHOOK_SECRET=whsec_integration \\
        DATABASE_URL=postgresql+asyncpg://senhas_test:senhas_test@localhost:55432/senhas_test \\
        python -m pytest tests/integration_pg --no-cov

Segurança: a suíte APAGA o schema `public` do banco apontado. Ela só roda
com INTEGRATION_PG=1 e recusa qualquer banco cujo nome não termine em
`_test`. As variáveis precisam estar no ambiente ANTES do pytest, porque o
engine do app é criado na importação de `src.core.database`.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

import pytest
import pytest_asyncio

BACKEND_DIR = Path(__file__).resolve().parents[2]


ENABLED = os.environ.get("INTEGRATION_PG") == "1"

if not ENABLED:
    # Sem a flag, os arquivos da suíte nem são coletados (um `pytest` na pasta
    # tests/ inteira segue funcionando sem Postgres).
    collect_ignore_glob = ["test_*.py"]


def _guard() -> str:
    if not ENABLED:
        return ""
    url = os.environ.get("DATABASE_URL", "")
    db_name = urlparse(url.replace("+asyncpg", "")).path.lstrip("/")
    if not db_name.endswith("_test"):
        raise pytest.UsageError(
            f"DATABASE_URL aponta para '{db_name}'. A suíte apaga o schema: use um banco terminado em _test."
        )
    return url


DATABASE_URL = _guard()


# UM loop para a sessão inteira: o pool do asyncpg fica preso ao loop em que
# as conexões nasceram, e o engine do app é global. Até o pytest-asyncio 0.21
# isso era feito sobrescrevendo o fixture `event_loop` com scope="session";
# a partir do 0.23 essa sobrescrita é depreciada (e some no 1.0). O mecanismo
# suportado é `loop_scope`: os testes recebem o marcador abaixo e todo fixture
# async desta suíte usa `SESSION_LOOP` — inclusive os definidos nos arquivos de
# teste (test_rbac_http.py::tenant, test_tenant_isolation.py::cenario). Fixture
# async novo aqui sem isso falha com "attached to a different loop".
# Fica restrito a esta pasta — tests/unit/ continua com um loop por teste.
SESSION_LOOP = pytest_asyncio.fixture(loop_scope="session")


def pytest_collection_modifyitems(items):
    session_loop = pytest.mark.asyncio(loop_scope="session")
    for item in items:
        if "integration_pg" in str(item.fspath):
            item.add_marker(pytest.mark.integration_pg)
            if pytest_asyncio.is_async_test(item):
                item.add_marker(session_loop, append=False)


def _run_migrations() -> None:
    """Schema do zero + `alembic upgrade head` (grupo 5 do Q-01)."""
    import sqlalchemy as sa

    sync_url = DATABASE_URL.replace("+asyncpg", "+psycopg2")
    engine = sa.create_engine(sync_url, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        conn.execute(sa.text("DROP SCHEMA IF EXISTS public CASCADE"))
        conn.execute(sa.text("CREATE SCHEMA public"))
    engine.dispose()
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env={**os.environ},
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"alembic upgrade head falhou:\n{result.stdout}\n{result.stderr}")


@pytest.fixture(scope="session")
def migrated_db():
    _run_migrations()
    return DATABASE_URL


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def table_names(migrated_db):
    from sqlalchemy import text

    from src.core.database import engine

    async with engine.connect() as conn:
        rows = await conn.execute(
            text(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'alembic_version'"
            )
        )
        return [r[0] for r in rows]


@pytest_asyncio.fixture(autouse=True, loop_scope="session")
async def clean_db(table_names):
    """Cada teste começa com o banco vazio (schema preservado)."""
    yield
    from sqlalchemy import text

    from src.core.database import engine

    if table_names:
        async with engine.begin() as conn:
            await conn.execute(text(f"TRUNCATE {', '.join(table_names)} RESTART IDENTITY CASCADE"))


@pytest.fixture(scope="session")
def app(migrated_db):
    from src.core.limiter import limiter
    from src.main import create_app

    # Rate limit por IP desligado: os testes de concorrência disparam rajadas
    # do mesmo "cliente" de propósito. O limiter tem testes próprios.
    limiter.enabled = False
    return create_app()


@SESSION_LOOP
async def client(app):
    import httpx

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as c:
        yield c


@SESSION_LOOP
async def db():
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        yield session
