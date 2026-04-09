"""Platform API - Dashboard aggregates endpoint."""
from datetime import datetime, timezone, timedelta
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, and_, case
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.api.dependencies import get_current_user
from src.models import User, UserRole, Tenant, Ticket, Subscription, SubscriptionStatus
from src.models.giras import Gira
from src.models.subscriptions import PlanType

router = APIRouter(prefix="/api/v1/platform/dashboard", tags=["platform-dashboard"])


async def require_super_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency to require SUPER_ADMIN role."""
    if user.role != UserRole.SUPER_ADMIN or user.tenant_id is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas SUPER_ADMIN pode acessar esta operação",
        )
    return user


async def _tenant_counts(db: AsyncSession) -> dict:
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)

    result = await db.execute(
        select(
            func.count().label("total"),
            func.count(case((Tenant.is_active.is_(True), 1))).label("active"),
            func.count(case((Tenant.is_active.is_(False), 1))).label("inactive"),
            func.count(case((Tenant.created_at >= thirty_days_ago, 1))).label("new_30d"),
        ).where(Tenant.deleted_at.is_(None))
    )
    row = result.one()

    # Trial count via subscriptions
    trial_result = await db.execute(
        select(func.count()).select_from(Subscription).where(
            and_(
                Subscription.is_trial.is_(True),
                Subscription.status == SubscriptionStatus.ACTIVE,
            )
        )
    )
    trial_count = trial_result.scalar() or 0

    return {
        "total": row.total,
        "active": row.active,
        "inactive": row.inactive,
        "trial": trial_count,
        "new_30d": row.new_30d,
    }


async def _user_count(db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count()).select_from(User).where(
            and_(
                User.is_active.is_(True),
                User.role != UserRole.SUPER_ADMIN,
                User.deleted_at.is_(None),
            )
        )
    )
    return result.scalar() or 0


async def _ticket_counts(db: AsyncSession) -> dict:
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    result = await db.execute(
        select(
            func.count().label("total"),
            func.count(case((Ticket.created_at >= thirty_days_ago, 1))).label("last_30d"),
            func.count(case((Ticket.created_at >= seven_days_ago, 1))).label("last_7d"),
        ).where(Ticket.deleted_at.is_(None))
    )
    row = result.one()
    return {"total": row.total, "last_30d": row.last_30d, "last_7d": row.last_7d}


async def _mrr(db: AsyncSession) -> float:
    result = await db.execute(
        select(func.coalesce(func.sum(Subscription.monthly_price), 0.0)).where(
            Subscription.status == SubscriptionStatus.ACTIVE
        )
    )
    return float(result.scalar() or 0.0)


async def _plans_distribution(db: AsyncSession) -> list:
    result = await db.execute(
        select(Subscription.plan, func.count().label("count"))
        .where(Subscription.status == SubscriptionStatus.ACTIVE)
        .group_by(Subscription.plan)
    )
    return [{"plan": row.plan.value if hasattr(row.plan, "value") else row.plan, "count": row.count} for row in result]


async def _daily_tickets(db: AsyncSession) -> list:
    """Count tickets per day for the last 30 days."""
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    result = await db.execute(
        select(
            func.date(Ticket.created_at).label("date"),
            func.count().label("count"),
        )
        .where(
            and_(
                Ticket.created_at >= thirty_days_ago,
                Ticket.deleted_at.is_(None),
            )
        )
        .group_by(func.date(Ticket.created_at))
        .order_by(func.date(Ticket.created_at))
    )
    return [{"date": str(row.date), "count": row.count} for row in result]


async def _tenant_growth(db: AsyncSession) -> list:
    """Count new tenants per day for the last 90 days."""
    ninety_days_ago = datetime.now(timezone.utc) - timedelta(days=90)
    result = await db.execute(
        select(
            func.date(Tenant.created_at).label("date"),
            func.count().label("count"),
        )
        .where(
            and_(
                Tenant.created_at >= ninety_days_ago,
                Tenant.deleted_at.is_(None),
            )
        )
        .group_by(func.date(Tenant.created_at))
        .order_by(func.date(Tenant.created_at))
    )
    return [{"date": str(row.date), "count": row.count} for row in result]


async def _top_tenants(db: AsyncSession) -> list:
    """Top 5 tenants by ticket volume in the last 30 days."""
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    result = await db.execute(
        select(
            Tenant.id.label("id"),
            Tenant.name.label("name"),
            Subscription.plan.label("plan"),
            func.count(Ticket.id).label("tickets_30d"),
        )
        .select_from(Tenant)
        .outerjoin(Gira, Gira.tenant_id == Tenant.id)
        .outerjoin(
            Ticket,
            and_(Ticket.gira_id == Gira.id, Ticket.created_at >= thirty_days_ago, Ticket.deleted_at.is_(None)),
        )
        .outerjoin(Subscription, Subscription.tenant_id == Tenant.id)
        .where(Tenant.deleted_at.is_(None))
        .group_by(Tenant.id, Tenant.name, Subscription.plan)
        .order_by(func.count(Ticket.id).desc())
        .limit(5)
    )
    return [
        {
            "id": str(row.id),
            "name": row.name,
            "plan": row.plan.value if row.plan and hasattr(row.plan, "value") else row.plan,
            "tickets_30d": row.tickets_30d,
        }
        for row in result
    ]


@router.get("")
async def get_dashboard(
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return aggregated platform metrics for the super-admin dashboard."""
    # Sequential — asyncpg does not support concurrent ops on the same connection
    tenants = await _tenant_counts(db)
    user_count = await _user_count(db)
    tickets = await _ticket_counts(db)
    mrr = await _mrr(db)
    plans_dist = await _plans_distribution(db)
    daily_tickets = await _daily_tickets(db)
    tenant_growth = await _tenant_growth(db)
    top_tenants = await _top_tenants(db)

    return {
        "tenants": tenants,
        "user_count": user_count,
        "tickets": tickets,
        "mrr": mrr,
        "plans_distribution": plans_dist,
        "daily_tickets": daily_tickets,
        "tenant_growth": tenant_growth,
        "top_tenants": top_tenants,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
