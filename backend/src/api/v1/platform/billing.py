"""Platform API - Billing invoices endpoint (T109)."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import datetime

from sqlalchemy import select, and_

from src.core.database import get_db
from src.api.dependencies import get_current_user
from src.models import User, UserRole, Invoice
from src.repositories.billing_repo import BillingRepository

router = APIRouter(prefix="/api/v1/platform/billing", tags=["platform-billing"])


class InvoiceResponse(BaseModel):
    """Invoice response."""
    id: str
    tenant_id: str
    invoice_number: str
    period_start: str
    period_end: str
    subtotal: float
    tax_amount: float
    discount_amount: float
    total_amount: float
    status: str
    paid_amount: float
    payment_method: Optional[str]
    due_date: str
    paid_at: Optional[str]
    created_at: str


class BillingStatisticsResponse(BaseModel):
    """Billing statistics response."""
    total_invoices: int
    paid_invoices: int
    total_revenue: float
    average_invoice_value: float


async def require_super_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency to require SUPER_ADMIN role."""
    if user.role != UserRole.SUPER_ADMIN or user.tenant_id is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas SUPER_ADMIN pode acessar esta operação",
        )
    return user


@router.get("/{tenant_id}/invoices", response_model=List[InvoiceResponse])
async def get_tenant_invoices(
    tenant_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> List[dict]:
    """Get invoices for tenant."""
    repo = BillingRepository(db)
    
    try:
        invoices = await repo.list_by_tenant(
            tenant_id=tenant_id,
            skip=skip,
            limit=limit,
        )
        
        return [
            InvoiceResponse(
                id=str(inv.id),
                tenant_id=str(inv.tenant_id),
                invoice_number=inv.invoice_number,
                period_start=inv.period_start.isoformat(),
                period_end=inv.period_end.isoformat(),
                subtotal=inv.subtotal,
                tax_amount=inv.tax_amount,
                discount_amount=inv.discount_amount,
                total_amount=inv.total_amount,
                status=inv.status.value,
                paid_amount=inv.paid_amount,
                payment_method=inv.payment_method,
                due_date=inv.due_date.isoformat(),
                paid_at=inv.paid_at.isoformat() if inv.paid_at else None,
                created_at=inv.created_at.isoformat(),
            )
            for inv in invoices
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar invoices: {str(e)}",
        )


@router.get("/{tenant_id}/invoice/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    tenant_id: UUID,
    invoice_id: UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get specific invoice."""
    repo = BillingRepository(db)
    
    try:
        stmt = select(Invoice).where(
            and_(Invoice.id == invoice_id, Invoice.tenant_id == tenant_id)
        )
        result = await db.execute(stmt)
        invoice = result.scalar_one_or_none()
        
        if not invoice:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invoice não encontrada",
            )
        
        return InvoiceResponse(
            id=str(invoice.id),
            tenant_id=str(invoice.tenant_id),
            invoice_number=invoice.invoice_number,
            period_start=invoice.period_start.isoformat(),
            period_end=invoice.period_end.isoformat(),
            subtotal=invoice.subtotal,
            tax_amount=invoice.tax_amount,
            discount_amount=invoice.discount_amount,
            total_amount=invoice.total_amount,
            status=invoice.status.value,
            paid_amount=invoice.paid_amount,
            payment_method=invoice.payment_method,
            due_date=invoice.due_date.isoformat(),
            paid_at=invoice.paid_at.isoformat() if invoice.paid_at else None,
            created_at=invoice.created_at.isoformat(),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar invoice: {str(e)}",
        )


@router.get("/statistics/summary", response_model=BillingStatisticsResponse)
async def get_billing_statistics(
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get platform-wide billing statistics."""
    repo = BillingRepository(db)
    
    try:
        # This is a simplified implementation
        # In production, these would be cached/materialized views
        
        total_revenue = await repo.total_revenue()
        
        # These would need additional queries to properly aggregate
        # For now, return basic statistics
        
        return BillingStatisticsResponse(
            total_invoices=0,  # Would query count
            paid_invoices=0,   # Would query count
            total_revenue=total_revenue,
            average_invoice_value=0.0,  # Would calculate
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar estatísticas: {str(e)}",
        )


@router.get("/{tenant_id}/statistics", response_model=dict)
async def get_tenant_billing_statistics(
    tenant_id: UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get billing statistics for tenant."""
    repo = BillingRepository(db)
    
    try:
        paid_count = await repo.count_paid(tenant_id)
        
        invoices = await repo.list_by_tenant(tenant_id, skip=0, limit=999999)
        
        total_amount = sum(invoice.total_amount for invoice in invoices)
        paid_amount = sum(invoice.paid_amount for invoice in invoices)
        
        avg_invoice = total_amount / len(invoices) if invoices else 0.0
        
        return {
            "tenant_id": str(tenant_id),
            "total_invoices": len(invoices),
            "paid_invoices": paid_count,
            "total_billed": total_amount,
            "total_paid": paid_amount,
            "outstanding": total_amount - paid_amount,
            "average_invoice_value": avg_invoice,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar estatísticas: {str(e)}",
        )
