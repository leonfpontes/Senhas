"""MediumRepository - CRUD for mediuns/cambones."""
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.mediuns import Medium
from src.repositories.base import BaseRepository

_TZ_BRT = ZoneInfo("America/Sao_Paulo")


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

    async def list_aniversariantes(
        self,
        tenant_id: UUID,
        dias: int = 7,
    ) -> List[Dict[str, Any]]:
        """List mediuns whose birthday falls within the next *dias* days (inclusive today).

        Days-until calculation uses America/Sao_Paulo timezone so server-side
        results are consistent regardless of the deploying region.
        Feb-29 birthdays are treated as Mar-01 in non-leap years.
        """
        today: date = datetime.now(_TZ_BRT).date()

        stmt = select(Medium).where(
            and_(
                Medium.tenant_id == tenant_id,
                Medium.deleted_at.is_(None),
                Medium.is_active == True,  # noqa: E712
                Medium.data_nascimento.is_not(None),
            )
        )
        result = await self.db.execute(stmt)
        mediuns = list(result.scalars().all())

        out: List[Dict[str, Any]] = []
        for m in mediuns:
            dn: date = m.data_nascimento  # type: ignore[assignment]
            try:
                bday = dn.replace(year=today.year)
            except ValueError:
                # Feb 29 in a non-leap year
                bday = date(today.year, 3, 1)
            if bday < today:
                try:
                    bday = dn.replace(year=today.year + 1)
                except ValueError:
                    bday = date(today.year + 1, 3, 1)
            days_until = (bday - today).days
            if 0 <= days_until <= dias:
                out.append(
                    {
                        "id": m.id,
                        "nome": m.nome,
                        "telefone": m.telefone,
                        "data_nascimento": m.data_nascimento,
                        "dias_ate_aniversario": days_until,
                    }
                )
        out.sort(key=lambda x: x["dias_ate_aniversario"])
        return out

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
