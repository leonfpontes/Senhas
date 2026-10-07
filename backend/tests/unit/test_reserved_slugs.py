"""T-01 — slugs reservados: rotas do site não podem virar slug de terreiro."""
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.api.v1.public.onboarding import _unique_slug
from src.core.errors import InvalidInputError
from src.core.reserved_slugs import RESERVED_SLUGS, is_reserved_slug
from src.services.tenant_service import TenantService

PAGES_DIR = Path(__file__).resolve().parents[3] / "frontend" / "src" / "pages"


def _top_level_routes() -> set[str]:
    """Primeiro segmento de cada página estática do Next (ignora _app/_document e rotas dinâmicas)."""
    routes = set()
    for entry in PAGES_DIR.iterdir():
        name = entry.stem if entry.is_file() else entry.name
        if name.startswith("_") or name.startswith("[") or name == "index":
            continue
        routes.add(name)
    return routes


@pytest.mark.skipif(not PAGES_DIR.is_dir(), reason="frontend fora do checkout")
def test_toda_pagina_de_primeiro_nivel_do_front_esta_reservada():
    faltando = _top_level_routes() - RESERVED_SLUGS
    assert not faltando, (
        f"Páginas do frontend sem slug reservado: {sorted(faltando)}. "
        "Acrescente em backend/src/core/reserved_slugs.py — senão encobrem o site de um terreiro."
    )


def test_is_reserved_slug_ignora_caixa_e_espacos():
    assert is_reserved_slug("Planos")
    assert is_reserved_slug(" login ")
    assert not is_reserved_slug("tenda-de-umbanda-pai-joaquim")


@pytest.mark.asyncio
async def test_cadastro_pula_slug_reservado():
    repo = MagicMock()
    repo.get_by_slug = AsyncMock(return_value=None)
    assert await _unique_slug("planos", repo) == "planos-1"


@pytest.mark.asyncio
async def test_cadastro_pula_reservado_e_ocupado():
    repo = MagicMock()
    repo.get_by_slug = AsyncMock(side_effect=lambda s: object() if s == "planos-1" else None)
    assert await _unique_slug("planos", repo) == "planos-2"


@pytest.mark.asyncio
async def test_slug_comum_continua_igual():
    repo = MagicMock()
    repo.get_by_slug = AsyncMock(return_value=None)
    assert await _unique_slug("casa-de-umbanda", repo) == "casa-de-umbanda"


@pytest.mark.asyncio
async def test_plataforma_nao_cria_tenant_com_slug_reservado():
    service = TenantService(MagicMock())
    service.tenant_repo = MagicMock()
    service.tenant_repo.get_by_slug = AsyncMock(return_value=None)
    with pytest.raises(InvalidInputError, match="reservado"):
        await service.create_tenant(slug="admin", name="X", email_admin="a@b.com")
    service.tenant_repo.get_by_slug.assert_not_called()
