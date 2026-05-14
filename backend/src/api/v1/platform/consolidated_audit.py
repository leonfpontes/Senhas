"""Platform API - Consolidated audit logs endpoint (T108)."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
from uuid import UUID
from datetime import datetime

from src.core.database import get_db
from src.api.dependencies import get_current_user
from src.models import User, UserRole
from src.models.audit_logs import AuditLog, AuditAction
from src.models.tenants import Tenant
from src.services.consolidated_audit_service import ConsolidatedAuditService

# Alias to avoid collision with the `User` dependency
_User = User

router = APIRouter(prefix="/api/v1/platform/audit-logs", tags=["platform-audit"])


class AuditSummaryResponse(BaseModel):
    """Audit summary response."""
    total: int
    by_tenant: Dict[str, int]
    by_action: Dict[str, int]
    by_user: Dict[str, int]
    period: dict
    statistics: dict
    by_tenant_name: Dict[str, str] = {}
    by_tenant_slug: Dict[str, str] = {}


async def require_super_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency to require SUPER_ADMIN role."""
    if user.role != UserRole.SUPER_ADMIN or user.tenant_id is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas SUPER_ADMIN pode acessar esta operação",
        )
    return user


def _parse_datetime(date_str: str) -> datetime:
    """Parse datetime string."""
    try:
        # Support ISO format with or without time
        if "T" not in date_str:
            date_str += "T00:00:00Z"
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Data inválida. Use formato ISO: YYYY-MM-DD ou YYYY-MM-DDTHH:MM:SSZ",
        )


@router.get("", response_model=AuditSummaryResponse)
async def get_audit_logs(
    start_date: str = Query(..., description="Start date (ISO format: YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (ISO format: YYYY-MM-DD)"),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get consolidated audit logs for date range.
    
    Returns aggregated audit statistics across all tenants:
    - Total log count
    - Breakdown by tenant
    - Breakdown by action type
    - Breakdown by user
    - Statistical summaries
    """
    service = ConsolidatedAuditService(db)
    
    try:
        start = _parse_datetime(start_date)
        end = _parse_datetime(end_date)
        
        if start > end:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="start_date deve ser anterior a end_date",
            )
        
        result = await service.get_audit_summary(start, end)

        # Resolve all tenant UUIDs in by_tenant to {id: {name, slug}}
        tenant_ids = [
            UUID(tid) for tid in result.get("by_tenant", {}).keys()
            if tid and tid != "None"
        ]
        tenant_name_map: dict = {}
        tenant_slug_map: dict = {}
        if tenant_ids:
            tenant_rows = await db.execute(
                select(Tenant.id, Tenant.name, Tenant.slug).where(Tenant.id.in_(tenant_ids))
            )
            for t in tenant_rows.all():
                tenant_name_map[str(t[0])] = t[1]
                tenant_slug_map[str(t[0])] = t[2]

        result["by_tenant_name"] = tenant_name_map
        result["by_tenant_slug"] = tenant_slug_map

        # Resolve most_active_tenant UUID to name/slug
        most_active_id = result.get("statistics", {}).get("most_active_tenant")
        if most_active_id and most_active_id in tenant_name_map:
            result["statistics"]["most_active_tenant_name"] = tenant_name_map[most_active_id]
            result["statistics"]["most_active_tenant_slug"] = tenant_slug_map.get(most_active_id, "")
        elif most_active_id:
            tenant_row = await db.execute(
                select(Tenant.name, Tenant.slug).where(Tenant.id == UUID(most_active_id))
            )
            tenant_info = tenant_row.first()
            if tenant_info:
                result["statistics"]["most_active_tenant_name"] = tenant_info[0]
                result["statistics"]["most_active_tenant_slug"] = tenant_info[1]

        return AuditSummaryResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar logs de auditoria: {str(e)}",
        )


@router.get("/feed", response_model=List[dict])
async def get_audit_feed(
    start_date: str = Query(..., description="Start date (ISO format: YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (ISO format: YYYY-MM-DD)"),
    tenant_id: Optional[str] = Query(None, description="Filter by tenant UUID"),
    action: Optional[str] = Query(None, description="Filter by action (create, update, delete, login, ...)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> List[dict]:
    """Feed de logs reais cross-tenant com nome do tenant.

    Retorna entradas paginadas ordenadas por data desc.
    Cada entrada inclui tenant_name para exibição legível.
    """
    try:
        start = _parse_datetime(start_date)
        end = _parse_datetime(end_date)

        filters = [
            AuditLog.created_at >= start,
            AuditLog.created_at <= end,
        ]
        if tenant_id:
            try:
                filters.append(AuditLog.tenant_id == UUID(tenant_id))
            except ValueError:
                raise HTTPException(status_code=400, detail="tenant_id inválido")
        if action:
            try:
                filters.append(AuditLog.action == AuditAction(action))
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Ação inválida: {action}")

        # Join with Tenant and User to get human-readable names
        stmt = (
            select(
                AuditLog.id,
                AuditLog.tenant_id,
                AuditLog.user_id,
                AuditLog.action,
                AuditLog.resource_type,
                AuditLog.resource_id,
                AuditLog.details,
                AuditLog.created_at,
                Tenant.name.label("tenant_name"),
                Tenant.slug.label("tenant_slug"),
                _User.email.label("user_email"),
                _User.username.label("user_username"),
            )
            .outerjoin(Tenant, AuditLog.tenant_id == Tenant.id)
            .outerjoin(_User, AuditLog.user_id == _User.id)
            .where(and_(*filters))
            .order_by(AuditLog.created_at.desc())
            .offset(skip)
            .limit(limit)
        )

        result = await db.execute(stmt)
        rows = result.all()

        return [
            {
                "id": str(row.id),
                "tenant_id": str(row.tenant_id) if row.tenant_id else None,
                "tenant_name": row.tenant_name or "Platform",
                "tenant_slug": row.tenant_slug or "",
                "user_id": str(row.user_id) if row.user_id else None,
                "user_email": row.user_email,
                "user_username": row.user_username,
                "action": row.action.value,
                "resource_type": row.resource_type,
                "resource_id": str(row.resource_id) if row.resource_id else None,
                "details": row.details,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar feed de auditoria: {str(e)}",
        )


@router.get("/tenant/{tenant_id}", response_model=dict)
async def get_tenant_audit_logs(
    tenant_id: UUID,
    start_date: str = Query(..., description="Start date (ISO format: YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (ISO format: YYYY-MM-DD)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(1000, ge=1, le=10000),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get audit logs for specific tenant."""
    service = ConsolidatedAuditService(db)
    
    try:
        start = _parse_datetime(start_date)
        end = _parse_datetime(end_date)
        
        result = await service.get_tenant_activity(
            tenant_id, start, end, skip, limit
        )
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar logs do tenant: {str(e)}",
        )


@router.get("/user/{user_id}", response_model=dict)
async def get_user_audit_logs(
    user_id: UUID,
    start_date: str = Query(..., description="Start date (ISO format: YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (ISO format: YYYY-MM-DD)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(1000, ge=1, le=10000),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get audit logs for specific user across all tenants."""
    service = ConsolidatedAuditService(db)
    
    try:
        start = _parse_datetime(start_date)
        end = _parse_datetime(end_date)
        
        result = await service.get_user_activity(
            user_id, start, end, skip, limit
        )
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar logs do usuário: {str(e)}",
        )


@router.get("/trends/actions", response_model=dict)
async def get_action_trends(
    start_date: str = Query(..., description="Start date (ISO format: YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (ISO format: YYYY-MM-DD)"),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get action trends."""
    service = ConsolidatedAuditService(db)
    
    try:
        start = _parse_datetime(start_date)
        end = _parse_datetime(end_date)
        
        result = await service.get_action_trends(start, end)
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar trends: {str(e)}",
        )


@router.get("/trends/tenants", response_model=dict)
async def get_tenant_trends(
    start_date: str = Query(..., description="Start date (ISO format: YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (ISO format: YYYY-MM-DD)"),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get tenant trends."""
    service = ConsolidatedAuditService(db)
    
    try:
        start = _parse_datetime(start_date)
        end = _parse_datetime(end_date)
        
        result = await service.get_tenant_trends(start, end)
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar trends: {str(e)}",
        )


@router.post("/export", response_model=List[dict])
async def export_audit_logs(
    start_date: str = Query(..., description="Start date (ISO format: YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (ISO format: YYYY-MM-DD)"),
    format_type: str = Query("json", regex="^(json|csv)$"),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> List[dict]:
    """Export audit logs for archiving/compliance."""
    service = ConsolidatedAuditService(db)
    
    try:
        start = _parse_datetime(start_date)
        end = _parse_datetime(end_date)
        
        result = await service.export_audit_logs(start, end, format_type)
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao exportar logs: {str(e)}",
        )
