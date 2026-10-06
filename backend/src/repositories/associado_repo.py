"""AssociadoRepository - CRUD for tenant member management."""

from typing import Optional, List
from uuid import UUID
from sqlalchemy import select, and_, func, or_
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

    @staticmethod
    def normalize_telefone(telefone: Optional[str]) -> Optional[str]:
        """Telefone só com dígitos (igual aos médiuns; a tela aplica a máscara)."""
        if not telefone:
            return None
        digits = re.sub(r"\D", "", telefone)
        return digits or None

    async def create_associado(
        self,
        tenant_id: UUID,
        nome: str,
        email: str,
        telefone: Optional[str] = None,
        mensalidade_isento: bool = False,
    ) -> Associado:
        """Create a new associado with email normalization."""
        normalized = self.normalize_email(email)
        associado = Associado(
            tenant_id=tenant_id,
            nome=nome.strip(),
            email=email.strip(),
            email_normalized=normalized,
            telefone=self.normalize_telefone(telefone),
            mensalidade_isento=mensalidade_isento,
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
        mensalidade_isento: Optional[bool] = None,
    ) -> Associado:
        """Update associado fields. Pass telefone=None explicitly to clear it."""
        if nome is not None:
            associado.nome = nome.strip()
        if email is not None:
            associado.email = email.strip()
            associado.email_normalized = self.normalize_email(email)
        if telefone is not ...:
            associado.telefone = self.normalize_telefone(telefone)
        if mensalidade_isento is not None:
            associado.mensalidade_isento = mensalidade_isento
        await self.db.flush()
        await self.db.refresh(associado)
        return associado

    async def list_by_tenant(
        self,
        tenant_id: UUID,
        skip: int = 0,
        limit: int = 100,
        search: Optional[str] = None,
    ) -> List[Associado]:
        """List non-deleted associados for a tenant, ordered by name.

        ``search`` filtra por nome/e-mail (ILIKE) ou dígitos do telefone.
        """
        conditions = [
            Associado.tenant_id == tenant_id,
            Associado.deleted_at.is_(None),
        ]
        term = (search or "").strip()
        if term:
            like = f"%{term}%"
            filtros = [Associado.nome.ilike(like), Associado.email.ilike(like)]
            digits = re.sub(r"\D", "", term)
            if digits:
                filtros.append(Associado.telefone.ilike(f"%{digits}%"))
            conditions.append(or_(*filtros))
        stmt = (
            select(Associado)
            .where(and_(*conditions))
            .order_by(Associado.nome.asc(), Associado.id.asc())
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
