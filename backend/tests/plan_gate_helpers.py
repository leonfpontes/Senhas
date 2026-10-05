"""Helpers de teste para o gate de plano único (P-05).

`require_plan_feature(feature)` marca a dependency com `.plan_feature`; aqui
achamos essas dependencies num router/rota e as executamos com uma assinatura
falsa, sem precisar subir o app.
"""
from unittest.mock import AsyncMock, MagicMock, patch


def plan_gates(router, path: str | None = None, method: str = "GET") -> list:
    """Dependencies de plano do router (e da rota, se `path` for dado)."""
    deps = list(router.dependencies)
    if path is not None:
        full = router.prefix + path
        route = next(
            r for r in router.routes
            if getattr(r, "path", None) == full and method.upper() in getattr(r, "methods", set())
        )
        deps += list(route.dependencies)
    return [d.dependency for d in deps if hasattr(d.dependency, "plan_feature")]


def plan_gate_features(router, path: str | None = None, method: str = "GET") -> list[str]:
    return [g.plan_feature for g in plan_gates(router, path, method)]


def make_sub(plan, status=None, **extra):
    from src.models.subscriptions import SubscriptionStatus

    sub = MagicMock()
    sub.plan = plan
    sub.status = status or SubscriptionStatus.ACTIVE
    sub.is_trial = extra.pop("is_trial", False)
    sub.is_bonus = extra.pop("is_bonus", False)
    sub.trial_ends_at = extra.pop("trial_ends_at", None)
    sub.stripe_subscription_id = extra.pop("stripe_subscription_id", None)
    for k, v in extra.items():
        setattr(sub, k, v)
    return sub


def tenant_user(tenant_id=None):
    import uuid

    user = MagicMock()
    user.tenant_id = tenant_id or uuid.uuid4()
    return user


async def run_gate(gate, sub, user=None):
    """Executa a dependency de plano com `sub` como assinatura do tenant."""
    with patch("src.api.dependencies.SubscriptionRepository") as MockRepo:
        MockRepo.return_value.get_by_tenant = AsyncMock(return_value=sub)
        return await gate(user=user or tenant_user(), db=AsyncMock())
