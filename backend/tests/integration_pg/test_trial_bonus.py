"""Bônus concedido durante o trial local não é rebaixado pelo trial_scheduler."""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

from sqlalchemy import select, update

from src.models.subscriptions import PlanType, Subscription
from src.models.users import UserRole
from src.services.trial_scheduler import TrialScheduler

from .factories import create_tenant, create_user


async def _sub(tenant_id):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(select(Subscription).where(Subscription.tenant_id == tenant_id))).scalar_one()


async def _trial_vencido(db, tenant, bonus: bool):
    await db.execute(
        update(Subscription)
        .where(Subscription.tenant_id == tenant.id)
        .values(is_trial=True, is_bonus=bonus, trial_ends_at=datetime.now(timezone.utc) - timedelta(hours=1))
    )
    await db.commit()


def _scheduler():
    s = TrialScheduler()
    s._get_primary_contact = AsyncMock(return_value=None)  # sem e-mail no teste
    return s


async def test_trial_vencido_sem_bonus_volta_ao_gratuito(db):
    tenant = await create_tenant(db, plan=PlanType.PREMIUM)
    await _trial_vencido(db, tenant, bonus=False)

    await _scheduler()._process_trials_locked()

    assert (await _sub(tenant.id)).plan == PlanType.FREE


async def test_trial_vencido_com_bonus_mantem_o_plano(db):
    tenant = await create_tenant(db, plan=PlanType.PREMIUM)
    await _trial_vencido(db, tenant, bonus=True)

    await _scheduler()._process_trials_locked()

    assert (await _sub(tenant.id)).plan == PlanType.PREMIUM


async def test_conceder_bonus_encerra_o_trial(client, db):
    tenant = await create_tenant(db, plan=PlanType.PREMIUM)
    await _trial_vencido(db, tenant, bonus=False)
    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")

    resp = await client.patch(
        f"/api/v1/platform/subscriptions/{tenant.id}/bonus",
        headers=root.headers,
        json={"is_bonus": True, "plan": "premium"},
    )

    assert resp.status_code == 200, resp.text
    sub = await _sub(tenant.id)
    assert sub.is_bonus is True and sub.is_trial is False
    await _scheduler()._process_trials_locked()
    assert (await _sub(tenant.id)).plan == PlanType.PREMIUM
