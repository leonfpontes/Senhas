"""Platform API — Observatório de Tenants.

Agrega dados cross-tenant para o super-admin ter visibilidade do que está
acontecendo: próximas giras, cursos, features mais usadas e erros recentes.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.database import get_db
from src.api.v1.platform.dashboard import require_super_admin
from src.models import User, Tenant, Ticket, Subscription
from src.models.giras import Gira
from src.models.cursos_presenciais import CursoPresencial, CursoParticipante
from src.models.audit_logs import AuditLog
from src.services.error_alert_service import error_alert_service
from src.services.tenant_retention_service import get_at_risk_tenants

router = APIRouter(
    prefix="/api/v1/platform/tenant-observatory",
    tags=["platform-observatory"],
)

_BASE = settings.FRONTEND_URL.rstrip("/")

# Mapeamento legível de resource_type → label de feature
_FEATURE_LABELS: dict[str, str] = {
    "Ticket":          "Emissão de senhas",
    "Gira":            "Giras",
    "Consulente":      "Consulentes",
    "Medium":          "Médiuns",
    "Associado":       "Associados",
    "Mensalidade":     "Mensalidades",
    "CursoPresencial": "Cursos presenciais",
    "Estoque":         "Estoque",
    "User":            "Usuários",
    "Site":            "Sites",
}


async def _upcoming_giras(db: AsyncSession) -> list[dict]:
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=30)

    rows = await db.execute(
        select(
            Gira.id,
            Gira.nome,
            Gira.data_inicio,
            Gira.data_fim,
            Gira.max_tickets,
            Gira.release_start_at,
            Gira.release_end_at,
            Gira.is_active,
            Tenant.id.label("tenant_id"),
            Tenant.name.label("tenant_name"),
            Tenant.slug.label("tenant_slug"),
            func.count(Ticket.id).label("tickets_emitidos"),
        )
        .select_from(Gira)
        .join(Tenant, Tenant.id == Gira.tenant_id)
        .outerjoin(Ticket, and_(Ticket.gira_id == Gira.id, Ticket.deleted_at.is_(None)))
        .where(
            and_(
                Gira.deleted_at.is_(None),
                Tenant.deleted_at.is_(None),
                Gira.data_inicio >= now,
                Gira.data_inicio <= horizon,
            )
        )
        .group_by(
            Gira.id, Gira.nome, Gira.data_inicio, Gira.data_fim,
            Gira.max_tickets, Gira.release_start_at, Gira.release_end_at,
            Gira.is_active, Tenant.id, Tenant.name, Tenant.slug,
        )
        .order_by(Gira.data_inicio.asc())
        .limit(50)
    )

    result = []
    for r in rows:
        ocupacao_pct = None
        if r.max_tickets and r.max_tickets > 0:
            ocupacao_pct = round((r.tickets_emitidos / r.max_tickets) * 100)
        result.append({
            "id": str(r.id),
            "nome": r.nome,
            "data_inicio": r.data_inicio.isoformat(),
            "data_fim": r.data_fim.isoformat() if r.data_fim else None,
            "max_tickets": r.max_tickets,
            "tickets_emitidos": r.tickets_emitidos,
            "ocupacao_pct": ocupacao_pct,
            "release_start_at": r.release_start_at.isoformat() if r.release_start_at else None,
            "release_end_at": r.release_end_at.isoformat() if r.release_end_at else None,
            "is_active": r.is_active,
            "tenant_id": str(r.tenant_id),
            "tenant_name": r.tenant_name,
            "tenant_slug": r.tenant_slug,
            "public_link": f"{_BASE}/public/gira/{r.id}",
        })
    return result


async def _upcoming_cursos(db: AsyncSession) -> list[dict]:
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=60)

    rows = await db.execute(
        select(
            CursoPresencial.id,
            CursoPresencial.titulo,
            CursoPresencial.data_inicio,
            CursoPresencial.data_fim,
            CursoPresencial.max_participantes,
            CursoPresencial.local,
            CursoPresencial.is_active,
            CursoPresencial.gerar_mensalidade,
            Tenant.id.label("tenant_id"),
            Tenant.name.label("tenant_name"),
            Tenant.slug.label("tenant_slug"),
            func.count(CursoParticipante.id).label("inscritos"),
        )
        .select_from(CursoPresencial)
        .join(Tenant, Tenant.id == CursoPresencial.tenant_id)
        .outerjoin(
            CursoParticipante,
            and_(
                CursoParticipante.curso_id == CursoPresencial.id,
                CursoParticipante.deleted_at.is_(None),
            ),
        )
        .where(
            and_(
                CursoPresencial.deleted_at.is_(None),
                Tenant.deleted_at.is_(None),
                CursoPresencial.data_inicio >= now,
                CursoPresencial.data_inicio <= horizon,
            )
        )
        .group_by(
            CursoPresencial.id, CursoPresencial.titulo, CursoPresencial.data_inicio,
            CursoPresencial.data_fim, CursoPresencial.max_participantes,
            CursoPresencial.local, CursoPresencial.is_active,
            CursoPresencial.gerar_mensalidade,
            Tenant.id, Tenant.name, Tenant.slug,
        )
        .order_by(CursoPresencial.data_inicio.asc())
        .limit(50)
    )

    result = []
    for r in rows:
        ocupacao_pct = None
        if r.max_participantes and r.max_participantes > 0:
            ocupacao_pct = round((r.inscritos / r.max_participantes) * 100)
        result.append({
            "id": str(r.id),
            "titulo": r.titulo,
            "data_inicio": r.data_inicio.isoformat(),
            "data_fim": r.data_fim.isoformat() if r.data_fim else None,
            "max_participantes": r.max_participantes,
            "inscritos": r.inscritos,
            "ocupacao_pct": ocupacao_pct,
            "local": r.local,
            "is_active": r.is_active,
            "gerar_mensalidade": r.gerar_mensalidade,
            "tenant_id": str(r.tenant_id),
            "tenant_name": r.tenant_name,
            "tenant_slug": r.tenant_slug,
        })
    return result


async def _top_features(db: AsyncSession) -> list[dict]:
    """Top 5 features por tenant nos últimos 30 dias via AuditLog."""
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)

    rows = await db.execute(
        select(
            Tenant.id.label("tenant_id"),
            Tenant.name.label("tenant_name"),
            AuditLog.resource_type,
            func.count().label("uso"),
        )
        .select_from(AuditLog)
        .join(Tenant, Tenant.id == AuditLog.tenant_id)
        .where(
            and_(
                AuditLog.created_at >= thirty_days_ago,
                AuditLog.tenant_id.is_not(None),
                Tenant.deleted_at.is_(None),
                AuditLog.resource_type.in_(list(_FEATURE_LABELS.keys())),
            )
        )
        .group_by(Tenant.id, Tenant.name, AuditLog.resource_type)
        .order_by(Tenant.name.asc(), desc("uso"))
    )

    # Agrupa por tenant, pega top 5 features de cada
    tenants: dict[str, dict] = {}
    for r in rows:
        tid = str(r.tenant_id)
        if tid not in tenants:
            tenants[tid] = {
                "tenant_id": tid,
                "tenant_name": r.tenant_name,
                "features": [],
                "total_acoes": 0,
            }
        if len(tenants[tid]["features"]) < 5:
            tenants[tid]["features"].append({
                "resource_type": r.resource_type,
                "label": _FEATURE_LABELS.get(r.resource_type, r.resource_type),
                "uso": r.uso,
            })
        tenants[tid]["total_acoes"] += r.uso

    return sorted(tenants.values(), key=lambda t: t["total_acoes"], reverse=True)[:20]


def _errors_by_tenant(window_minutes: int) -> list[dict]:
    """Agrega erros recentes do monitor in-memory por tenant."""
    errors = error_alert_service.recent_errors(window_minutes)
    by_tenant: dict[str, dict] = {}
    for e in errors:
        key = e.tenant_id or "__anonymous__"
        if key not in by_tenant:
            by_tenant[key] = {
                "tenant_id": e.tenant_id,
                "total": 0,
                "endpoints": {},
            }
        by_tenant[key]["total"] += 1
        ep = f"{e.method} {e.path}"
        by_tenant[key]["endpoints"][ep] = by_tenant[key]["endpoints"].get(ep, 0) + 1

    result = []
    for data in by_tenant.values():
        top_endpoints = sorted(data["endpoints"].items(), key=lambda x: x[1], reverse=True)[:5]
        result.append({
            "tenant_id": data["tenant_id"],
            "total_erros": data["total"],
            "top_endpoints": [{"endpoint": ep, "count": c} for ep, c in top_endpoints],
        })
    return sorted(result, key=lambda x: x["total_erros"], reverse=True)


@router.get("")
async def get_tenant_observatory(
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    retention = await get_at_risk_tenants(db)
    upcoming_giras = await _upcoming_giras(db)
    upcoming_cursos = await _upcoming_cursos(db)
    top_features = await _top_features(db)
    errors = _errors_by_tenant(window_minutes=60)

    retention_summary = {
        "total_at_risk": len(retention),
        "mrr_at_risk": round(sum(t["mrr"] for t in retention), 2),
        "critico": sum(1 for t in retention if t["severity"] == "critico"),
        "risco": sum(1 for t in retention if t["severity"] == "risco"),
        "atencao": sum(1 for t in retention if t["severity"] == "atencao"),
    }

    return {
        "retention": retention,
        "retention_summary": retention_summary,
        "upcoming_giras": upcoming_giras,
        "upcoming_cursos": upcoming_cursos,
        "top_features_by_tenant": top_features,
        "errors_by_tenant": errors,
        "error_window_minutes": 60,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
