"""$-04 — PIX mês a mês: regras puras de período, lembrete, vencimento, acesso e métricas."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from src.models.subscriptions import PlanType, SubscriptionStatus
from src.services.assinatura_pix import (
    PIX_MENSAL_DIAS,
    lembrete_devido,
    novo_periodo,
    pix_expirado,
    pix_mes_ativo,
    pix_pago_ate,
    tolerancia_ate,
)
from src.services.billing_metrics import BillingCategory, billing_category
from src.services.plan_features import BLOCK_PIX_EXPIRED, get_effective_plan_features, subscription_block_reason

AGORA = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)


def _sub(**kw):
    base = dict(
        plan=PlanType.PRO, status=SubscriptionStatus.ACTIVE, is_trial=False, is_bonus=False,
        trial_ends_at=None, stripe_subscription_id=None, collection_method="pix_mensal",
        current_period_end=AGORA + timedelta(days=10), monthly_price=79.0,
    )
    base.update(kw)
    return SimpleNamespace(**base)


# ── período ──

def test_primeiro_pix_libera_30_dias_a_partir_de_agora():
    inicio, fim = novo_periodo(AGORA)
    assert inicio == AGORA
    assert fim == AGORA + timedelta(days=PIX_MENSAL_DIAS)


def test_pagar_antes_estende_a_partir_do_pago_ate():
    pago_ate = AGORA + timedelta(days=4)
    inicio, fim = novo_periodo(AGORA, pago_ate=pago_ate)
    assert inicio == pago_ate
    assert fim == pago_ate + timedelta(days=30)


def test_pagar_depois_do_vencimento_conta_de_agora():
    inicio, fim = novo_periodo(AGORA, pago_ate=AGORA - timedelta(days=2))
    assert (inicio, fim) == (AGORA, AGORA + timedelta(days=30))


def test_pagar_no_meio_do_teste_preserva_os_dias_gratis():
    fim_teste = AGORA + timedelta(days=12)
    inicio, fim = novo_periodo(AGORA, fim_teste=fim_teste)
    assert inicio == fim_teste
    assert fim == fim_teste + timedelta(days=30)


def test_datas_sem_fuso_sao_tratadas_como_utc():
    naive = (AGORA + timedelta(days=1)).replace(tzinfo=None)
    inicio, _ = novo_periodo(AGORA, pago_ate=naive)
    assert inicio == AGORA + timedelta(days=1)


# ── lembretes ──

def test_lembrete_por_faixa():
    assert lembrete_devido(7) is None
    assert lembrete_devido(6) is None
    assert lembrete_devido(5) == 5
    assert lembrete_devido(4) == 5  # rodada perdida: o de 5 dias sai no dia seguinte
    assert lembrete_devido(2) == 5
    assert lembrete_devido(1) == 1
    assert lembrete_devido(0) is None


# ── vigência / vencimento ──

def test_mes_ativo_tolerancia_e_expirado():
    sub = _sub(current_period_end=AGORA + timedelta(hours=1))
    assert pix_mes_ativo(sub, AGORA) and not pix_expirado(sub, AGORA)

    na_tolerancia = _sub(current_period_end=AGORA - timedelta(days=2))
    assert not pix_mes_ativo(na_tolerancia, AGORA)
    assert not pix_expirado(na_tolerancia, AGORA)
    assert tolerancia_ate(na_tolerancia.current_period_end) == AGORA + timedelta(days=1)

    vencido = _sub(current_period_end=AGORA - timedelta(days=3))
    assert pix_expirado(vencido, AGORA)


def test_cartao_boleto_e_cortesia_nao_sao_pix():
    assert pix_pago_ate(_sub(collection_method="charge_automatically")) is None
    assert pix_pago_ate(_sub(stripe_subscription_id="sub_1")) is None
    assert pix_pago_ate(_sub(is_bonus=True)) is None
    assert pix_pago_ate(None) is None


# ── acesso (plan_features) ──

def test_mes_vencido_alem_da_tolerancia_bloqueia_features_pagas():
    assert subscription_block_reason(_sub(), AGORA) is None
    assert subscription_block_reason(_sub(current_period_end=AGORA - timedelta(days=1)), AGORA) is None
    vencido = _sub(current_period_end=AGORA - timedelta(days=4))
    assert subscription_block_reason(vencido, AGORA) == BLOCK_PIX_EXPIRED
    assert get_effective_plan_features(vencido, AGORA).relatorio_gira is False


# ── métricas ──

def test_mes_pix_pago_e_pagante_vencido_nao():
    ativo = _sub(current_period_end=datetime.now(timezone.utc) + timedelta(days=3))
    assert billing_category(ativo, False) == BillingCategory.PAGANTE
    vencido = _sub(current_period_end=datetime.now(timezone.utc) - timedelta(hours=1))
    assert billing_category(vencido, False) == BillingCategory.SEM_COBRANCA
    # cartão sem mudança
    assert billing_category(_sub(collection_method=None, stripe_subscription_id="sub_1"), False) == BillingCategory.PAGANTE
