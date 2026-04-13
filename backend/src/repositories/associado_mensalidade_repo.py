"""AssociadoMensalidadeRepository — monthly dues for associados (PRO+ feature).

Multi-tenant isolation: ALL methods receive tenant_id explicitly.
Before any insert/update, associado ownership is verified against tenant_id.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import and_, func, outerjoin, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.associados import Associado
from src.models.associado_mensalidade import AssociadoMensalidadePagamento
from src.models.mensalidades import MensalidadeConfig, MensalidadeStatus


class AssociadoMensalidadeRepository:
    """Multi-tenant repository for associado mensalidade operations."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ─── Config (shared with mediuns config) ─────────────────────────────────

    async def get_config(self, tenant_id: UUID) -> Optional[MensalidadeConfig]:
        stmt = select(MensalidadeConfig).where(MensalidadeConfig.tenant_id == tenant_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    # ─── List for a specific month ────────────────────────────────────────────

    async def list_mes(
        self,
        tenant_id: UUID,
        mes_referencia: date,
    ) -> List[Dict[str, Any]]:
        """Return all active associados for the tenant with their payment status for the month.

        Multi-tenant isolation: filters Associado.tenant_id == tenant_id explicitly.
        Performs LEFT JOIN so associados without a payment record appear with status=PENDENTE.
        """
        pag_stmt = select(AssociadoMensalidadePagamento).where(
            and_(
                AssociadoMensalidadePagamento.tenant_id == tenant_id,
                AssociadoMensalidadePagamento.mes_referencia == mes_referencia,
            )
        ).subquery()

        stmt = (
            select(
                Associado.id.label("associado_id"),
                Associado.nome.label("associado_nome"),
                Associado.mensalidade_isento.label("mensalidade_isento"),
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
                    Associado,
                    pag_stmt,
                    Associado.id == pag_stmt.c.associado_id,
                )
            )
            .where(
                and_(
                    Associado.tenant_id == tenant_id,
                    Associado.deleted_at.is_(None),
                )
            )
            .order_by(Associado.nome)
        )
        result = await self.db.execute(stmt)
        rows = result.mappings().all()
        return [dict(r) for r in rows]

    # ─── Register / update payment ────────────────────────────────────────────

    async def get_pagamento(
        self,
        tenant_id: UUID,
        associado_id: UUID,
        mes_referencia: date,
    ) -> Optional[AssociadoMensalidadePagamento]:
        stmt = select(AssociadoMensalidadePagamento).where(
            and_(
                AssociadoMensalidadePagamento.tenant_id == tenant_id,
                AssociadoMensalidadePagamento.associado_id == associado_id,
                AssociadoMensalidadePagamento.mes_referencia == mes_referencia,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_pagamento_by_id(
        self,
        tenant_id: UUID,
        pagamento_id: UUID,
    ) -> Optional[AssociadoMensalidadePagamento]:
        stmt = select(AssociadoMensalidadePagamento).where(
            and_(
                AssociadoMensalidadePagamento.id == pagamento_id,
                AssociadoMensalidadePagamento.tenant_id == tenant_id,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def registrar_pagamento(
        self,
        tenant_id: UUID,
        associado_id: UUID,
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
    ) -> AssociadoMensalidadePagamento:
        """Create or update a payment record (upsert).

        Multi-tenant: caller must have verified associado.tenant_id == tenant_id
        before calling this method (enforced in the API layer).
        """
        existing = await self.get_pagamento(tenant_id, associado_id, mes_referencia)
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

        pagamento = AssociadoMensalidadePagamento(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            associado_id=associado_id,
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

    async def delete_comprovante(
        self,
        tenant_id: UUID,
        pagamento_id: UUID,
    ) -> Optional[AssociadoMensalidadePagamento]:
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

    # ─── Resumo / chart data ──────────────────────────────────────────────────

    async def get_resumo(
        self,
        tenant_id: UUID,
        n_historico: int = 6,
        n_projecao: int = 3,
    ) -> Dict[str, Any]:
        """Return historical monthly summary + linear projection for associados."""
        from calendar import monthrange
        from dateutil.relativedelta import relativedelta

        today = date.today()
        config = await self.get_config(tenant_id)
        valor_mensal = config.valor_mensal_associado if config else Decimal("0.00")

        # Count active associados
        count_stmt = select(func.count(Associado.id)).where(
            and_(
                Associado.tenant_id == tenant_id,
                Associado.deleted_at.is_(None),
            )
        )
        count_ativos_result = await self.db.execute(count_stmt)
        count_ativos: int = count_ativos_result.scalar() or 0

        count_isentos_stmt = select(func.count(Associado.id)).where(
            and_(
                Associado.tenant_id == tenant_id,
                Associado.deleted_at.is_(None),
                Associado.mensalidade_isento.is_(True),
            )
        )
        count_isentos_result = await self.db.execute(count_isentos_stmt)
        count_isentos: int = count_isentos_result.scalar() or 0
        count_pagantes = count_ativos - count_isentos

        historico = []
        for i in range(n_historico - 1, -1, -1):
            mes_dt = today.replace(day=1) - relativedelta(months=i)
            mes_start = mes_dt.replace(day=1)
            _, last_day = monthrange(mes_dt.year, mes_dt.month)
            mes_end = mes_dt.replace(day=last_day)

            pag_stmt = (
                select(
                    func.count(AssociadoMensalidadePagamento.id).label("total"),
                    func.count(
                        AssociadoMensalidadePagamento.id
                    ).filter(
                        AssociadoMensalidadePagamento.status == MensalidadeStatus.PAGO
                    ).label("pagos"),
                )
                .where(
                    and_(
                        AssociadoMensalidadePagamento.tenant_id == tenant_id,
                        AssociadoMensalidadePagamento.mes_referencia >= mes_start,
                        AssociadoMensalidadePagamento.mes_referencia <= mes_end,
                    )
                )
            )
            pag_result = await self.db.execute(pag_stmt)
            pag_row = pag_result.mappings().one()

            esperado = float(valor_mensal) * count_pagantes
            arrecadado = float(valor_mensal) * int(pag_row["pagos"])
            inadimplentes = count_pagantes - int(pag_row["pagos"])

            historico.append({
                "mes": mes_dt.strftime("%Y-%m"),
                "esperado": round(esperado, 2),
                "arrecadado": round(arrecadado, 2),
                "inadimplentes": max(inadimplentes, 0),
            })

        projecao = []
        for i in range(1, n_projecao + 1):
            mes_dt = today.replace(day=1) + relativedelta(months=i)
            projecao.append({
                "mes": mes_dt.strftime("%Y-%m"),
                "projetado": round(float(valor_mensal) * count_pagantes, 2),
            })

        return {
            "historico": historico,
            "projecao": projecao,
            "config": {
                "valor_mensal": float(valor_mensal),
                "count_ativos": count_ativos,
                "count_isentos": count_isentos,
                "count_pagantes": count_pagantes,
            },
        }
