"""Platform API - Consolidated audit logs endpoint (T108)."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Dict, List, Any
from uuid import UUID
from datetime import datetime

from src.core.database import get_db
from src.api.dependencies import get_current_user
from src.models import User, UserRole
from src.services.consolidated_audit_service import ConsolidatedAuditService

router = APIRouter(prefix="/api/v1/platform/audit-logs", tags=["platform-audit"])


class AuditSummaryResponse(BaseModel):
    """Audit summary response."""
    total: int
    by_tenant: Dict[str, int]
    by_action: Dict[str, int]
    by_user: Dict[str, int]
    period: dict
    statistics: dict


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
        
        return AuditSummaryResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar logs de auditoria: {str(e)}",
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
