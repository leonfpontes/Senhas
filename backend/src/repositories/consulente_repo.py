"""
T032: ConsulenteRepository - Consulente (person) data management
Handles lookup, upsert, and normalization of email/phone for deduplication
"""

from typing import Optional
from sqlalchemy import select, and_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import logging
import re

from src.models.consulentes import Consulente
from src.repositories.base import BaseRepository

logger = logging.getLogger(__name__)


class ConsulenteRepository(BaseRepository[Consulente]):
    """Multi-tenant repository for consulente management
    
    Normalizes email and phone for consistent lookup.
    Supports upsert pattern for idempotent ticket emission.
    """

    @staticmethod
    def normalize_email(email: str) -> str:
        """Normalize email for storage and lookup
        
        - Lowercase
        - Strip whitespace
        - Validate basic RFC format
        
        Args:
            email: Raw email address
            
        Returns:
            Normalized email
            
        Raises:
            ValueError: If email is invalid
        """
        normalized = email.lower().strip()

        # Basic RFC 5322 validation
        email_pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        if not re.match(email_pattern, normalized):
            raise ValueError(f"Invalid email format: {email}")

        return normalized

    @staticmethod
    def normalize_phone(phone: Optional[str]) -> Optional[str]:
        """Normalize phone for storage and lookup
        
        - Remove all non-digit characters except leading +
        - Validate E.164 format
        
        Args:
            phone: Raw phone number
            
        Returns:
            Normalized phone or None if not provided
            
        Raises:
            ValueError: If phone is invalid format
        """
        if not phone:
            return None

        # Keep + prefix and digits only
        normalized = re.sub(r"[^\d+]", "", phone.strip())

        # Basic E.164 validation (+ followed by 7-15 digits)
        if not re.match(r"^\+?[1-9]\d{6,14}$", normalized):
            raise ValueError(f"Invalid phone format: {phone}")

        # Ensure + prefix
        if not normalized.startswith("+"):
            normalized = f"+{normalized}"

        return normalized

    @staticmethod
    def normalize_optional_email(email: Optional[str]) -> Optional[str]:
        if not email:
            return None
        return ConsulenteRepository.normalize_email(email)

    async def get_by_email(
        self,
        session: AsyncSession,
        tenant_id: int,
        email: str,
    ) -> Optional[Consulente]:
        """Lookup consulente by normalized email
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID
            email: Email address (will be normalized)
            
        Returns:
            Consulente or None
            
        Raises:
            ValueError: If email is invalid format
        """
        normalized_email = self.normalize_email(email)

        # Excludes soft-deleted rows: a prior consulente who requested LGPD
        # erasure shouldn't be resurrected/matched by a new signup with the
        # same email. Migration 052 enforces uniqueness on this same shape
        # (tenant_id, email_normalized) among active rows — this query must
        # stay aligned with it. Historical data from before that migration
        # could still carry duplicates among active rows in tenants that
        # weren't caught by the backfill, so this stays defensive
        # (order_by + limit(2) + oldest-wins) rather than assuming
        # exactly-one-or-none.
        query = (
            select(Consulente)
            .where(
                and_(
                    Consulente.tenant_id == tenant_id,
                    Consulente.email_normalized == normalized_email,
                    Consulente.deleted_at.is_(None),
                )
            )
            .order_by(Consulente.created_at.asc())
            .limit(2)
        )
        result = await session.execute(query)
        rows = result.scalars().all()
        if len(rows) > 1:
            logger.warning(
                "Duplicate consulente rows for tenant_id=%s email=%s — using oldest (id=%s)",
                tenant_id, normalized_email, rows[0].id,
            )
        return rows[0] if rows else None

    async def get_by_id_with_audit(
        self,
        session: AsyncSession,
        tenant_id: int,
        consulente_id: int,
    ) -> Optional[Consulente]:
        """Fetch consulente with full context
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID
            consulente_id: Consulente ID
            
        Returns:
            Consulente with relations or None
        """
        query = (
            select(Consulente)
            .where(
                and_(
                    Consulente.tenant_id == tenant_id,
                    Consulente.id == consulente_id,
                )
            )
            .options(selectinload(Consulente.tenant))
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()

    async def create_consulente(
        self,
        session: AsyncSession,
        tenant_id: int,
        name: str,
        email: str,
        phone: Optional[str] = None,
    ) -> Consulente:
        """Create a new consulente
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID
            name: Consulente name
            email: Email address (will be normalized)
            phone: Phone number (optional, will be normalized)
            
        Returns:
            Created Consulente
            
        Raises:
            ValueError: If email/phone invalid format
        """
        email_normalized = self.normalize_email(email)
        phone_normalized = self.normalize_phone(phone)

        consulente = Consulente(
            tenant_id=tenant_id,
            nome=name,
            email=email,
            email_normalized=email_normalized,
            telefone=phone,
            phone_normalized=phone_normalized,
        )
        session.add(consulente)
        await session.flush()
        return consulente

    async def create_walk_in_consulente(
        self,
        session: AsyncSession,
        tenant_id: int,
        name: str,
        email: Optional[str] = None,
        phone: Optional[str] = None,
    ) -> Consulente:
        """Get-or-create a consulente for a walk-in flow where email is optional.

        When an email is provided, reuses the existing active consulente with
        that email (same dedup shape as upsert_consulente) — walk-ins for
        someone who already emitted a ticket online must not trip the
        uq_consulentes_tenant_email_active constraint from migration 052.
        """
        email_normalized = self.normalize_optional_email(email)
        phone_normalized = self.normalize_phone(phone)

        if email_normalized:
            existing = await self.get_by_email(session, tenant_id, email)
            if existing:
                if phone_normalized and existing.phone_normalized != phone_normalized:
                    existing.telefone = phone
                    existing.phone_normalized = phone_normalized
                    await session.flush()
                return existing

        consulente = Consulente(
            tenant_id=tenant_id,
            nome=name,
            email=email,
            email_normalized=email_normalized,
            telefone=phone,
            phone_normalized=phone_normalized,
        )
        session.add(consulente)
        try:
            await session.flush()
        except IntegrityError:
            # Concurrent walk-in/public emission with the same email won the
            # insert race — recover the winner instead of 500ing the door view.
            await session.rollback()
            if email_normalized:
                existing = await self.get_by_email(session, tenant_id, email)
                if existing:
                    return existing
            raise
        return consulente

    async def update_basic_info(
        self,
        session: AsyncSession,
        consulente: Consulente,
        name: str,
        email: Optional[str] = None,
        phone: Optional[str] = None,
    ) -> Consulente:
        """Update basic walk-in information with optional email/phone normalization."""
        consulente.nome = name
        consulente.email = email or None
        consulente.email_normalized = self.normalize_optional_email(email)
        consulente.telefone = phone or None
        consulente.phone_normalized = self.normalize_phone(phone)
        await session.flush()
        return consulente

    async def upsert_consulente(
        self,
        session: AsyncSession,
        tenant_id: int,
        name: str,
        email: str,
        phone: Optional[str] = None,
    ) -> tuple[Consulente, bool]:
        """Upsert consulente (get existing by email or create new)
        
        Supports idempotent ticket emission - same email returns same consulente.
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID
            name: Consulente name (used only on creation)
            email: Email address
            phone: Phone number (optional)
            
        Returns:
            Tuple of (Consulente, is_new) where is_new indicates if created
            
        Raises:
            ValueError: If email/phone invalid format
        """
        existing = await self.get_by_email(session, tenant_id, email)

        if existing:
            # Update phone if provided and different
            if phone:
                phone_normalized = self.normalize_phone(phone)
                if phone_normalized and existing.phone_normalized != phone_normalized:
                    existing.telefone = phone
                    existing.phone_normalized = phone_normalized
                    await session.flush()
            return (existing, False)

        # Create new. Two concurrent requests for the same not-yet-seen email
        # can both pass the get_by_email check above before either commits —
        # the unique index from migration 052 (tenant_id, email_normalized
        # among active rows) catches that race at the DB level. The loser
        # re-fetches instead of 500ing the consulente's own request.
        try:
            consulente = await self.create_consulente(session, tenant_id, name, email, phone)
            return (consulente, True)
        except IntegrityError:
            await session.rollback()
            existing = await self.get_by_email(session, tenant_id, email)
            if existing:
                return (existing, False)
            raise

    async def list_by_tenant(
        self,
        session: AsyncSession,
        tenant_id: int,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Consulente]:
        """List all consulentes for a tenant
        
        Args:
            session: Async DB session
            tenant_id: Tenant ID
            limit: Max results
            offset: Pagination offset
            
        Returns:
            List of Consulentes
        """
        query = (
            select(Consulente)
            .where(Consulente.tenant_id == tenant_id)
            .order_by(Consulente.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await session.execute(query)
        return result.scalars().all()
