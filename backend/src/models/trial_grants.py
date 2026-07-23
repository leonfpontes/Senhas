"""TrialGrant model - anti-abuse ledger for the 1-month Premium trial offer."""
from sqlalchemy import String, DateTime, Index, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from .base import Base


class TrialGrant(Base):
    """Records that a given document (CPF/CNPJ) or e-mail already used the
    signup trial, so it survives tenant hard-delete (see Tenant hard-delete
    support) and keeps blocking re-trials after the tenant is gone.

    documento_hash is a SHA-256 hex digest of the normalized (digits-only)
    CPF/CNPJ — never the raw document — since this table has no other
    purpose than an existence check.
    """

    __tablename__ = "trial_grants"
    __table_args__ = (
        Index("ix_trial_grants_documento_hash", "documento_hash", unique=True),
        Index("ix_trial_grants_email", "email", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    documento_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    # Informational only — intentionally not a ForeignKey, so this row
    # outlives the tenant if it's hard-deleted.
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<TrialGrant(tenant_id={self.tenant_id}, email='{self.email}')>"
