"""Single source of truth for "tenants at risk of churn" (super-admin views).

Used by both the platform dashboard alert badge and the Tenant Observatory
retention list — kept in one place so the two screens never disagree on
which tenants count as at risk.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

from sqlalchemy import select, func, and_, or_, case
from sqlalchemy.ext.asyncio import AsyncSession

from src.models import Tenant, Ticket, Subscription

GRACE_DAYS = 15  # tenants younger than this (or active more recently) aren't flagged


async def get_at_risk_tenants(db: AsyncSession) -> list[dict]:
    """Active tenants at risk of churn, ranked by days since their last ticket.

    Severity tiers: 15-29d = atenção, 30-59d = risco, 60d+ (or never emitted,
    past the grace period) = crítico. MRR is included so risk can be weighed
    against revenue impact, not just headcount.
    """
    now = datetime.now(timezone.utc)
    grace_cutoff = now - timedelta(days=GRACE_DAYS)
    d30 = now - timedelta(days=30)
    d60 = now - timedelta(days=60)

    ticket_stats = (
        select(
            Ticket.tenant_id.label("tenant_id"),
            func.max(Ticket.created_at).label("last_ticket_at"),
            func.count(case((Ticket.created_at >= d30, 1))).label("tickets_30d"),
            func.count(
                case((and_(Ticket.created_at < d30, Ticket.created_at >= d60), 1))
            ).label("tickets_prev_30d"),
        )
        .where(Ticket.deleted_at.is_(None))
        .group_by(Ticket.tenant_id)
        .subquery()
    )

    rows = await db.execute(
        select(
            Tenant.id,
            Tenant.name,
            Tenant.slug,
            Tenant.created_at,
            Subscription.plan,
            Subscription.monthly_price,
            ticket_stats.c.last_ticket_at,
            func.coalesce(ticket_stats.c.tickets_30d, 0).label("tickets_30d"),
            func.coalesce(ticket_stats.c.tickets_prev_30d, 0).label("tickets_prev_30d"),
        )
        .select_from(Tenant)
        .outerjoin(ticket_stats, ticket_stats.c.tenant_id == Tenant.id)
        .outerjoin(Subscription, Subscription.tenant_id == Tenant.id)
        .where(
            and_(
                Tenant.deleted_at.is_(None),
                Tenant.is_active.is_(True),
                Tenant.created_at < grace_cutoff,
                or_(
                    ticket_stats.c.last_ticket_at.is_(None),
                    ticket_stats.c.last_ticket_at < grace_cutoff,
                ),
            )
        )
    )

    result = []
    for r in rows:
        reference = r.last_ticket_at or r.created_at
        days_inactive = (now - reference).days
        if days_inactive >= 60:
            severity = "critico"
        elif days_inactive >= 30:
            severity = "risco"
        else:
            severity = "atencao"
        result.append({
            "tenant_id": str(r.id),
            "tenant_name": r.name,
            "tenant_slug": r.slug,
            "plan": r.plan.value if r.plan and hasattr(r.plan, "value") else r.plan,
            "mrr": float(r.monthly_price) if r.monthly_price else 0.0,
            "last_ticket_at": r.last_ticket_at.isoformat() if r.last_ticket_at else None,
            "never_emitted": r.last_ticket_at is None,
            "days_inactive": days_inactive,
            "tickets_30d": r.tickets_30d,
            "tickets_prev_30d": r.tickets_prev_30d,
            "severity": severity,
        })

    return sorted(result, key=lambda t: t["days_inactive"], reverse=True)
