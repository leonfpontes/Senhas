"""Billing model - invoices and charges (Phase 6 - T099)."""
from sqlalchemy import Column, String, ForeignKey, Boolean, Integer, Float, Index, Enum as SQLEnum, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
import uuid
import enum

from .base import TimestampedModel


class InvoiceStatus(str, enum.Enum):
    """Invoice status."""
    
    DRAFT = "draft"
    SENT = "sent"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class Invoice(TimestampedModel):
    """Billing invoice model.
    
    Tracks:
    - Monthly invoices for subscriptions
    - Payment status
    - Amount due
    - Payment method
    - Due date
    """
    
    __tablename__ = "invoices"
    __table_args__ = (
        Index("ix_invoices_tenant_id", "tenant_id"),
        Index("ix_invoices_status", "status"),
        Index("ix_invoices_period_start", "period_start"),
    )
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    
    # Invoice number
    invoice_number: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    
    # Billing period
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    
    # Amount
    subtotal: Mapped[float] = mapped_column(Float, nullable=False)
    tax_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    discount_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    
    # Status
    status: Mapped[InvoiceStatus] = mapped_column(
        SQLEnum(InvoiceStatus, name="invoice_status", create_constraint=False),
        default=InvoiceStatus.DRAFT,
        nullable=False,
    )
    
    # Payment
    paid_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)  # credit_card, bank_transfer, pix
    payment_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)  # For payment tracking
    
    # Dates
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="invoices")
    
    def __repr__(self) -> str:
        return f"<Invoice(invoice_number={self.invoice_number}, tenant_id={self.tenant_id}, status={self.status.value})>"
