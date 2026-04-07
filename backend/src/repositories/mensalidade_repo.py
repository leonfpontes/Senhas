"""MensalidadeRepository — monthly dues management for médiuns (Premium feature)."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import and_, func, literal, outerjoin, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.mediuns import Medium
from src.models.mensalidades import MensalidadeConfig, MensalidadePagamento, MensalidadeStatus


class MensalidadeRepository:
    """Multi-tenant repository for mensalidade operations.

    All methods receive tenant_id explicitly — no operation touches data without it.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ─── Config ──────────────────────────────────────────────────────────────

    async def get_config(self, tenant_id: UUID) -> Optional[MensalidadeConfig]:
        """Return the tenant's mensalidade config, or None if not yet set up."""
        stmt = select(MensalidadeConfig).where(
            MensalidadeConfig.tenant_id == tenant_id
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def upsert_config(
        self,
        tenant_id: UUID,
        valor_mensal: Decimal,
        dia_vencimento: int,
    ) -> MensalidadeConfig:
        """Create or update the tenant's mensalidade config."""
        existing = await self.get_config(tenant_id)
        if existing:
            existing.valor_mensal = valor_mensal
            existing.dia_vencimento = dia_vencimento
            existing.updated_at = datetime.now(timezone.utc)
            await self.db.flush()
            await self.db.refresh(existing)
            return existing

        config = MensalidadeConfig(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            valor_mensal=valor_mensal,
            dia_vencimento=dia_vencimento,
        )
        self.db.add(config)
        await self.db.flush()
        await self.db.refresh(config)
        return config

    # ─── List for a specific month ────────────────────────────────────────────

    async def list_mes(
        self,
        tenant_id: UUID,
        mes_referencia: date,
    ) -> List[Dict[str, Any]]:
        """Return all active médiuns for the tenant with their payment status for the month.

        Performs a LEFT JOIN so médiuns without a payment record appear with status=PENDENTE.
        """
        # Subquery: pagamentos for this tenant+month
        pag_stmt = select(MensalidadePagamento).where(
            and_(
                MensalidadePagamento.tenant_id == tenant_id,
                MensalidadePagamento.mes_referencia == mes_referencia,
            )
        ).subquery()

        # LEFT JOIN mediuns → pagamentos
        stmt = (
            select(
                Medium.id.label("mediun_id"),
                Medium.nome.label("mediun_nome"),
                Medium.mensalidade_isento.label("mensalidade_isento"),
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
                    Medium,
                    pag_stmt,
                    Medium.id == pag_stmt.c.mediun_id,
                )
            )
            .where(
                and_(
                    Medium.tenant_id == tenant_id,
                    Medium.deleted_at.is_(None),
                    Medium.is_active.is_(True),
                )
            )
            .order_by(Medium.nome)
        )
        result = await self.db.execute(stmt)
        rows = result.mappings().all()
        return [dict(r) for r in rows]

    # ─── Register / update payment ────────────────────────────────────────────

    async def get_pagamento(
        self,
        tenant_id: UUID,
        mediun_id: UUID,
        mes_referencia: date,
    ) -> Optional[MensalidadePagamento]:
        """Fetch existing payment record for a médium + month."""
        stmt = select(MensalidadePagamento).where(
            and_(
                MensalidadePagamento.tenant_id == tenant_id,
                MensalidadePagamento.mediun_id == mediun_id,
                MensalidadePagamento.mes_referencia == mes_referencia,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def registrar_pagamento(
        self,
        tenant_id: UUID,
        mediun_id: UUID,
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
    ) -> MensalidadePagamento:
        """Create or update a payment record (upsert).

        valor_vigente is captured at call-time — NOT re-fetched later — to avoid
        retroactive calculation changes when the config's valor_mensal is updated.
        """
        existing = await self.get_pagamento(tenant_id, mediun_id, mes_referencia)
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

        pagamento = MensalidadePagamento(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            mediun_id=mediun_id,
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
    ) -> Optional[MensalidadePagamento]:
        """Fetch pagamento by id enforcing tenant isolation."""
        stmt = select(MensalidadePagamento).where(
            and_(
                MensalidadePagamento.id == pagamento_id,
                MensalidadePagamento.tenant_id == tenant_id,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def delete_comprovante(
        self,
        tenant_id: UUID,
        pagamento_id: UUID,
    ) -> Optional[MensalidadePagamento]:
        """Clear comprovante binary fields without deleting the payment record."""
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
        """Return historical monthly summary + linear projection.

        Returns:
            {
                "historico": [{"mes": "2026-01", "esperado": X, "arrecadado": Y, "inadimplentes": N}, ...],
                "projecao": [{"mes": "2026-07", "projetado": X}, ...],
                "config": {"valor_mensal": X, "count_ativos": N},
            }
        """
        from calendar import monthrange
        from dateutil.relativedelta import relativedelta

        today = date.today()
        config = await self.get_config(tenant_id)
        valor_mensal = config.valor_mensal if config else Decimal("0.00")

        # Count active médiuns + isentos
        count_stmt = select(func.count(Medium.id)).where(
            and_(
                Medium.tenant_id == tenant_id,
                Medium.deleted_at.is_(None),
                Medium.is_active.is_(True),
            )
        )
        count_ativos_result = await self.db.execute(count_stmt)
        count_ativos: int = count_ativos_result.scalar() or 0

        count_isentos_stmt = select(func.count(Medium.id)).where(
            and_(
                Medium.tenant_id == tenant_id,
                Medium.deleted_at.is_(None),
                Medium.is_active.is_(True),
                Medium.mensalidade_isento.is_(True),
            )
        )
        count_isentos_result = await self.db.execute(count_isentos_stmt)
        count_isentos: int = count_isentos_result.scalar() or 0

        count_pagantes = count_ativos - count_isentos

        # Count isentos for the current month: permanent flag + monthly ISENTO records
        current_mes = today.replace(day=1)
        perm_isento_ids = select(Medium.id.label("mid")).where(
            and_(
                Medium.tenant_id == tenant_id,
                Medium.deleted_at.is_(None),
                Medium.is_active.is_(True),
                Medium.mensalidade_isento.is_(True),
            )
        )
        monthly_isento_ids = select(MensalidadePagamento.mediun_id.label("mid")).where(
            and_(
                MensalidadePagamento.tenant_id == tenant_id,
                MensalidadePagamento.mes_referencia == current_mes,
                MensalidadePagamento.status == MensalidadeStatus.ISENTO,
            )
        )
        combined_isento = perm_isento_ids.union(monthly_isento_ids).subquery()
        count_isentos_mes_result = await self.db.execute(
            select(func.count()).select_from(combined_isento)
        )
        count_isentos_mes: int = count_isentos_mes_result.scalar() or 0

        # Build historical months
        historico = []
        for i in range(n_historico - 1, -1, -1):
            mes_date = (today.replace(day=1) - relativedelta(months=i))
            mes_str = mes_date.strftime("%Y-%m")

            esperado = valor_mensal * count_pagantes

            pag_stmt = select(
                func.count(MensalidadePagamento.id).label("total"),
                func.sum(MensalidadePagamento.valor_pago).label("arrecadado"),
            ).where(
                and_(
                    MensalidadePagamento.tenant_id == tenant_id,
                    MensalidadePagamento.mes_referencia == mes_date,
                    MensalidadePagamento.status == MensalidadeStatus.PAGO,
                )
            )
            pag_result = await self.db.execute(pag_stmt)
            row = pag_result.one()
            arrecadado = row.arrecadado or Decimal("0.00")

            inadim_stmt = select(func.count(Medium.id)).where(
                and_(
                    Medium.tenant_id == tenant_id,
                    Medium.deleted_at.is_(None),
                    Medium.is_active.is_(True),
                    Medium.mensalidade_isento.is_(False),
                    ~Medium.id.in_(
                        select(MensalidadePagamento.mediun_id).where(
                            and_(
                                MensalidadePagamento.tenant_id == tenant_id,
                                MensalidadePagamento.mes_referencia == mes_date,
                                MensalidadePagamento.status.in_(
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
                    "esperado": float(esperado),
                    "arrecadado": float(arrecadado),
                    "inadimplentes": inadimplentes,
                }
            )

        # Build projection
        projecao_valor = float(valor_mensal * count_pagantes)
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
                "valor_mensal": float(valor_mensal),
                "count_ativos": count_ativos,
                "count_isentos": count_isentos_mes,
                "count_pagantes": count_pagantes,
            },
        }
