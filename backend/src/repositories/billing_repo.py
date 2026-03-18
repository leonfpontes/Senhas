"""BillingRepository - Invoice and charge management (T099)."""
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

from ..models import Invoice, InvoiceStatus
from .base import BaseRepository


class BillingRepository(BaseRepository[Invoice]):
    """Repository for Billing invoice management.
    
    Provides:
    - CRUD for invoices
    - Access by tenant_id
    - Filtering by status and date range
    - Invoice numbering
    - Payment tracking
    """
    
    def __init__(self, db: AsyncSession):
        super().__init__(db, Invoice)
    
    async def get_by_number(self, invoice_number: str) -> Optional[Invoice]:
        """Get invoice by invoice number.
        
        Args:
            invoice_number: Invoice number
            
        Returns:
            Invoice object or None
        """
        stmt = select(Invoice).where(Invoice.invoice_number == invoice_number)
        
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def list_by_tenant(
        self,
        tenant_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Invoice]:
        """Get invoices for a tenant.
        
        Args:
            tenant_id: Tenant ID
            skip: Pagination offset
            limit: Pagination limit
            
        Returns:
            List of invoices
        """
        stmt = select(Invoice).where(
            Invoice.tenant_id == tenant_id
        ).offset(skip).limit(limit).order_by(Invoice.period_start.desc())
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def list_by_status(
        self,
        status: InvoiceStatus,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Invoice]:
        """Get invoices by status (all tenants).
        
        Args:
            status: Invoice status
            skip: Pagination offset
            limit: Pagination limit
            
        Returns:
            List of invoices
        """
        stmt = select(Invoice).where(
            Invoice.status == status
        ).offset(skip).limit(limit).order_by(Invoice.period_start.desc())
        
        result = await self.db.execute(stmt)
        return result.scalars().all()
    
    async def create_invoice(
        self,
        tenant_id: UUID,
        invoice_number: str,
        period_start: datetime,
        period_end: datetime,
        subtotal: float,
        tax_amount: float = 0.0,
        discount_amount: float = 0.0,
        due_date: Optional[datetime] = None,
    ) -> Invoice:
        """Create new invoice.
        
        Args:
            tenant_id: Tenant ID
            invoice_number: Unique invoice number
            period_start: Billing period start
            period_end: Billing period end
            subtotal: Subtotal amount
            tax_amount: Tax amount
            discount_amount: Discount amount
            due_date: Payment due date
            
        Returns:
            Created Invoice
        """
        total_amount = subtotal + tax_amount - discount_amount
        
        if due_date is None:
            from datetime import timedelta
            due_date = period_end + timedelta(days=15)
        
        invoice = Invoice(
            tenant_id=tenant_id,
            invoice_number=invoice_number,
            period_start=period_start,
            period_end=period_end,
            subtotal=subtotal,
            tax_amount=tax_amount,
            discount_amount=discount_amount,
            total_amount=total_amount,
            status=InvoiceStatus.DRAFT,
            due_date=due_date,
        )
        
        self.db.add(invoice)
        await self.db.flush()
        await self.db.refresh(invoice)
        return invoice
    
    async def mark_as_paid(
        self,
        invoice_id: UUID,
        payment_method: str,
        payment_reference: Optional[str] = None,
        paid_amount: Optional[float] = None,
    ) -> Optional[Invoice]:
        """Mark invoice as paid.
        
        Args:
            invoice_id: Invoice ID
            payment_method: Payment method used
            payment_reference: Reference for payment tracking
            paid_amount: Amount paid (default: total_amount)
            
        Returns:
            Updated Invoice or None
        """
        stmt = select(Invoice).where(Invoice.id == invoice_id)
        
        result = await self.db.execute(stmt)
        invoice = result.scalar_one_or_none()
        
        if not invoice:
            return None
        
        invoice.status = InvoiceStatus.PAID
        invoice.payment_method = payment_method
        invoice.payment_reference = payment_reference
        invoice.paid_amount = paid_amount or invoice.total_amount
        invoice.paid_at = datetime.utcnow()
        
        await self.db.flush()
        await self.db.refresh(invoice)
        return invoice
    
    async def count_paid(self, tenant_id: UUID) -> int:
        """Count paid invoices for tenant.
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            Count of paid invoices
        """
        stmt = select(func.count()).select_from(Invoice).where(
            and_(
                Invoice.tenant_id == tenant_id,
                Invoice.status == InvoiceStatus.PAID,
            )
        )
        
        result = await self.db.execute(stmt)
        return result.scalar() or 0
    
    async def total_revenue(self) -> float:
        """Get total revenue from paid invoices (all tenants).
        
        Returns:
            Total revenue
        """
        stmt = select(func.sum(Invoice.paid_amount)).select_from(Invoice).where(
            Invoice.status == InvoiceStatus.PAID
        )
        
        result = await self.db.execute(stmt)
        return result.scalar() or 0.0
