"""Catálogo de features por plano e semântica única de acesso (T097 / P-05).

Este módulo é a ÚNICA fonte de verdade de:
- hierarquia de planos (`_PLAN_TIER` / `plan_tier()`);
- quais features cada plano libera (`PlanFeatures` / `_get_plan_features()`);
- quando o status da assinatura bloqueia o uso pago (`subscription_block_reason()`).

O gate HTTP fica em `src/api/dependencies.py::require_plan_feature`, que usa
estas funções. O frontend espelha o catálogo em `frontend/src/hooks/useSubscription.tsx`
(lê `features` de `GET /api/v1/admin/subscription`, calculado com
`get_effective_plan_features`, então UI e backend concordam sobre o status).

Semântica de status (P-05, 2026-10-05):
- ACTIVE → libera o que o plano inclui.
- SUSPENDED (pagamento falhou / suspensão manual) → bloqueia toda feature paga e
  a criação de recursos com limite numérico (usuários, giras, médiuns) → HTTP 402.
- CANCELLED / EXPIRED com plano pago → bloqueia features pagas (402). Com plano
  FREE é o estado normal depois de `reset_to_free()` (cancelamento/desativação):
  o tenant segue usando o FREE normalmente.
- Trial local (`is_trial` sem `stripe_subscription_id`) com `trial_ends_at` no
  passado → bloqueia features pagas (402) mesmo antes de o trial_scheduler
  (diário, 09:00 BRT) rebaixar para FREE. Trial com assinatura Stripe ("trialing")
  não é checado aqui: a Stripe é a fonte de verdade e o webhook converte (active)
  ou rebaixa (payment_failed) — o mesmo recorte que o trial_scheduler usa.
- `is_bonus` (cortesia concedida pela plataforma, sem cobrança): vale o plano
  concedido e o status normalmente (bônus suspenso perde acesso); não sofre o
  corte de fim de trial, porque o bônus é concessão deliberada e não tem prazo.
- `cancel_at_period_end`: o status continua ACTIVE até a Stripe mandar
  `customer.subscription.deleted` no fim do período pago; até lá o acesso continua.
  `current_period_end` não é checado localmente (a Stripe é a fonte de verdade).
"""
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel

from ..models.subscriptions import PlanType, SubscriptionStatus


# Hierarquia de planos (nível = índice). Único lugar do código — use plan_tier().
_PLAN_TIER = {
    PlanType.FREE: 0,
    PlanType.BASIC: 1,
    PlanType.PRO: 2,
    PlanType.PREMIUM: 3,
}


def plan_tier(plan: Optional[PlanType]) -> int:
    """Nível do plano (FREE=0 … PREMIUM=3). Plano desconhecido/None conta como FREE."""
    return _PLAN_TIER.get(plan, 0)


class PlanFeatures(BaseModel):
    """Which features are available for current plan."""
    email_transacional: bool = False
    tema_personalizado: bool = False
    analytics_basico: bool = False
    analytics_avancado: bool = False
    associados: bool = False
    export_csv: bool = False
    bulk_operations: bool = False
    auditoria: bool = False
    estoque_controle: bool = False
    mediuns: bool = False
    relatorio_gira: bool = False
    suporte_prioritario: bool = False
    mensalidade_mediun: bool = False
    mensalidade_associado: bool = False
    site_builder: bool = False
    contas_financeiras: bool = False
    fila_espera: bool = False
    agendamento_por_horario: bool = False


# Nomes válidos para require_plan_feature(feature) — erro na importação se houver typo.
PLAN_FEATURE_NAMES = frozenset(PlanFeatures.model_fields)


# Nível mínimo de cada feature (FREE=0, BASIC=1, PRO=2, PREMIUM=3).
#
# Reestruturação de planos de out/2026: controle de associados (e, junto, a
# mensalidade de associados), estoque, agendamento por horário, fila de espera
# e todo o controle financeiro (`contas_financeiras`: lançamentos, fluxo de
# caixa, categorias, contas bancárias, configuração) passaram de PRO para
# PREMIUM. A mensalidade de médiuns também é Premium (decisão do dono do
# produto, out/2026) — o espelho fica em
# `frontend/src/constants/plans.ts::FEATURE_MIN_PLAN`.
_PREMIUM = 3
_PRO = 2
_BASIC = 1
_FREE = 0

_FEATURE_MIN_TIER: dict[str, int] = {
    "email_transacional": _PRO,
    "tema_personalizado": _PRO,
    "analytics_basico": _PRO,
    "analytics_avancado": _PRO,
    "associados": _PREMIUM,
    "export_csv": _PRO,
    # Ações em lote valem em todos os planos (always-on desde 88dbc25; não é vendido).
    "bulk_operations": _FREE,
    "auditoria": _PRO,
    "estoque_controle": _PREMIUM,
    "mediuns": _BASIC,
    "relatorio_gira": _BASIC,
    "suporte_prioritario": _PREMIUM,
    "mensalidade_mediun": _PREMIUM,
    "mensalidade_associado": _PREMIUM,
    "site_builder": _PRO,
    "contas_financeiras": _PREMIUM,
    "fila_espera": _PREMIUM,
    "agendamento_por_horario": _PREMIUM,
}

# Toda feature do catálogo precisa de nível — erro na importação se faltar.
if set(_FEATURE_MIN_TIER) != set(PLAN_FEATURE_NAMES):  # pragma: no cover
    raise RuntimeError(
        f"_FEATURE_MIN_TIER diverge de PlanFeatures: {set(_FEATURE_MIN_TIER) ^ set(PLAN_FEATURE_NAMES)}"
    )


def feature_min_plan(feature: str) -> PlanType:
    """Plano mínimo que inclui a feature (para mensagens "a partir do plano X")."""
    tier = _FEATURE_MIN_TIER[feature]
    return next(p for p, t in _PLAN_TIER.items() if t == tier)


def _get_plan_features(plan: PlanType, suspended: bool = False) -> PlanFeatures:
    """Derive feature flags from plan tier (níveis em `_FEATURE_MIN_TIER`).

    When suspended=True (payment failed), all features are locked regardless
    of the plan. The tenant retains only basic read access. Para considerar o
    status completo da assinatura use `get_effective_plan_features(sub)`.
    """
    if suspended:
        return PlanFeatures()  # all False
    tier = plan_tier(plan)
    return PlanFeatures(**{name: tier >= min_tier for name, min_tier in _FEATURE_MIN_TIER.items()})


# ── Status da assinatura ────────────────────────────────────────────────────

BLOCK_SUSPENDED = "suspended"
BLOCK_INACTIVE = "inactive"
BLOCK_TRIAL_ENDED = "trial_ended"

BLOCK_MESSAGES = {
    BLOCK_SUSPENDED: (
        "Assinatura suspensa por falta de pagamento. "
        "Regularize sua assinatura para usar este recurso."
    ),
    BLOCK_INACTIVE: "Assinatura cancelada ou expirada. Assine novamente para usar este recurso.",
    BLOCK_TRIAL_ENDED: "Período de avaliação encerrado. Assine um plano para continuar usando este recurso.",
}


def subscription_block_reason(sub, now: Optional[datetime] = None) -> Optional[str]:
    """Motivo pelo qual o status da assinatura bloqueia o uso pago, ou None.

    Retorna BLOCK_SUSPENDED, BLOCK_INACTIVE ou BLOCK_TRIAL_ENDED. Tenant sem linha
    de assinatura é tratado como FREE ativo (None). Ver docstring do módulo.
    """
    if sub is None:
        return None
    if sub.status == SubscriptionStatus.SUSPENDED:
        return BLOCK_SUSPENDED
    if sub.status in (SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED):
        return None if sub.plan == PlanType.FREE else BLOCK_INACTIVE
    # `is True` / isinstance: atributo ausente (ou mock em teste) não liga o corte por engano.
    trial_ends_at = getattr(sub, "trial_ends_at", None)
    if (
        getattr(sub, "is_trial", False) is True
        and getattr(sub, "is_bonus", False) is not True
        and not isinstance(getattr(sub, "stripe_subscription_id", None), str)
        and isinstance(trial_ends_at, datetime)
    ):
        if trial_ends_at.tzinfo is None:
            trial_ends_at = trial_ends_at.replace(tzinfo=timezone.utc)
        if trial_ends_at <= (now or datetime.now(timezone.utc)):
            return BLOCK_TRIAL_ENDED
    return None


def get_effective_plan_features(sub, now: Optional[datetime] = None) -> PlanFeatures:
    """Features que o tenant pode usar AGORA: plano contratado × status da assinatura.

    Sem assinatura → FREE. Status que bloqueia (subscription_block_reason) → tudo False.
    """
    if sub is None:
        return _get_plan_features(PlanType.FREE)
    blocked = subscription_block_reason(sub, now) is not None
    return _get_plan_features(sub.plan, suspended=blocked)
