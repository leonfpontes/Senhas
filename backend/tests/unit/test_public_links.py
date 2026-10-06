"""Os links que os e-mails mandam ao consulente precisam existir no frontend.

O link "Para resgatar sua senha" apontava para /public/{slug}/ticket/{id} sem
que houvesse página para isso (404). Agora o formato vive em
src/core/public_links.py e este teste amarra cada padrão ao arquivo do Next
que o serve.
"""
from pathlib import Path
from uuid import UUID

from src.core import public_links as pl

REPO = Path(__file__).resolve().parents[3]
PAGES = REPO / "frontend" / "src" / "pages"
TICKET_ID = UUID("11111111-2222-3333-4444-555555555555")


def _next_file(route: str) -> Path:
    """'/public/{tenant_slug}/ticket/{ticket_id}' → pages/public/[tenant]/ticket/[ticketId].tsx"""
    parts = route.strip("/").split("/")
    mapped = [
        p.replace("{tenant_slug}", "[tenant]").replace("{ticket_id}", "[ticketId]") for p in parts
    ]
    return PAGES.joinpath(*mapped).with_suffix(".tsx")


def test_rotas_publicas_existem_no_frontend():
    for route in (pl.PUBLIC_TICKET_ROUTE, pl.PUBLIC_CANCEL_ROUTE, pl.PUBLIC_TENANT_ROUTE):
        assert _next_file(route).exists(), f"{route} não tem página em {_next_file(route)}"


def test_formato_dos_links():
    assert (
        pl.public_ticket_link("https://girahub.com.br/", "tenda-x", TICKET_ID)
        == f"https://girahub.com.br/public/tenda-x/ticket/{TICKET_ID}"
    )
    assert pl.public_cancel_link("https://girahub.com.br", TICKET_ID) == (
        f"https://girahub.com.br/public/ticket/{TICKET_ID}/cancelar"
    )
    assert pl.public_tenant_link("https://girahub.com.br", "tenda-x") == "https://girahub.com.br/public/tenda-x"


def test_nenhum_caller_monta_o_link_na_mao():
    src = REPO / "backend" / "src"
    offenders = [
        p.relative_to(src)
        for p in src.rglob("*.py")
        if p.name != "public_links.py"
        and "/public/{tenant.slug}/ticket/" in p.read_text(encoding="utf-8")
    ]
    assert offenders == [], offenders
