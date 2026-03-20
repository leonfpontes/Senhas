"""AssociadoRepository - CRUD for tenant member management."""

from typing import Optional, List
from uuid import UUID
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
import re

from src.models.associados import Associado
from src.repositories.base import BaseRepository


class AssociadoRepository(BaseRepository[Associado]):
    """Multi-tenant repository for associado (member) management."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, Associado)

    @staticmethod
    def normalize_email(email: str) -> str:
        """Normalize email: lowercase + strip + basic RFC validation."""
        normalized = email.lower().strip()
        email_pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        if not re.match(email_pattern, normalized):
            raise ValueError(f"Formato de e-mail inválido: {email}")
        return normalized

    async def get_by_email(
        self,
        tenant_id: UUID,
        email: str,
    ) -> Optional[Associado]:
        """Lookup associado by normalized email within tenant."""
        normalized = self.normalize_email(email)
        stmt = select(Associado).where(
            and_(
                Associado.tenant_id == tenant_id,
                Associado.email_normalized == normalized,
                Associado.deleted_at.is_(None),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def email_exists(self, tenant_id: UUID, email: str) -> bool:
        """Check if a non-deleted associado with this email exists for the tenant."""
        normalized = self.normalize_email(email)
        stmt = select(func.count(Associado.id)).where(
            and_(
                Associado.tenant_id == tenant_id,
                Associado.email_normalized == normalized,
                Associado.deleted_at.is_(None),
            )
        )
        result = await self.db.execute(stmt)
        return (result.scalar() or 0) > 0

    async def create_associado(
        self,
        tenant_id: UUID,
        nome: str,
        email: str,
        telefone: Optional[str] = None,
    ) -> Associado:
        """Create a new associado with email normalization."""
        normalized = self.normalize_email(email)
        associado = Associado(
            tenant_id=tenant_id,
            nome=nome.strip(),
            email=email.strip(),
            email_normalized=normalized,
            telefone=telefone.strip() if telefone else None,
        )
        self.db.add(associado)
        await self.db.flush()
        await self.db.refresh(associado)
        return associado

    async def update_associado(
        self,
        associado: Associado,
        nome: Optional[str] = None,
        email: Optional[str] = None,
        telefone: Optional[str] = ...,
    ) -> Associado:
        """Update associado fields. Pass telefone=None explicitly to clear it."""
        if nome is not None:
            associado.nome = nome.strip()
        if email is not None:
            associado.email = email.strip()
            associado.email_normalized = self.normalize_email(email)
        if telefone is not ...:
            associado.telefone = telefone.strip() if telefone else None
        await self.db.flush()
        await self.db.refresh(associado)
        return associado

    async def list_by_tenant(
        self,
        tenant_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Associado]:
        """List non-deleted associados for a tenant, ordered by name."""
        stmt = (
            select(Associado)
            .where(
                and_(
                    Associado.tenant_id == tenant_id,
                    Associado.deleted_at.is_(None),
                )
            )
            .order_by(Associado.nome.asc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_by_tenant(self, tenant_id: UUID) -> int:
        """Count non-deleted associados for a tenant."""
        stmt = select(func.count(Associado.id)).where(
            and_(
                Associado.tenant_id == tenant_id,
                Associado.deleted_at.is_(None),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0
