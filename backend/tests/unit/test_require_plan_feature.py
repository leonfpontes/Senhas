"""Gate de plano único (P-05): require_plan_feature, effective_limit e catálogo.

Semântica: o plano inclui a feature (senão 403) E o status da assinatura permite
uso pago (senão 402). Detalhes em src/services/plan_features.py.
"""
import importlib
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from src.models.subscriptions import PlanType, SubscriptionStatus
from src.services.plan_features import (
    BLOCK_INACTIVE,
    BLOCK_SUSPENDED,
    BLOCK_TRIAL_ENDED,
    PLAN_FEATURE_NAMES,
    get_effective_plan_features,
    plan_tier,
    subscription_block_reason,
)
from tests.plan_gate_helpers import make_sub, plan_gate_features, run_gate

NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
PAST = NOW - timedelta(hours=1)
FUTURE = NOW + timedelta(days=3)

ALL_PLANS = [PlanType.FREE, PlanType.BASIC, PlanType.PRO, PlanType.PREMIUM]
ALL_STATUS = list(SubscriptionStatus)


# ── Catálogo ────────────────────────────────────────────────────────────────


def test_plan_tier():
    assert [plan_tier(p) for p in ALL_PLANS] == [0, 1, 2, 3]
    assert plan_tier(None) == 0


# ── subscription_block_reason ───────────────────────────────────────────────


def _expected_reason(plan, status):
    if status == SubscriptionStatus.SUSPENDED:
        return BLOCK_SUSPENDED
    if status in (SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED):
        return None if plan == PlanType.FREE else BLOCK_INACTIVE
    return None


@pytest.mark.parametrize("plan", ALL_PLANS)
@pytest.mark.parametrize("status", ALL_STATUS)
def test_block_reason_status_x_plano(plan, status):
    assert subscription_block_reason(make_sub(plan, status), NOW) == _expected_reason(plan, status)


def test_sem_assinatura_nao_bloqueia():
    assert subscription_block_reason(None, NOW) is None


def test_trial_local_vencido_bloqueia():
    sub = make_sub(PlanType.PREMIUM, is_trial=True, trial_ends_at=PAST)
    assert subscription_block_reason(sub, NOW) == BLOCK_TRIAL_ENDED


def test_trial_local_vencido_com_datetime_naive_bloqueia():
    sub = make_sub(PlanType.PREMIUM, is_trial=True, trial_ends_at=PAST.replace(tzinfo=None))
    assert subscription_block_reason(sub, NOW) == BLOCK_TRIAL_ENDED


def test_trial_local_em_andamento_libera():
    sub = make_sub(PlanType.PREMIUM, is_trial=True, trial_ends_at=FUTURE)
    assert subscription_block_reason(sub, NOW) is None


def test_trial_stripe_vencido_nao_bloqueia():
    """Trial com assinatura Stripe: a Stripe/webhook decide (mesmo recorte do trial_scheduler)."""
    sub = make_sub(PlanType.PRO, is_trial=True, trial_ends_at=PAST, stripe_subscription_id="sub_123")
    assert subscription_block_reason(sub, NOW) is None


def test_bonus_nao_sofre_corte_de_trial():
    sub = make_sub(PlanType.PRO, is_trial=True, trial_ends_at=PAST, is_bonus=True)
    assert subscription_block_reason(sub, NOW) is None


def test_bonus_suspenso_bloqueia():
    sub = make_sub(PlanType.PRO, SubscriptionStatus.SUSPENDED, is_bonus=True)
    assert subscription_block_reason(sub, NOW) == BLOCK_SUSPENDED


def test_cancel_at_period_end_continua_ativo_ate_o_webhook():
    sub = make_sub(PlanType.PRO, cancel_at_period_end=True, current_period_end=PAST)
    assert subscription_block_reason(sub, NOW) is None


def test_features_efetivas():
    assert get_effective_plan_features(None).estoque_controle is False
    assert get_effective_plan_features(make_sub(PlanType.PRO)).estoque_controle is True
    suspensa = get_effective_plan_features(make_sub(PlanType.PREMIUM, SubscriptionStatus.SUSPENDED))
    assert not any(suspensa.model_dump().values())
    cancelada = get_effective_plan_features(make_sub(PlanType.PRO, SubscriptionStatus.CANCELLED))
    assert cancelada.contas_financeiras is False


# ── require_plan_feature ────────────────────────────────────────────────────


def _expected_status(feature, plan, status):
    """None = passa; senão o status HTTP esperado."""
    from src.services.plan_features import _get_plan_features

    if not getattr(_get_plan_features(plan), feature):
        return 403
    return None if _expected_reason(plan, status) is None else 402


@pytest.mark.parametrize("feature", ["estoque_controle", "mediuns", "suporte_prioritario"])
@pytest.mark.parametrize("plan", ALL_PLANS)
@pytest.mark.parametrize("status", ALL_STATUS)
async def test_gate_status_x_plano(feature, plan, status):
    from src.api.dependencies import require_plan_feature

    gate = require_plan_feature(feature)
    expected = _expected_status(feature, plan, status)
    if expected is None:
        await run_gate(gate, make_sub(plan, status))
    else:
        with pytest.raises(HTTPException) as exc:
            await run_gate(gate, make_sub(plan, status))
        assert exc.value.status_code == expected


async def test_gate_sem_assinatura_e_free():
    from src.api.dependencies import require_plan_feature

    with pytest.raises(HTTPException) as exc:
        await run_gate(require_plan_feature("estoque_controle"), None)
    assert exc.value.status_code == 403
    await run_gate(require_plan_feature("relatorio_gira"), make_sub(PlanType.BASIC))


async def test_gate_trial_vencido_retorna_402():
    from src.api.dependencies import require_plan_feature

    sub = make_sub(PlanType.PREMIUM, is_trial=True, trial_ends_at=datetime.now(timezone.utc) - timedelta(minutes=1))
    with pytest.raises(HTTPException) as exc:
        await run_gate(require_plan_feature("estoque_controle"), sub)
    assert exc.value.status_code == 402
    assert "avaliação" in exc.value.detail


async def test_gate_mensagens():
    from src.api.dependencies import require_plan_feature

    with pytest.raises(HTTPException) as exc:
        await run_gate(require_plan_feature("estoque_controle"), make_sub(PlanType.BASIC))
    assert exc.value.detail == "Controle de Estoque disponível a partir do plano Pro."
    with pytest.raises(HTTPException) as exc:
        await run_gate(require_plan_feature("site_builder", detail="Plano X."), make_sub(PlanType.FREE))
    assert exc.value.detail == "Plano X."
    with pytest.raises(HTTPException) as exc:
        await run_gate(require_plan_feature("estoque_controle"), make_sub(PlanType.PRO, SubscriptionStatus.SUSPENDED))
    assert "suspensa" in exc.value.detail


async def test_gate_super_admin_sem_tenant_retorna_400():
    from src.api.dependencies import require_plan_feature

    user = MagicMock()
    user.tenant_id = None
    with pytest.raises(HTTPException) as exc:
        await run_gate(require_plan_feature("estoque_controle"), make_sub(PlanType.PREMIUM), user=user)
    assert exc.value.status_code == 400


def test_feature_desconhecida_quebra_na_importacao():
    from src.api.dependencies import require_plan_feature

    with pytest.raises(ValueError):
        require_plan_feature("estoque")


def test_dependency_expoe_a_feature():
    from src.api.dependencies import require_plan_feature

    assert require_plan_feature("contas_financeiras").plan_feature == "contas_financeiras"
    assert "contas_financeiras" in PLAN_FEATURE_NAMES


# ── Adoção nos módulos ──────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "module, feature",
    [
        ("estoque", "estoque_controle"),
        ("sites", "site_builder"),
        ("cursos_presenciais", "site_builder"),
        ("contas_financeiras", "contas_financeiras"),
        ("email_resend", "email_transacional"),
        ("analytics", "analytics_basico"),
        ("audit_trail", "auditoria"),
    ],
)
def test_modulos_gated_no_router(module, feature):
    mod = importlib.import_module(f"src.api.v1.admin.{module}")
    assert plan_gate_features(mod.router) == [feature]


def test_mediuns_gated_nas_rotas_de_plano():
    from src.api.v1.admin.mediuns import router

    assert plan_gate_features(router, "/aniversariantes") == ["mediuns"]
    assert plan_gate_features(router, "", "POST") == ["mediuns"]


# ── effective_limit ─────────────────────────────────────────────────────────


def test_effective_limit():
    from src.api.dependencies import effective_limit
    from src.repositories.subscription_repo import PLAN_LIMITS

    ativa = make_sub(PlanType.PRO, max_giras_per_month=15)
    assert effective_limit(ativa, "max_giras_per_month") == 15

    with pytest.raises(HTTPException) as exc:
        effective_limit(make_sub(PlanType.PRO, SubscriptionStatus.SUSPENDED), "max_users")
    assert exc.value.status_code == 402
    assert "adicionar usuários" in exc.value.detail

    cancelada = make_sub(PlanType.PRO, SubscriptionStatus.CANCELLED, max_giras_per_month=15)
    assert effective_limit(cancelada, "max_giras_per_month") == PLAN_LIMITS[PlanType.FREE]["max_giras_per_month"]

    trial_vencido = make_sub(
        PlanType.PREMIUM, is_trial=True, trial_ends_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        max_users=99999,
    )
    assert effective_limit(trial_vencido, "max_users") == PLAN_LIMITS[PlanType.FREE]["max_users"]

    free_cancelada = make_sub(PlanType.FREE, SubscriptionStatus.CANCELLED, max_giras_per_month=4)
    assert effective_limit(free_cancelada, "max_giras_per_month") == 4


# ── require_super_admin único ───────────────────────────────────────────────


async def test_require_super_admin():
    from src.api.dependencies import require_super_admin
    from src.models.users import UserRole

    sa = MagicMock(role=UserRole.SUPER_ADMIN, tenant_id=None)
    assert await require_super_admin(sa) is sa
    for user in (
        MagicMock(role=UserRole.ADMIN, tenant_id=None),
        MagicMock(role=UserRole.SUPER_ADMIN, tenant_id=uuid.uuid4()),  # impersonando
    ):
        with pytest.raises(HTTPException) as exc:
            await require_super_admin(user)
        assert exc.value.status_code == 403


@pytest.mark.parametrize(
    "module",
    [
        "billing", "billing_sync", "consolidated_audit", "dashboard", "feature_flags", "impersonate",
        "subscriptions", "support_chat", "tenant_observatory", "tenants", "tenants_search", "users_global",
    ],
)
def test_platform_usa_o_require_super_admin_unico(module):
    from src.api import dependencies

    mod = importlib.import_module(f"src.api.v1.platform.{module}")
    assert mod.require_super_admin is dependencies.require_super_admin


