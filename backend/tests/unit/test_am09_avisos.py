"""AM-09 — Avisos da casa: regras puras e guards (sem banco).

O comportamento HTTP com Postgres real (CRUD por grupo, público, leituras, agenda/validade,
impersonação, outro terreiro, módulo e chave do piloto, migrações) está em
tests/integration_pg/test_am09_avisos.py.
"""
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from src.core.errors import ForbiddenError, ValidationError
from src.core.tz import APP_TZ
from src.models import ComunicadoPublico, PermissionFeature
from src.models.subscriptions import PlanType
from src.services.comunicados import (
    SITUACAO_AGENDADO,
    SITUACAO_EXPIRADO,
    SITUACAO_PUBLICADO,
    limpar_corpo,
    limpar_titulo,
    medium_no_publico,
    normalizar_data,
    publicos_do_medium,
    resumo,
    situacao,
)
from tests.plan_gate_helpers import make_sub, plan_gate_features

AGORA = datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc)


# ── Texto simples (sem HTML, sem XSS) ───────────────────────────────────────


@pytest.mark.parametrize(
    "entrada",
    [
        '<script>alert("x")</script>Gira às 20h',
        '<img src=x onerror="alert(1)">Gira às 20h',
        "<scr<script>ipt>alert(1)</scr</script>ipt>Gira às 20h",
        '<a href="javascript:alert(1)">Gira às 20h</a>',
        "<!-- escondido -->Gira às 20h",
        "<svg/onload=alert(1)>Gira às 20h",
    ],
)
def test_titulo_e_corpo_nunca_guardam_html(entrada):
    for limpo in (limpar_titulo(entrada), limpar_corpo(entrada)):
        assert "<" not in limpo and ">" not in limpo
        assert "onerror" not in limpo and "<script" not in limpo.lower() and "href" not in limpo
        assert limpo.endswith("Gira às 20h")


def test_texto_comum_com_sinal_de_menor_fica_como_esta():
    assert limpar_corpo("Crianças < 12 anos não pagam <3") == "Crianças < 12 anos não pagam <3"


def test_corpo_preserva_quebras_e_colapsa_linhas_em_branco():
    entrada = "Linha 1\r\nLinha 2   \r\n\r\n\r\n\r\nLinha 3\n\n\x00\x07"
    assert limpar_corpo(entrada) == "Linha 1\nLinha 2\n\nLinha 3"


def test_corpo_mantem_links_como_texto():
    corpo = limpar_corpo("Leia: https://exemplo.com.br/agenda?x=1&y=2\nObrigado")
    assert corpo == "Leia: https://exemplo.com.br/agenda?x=1&y=2\nObrigado"


def test_titulo_numa_linha_so_sem_controle():
    assert limpar_titulo("  Gira\nde\tsexta​  \x1b ") == "Gira de sexta"
    assert limpar_titulo(None) == ""
    assert limpar_titulo("<b></b>") == ""


def test_resumo_corta_em_palavra():
    assert resumo("Curto") == "Curto"
    texto = "palavra " * 40
    r = resumo(texto, limite=30)
    assert r.endswith("…") and len(r) <= 31 and "  " not in r


# ── Público ─────────────────────────────────────────────────────────────────


def test_publico_do_medium_de_atendimento_e_do_cambone():
    assert publicos_do_medium(True) == ("todos", "atendimento")
    assert publicos_do_medium(False) == ("todos", "cambones")
    assert medium_no_publico("todos", True) and medium_no_publico("todos", False)
    assert medium_no_publico("atendimento", True) and not medium_no_publico("atendimento", False)
    assert medium_no_publico("cambones", False) and not medium_no_publico("cambones", True)
    assert {p.value for p in ComunicadoPublico} == {"todos", "atendimento", "cambones"}


# ── Agenda e validade ───────────────────────────────────────────────────────


def test_situacao_agendado_publicado_expirado():
    assert situacao(AGORA + timedelta(minutes=1), None, AGORA) == SITUACAO_AGENDADO
    assert situacao(AGORA, None, AGORA) == SITUACAO_PUBLICADO
    assert situacao(AGORA - timedelta(days=1), AGORA + timedelta(seconds=1), AGORA) == SITUACAO_PUBLICADO
    assert situacao(AGORA - timedelta(days=1), AGORA, AGORA) == SITUACAO_EXPIRADO


def test_data_sem_fuso_e_horario_de_brasilia():
    naive = datetime(2026, 10, 8, 8, 0)
    assert normalizar_data(naive) == datetime(2026, 10, 8, 8, 0, tzinfo=APP_TZ)
    assert normalizar_data(AGORA) is AGORA
    assert normalizar_data(None) is None


def test_janela_de_publicacao():
    from src.api.v1.admin.comunicados import _validar_janela

    _validar_janela(AGORA, None, AGORA, criando=True)
    _validar_janela(AGORA, AGORA + timedelta(days=1), AGORA, criando=True)
    with pytest.raises(ValidationError):
        _validar_janela(AGORA + timedelta(days=2), AGORA + timedelta(days=1), AGORA, criando=True)
    with pytest.raises(ValidationError):
        _validar_janela(AGORA - timedelta(days=3), AGORA - timedelta(days=1), AGORA, criando=True)
    # Editar um aviso que já saiu do ar sem mexer na validade continua possível.
    _validar_janela(AGORA - timedelta(days=3), AGORA - timedelta(days=1), AGORA, criando=False)


# ── Guards ──────────────────────────────────────────────────────────────────


def _guards(dependencies) -> set:
    """{(feature, ação)} dos `require_group_permission` (ficam na closure)."""
    out = set()
    for d in dependencies:
        cells = [c.cell_contents for c in (getattr(d.dependency, "__closure__", None) or ())]
        feats = [c for c in cells if isinstance(c, PermissionFeature)]
        acoes = [c for c in cells if isinstance(c, str)]
        for f in feats:
            out.add((f, acoes[0] if acoes else None))
    return out


def test_feature_comunicados_no_enum():
    assert PermissionFeature.COMUNICADOS.value == "comunicados"


def test_rotas_admin_tem_grupo_comunicados_por_acao_e_plano_area_medium():
    from src.api.v1.admin.comunicados import router

    assert router.prefix == "/api/v1/admin/comunicados"
    assert plan_gate_features(router) == ["area_medium"]
    esperado = {
        ("GET", "/api/v1/admin/comunicados"): "view",
        ("GET", "/api/v1/admin/comunicados/{comunicado_id}"): "view",
        ("GET", "/api/v1/admin/comunicados/{comunicado_id}/leituras"): "view",
        ("POST", "/api/v1/admin/comunicados"): "insert",
        ("PUT", "/api/v1/admin/comunicados/{comunicado_id}"): "edit",
        ("DELETE", "/api/v1/admin/comunicados/{comunicado_id}"): "delete",
    }
    vistos = {}
    for rota in router.routes:
        for metodo in rota.methods:
            vistos[(metodo, rota.path)] = _guards(rota.dependencies)
    assert set(vistos) == set(esperado)
    for chave, acao in esperado.items():
        assert vistos[chave] == {(PermissionFeature.COMUNICADOS, acao)}, chave


def test_rotas_do_medium_estao_no_medium_router_com_guard_de_modulo_e_impersonacao():
    from fastapi.routing import APIRoute, iter_route_contexts

    from src.api.dependencies import require_medium, require_not_impersonated
    from src.api.v1.medium import medium_router
    from src.api.v1.medium.avisos import require_modulo_avisos, router
    from src.main import create_app

    assert any(d.dependency is require_medium for d in medium_router.dependencies)
    assert any(d.dependency is require_modulo_avisos for d in router.dependencies)
    rotas = {
        (metodo, ctx.path): ctx.original_route
        for ctx in iter_route_contexts(create_app().routes)
        if isinstance(ctx.original_route, APIRoute) and ctx.path.startswith("/api/v1/medium/avisos")
        for metodo in ctx.original_route.methods
    }
    assert set(rotas) == {
        ("GET", "/api/v1/medium/avisos"),
        ("GET", "/api/v1/medium/avisos/{aviso_id}"),
        ("POST", "/api/v1/medium/avisos/{aviso_id}/lido"),
    }
    for (metodo, caminho), rota in rotas.items():
        assert any(d.call is require_medium for d in rota.dependant.dependencies), caminho
        # Regra de ouro: nada de medium_id na rota, nem corpo.
        assert "medium_id" not in caminho
        assert rota.dependant.body_params == []
        assert [p.name for p in rota.dependant.query_params] == []
    lido = rotas[("POST", "/api/v1/medium/avisos/{aviso_id}/lido")]
    assert any(d.dependency is require_not_impersonated for d in lido.dependencies)


async def test_modulo_avisos_desligado_da_403_neutro():
    from src.api.v1.medium import avisos as mod
    from src.services.medium_area import AreaMediumConfig

    ctx = SimpleNamespace(tenant_id=uuid.uuid4())
    with patch.object(mod, "get_area_medium_config", AsyncMock(return_value=AreaMediumConfig(avisos=False))):
        with pytest.raises(ForbiddenError) as exc:
            await mod.require_modulo_avisos(ctx=ctx, db=AsyncMock())
    assert exc.value.status_code == 403
    assert "não estão disponíveis" in exc.value.message
    with patch.object(mod, "get_area_medium_config", AsyncMock(return_value=AreaMediumConfig())):
        assert await mod.require_modulo_avisos(ctx=ctx, db=AsyncMock()) is ctx


@pytest.mark.parametrize(
    "plan,esperado",
    [(PlanType.FREE, False), (PlanType.BASIC, True), (PlanType.PRO, True), (PlanType.PREMIUM, True)],
)
async def test_operador_so_tem_comunicados_no_plano_com_area_medium(plan, esperado):
    from src.services.permission_service import PermissionService

    with patch("src.services.permission_service.SubscriptionRepository") as Repo:
        Repo.return_value.get_by_tenant = AsyncMock(return_value=make_sub(plan))
        service = PermissionService(AsyncMock())
        assert await service.is_feature_enabled_for_plan(uuid.uuid4(), PermissionFeature.COMUNICADOS) is esperado
