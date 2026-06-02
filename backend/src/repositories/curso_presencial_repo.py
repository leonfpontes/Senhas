"""Repository for presential courses management."""

from typing import Optional  # noqa: F401  # may be useful for future methods
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ..models import CursoPresencial, CursoParticipante
from .base import BaseRepository


class CursoPresencialRepository(BaseRepository[CursoPresencial]):
    """Repository for CursoPresencial management.

    This repository reuses BaseRepository for generic CRUD operations
    and adds a helper to count the number of current participants in a course.
    """

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db, CursoPresencial)

    async def create(self, tenant_id: UUID, **kwargs) -> CursoPresencial:
        """Create a new course and immediately flush/refresh it.

        Args:
            tenant_id: Tenant ID to scope the course.
            **kwargs: Additional fields (e.g. titulo, ementa, datas).

        Returns:
            The newly created CursoPresencial object.
        """
        curso = CursoPresencial(tenant_id=tenant_id, **kwargs)
        self.db.add(curso)
        await self.db.flush()
        await self.db.refresh(curso)
        return curso

    async def get_participant_count(self, curso_id: UUID, tenant_id: UUID) -> int:
        """Return the number of participants currently enrolled in a course.

        Soft‑deleted participants are ignored.

        Args:
            curso_id: ID of the course to count enrolments.
            tenant_id: Tenant ID to ensure isolation.

        Returns:
            Number of participants (int).
        """
        stmt = select(func.count(CursoParticipante.id)).where(
            (CursoParticipante.curso_id == curso_id)
            & (CursoParticipante.tenant_id == tenant_id)
            & (CursoParticipante.deleted_at.is_(None))
        )
        result = await self.db.execute(stmt)
        # scalar_one() returns None if no rows; coalesce to 0
        return result.scalar_one() or 0


class CursoParticipanteRepository(BaseRepository[CursoParticipante]):
    """Repository for CursoParticipante management.

    Extends BaseRepository with a method to list participants by course.
    """

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db, CursoParticipante)

    async def list_by_curso(
        self,
        curso_id: UUID,
        tenant_id: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> list[CursoParticipante]:
        """List participants of a specific course.

        Args:
            curso_id: ID of the course.
            tenant_id: Tenant ID to ensure isolation.
            skip: Number of records to skip (pagination).
            limit: Maximum number of records to return.

        Returns:
            A list of CursoParticipante objects associated with the course.
        """
        stmt = (
            select(CursoParticipante)
            .where(
                (CursoParticipante.curso_id == curso_id)
                & (CursoParticipante.tenant_id == tenant_id)
                & (CursoParticipante.deleted_at.is_(None))
            )
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()