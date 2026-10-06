"""Reestruturação de planos de out/2026 — matriz de recursos e limites por plano.

Decisão do dono do produto:
- Limites: Gratuito 2 giras/mês; Basic 3 giras e 15 médiuns; Pro 4 giras e 30
  médiuns; Premium ilimitado. Usuários e preços não mudam.
- Associados (+ mensalidade de associados), estoque, horário marcado, fila de
  espera e financeiro (contas_financeiras) saem do Pro e ficam só no Premium.
- Mensalidade de médiuns também é Premium (decisão do dono do produto).

O frontend espelha esta matriz em frontend/src/constants/plans.ts (teste
__tests__/constants/plans.test.ts). Mudou aqui, mude lá.
"""
import importlib.util
import inspect
from pathlib import Path

import pytest

from src.models.subscriptions import PlanType
from src.repositories.subscription_repo import PLAN_LIMITS
from src.services.plan_features import PLAN_FEATURE_NAMES, _get_plan_features, feature_min_plan

MIN_PLAN = {
    "bulk_operations": PlanType.FREE,  # always-on em todos os planos (2.2.0), não é vendido
    "mediuns": PlanType.BASIC,
    "relatorio_gira": PlanType.BASIC,
    "email_transacional": PlanType.PRO,
    "tema_personalizado": PlanType.PRO,
    "analytics_basico": PlanType.PRO,
    "analytics_avancado": PlanType.PRO,
    "export_csv": PlanType.PRO,
    "auditoria": PlanType.PRO,
    "site_builder": PlanType.PRO,
    "mensalidade_mediun": PlanType.PREMIUM,
    "associados": PlanType.PREMIUM,
    "mensalidade_associado": PlanType.PREMIUM,
    "estoque_controle": PlanType.PREMIUM,
    "contas_financeiras": PlanType.PREMIUM,
    "fila_espera": PlanType.PREMIUM,
    "agendamento_por_horario": PlanType.PREMIUM,
    "suporte_prioritario": PlanType.PREMIUM,
}
ORDER = [PlanType.FREE, PlanType.BASIC, PlanType.PRO, PlanType.PREMIUM]


def test_matriz_cobre_todo_o_catalogo():
    assert set(MIN_PLAN) == set(PLAN_FEATURE_NAMES)


@pytest.mark.parametrize("feature", sorted(MIN_PLAN))
@pytest.mark.parametrize("plan", ORDER)
def test_feature_por_plano(plan, feature):
    expected = ORDER.index(plan) >= ORDER.index(MIN_PLAN[feature])
    assert getattr(_get_plan_features(plan), feature) is expected, (plan, feature)


@pytest.mark.parametrize("feature", sorted(MIN_PLAN))
def test_feature_min_plan(feature):
    assert feature_min_plan(feature) == MIN_PLAN[feature]


@pytest.mark.parametrize(
    "plan, users, giras, mediuns, price",
    [
        (PlanType.FREE, 1, 2, 0, 0.0),
        (PlanType.BASIC, 3, 3, 15, 49.0),
        (PlanType.PRO, 10, 4, 30, 79.0),
        (PlanType.PREMIUM, 99999, 999999, 9999999, 99.0),
    ],
)
def test_plan_limits(plan, users, giras, mediuns, price):
    assert PLAN_LIMITS[plan] == {
        "max_users": users,
        "max_giras_per_month": giras,
        "max_mediuns": mediuns,
        "price": price,
    }


def test_suspenso_perde_tudo():
    f = _get_plan_features(PlanType.PREMIUM, suspended=True)
    assert not any(getattr(f, name) for name in PLAN_FEATURE_NAMES)


@pytest.mark.parametrize(
    "feature, trecho",
    [
        ("estoque_controle", "apenas no plano Premium"),
        ("associados", "apenas no plano Premium"),
        ("contas_financeiras", "apenas no plano Premium"),
        ("fila_espera", "apenas no plano Premium"),
        ("agendamento_por_horario", "apenas no plano Premium"),
        ("mensalidade_associado", "apenas no plano Premium"),
        ("mensalidade_mediun", "apenas no plano Premium"),
        ("site_builder", "a partir do plano Pro"),
    ],
)
def test_mensagem_de_403_segue_o_catalogo(feature, trecho):
    from src.api.dependencies import PLAN_FEATURE_DENIED_MESSAGES

    assert trecho in PLAN_FEATURE_DENIED_MESSAGES[feature]


def test_permission_service_mapeia_modulos_para_features_do_plano():
    """Operador: o PermissionService corta pelo plano os módulos movidos para o Premium."""
    from src.services import permission_service

    src = inspect.getsource(permission_service.PermissionService.is_feature_enabled_for_plan)
    for enum_name, feature in [
        ("ESTOQUE", "estoque_controle"),
        ("ASSOCIADOS", "associados"),
        ("CONTAS_FINANCEIRAS", "contas_financeiras"),
        ("FINANCEIRO", "mensalidade_mediun"),
    ]:
        assert f'PermissionFeature.{enum_name}: "{feature}"' in src


def test_migracao_059_tem_os_mesmos_numeros_de_plan_limits():
    path = Path(__file__).resolve().parents[2] / "alembic" / "versions" / "059_planos_limites_out_2026.py"
    spec = importlib.util.spec_from_file_location("mig059", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    for plan in (PlanType.FREE, PlanType.BASIC, PlanType.PRO):
        assert module.NOVOS[plan.name] == (
            PLAN_LIMITS[plan]["max_giras_per_month"],
            PLAN_LIMITS[plan]["max_mediuns"],
        )
    assert module.ANTIGOS == {"FREE": (4, 0), "BASIC": (10, 50), "PRO": (15, 150)}
    assert "PREMIUM" not in module.NOVOS
