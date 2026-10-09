"""AM-21 — Estudos e documentos da casa: regras puras e guards (sem banco).

O comportamento HTTP com Postgres real (CRUD por grupo, plano, público, rascunho, links, limites,
outro terreiro, cursos da casa, migração) está em tests/integration_pg/test_am21_materiais.py.
"""
import pytest

from src.core.errors import ValidationError
from src.models.materiais import CATEGORIA_PADRAO, TEXTO_MAX, MaterialTipo
from src.models.subscriptions import PlanType
from src.services.materiais import (
    FONTE_DRIVE,
    FONTE_LINK,
    FONTE_YOUTUBE,
    fonte_do_link,
    limpar_categoria,
    limpar_texto_material,
    limpar_titulo_material,
    validar_conteudo,
    validar_url,
    youtube_id,
)
from src.services.plan_features import _get_plan_features, feature_min_plan
from tests.plan_gate_helpers import plan_gate_features


# ── Endereço: só http(s) ────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "url",
    [
        "https://drive.google.com/file/d/abc123/view?usp=sharing",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "http://terreiro.com.br/estudos#ogum",
        "  https://youtu.be/dQw4w9WgXcQ  ",
    ],
)
def test_url_http_e_https_aceitas(url):
    assert validar_url(url) == url.strip()


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "JaVaScRiPt:alert(1)",
        " javascript:alert(document.cookie)",
        "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
        "vbscript:msgbox(1)",
        "file:///etc/passwd",
        "ftp://exemplo.com/arquivo.pdf",
        "//exemplo.com/sem-esquema",
        "exemplo.com",
        "https://",
        "https://localhost/x",
        "https://banco.com.br@golpe.net/login",
        "https://exemplo.com/com espaço",
        "https://exemplo.com/\"onmouseover=alert(1)",
        "https://exemplo.com/<script>",
        "https://exemplo.com:99999/",
        "https://exemplo.com/" + "a" * 500,
    ],
)
def test_url_perigosa_ou_invalida_recusada(url):
    with pytest.raises(ValidationError):
        validar_url(url)


def test_url_vazia_vira_none():
    assert validar_url(None) is None
    assert validar_url("   ") is None


# ── Fonte e YouTube ─────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "url, esperado",
    [
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s", "dQw4w9WgXcQ"),
        ("https://youtu.be/dQw4w9WgXcQ?si=xyz", "dQw4w9WgXcQ"),
        ("https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://www.youtube.com/playlist?list=PL123", None),
        ("https://www.youtube.com/watch?v=curto", None),
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ\"><script>", None),
        ("https://evil.com/watch?v=dQw4w9WgXcQ", None),
        ("https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ", None),
        (None, None),
    ],
)
def test_youtube_id(url, esperado):
    assert youtube_id(url) == esperado


def test_fonte_do_link():
    assert fonte_do_link("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == FONTE_YOUTUBE
    assert fonte_do_link("https://drive.google.com/file/d/x/view") == FONTE_DRIVE
    assert fonte_do_link("https://docs.google.com/document/d/x") == FONTE_DRIVE
    assert fonte_do_link("https://terreiro.com.br/estudo") == FONTE_LINK
    assert fonte_do_link(None) is None


# ── Texto, título, categoria e tipo ─────────────────────────────────────────


def test_texto_sem_html_com_quebras_e_limite_medido():
    assert limpar_texto_material("Ogum ê\r\n<script>alert(1)</script>Patacori") == "Ogum ê\nalert(1)Patacori"
    assert limpar_texto_material("  ") is None
    assert len(limpar_texto_material("a" * TEXTO_MAX)) == TEXTO_MAX
    with pytest.raises(ValidationError):
        limpar_texto_material("a" * (TEXTO_MAX + 1))


def test_titulo_e_categoria():
    assert limpar_titulo_material("  <b>Fundamentos</b> de Exu ") == "Fundamentos de Exu"
    with pytest.raises(ValidationError):
        limpar_titulo_material("<i></i>")
    with pytest.raises(ValidationError):
        limpar_titulo_material("a" * 121)
    assert limpar_categoria(None) == CATEGORIA_PADRAO
    assert limpar_categoria("  Pontos   cantados ") == "Pontos cantados"
    with pytest.raises(ValidationError):
        limpar_categoria("a" * 61)


def test_cada_tipo_pede_o_seu_conteudo():
    validar_conteudo(MaterialTipo.LINK.value, "https://x.com.br", None)
    validar_conteudo(MaterialTipo.TEXTO.value, None, "Estudo")
    validar_conteudo(MaterialTipo.PONTO.value, None, "Letra do ponto")
    validar_conteudo(MaterialTipo.PONTO.value, "https://youtu.be/dQw4w9WgXcQ", "Letra")
    for tipo, url, texto in (
        (MaterialTipo.LINK.value, None, "descrição"),
        (MaterialTipo.TEXTO.value, "https://x.com.br", None),
        (MaterialTipo.PONTO.value, "https://youtu.be/dQw4w9WgXcQ", None),
    ):
        with pytest.raises(ValidationError):
            validar_conteudo(tipo, url, texto)


# ── Plano e guards ──────────────────────────────────────────────────────────


def test_biblioteca_medium_no_pro():
    assert feature_min_plan("biblioteca_medium") == PlanType.PRO
    assert not _get_plan_features(PlanType.BASIC).biblioteca_medium
    assert _get_plan_features(PlanType.PRO).biblioteca_medium


def test_mensagem_de_plano():
    from src.api.dependencies import plan_feature_denied_message

    assert plan_feature_denied_message("biblioteca_medium") == (
        "Estudos e documentos da casa disponível a partir do plano Pro."
    )


def test_router_admin_exige_area_e_biblioteca_e_grupo_comunicados():
    from src.api.v1.admin.materiais import router

    assert plan_gate_features(router) == ["area_medium", "biblioteca_medium"]
    acoes = {}
    for route in router.routes:
        for dep in route.dependencies:
            closure = getattr(dep.dependency, "__closure__", None) or ()
            valores = [c.cell_contents for c in closure]
            if "require_group_permission" in dep.dependency.__qualname__:
                feature = next(v for v in valores if hasattr(v, "value"))
                acao = next(v for v in valores if isinstance(v, str))
                acoes[(next(iter(route.methods)), route.path)] = (feature.value, acao)
    base = "/api/v1/admin/materiais"
    assert acoes == {
        ("GET", base): ("comunicados", "view"),
        ("GET", base + "/{material_id}"): ("comunicados", "view"),
        ("POST", base): ("comunicados", "insert"),
        ("PUT", base + "/ordem"): ("comunicados", "edit"),
        ("PUT", base + "/{material_id}"): ("comunicados", "edit"),
        ("DELETE", base + "/{material_id}"): ("comunicados", "delete"),
    }


def test_router_medium_exige_biblioteca():
    from src.api.v1.medium.materiais import router

    assert plan_gate_features(router) == ["biblioteca_medium"]


def test_ordem_vem_antes_do_id_no_put():
    from src.api.v1.admin.materiais import router

    puts = [r.path for r in router.routes if "PUT" in r.methods]
    assert puts.index("/api/v1/admin/materiais/ordem") < puts.index("/api/v1/admin/materiais/{material_id}")
