"""Plan features and tiers definition to gate platform functionalities (T097)."""
from typing import Dict
from pydantic import BaseModel
from ..models.subscriptions import PlanType


# Plan hierarchy for feature gating (index = tier level)
_PLAN_TIER = {
    PlanType.FREE: 0,
    PlanType.BASIC: 1,
    PlanType.PRO: 2,
    PlanType.PREMIUM: 3,
}


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
    api_access: bool = False
    suporte_prioritario: bool = False
    mensalidade_mediun: bool = False
    mensalidade_associado: bool = False
    site_builder: bool = False


def _get_plan_features(plan: PlanType, suspended: bool = False) -> PlanFeatures:
    """Derive feature flags from plan tier.

    When suspended=True (payment failed), all features are locked regardless
    of the plan. The tenant retains only basic read access.
    """
    if suspended:
        return PlanFeatures()  # all False
    tier = _PLAN_TIER.get(plan, 0)
    return PlanFeatures(
        email_transacional=tier >= 2,
        tema_personalizado=tier >= 2,
        analytics_basico=tier >= 2,
        analytics_avancado=tier >= 2,
        associados=tier >= 2,
        export_csv=tier >= 2,
        bulk_operations=tier >= 1,
        auditoria=tier >= 2,
        estoque_controle=tier >= 2,
        mediuns=tier >= 1,
        relatorio_gira=tier >= 1,
        api_access=tier >= 3,
        suporte_prioritario=tier >= 3,
        mensalidade_mediun=tier >= 3,
        mensalidade_associado=tier >= 2,
        site_builder=tier >= 2,
    )
