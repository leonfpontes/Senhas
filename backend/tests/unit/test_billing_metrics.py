"""Regra única de quem é pagante (src/services/billing_metrics.py)."""
from types import SimpleNamespace

import pytest

from src.models.subscriptions import PlanType, SubscriptionStatus as S
from src.services.billing_metrics import (
    BillingCategory as C,
    billing_category,
    effective_mrr,
    potential_mrr,
)


def sub(plan=PlanType.PRO, price=79.0, status=S.ACTIVE, trial=False, bonus=False, stripe="sub_x"):
    return SimpleNamespace(plan=plan, monthly_price=price, status=status, is_trial=trial,
                           is_bonus=bonus, stripe_subscription_id=stripe)


@pytest.mark.parametrize("s, deleted, expected", [
    (sub(), False, C.PAGANTE),
    (sub(), True, C.EXCLUIDO),
    (sub(trial=True, stripe=None), False, C.EM_TESTE),
    (sub(trial=True), False, C.EM_TESTE),  # teste com cartão cadastrado ainda não é receita
    (sub(bonus=True, stripe=None), False, C.BONIFICADO),
    (sub(bonus=True, trial=True), False, C.BONIFICADO),
    (sub(plan=PlanType.FREE, price=0, stripe=None), False, C.GRATUITO),
    (sub(plan=PlanType.FREE, price=0, status=S.CANCELLED, stripe=None), False, C.GRATUITO),
    (sub(status=S.CANCELLED), False, C.CANCELADA),
    (sub(status=S.EXPIRED), False, C.CANCELADA),
    (sub(status=S.SUSPENDED), False, C.SUSPENSA),
    (sub(stripe=None), False, C.SEM_COBRANCA),
])
def test_categoria(s, deleted, expected):
    assert billing_category(s, deleted) == expected


def test_mrr_so_de_pagante_e_potencial_so_de_teste():
    pagante, teste, bonus = sub(), sub(plan=PlanType.PREMIUM, price=99, trial=True), sub(bonus=True)
    assert effective_mrr(pagante, billing_category(pagante, False)) == 79.0
    assert effective_mrr(teste, billing_category(teste, False)) == 0.0
    assert potential_mrr(teste, billing_category(teste, False)) == 99.0
    assert effective_mrr(bonus, billing_category(bonus, False)) == 0.0
    assert potential_mrr(bonus, billing_category(bonus, False)) == 0.0
    assert effective_mrr(pagante, billing_category(pagante, True)) == 0.0
