"""Platform API - Billing invoices endpoint (T109)."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, List, Dict
from uuid import UUID
from datetime import datetime

from sqlalchemy import select, and_, func

from src.core.database import get_db
from src.api.dependencies import require_super_admin
from src.models import User, Invoice
from src.models.subscriptions import Subscription, PlanType, SubscriptionStatus
from src.models.tenants import Tenant
from src.models.users import User as UserModel, UserRole
from src.repositories.billing_repo import BillingRepository
from src.services.billing_metrics import (
    BillingCategory,
    billing_category,
    effective_mrr,
    potential_mrr,
)

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
    """Números de cobrança da plataforma (regra em services/billing_metrics.py).

    Terreiros excluídos não entram em nenhuma contagem além de `deleted_tenants`.
    """
    mrr: float  # só pagantes
    paying_tenants: int
    trial_tenants: int
    trial_potential_mrr: float  # quanto os terreiros em teste gerariam se assinassem
    bonus_tenants: int
    free_tenants: int
    suspended_tenants: int  # suspensas + canceladas
    unbilled_tenants: int  # plano pago ativo sem cobrança no Stripe
    deleted_tenants: int
    active_tenants: int  # assinaturas com status ativo em terreiros não excluídos (compatibilidade)
    plan_distribution: Dict[str, int]  # terreiros não excluídos


class SubscriptionListItem(BaseModel):
    """Subscription list item for billing overview."""
    tenant_id: str
    tenant_name: str
    tenant_slug: str
    plan: str
    status: str
    monthly_price: float
    mrr: float  # receita real: o preço só para pagantes
    potential_mrr: float  # preço do plano em teste (só para quem está em teste)
    category: BillingCategory
    tenant_deleted: bool
    current_users: int  # usuários ativos de verdade (o contador da tabela subscriptions não é mantido)
    max_users: int
    is_trial: bool
    is_bonus: bool
    cancel_at_period_end: bool
    current_period_end: Optional[str]
    trial_ends_at: Optional[str]
    stripe_customer_id: Optional[str]
    # $-04: "charge_automatically" (cartão) | "send_invoice" (boleto) | "pix_mensal" | None.
    collection_method: Optional[str] = None


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
    """Números de cobrança da plataforma: MRR só de pagantes; teste, bônus e excluídos à parte."""
    try:
        result = await db.execute(
            select(Subscription, Tenant.deleted_at).join(Tenant, Subscription.tenant_id == Tenant.id)
        )
        rows = result.all()

        counts = {c: 0 for c in BillingCategory}
        mrr = 0.0
        trial_potential = 0.0
        live = []
        for sub, deleted_at in rows:
            cat = billing_category(sub, deleted_at is not None)
            counts[cat] += 1
            mrr += effective_mrr(sub, cat)
            trial_potential += potential_mrr(sub, cat)
            if cat != BillingCategory.EXCLUIDO:
                live.append(sub)

        distribution: Dict[str, int] = {p.value: 0 for p in PlanType}
        for sub in live:
            distribution[sub.plan.value] = distribution.get(sub.plan.value, 0) + 1

        return BillingStatisticsResponse(
            mrr=round(mrr, 2),
            paying_tenants=counts[BillingCategory.PAGANTE],
            trial_tenants=counts[BillingCategory.EM_TESTE],
            trial_potential_mrr=round(trial_potential, 2),
            bonus_tenants=counts[BillingCategory.BONIFICADO],
            free_tenants=counts[BillingCategory.GRATUITO],
            suspended_tenants=counts[BillingCategory.SUSPENSA] + counts[BillingCategory.CANCELADA],
            unbilled_tenants=counts[BillingCategory.SEM_COBRANCA],
            deleted_tenants=counts[BillingCategory.EXCLUIDO],
            active_tenants=sum(1 for sub in live if sub.status == SubscriptionStatus.ACTIVE),
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
    include_deleted: bool = Query(False, description="Incluir terreiros excluídos (categoria 'excluido')"),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> List[dict]:
    """List all tenant subscriptions for billing overview."""
    try:
        users_count = (
            select(UserModel.tenant_id, func.count().label("n"))
            # Usuários do painel (contas `medium` da Área do Médium não contam — AM-02).
            .where(UserModel.deleted_at.is_(None), UserModel.is_active.is_(True), UserModel.role != UserRole.MEDIUM)
            .group_by(UserModel.tenant_id)
            .subquery()
        )
        stmt = (
            select(Subscription, Tenant.name, Tenant.slug, Tenant.deleted_at, func.coalesce(users_count.c.n, 0))
            .join(Tenant, Subscription.tenant_id == Tenant.id)
            .outerjoin(users_count, users_count.c.tenant_id == Subscription.tenant_id)
            .order_by(Subscription.monthly_price.desc(), Tenant.name)
            .offset(skip)
            .limit(limit)
        )
        if not include_deleted:
            stmt = stmt.where(Tenant.deleted_at.is_(None))
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
                mrr=effective_mrr(sub, cat),
                potential_mrr=potential_mrr(sub, cat),
                category=cat,
                tenant_deleted=deleted_at is not None,
                current_users=int(users or 0),
                max_users=sub.max_users,
                is_trial=sub.is_trial,
                is_bonus=sub.is_bonus,
                cancel_at_period_end=sub.cancel_at_period_end,
                current_period_end=sub.current_period_end.isoformat() if sub.current_period_end else None,
                trial_ends_at=sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
                stripe_customer_id=sub.stripe_customer_id,
                collection_method=sub.collection_method if isinstance(sub.collection_method, str) else None,
            )
            for sub, name, slug, deleted_at, users in rows
            for cat in (billing_category(sub, deleted_at is not None),)
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
