"""AM-10 — guards das rotas novas, módulos visíveis da Área, WhatsApp da casa e e-mail do aviso.

O fluxo completo (senha, auditoria, e-mails, impersonação, isolamento) roda com Postgres
real em tests/integration_pg/test_am10_config_pix.py.
"""
import pytest

from src.api.dependencies import require_not_impersonated
from src.api.v1.admin import area_medium_config, mensalidade_pix
from src.core.errors import ValidationError
from src.services.email.templates.pix_chave_alterada import (
    pix_chave_alterada_subject,
    render_pix_chave_alterada_email,
)
from src.services.medium_area import AreaMediumConfig, modulos_visiveis
from tests.plan_gate_helpers import plan_gate_features


def _route(router, path, method):
    full = router.prefix + path
    return next(r for r in router.routes if r.path == full and method in r.methods)


def _group_guards(route):
    """(feature, ação) de cada require_group_permission da rota (lidos do closure)."""
    out = []
    for dep in route.dependencies:
        fn = dep.dependency
        if fn.__qualname__.startswith("require_group_permission"):
            cells = {name: cell.cell_contents for name, cell in zip(fn.__code__.co_freevars, fn.__closure__)}
            out.append((cells["feature"].value, cells["action"]))
    return out


@pytest.mark.parametrize(
    "router, path, method, feature, acao, plano",
    [
        (area_medium_config.router, "/config/area-medium", "GET", "configuracoes", "view", "area_medium"),
        (area_medium_config.router, "/config/area-medium", "PUT", "configuracoes", "edit", "area_medium"),
        (mensalidade_pix.router, "/config/pix", "GET", "financeiro", "view", "mensalidade_mediun"),
        (mensalidade_pix.router, "/config/pix", "PUT", "financeiro", "edit", "mensalidade_mediun"),
    ],
)
def test_rotas_com_grupo_e_plano(router, path, method, feature, acao, plano):
    route = _route(router, path, method)
    assert _group_guards(route) == [(feature, acao)]
    assert plan_gate_features(router, path, method) == [plano]


def test_troca_da_chave_recusa_impersonacao():
    route = _route(mensalidade_pix.router, "/config/pix", "PUT")
    assert require_not_impersonated in [d.dependency for d in route.dependencies]


def test_put_pix_exige_senha_no_corpo():
    campos = mensalidade_pix.PixConfigUpdate.model_fields
    assert campos["senha"].is_required()
    # A resposta nunca devolve a senha.
    assert "senha" not in mensalidade_pix.PixConfigResponse.model_fields


# ── Módulos visíveis ────────────────────────────────────────────────────────


def test_padrao_mostra_os_tres_modulos_na_ordem_da_barra():
    assert modulos_visiveis(AreaMediumConfig(), mensalidade_no_plano=True) == ["agenda", "avisos", "mensalidade"]


def test_modulo_desligado_some():
    cfg = AreaMediumConfig(agenda=False, avisos=True, mensalidade=False)
    assert modulos_visiveis(cfg, mensalidade_no_plano=True) == ["avisos"]


def test_mensalidade_ligada_sem_plano_nao_aparece():
    assert modulos_visiveis(AreaMediumConfig(), mensalidade_no_plano=False) == ["agenda", "avisos"]


# ── WhatsApp da casa ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "digitado, gravado",
    [
        ("(11) 98765-4321", "5511987654321"),
        ("(11) 3456-7890", "551134567890"),
        ("+55 11 98765-4321", "5511987654321"),
        ("", None),
        (None, None),
    ],
)
def test_whatsapp_normalizado(digitado, gravado):
    assert area_medium_config.normalizar_whatsapp(digitado) == gravado


@pytest.mark.parametrize("digitado", ["123", "(01) 98765-4321", "+1 202 555 0100", "5511"])
def test_whatsapp_invalido(digitado):
    with pytest.raises(ValidationError):
        area_medium_config.normalizar_whatsapp(digitado)


# ── E-mail do aviso ─────────────────────────────────────────────────────────


def test_email_discreto_escapa_e_so_leva_a_chave_mascarada():
    html = render_pix_chave_alterada_email(
        tenant_name="Casa <script>",
        alterado_por="Op & Cia",
        quando="07/10/2026 às 17:00",
        tipo_label="CPF",
        chave_mascarada="***.456.789-**",
        chave_anterior_mascarada="f***@example.com",
        painel_url="http://localhost:3000/admin/financeiro/config",
    )
    assert "<script>" not in html and "Casa &lt;script&gt;" in html
    assert "Op &amp; Cia" in html
    assert "***.456.789-**" in html and "f***@example.com" in html
    assert "12345678909" not in html
    assert pix_chave_alterada_subject("Casa X") == "Chave PIX da mensalidade alterada — Casa X"
