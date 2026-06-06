from typing import Optional, List, Dict, Any  # noqa: F401
from uuid import UUID
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, outerjoin

from ..models import CursoPresencial, CursoParticipante, CursoParticipantePagamento
from ..models.mensalidades import MensalidadeStatus
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

    async def get_comprovante_inscricao(
        self,
        tenant_id: UUID,
        participante_id: UUID,
    ) -> Optional[CursoParticipante]:
        """Retorna o participante com os dados do comprovante de inscrição."""
        stmt = select(CursoParticipante).where(
            (CursoParticipante.id == participante_id)
            & (CursoParticipante.tenant_id == tenant_id)
            & (CursoParticipante.deleted_at.is_(None))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def delete_comprovante_inscricao(
        self,
        tenant_id: UUID,
        participante_id: UUID,
    ) -> Optional[CursoParticipante]:
        """Remove o comprovante de inscrição do participante."""
        part = await self.get_by_id(participante_id, tenant_id)
        if not part:
            return None
        part.comprovante_inscricao_data = None
        part.comprovante_inscricao_filename = None
        part.comprovante_inscricao_mime = None
        await self.db.flush()
        return part


class CursoParticipantePagamentoRepository(BaseRepository[CursoParticipantePagamento]):
    """Repositório para gerenciar os pagamentos mensais de alunos em cursos presenciais."""

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db, CursoParticipantePagamento)

    async def get_pagamento(
        self,
        tenant_id: UUID,
        participante_id: UUID,
        mes_referencia: date,
    ) -> Optional[CursoParticipantePagamento]:
        """Busca o pagamento existente de um participante para um mês específico."""
        stmt = select(CursoParticipantePagamento).where(
            and_(
                CursoParticipantePagamento.tenant_id == tenant_id,
                CursoParticipantePagamento.participante_id == participante_id,
                CursoParticipantePagamento.mes_referencia == mes_referencia,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def registrar_pagamento(
        self,
        tenant_id: UUID,
        participante_id: UUID,
        mes_referencia: date,
        status: MensalidadeStatus,
        registrado_por: UUID,
        valor_vigente: Optional[Decimal] = None,
        valor_pago: Optional[Decimal] = None,
        data_pagamento: Optional[datetime] = None,
        observacao: Optional[str] = None,
        comprovante_data: Optional[bytes] = None,
        comprovante_filename: Optional[str] = None,
        comprovante_mime: Optional[str] = None,
    ) -> CursoParticipantePagamento:
        """Cria ou atualiza (upsert) o registro de pagamento de um mês."""
        existing = await self.get_pagamento(tenant_id, participante_id, mes_referencia)
        if existing:
            existing.status = status
            existing.registrado_por = registrado_por
            existing.valor_vigente = valor_vigente
            existing.valor_pago = valor_pago
            existing.data_pagamento = data_pagamento
            existing.observacao = observacao
            existing.updated_at = datetime.now(timezone.utc)
            if comprovante_data is not None:
                existing.comprovante_data = comprovante_data
                existing.comprovante_filename = comprovante_filename
                existing.comprovante_mime = comprovante_mime
            await self.db.flush()
            await self.db.refresh(existing)
            return existing

        pagamento = CursoParticipantePagamento(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            participante_id=participante_id,
            mes_referencia=mes_referencia,
            status=status,
            registrado_por=registrado_por,
            valor_vigente=valor_vigente,
            valor_pago=valor_pago,
            data_pagamento=data_pagamento,
            observacao=observacao,
            comprovante_data=comprovante_data,
            comprovante_filename=comprovante_filename,
            comprovante_mime=comprovante_mime,
        )
        self.db.add(pagamento)
        await self.db.flush()
        await self.db.refresh(pagamento)
        return pagamento

    async def get_pagamento_by_id(
        self,
        tenant_id: UUID,
        pagamento_id: UUID,
    ) -> Optional[CursoParticipantePagamento]:
        """Busca um pagamento pelo ID respeitando o isolamento do tenant."""
        stmt = select(CursoParticipantePagamento).where(
            and_(
                CursoParticipantePagamento.id == pagamento_id,
                CursoParticipantePagamento.tenant_id == tenant_id,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def delete_comprovante(
        self,
        tenant_id: UUID,
        pagamento_id: UUID,
    ) -> Optional[CursoParticipantePagamento]:
        """Remove o anexo binário de comprovante mantendo o histórico de pagamento."""
        pag = await self.get_pagamento_by_id(tenant_id, pagamento_id)
        if not pag:
            return None
        pag.comprovante_data = None
        pag.comprovante_filename = None
        pag.comprovante_mime = None
        pag.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        await self.db.refresh(pag)
        return pag

    async def list_mes(
        self,
        tenant_id: UUID,
        curso_id: UUID,
        mes_referencia: date,
    ) -> List[Dict[str, Any]]:
        """Retorna todos os alunos matriculados ativos com seus status de pagamento para o mês."""
        pag_stmt = select(CursoParticipantePagamento).where(
            and_(
                CursoParticipantePagamento.tenant_id == tenant_id,
                CursoParticipantePagamento.mes_referencia == mes_referencia,
            )
        ).subquery()

        stmt = (
            select(
                CursoParticipante.id.label("participante_id"),
                CursoParticipante.nome.label("participante_nome"),
                CursoParticipante.email.label("email"),
                CursoParticipante.celular.label("celular"),
                CursoParticipante.data_nascimento.label("data_nascimento"),
                CursoParticipante.valor_mensalidade.label("valor_mensalidade"),
                pag_stmt.c.id.label("pagamento_id"),
                pag_stmt.c.status.label("status"),
                pag_stmt.c.data_pagamento.label("data_pagamento"),
                pag_stmt.c.valor_vigente.label("valor_vigente"),
                pag_stmt.c.valor_pago.label("valor_pago"),
                pag_stmt.c.comprovante_filename.label("comprovante_filename"),
                pag_stmt.c.observacao.label("observacao"),
            )
            .select_from(
                outerjoin(
                    CursoParticipante,
                    pag_stmt,
                    CursoParticipante.id == pag_stmt.c.participante_id,
                )
            )
            .where(
                and_(
                    CursoParticipante.tenant_id == tenant_id,
                    CursoParticipante.curso_id == curso_id,
                    CursoParticipante.deleted_at.is_(None),
                )
            )
            .order_by(CursoParticipante.nome)
        )
        result = await self.db.execute(stmt)
        rows = result.mappings().all()
        return [dict(r) for r in rows]

    async def get_resumo(
        self,
        tenant_id: UUID,
        curso_id: UUID,
        n_historico: int = 6,
        n_projecao: int = 3,
    ) -> Dict[str, Any]:
        """Retorna o resumo financeiro histórico e projeções do curso."""
        from dateutil.relativedelta import relativedelta

        today = date.today()

        # Soma das mensalidades ativas do curso
        sum_stmt = select(func.sum(CursoParticipante.valor_mensalidade)).where(
            and_(
                CursoParticipante.tenant_id == tenant_id,
                CursoParticipante.curso_id == curso_id,
                CursoParticipante.deleted_at.is_(None),
            )
        )
        sum_result = await self.db.execute(sum_stmt)
        faturamento_estimado_por_mes = sum_result.scalar() or Decimal("0.00")

        # Quantidade de participantes matriculados
        count_stmt = select(func.count(CursoParticipante.id)).where(
            and_(
                CursoParticipante.tenant_id == tenant_id,
                CursoParticipante.curso_id == curso_id,
                CursoParticipante.deleted_at.is_(None),
            )
        )
        count_ativos_result = await self.db.execute(count_stmt)
        count_ativos = count_ativos_result.scalar() or 0

        historico = []
        for i in range(n_historico - 1, -1, -1):
            mes_date = (today.replace(day=1) - relativedelta(months=i))
            mes_str = mes_date.strftime("%Y-%m")

            # Arrecadado do mês
            pag_stmt = select(func.sum(CursoParticipantePagamento.valor_pago)).join(
                CursoParticipante, CursoParticipante.id == CursoParticipantePagamento.participante_id
            ).where(
                and_(
                    CursoParticipantePagamento.tenant_id == tenant_id,
                    CursoParticipante.curso_id == curso_id,
                    CursoParticipantePagamento.mes_referencia == mes_date,
                    CursoParticipantePagamento.status == MensalidadeStatus.PAGO,
                )
            )
            pag_result = await self.db.execute(pag_stmt)
            arrecadado = pag_result.scalar() or Decimal("0.00")

            # Quantidade de inadimplentes
            inadim_stmt = select(func.count(CursoParticipante.id)).where(
                and_(
                    CursoParticipante.tenant_id == tenant_id,
                    CursoParticipante.curso_id == curso_id,
                    CursoParticipante.deleted_at.is_(None),
                    ~CursoParticipante.id.in_(
                        select(CursoParticipantePagamento.participante_id).where(
                           and_(
                               CursoParticipantePagamento.tenant_id == tenant_id,
                               CursoParticipantePagamento.mes_referencia == mes_date,
                               CursoParticipantePagamento.status.in_(
                                   [MensalidadeStatus.PAGO, MensalidadeStatus.ISENTO]
                               ),
                           )
                        )
                    ),
                )
            )
            inadim_result = await self.db.execute(inadim_stmt)
            inadimplentes = inadim_result.scalar() or 0

            historico.append(
                {
                    "mes": mes_str,
                    "esperado": float(faturamento_estimado_por_mes),
                    "arrecadado": float(arrecadado),
                    "inadimplentes": inadimplentes,
                }
            )

        # Projeção
        projecao_valor = float(faturamento_estimado_por_mes)
        projecao = []
        for i in range(1, n_projecao + 1):
            mes_date = today.replace(day=1) + relativedelta(months=i)
            projecao.append(
                {
                    "mes": mes_date.strftime("%Y-%m"),
                    "projetado": projecao_valor,
                }
            )

        return {
            "historico": historico,
            "projecao": projecao,
            "config": {
                "valor_mensal": float(faturamento_estimado_por_mes),
                "count_ativos": count_ativos,
            },
        }