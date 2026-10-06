"""Ativação de terreiros novos — visão do super-admin (Observatório).

Classifica cada cadastro recente num estágio do ciclo que gera valor:
criar gira → configurar senhas → receber senhas pelo link → usar a Porta.
Serve para priorizar contato pessoal com quem está travado (análise de
produção de 2026-10-05: os novos param entre criar a gira e receber a
primeira senha).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from src.core.onboarding import read_principal_dor

WINDOW_DAYS = 60
# Mesmo limiar do checklist do dashboard (FirstGiraChecklist.ACTIVATED_PUBLIC_TICKETS).
ACTIVATED_PUBLIC_TICKETS = 20

STAGES = ("sem_gira", "sem_senhas", "aguardando_senha", "recebendo", "usou_porta", "ativado")


def classify_stage(giras: int, giras_configuradas: int, public_tickets: int, door_used: bool) -> str:
    """Estágio de ativação. Ordem em STAGES, do mais travado ao ativado."""
    if public_tickets >= ACTIVATED_PUBLIC_TICKETS:
        return "ativado"
    if door_used:
        return "usou_porta"
    if public_tickets > 0:
        return "recebendo"
    if giras_configuradas > 0:
        return "aguardando_senha"
    if giras > 0:
        return "sem_senhas"
    return "sem_gira"


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    dt = _aware(dt)
    return dt.isoformat() if dt else None


def _onboarding_emails(custom_settings: Any) -> dict:
    if not isinstance(custom_settings, dict):
        return {}
    sent = custom_settings.get("onboarding_emails")
    return {k: v for k, v in sent.items() if k in ("d1", "d3")} if isinstance(sent, dict) else {}


async def get_activation(db, now: Optional[datetime] = None) -> dict[str, Any]:
    """Cadastros dos últimos WINDOW_DAYS dias com estágio, uso, trial e contato."""
    from sqlalchemy import and_, exists, func, or_, select

    from src.models import User, UserRole
    from src.models.audit_logs import AuditLog
    from src.models.giras import Gira
    from src.models.subscriptions import Subscription
    from src.models.tenant_config import TenantConfig
    from src.models.tenants import Tenant
    from src.models.tickets import Ticket
    from src.models.user_sessions import UserSession

    now = now or datetime.now(timezone.utc)

    def corr(stmt):
        return stmt.correlate(Tenant).scalar_subquery()

    giras = corr(select(func.count(Gira.id)).where(Gira.tenant_id == Tenant.id, Gira.deleted_at.is_(None)))
    giras_cfg = corr(
        select(func.count(Gira.id)).where(
            Gira.tenant_id == Tenant.id, Gira.deleted_at.is_(None), Gira.max_tickets > 0
        )
    )
    next_gira = corr(
        select(func.min(Gira.data_inicio)).where(
            Gira.tenant_id == Tenant.id, Gira.deleted_at.is_(None), Gira.data_inicio > now
        )
    )
    public_tickets = corr(
        select(func.count(Ticket.id)).where(
            Ticket.tenant_id == Tenant.id, Ticket.deleted_at.is_(None), Ticket.emitido_por_id.is_(None)
        )
    )
    door_used = (
        exists()
        .where(
            Ticket.tenant_id == Tenant.id,
            Ticket.deleted_at.is_(None),
            or_(Ticket.checkin_em.is_not(None), Ticket.chamado_em.is_not(None)),
        )
        .correlate(Tenant)
    )
    last_session = corr(select(func.max(UserSession.last_used_at)).where(UserSession.tenant_id == Tenant.id))
    # Ações da plataforma no terreiro (impersonação, troca de plano... — services/platform_audit.py)
    # não são atividade do terreiro.
    last_action = corr(
        select(func.max(AuditLog.created_at)).where(
            AuditLog.tenant_id == Tenant.id,
            or_(AuditLog.details.is_(None), ~AuditLog.details.has_key("platform_action")),
        )
    )
    custom_settings = corr(
        select(TenantConfig.custom_settings)
        .where(TenantConfig.tenant_id == Tenant.id, TenantConfig.deleted_at.is_(None))
        .limit(1)
    )

    stmt = (
        select(
            Tenant.id, Tenant.name, Tenant.slug, Tenant.created_at, Tenant.is_active, Tenant.self_deactivated_at,
            Subscription.plan, Subscription.is_trial, Subscription.trial_ends_at, Subscription.stripe_subscription_id,
            giras, giras_cfg, next_gira, public_tickets, door_used, last_session, last_action, custom_settings,
        )
        .outerjoin(Subscription, Subscription.tenant_id == Tenant.id)
        .where(Tenant.created_at >= now - timedelta(days=WINDOW_DAYS), Tenant.deleted_at.is_(None))
        .order_by(Tenant.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()

    # Contato principal: admin ativo mais antigo de cada tenant (uma consulta).
    contacts: dict[uuid.UUID, dict] = {}
    tenant_ids = [r[0] for r in rows]
    if tenant_ids:
        users = (
            await db.execute(
                select(User.tenant_id, User.full_name, User.username, User.email, User.phone)
                .where(
                    and_(
                        User.tenant_id.in_(tenant_ids),
                        User.role == UserRole.ADMIN,
                        User.is_active.is_(True),
                        User.deleted_at.is_(None),
                    )
                )
                .order_by(User.created_at.asc())
            )
        ).all()
        for u in users:
            contacts.setdefault(u[0], {"name": u[1] or u[2], "email": u[3], "phone": u[4]})

    tenants: list[dict[str, Any]] = []
    for r in rows:
        (tid, name, slug, created_at, is_active, self_deactivated_at,
         plan, is_trial, trial_ends_at, stripe_sub, n_giras, n_cfg, next_gira_at,
         n_public, used_door, last_sess, last_act, settings) = r
        created_at = _aware(created_at)
        last_activity = max([d for d in (_aware(last_sess), _aware(last_act)) if d], default=None)
        trial_end = _aware(trial_ends_at)
        n_giras, n_cfg, n_public = int(n_giras or 0), int(n_cfg or 0), int(n_public or 0)
        tenants.append({
            "tenant_id": str(tid),
            "tenant_name": name,
            "slug": slug,
            "created_at": _iso(created_at),
            "days_since_signup": (now - created_at).days if created_at else None,
            "inactive": (not is_active) or self_deactivated_at is not None,
            "plan": getattr(plan, "value", plan),
            "is_trial": bool(is_trial),
            "trial_ends_at": _iso(trial_end),
            "trial_days_left": (trial_end - now).days if (is_trial and trial_end) else None,
            "paying": bool(stripe_sub),
            "stage": classify_stage(n_giras, n_cfg, n_public, bool(used_door)),
            "giras": n_giras,
            "giras_configuradas": n_cfg,
            "next_gira_at": _iso(next_gira_at),
            "public_tickets": n_public,
            "door_used": bool(used_door),
            "principal_dor": read_principal_dor(settings),
            "onboarding_emails": _onboarding_emails(settings),
            "last_activity_at": _iso(last_activity),
            "days_since_activity": (now - last_activity).days if last_activity else None,
            "contact": contacts.get(tid),
        })

    summary = {stage: 0 for stage in STAGES}
    for t in tenants:
        summary[t["stage"]] += 1
    return {"window_days": WINDOW_DAYS, "total": len(tenants), "by_stage": summary, "tenants": tenants}
