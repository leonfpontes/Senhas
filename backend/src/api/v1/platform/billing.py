"""Platform API - Billing invoices endpoint (T109)."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, List, Dict
from uuid import UUID
from datetime import datetime

from sqlalchemy import select, and_, func

from src.core.database import get_db
from src.api.dependencies import get_current_user
from src.models import User, UserRole, Invoice
from src.models.subscriptions import Subscription, PlanType, SubscriptionStatus
from src.models.tenants import Tenant
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
    active_tenants: int
    trial_tenants: int
    suspended_tenants: int
    mrr: float
    plan_distribution: Dict[str, int]


class SubscriptionListItem(BaseModel):
    """Subscription list item for billing overview."""
    tenant_id: str
    tenant_name: str
    tenant_slug: str
    plan: str
    status: str
    monthly_price: float
    current_users: int
    max_users: int
    is_trial: bool
    is_bonus: bool
    cancel_at_period_end: bool
    current_period_end: Optional[str]
    trial_ends_at: Optional[str]
    stripe_customer_id: Optional[str]


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
    """Get platform-wide billing statistics from subscriptions table."""
    try:
        result = await db.execute(select(Subscription))
        subs = result.scalars().all()

        active = [s for s in subs if s.status == SubscriptionStatus.ACTIVE]
        trial = [s for s in subs if s.is_trial and s.status == SubscriptionStatus.ACTIVE]
        suspended = [s for s in subs if s.status in (SubscriptionStatus.SUSPENDED, SubscriptionStatus.EXPIRED, SubscriptionStatus.CANCELLED)]
        mrr = sum(s.monthly_price for s in active)

        distribution: Dict[str, int] = {p.value: 0 for p in PlanType}
        for s in subs:
            distribution[s.plan.value] = distribution.get(s.plan.value, 0) + 1

        return BillingStatisticsResponse(
            active_tenants=len(active),
            trial_tenants=len(trial),
            suspended_tenants=len(suspended),
            mrr=mrr,
            plan_distribution=distribution,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar estatísticas: {str(e)}",
        )


@router.get("/subscriptions", response_model=List[SubscriptionListItem])
async def list_billing_subscriptions(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> List[dict]:
    """List all tenant subscriptions for billing overview."""
    try:
        stmt = (
            select(Subscription, Tenant.name, Tenant.slug)
            .join(Tenant, Subscription.tenant_id == Tenant.id)
            .offset(skip)
            .limit(limit)
            .order_by(Subscription.monthly_price.desc())
        )
        result = await db.execute(stmt)
        rows = result.all()

        return [
            SubscriptionListItem(
                tenant_id=str(sub.tenant_id),
                tenant_name=name,
                tenant_slug=slug,
                plan=sub.plan.value,
                status=sub.status.value,
                monthly_price=sub.monthly_price,
                current_users=sub.current_users,
                max_users=sub.max_users,
                is_trial=sub.is_trial,
                is_bonus=sub.is_bonus,
                cancel_at_period_end=sub.cancel_at_period_end,
                current_period_end=sub.current_period_end.isoformat() if sub.current_period_end else None,
                trial_ends_at=sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
                stripe_customer_id=sub.stripe_customer_id,
            )
            for sub, name, slug in rows
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao listar assinaturas: {str(e)}",
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
