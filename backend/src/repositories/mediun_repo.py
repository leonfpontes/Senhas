"""MediumRepository - CRUD for mediuns/cambones."""
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.mediuns import Medium
from src.repositories.base import BaseRepository


class MediumRepository(BaseRepository[Medium]):
    """Multi-tenant repository for medium/cambone management."""

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db, Medium)

    async def list(
        self,
        tenant_id: UUID,
        *,
        search: Optional[str] = None,
        only_atendimento: bool = False,
        include_inactive: bool = False,
    ) -> List[Medium]:
        """List mediuns for a tenant with optional filters."""
        conditions = [
            Medium.tenant_id == tenant_id,
            Medium.deleted_at.is_(None),
        ]
        if not include_inactive:
            conditions.append(Medium.is_active == True)  # noqa: E712
        if only_atendimento:
            conditions.append(Medium.is_atendimento == True)  # noqa: E712
        if search:
            conditions.append(Medium.nome.ilike(f"%{search}%"))

        stmt = select(Medium).where(and_(*conditions)).order_by(Medium.nome)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count(self, tenant_id: UUID) -> int:
        """Count active non-deleted mediuns for a tenant."""
        stmt = select(func.count(Medium.id)).where(
            and_(
                Medium.tenant_id == tenant_id,
                Medium.deleted_at.is_(None),
                Medium.is_active == True,  # noqa: E712
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def get(self, tenant_id: UUID, medium_id: UUID) -> Optional[Medium]:
        """Get a single medium by ID within tenant scope."""
        stmt = select(Medium).where(
            and_(
                Medium.id == medium_id,
                Medium.tenant_id == tenant_id,
                Medium.deleted_at.is_(None),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create(
        self,
        tenant_id: UUID,
        nome: str,
        is_atendimento: bool,
        *,
        telefone: Optional[str] = None,
        email: Optional[str] = None,
        data_nascimento=None,
        cep: Optional[str] = None,
        logradouro: Optional[str] = None,
        numero: Optional[str] = None,
        bairro: Optional[str] = None,
        cidade: Optional[str] = None,
        observacoes: Optional[str] = None,
    ) -> Medium:
        """Create a new medium."""
        medium = Medium(
            tenant_id=tenant_id,
            nome=nome.strip(),
            is_atendimento=is_atendimento,
            telefone=telefone,
            email=email,
            data_nascimento=data_nascimento,
            cep=cep,
            logradouro=logradouro,
            numero=numero,
            bairro=bairro,
            cidade=cidade,
            observacoes=observacoes,
        )
        self.db.add(medium)
        await self.db.flush()
        await self.db.refresh(medium)
        return medium
