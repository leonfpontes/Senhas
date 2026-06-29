"""EstoqueRepository — CRUD para grupos, itens e movimentações de estoque."""
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.estoque import (
    EstoqueGrupo,
    EstoqueItem,
    EstoqueMovimentacao,
    EstoqueMovimentacaoTipo,
)
from src.repositories.base import BaseRepository


class EstoqueGrupoRepository(BaseRepository[EstoqueGrupo]):
    """Repository de grupos/famílias de material."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, EstoqueGrupo)

    async def list_all(self, tenant_id: UUID) -> List[EstoqueGrupo]:
        stmt = (
            select(EstoqueGrupo)
            .where(
                and_(
                    EstoqueGrupo.tenant_id == tenant_id,
                    EstoqueGrupo.deleted_at.is_(None),
                )
            )
            .order_by(EstoqueGrupo.nome)
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def create_grupo(self, tenant_id: UUID, nome: str, descricao: Optional[str] = None) -> EstoqueGrupo:
        grupo = EstoqueGrupo(tenant_id=tenant_id, nome=nome.strip(), descricao=descricao)
        self.db.add(grupo)
        await self.db.flush()
        await self.db.refresh(grupo)
        return grupo

    async def update_grupo(
        self, grupo_id: UUID, tenant_id: UUID, nome: Optional[str] = None, descricao: Optional[str] = None
    ) -> Optional[EstoqueGrupo]:
        grupo = await self.get_by_id(grupo_id, tenant_id)
        if not grupo:
            return None
        if nome is not None:
            grupo.nome = nome.strip()
        if descricao is not None:
            grupo.descricao = descricao
        self.db.add(grupo)
        await self.db.flush()
        await self.db.refresh(grupo)
        return grupo

    async def delete_grupo(self, grupo_id: UUID, tenant_id: UUID) -> bool:
        grupo = await self.get_by_id(grupo_id, tenant_id)
        if not grupo:
            return False
        grupo.soft_delete()
        self.db.add(grupo)
        await self.db.flush()
        return True


class EstoqueItemRepository(BaseRepository[EstoqueItem]):
    """Repository de itens de estoque."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, EstoqueItem)

    async def list_all(
        self,
        tenant_id: UUID,
        grupo_id: Optional[UUID] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[EstoqueItem]:
        stmt = (
            select(EstoqueItem)
            .options(selectinload(EstoqueItem.grupo))
            .where(
                and_(
                    EstoqueItem.tenant_id == tenant_id,
                    EstoqueItem.deleted_at.is_(None),
                )
            )
        )
        if grupo_id:
            stmt = stmt.where(EstoqueItem.grupo_id == grupo_id)
        stmt = stmt.order_by(EstoqueItem.nome).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def get_with_grupo(self, item_id: UUID, tenant_id: UUID) -> Optional[EstoqueItem]:
        stmt = (
            select(EstoqueItem)
            .options(selectinload(EstoqueItem.grupo))
            .where(
                and_(
                    EstoqueItem.id == item_id,
                    EstoqueItem.tenant_id == tenant_id,
                    EstoqueItem.deleted_at.is_(None),
                )
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_saldo(self, item_id: UUID, tenant_id: UUID) -> int:
        """Calcula saldo atual: SUM(entradas) - SUM(saídas)."""
        stmt_entrada = select(func.coalesce(func.sum(EstoqueMovimentacao.quantidade), 0)).where(
            and_(
                EstoqueMovimentacao.item_id == item_id,
                EstoqueMovimentacao.tenant_id == tenant_id,
                EstoqueMovimentacao.tipo == EstoqueMovimentacaoTipo.ENTRADA,
            )
        )
        stmt_saida = select(func.coalesce(func.sum(EstoqueMovimentacao.quantidade), 0)).where(
            and_(
                EstoqueMovimentacao.item_id == item_id,
                EstoqueMovimentacao.tenant_id == tenant_id,
                EstoqueMovimentacao.tipo == EstoqueMovimentacaoTipo.SAIDA,
            )
        )
        entradas = (await self.db.execute(stmt_entrada)).scalar() or 0
        saidas = (await self.db.execute(stmt_saida)).scalar() or 0
        return int(entradas) - int(saidas)

    async def get_saldos_bulk(self, item_ids: list[UUID], tenant_id: UUID) -> dict[UUID, int]:
        """Calcula saldo de múltiplos itens em uma única query agregada."""
        if not item_ids:
            return {}
        stmt = (
            select(
                EstoqueMovimentacao.item_id,
                func.sum(
                    case(
                        (EstoqueMovimentacao.tipo == EstoqueMovimentacaoTipo.ENTRADA, EstoqueMovimentacao.quantidade),
                        else_=-EstoqueMovimentacao.quantidade,
                    )
                ).label("saldo"),
            )
            .where(
                and_(
                    EstoqueMovimentacao.tenant_id == tenant_id,
                    EstoqueMovimentacao.item_id.in_(item_ids),
                )
            )
            .group_by(EstoqueMovimentacao.item_id)
        )
        rows = (await self.db.execute(stmt)).all()
        return {row.item_id: int(row.saldo or 0) for row in rows}

    async def count_by_grupo(self, grupo_id: UUID, tenant_id: UUID) -> int:
        """Conta itens ativos pertencentes a um grupo."""
        stmt = select(func.count(EstoqueItem.id)).where(
            and_(
                EstoqueItem.grupo_id == grupo_id,
                EstoqueItem.tenant_id == tenant_id,
                EstoqueItem.deleted_at.is_(None),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def create_item(
        self,
        tenant_id: UUID,
        nome: str,
        grupo_id: Optional[UUID] = None,
        descricao: Optional[str] = None,
        unidade_medida: str = "UN",
        estoque_minimo: int = 0,
        custo_unitario: Optional[float] = None,
        observacoes: Optional[str] = None,
        foto_data: Optional[bytes] = None,
        foto_content_type: Optional[str] = None,
    ) -> EstoqueItem:
        item = EstoqueItem(
            tenant_id=tenant_id,
            nome=nome.strip(),
            grupo_id=grupo_id,
            descricao=descricao,
            unidade_medida=unidade_medida,
            estoque_minimo=estoque_minimo,
            custo_unitario=custo_unitario,
            observacoes=observacoes,
            foto_data=foto_data,
            foto_content_type=foto_content_type,
        )
        self.db.add(item)
        await self.db.flush()
        await self.db.refresh(item)
        return item

    async def update_item(self, item_id: UUID, tenant_id: UUID, **kwargs) -> Optional[EstoqueItem]:
        item = await self.get_by_id(item_id, tenant_id)
        if not item:
            return None
        for key, value in kwargs.items():
            if hasattr(item, key):
                setattr(item, key, value)
        self.db.add(item)
        await self.db.flush()
        await self.db.refresh(item)
        return item

    async def delete_item(self, item_id: UUID, tenant_id: UUID) -> bool:
        item = await self.get_by_id(item_id, tenant_id)
        if not item:
            return False
        item.soft_delete()
        self.db.add(item)
        await self.db.flush()
        return True


class EstoqueMovimentacaoRepository:
    """Repository de movimentações de estoque (imutável — somente criação e leitura)."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_movimentacao(
        self,
        tenant_id: UUID,
        item_id: UUID,
        tipo: EstoqueMovimentacaoTipo,
        quantidade: int,
        data_movimentacao: datetime,
        motivo: Optional[str] = None,
        requisitante: Optional[str] = None,
        usuario_id: Optional[UUID] = None,
    ) -> EstoqueMovimentacao:
        mov = EstoqueMovimentacao(
            tenant_id=tenant_id,
            item_id=item_id,
            tipo=tipo,
            quantidade=quantidade,
            data_movimentacao=data_movimentacao,
            motivo=motivo,
            requisitante=requisitante,
            usuario_id=usuario_id,
        )
        self.db.add(mov)
        await self.db.flush()
        await self.db.refresh(mov)
        return mov

    async def get_by_id(self, mov_id: UUID, tenant_id: UUID) -> Optional[EstoqueMovimentacao]:
        stmt = (
            select(EstoqueMovimentacao)
            .options(selectinload(EstoqueMovimentacao.item))
            .where(
                EstoqueMovimentacao.id == mov_id,
                EstoqueMovimentacao.tenant_id == tenant_id,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def update_movimentacao(
        self,
        mov_id: UUID,
        tenant_id: UUID,
        **kwargs,
    ) -> Optional[EstoqueMovimentacao]:
        stmt = select(EstoqueMovimentacao).where(
            EstoqueMovimentacao.id == mov_id,
            EstoqueMovimentacao.tenant_id == tenant_id,
        )
        result = await self.db.execute(stmt)
        mov = result.scalar_one_or_none()
        if not mov:
            return None
        for key, value in kwargs.items():
            if value is not None or key in ("motivo", "requisitante"):
                setattr(mov, key, value)
        await self.db.flush()
        await self.db.refresh(mov)
        return mov

    async def delete_movimentacao(self, mov_id: UUID, tenant_id: UUID) -> bool:
        stmt = select(EstoqueMovimentacao).where(
            EstoqueMovimentacao.id == mov_id,
            EstoqueMovimentacao.tenant_id == tenant_id,
        )
        result = await self.db.execute(stmt)
        mov = result.scalar_one_or_none()
        if not mov:
            return False
        await self.db.delete(mov)
        await self.db.flush()
        return True

    async def list_filtered(
        self,
        tenant_id: UUID,
        item_id: Optional[UUID] = None,
        tipo: Optional[EstoqueMovimentacaoTipo] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[EstoqueMovimentacao]:
        stmt = (
            select(EstoqueMovimentacao)
            .options(selectinload(EstoqueMovimentacao.item))
            .where(EstoqueMovimentacao.tenant_id == tenant_id)
        )
        if item_id:
            stmt = stmt.where(EstoqueMovimentacao.item_id == item_id)
        if tipo:
            stmt = stmt.where(EstoqueMovimentacao.tipo == tipo)
        if date_from:
            stmt = stmt.where(EstoqueMovimentacao.data_movimentacao >= date_from)
        if date_to:
            stmt = stmt.where(EstoqueMovimentacao.data_movimentacao <= date_to)
        if search:
            stmt = stmt.join(EstoqueItem, EstoqueMovimentacao.item_id == EstoqueItem.id)
            stmt = stmt.where(EstoqueItem.nome.ilike(f"%{search}%"))
        stmt = stmt.order_by(EstoqueMovimentacao.data_movimentacao.desc()).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def get_posicao_estoque(
        self,
        tenant_id: UUID,
        grupo_id: Optional[UUID] = None,
        search: Optional[str] = None,
    ) -> List[dict]:
        """Calcula saldo atual por item. Retorna lista de dicts com item + saldo."""
        # Busca todos os itens ativos do tenant
        stmt_itens = (
            select(EstoqueItem)
            .options(selectinload(EstoqueItem.grupo))
            .where(
                and_(
                    EstoqueItem.tenant_id == tenant_id,
                    EstoqueItem.deleted_at.is_(None),
                )
            )
        )
        if grupo_id:
            stmt_itens = stmt_itens.where(EstoqueItem.grupo_id == grupo_id)
        if search:
            stmt_itens = stmt_itens.where(EstoqueItem.nome.ilike(f"%{search}%"))
        stmt_itens = stmt_itens.order_by(EstoqueItem.nome)
        itens = (await self.db.execute(stmt_itens)).scalars().all()

        # Calcula saldo de cada item via subquery agregada
        stmt_saldos = (
            select(
                EstoqueMovimentacao.item_id,
                func.sum(
                    case(
                        (EstoqueMovimentacao.tipo == EstoqueMovimentacaoTipo.ENTRADA, EstoqueMovimentacao.quantidade),
                        else_=-EstoqueMovimentacao.quantidade,
                    )
                ).label("saldo"),
                func.max(EstoqueMovimentacao.data_movimentacao).label("ultima_mov"),
            )
            .where(EstoqueMovimentacao.tenant_id == tenant_id)
            .group_by(EstoqueMovimentacao.item_id)
        )
        saldo_rows = (await self.db.execute(stmt_saldos)).all()
        saldo_map = {row.item_id: (int(row.saldo or 0), row.ultima_mov) for row in saldo_rows}

        resultado = []
        for item in itens:
            saldo, ultima_mov = saldo_map.get(item.id, (0, None))
            resultado.append(
                {
                    "item": item,
                    "saldo": saldo,
                    "ultima_movimentacao": ultima_mov,
                }
            )
        return resultado
