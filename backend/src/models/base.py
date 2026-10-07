"""Base model class for all SQLAlchemy models."""
from sqlalchemy import Column, DateTime, String, func
from sqlalchemy.orm import declarative_base, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
from ..core.tz import utc_now

Base = declarative_base()


class TimestampedModel(Base):
    """Base model with timestamp tracking."""
    
    __abstract__ = True
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class SoftDeleteModel(TimestampedModel):
    """Base model with soft delete support (for LGPD compliance)."""
    
    __abstract__ = True
    
    def soft_delete(self) -> None:
        """Mark record as deleted without removing from database."""
        self.deleted_at = utc_now()
