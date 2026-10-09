"""Quem é pagante — regra única de receita da plataforma.

Antes, cada tela somava `monthly_price` de toda assinatura com status ACTIVE: terreiros em
teste, bonificados (clientes piloto) e até excluídos entravam no MRR. Em 2026-10-06 isso
mostrava R$ 475 de MRR na aba Assinaturas e R$ 376 no painel Hoje, com receita real de R$ 79.

Regra: **pagante** = assinatura ACTIVE, com assinatura no Stripe, que não está em teste, não é
bônus, não é do plano gratuito e cujo terreiro não foi excluído. Só pagante gera MRR. Todo o
resto ganha uma categoria visível para o operador decidir o que fazer.

PIX mês a mês ($-04): não há assinatura no Stripe — o mês PIX pago e ainda valendo
(`collection_method="pix_mensal"` com `current_period_end` no futuro) conta como pagante; vencido
(inclusive nos 3 dias de tolerância), cai em "sem cobrança" até pagar ou voltar ao gratuito.
"""

from __future__ import annotations

import enum
from typing import Any

from sqlalchemy import and_, func, or_

from src.models.subscriptions import PlanType, Subscription, SubscriptionStatus
from src.models.tenants import Tenant


class BillingCategory(str, enum.Enum):
    PAGANTE = "pagante"
    EM_TESTE = "em_teste"
    BONIFICADO = "bonificado"
    GRATUITO = "gratuito"
    SUSPENSA = "suspensa"
    CANCELADA = "cancelada"
    # Plano pago, ativo, sem teste nem bônus e sem assinatura no Stripe: ninguém cobra.
    SEM_COBRANCA = "sem_cobranca"
    EXCLUIDO = "excluido"


def billing_category(sub: Any, tenant_deleted: bool) -> BillingCategory:
    """Categoria de cobrança de uma assinatura (objeto `Subscription` ou equivalente)."""
    if tenant_deleted:
        return BillingCategory.EXCLUIDO
    if sub.status == SubscriptionStatus.SUSPENDED:
        return BillingCategory.SUSPENSA
    if sub.status in (SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED):
        # CANCELLED no FREE é o estado normal depois de reset_to_free.
        return BillingCategory.GRATUITO if sub.plan == PlanType.FREE else BillingCategory.CANCELADA
    if sub.is_bonus:
        return BillingCategory.BONIFICADO
    if sub.is_trial:
        return BillingCategory.EM_TESTE
    if sub.plan == PlanType.FREE:
        return BillingCategory.GRATUITO
    if sub.stripe_subscription_id:
        return BillingCategory.PAGANTE
    from .assinatura_pix import pix_mes_ativo  # import tardio: assinatura_pix importa repositórios

    if pix_mes_ativo(sub):
        return BillingCategory.PAGANTE
    return BillingCategory.SEM_COBRANCA


def effective_mrr(sub: Any, category: BillingCategory) -> float:
    """Receita mensal que a assinatura gera hoje: o preço, se pagante; senão zero."""
    return float(sub.monthly_price or 0.0) if category == BillingCategory.PAGANTE else 0.0


def potential_mrr(sub: Any, category: BillingCategory) -> float:
    """Quanto o terreiro em teste passa a gerar se assinar o plano que está testando."""
    return float(sub.monthly_price or 0.0) if category == BillingCategory.EM_TESTE else 0.0


def billing_fields(sub: Any, tenant_deleted: bool) -> dict:
    """Campos de cobrança prontos para resposta de API: categoria, MRR real e MRR potencial."""
    category = billing_category(sub, tenant_deleted)
    return {
        "billing_category": category.value,
        "mrr": effective_mrr(sub, category),
        "potential_mrr": potential_mrr(sub, category),
    }


def paying_clause():
    """Mesma regra de `billing_category(...) == PAGANTE`, como filtro SQL (exige join com Tenant)."""
    return and_(
        Subscription.status == SubscriptionStatus.ACTIVE,
        Subscription.is_trial.is_(False),
        Subscription.is_bonus.is_(False),
        Subscription.plan != PlanType.FREE,
        or_(
            Subscription.stripe_subscription_id.isnot(None),
            # PIX mês a mês ($-04): mês pago e ainda valendo.
            and_(
                Subscription.collection_method == "pix_mensal",
                Subscription.current_period_end > func.now(),
            ),
        ),
        Tenant.deleted_at.is_(None),
    )
