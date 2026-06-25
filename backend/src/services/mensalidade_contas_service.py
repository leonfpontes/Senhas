"""MensalidadeContasService — syncs mensalidade events to contas_financeiras.

Two responsibilities:
  1. sync_pagamento  — called after a mensalidade payment is registered.
     Creates or updates a ContaFinanceira (tipo=receber) for that person+month.
  2. criar_conta_proxima_mensalidade — called after a new médium or associado
     is created. Creates a pending ContaFinanceira for the next month.

external_ref format:
  "mensalidade:{tipo}:{pessoa_id}:{YYYY-MM}"
  e.g. "mensalidade:mediun:uuid:2026-07"
       "mensalidade:associado:uuid:2026-07"
"""
from __future__ import annotations

import calendar
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.contas_financeiras import ContaFinanceira


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_ref(tipo: str, pessoa_id: UUID, mes_date: date) -> str:
    return f"mensalidade:{tipo}:{pessoa_id}:{mes_date.strftime('%Y-%m')}"


def _vencimento_for_mes(mes_date: date, dia: int) -> date:
    """Return the due date for the given month, clamping day to last day of month."""
    last_day = calendar.monthrange(mes_date.year, mes_date.month)[1]
    return date(mes_date.year, mes_date.month, min(dia, last_day))


def _next_month(ref: date) -> date:
    """First day of the month following ref."""
    if ref.month == 12:
        return date(ref.year + 1, 1, 1)
    return date(ref.year, ref.month + 1, 1)


async def _get_or_create_categoria(
    db: AsyncSession,
    tenant_id: UUID,
) -> Optional[UUID]:
    """Find or create a 'Mensalidades' category for the tenant. Returns its id."""
    from src.models.contas_financeiras import CategoriaFinanceira

    stmt = select(CategoriaFinanceira).where(
        CategoriaFinanceira.tenant_id == tenant_id,
        CategoriaFinanceira.nome == "Mensalidades",
        CategoriaFinanceira.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    cat = result.scalar_one_or_none()
    if cat:
        return cat.id

    cat = CategoriaFinanceira(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        nome="Mensalidades",
        tipo="receber",
        cor="#1D9E75",
    )
    db.add(cat)
    await db.flush()
    return cat.id


async def _find_conta(
    db: AsyncSession,
    tenant_id: UUID,
    external_ref: str,
) -> Optional[ContaFinanceira]:
    stmt = select(ContaFinanceira).where(
        ContaFinanceira.tenant_id == tenant_id,
        ContaFinanceira.external_ref == external_ref,
        ContaFinanceira.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


# ── public API ────────────────────────────────────────────────────────────────

async def sync_pagamento(
    *,
    db: AsyncSession,
    tenant_id: UUID,
    tipo_pessoa: str,            # "mediun" | "associado"
    pessoa_id: UUID,
    pessoa_nome: str,
    mes_date: date,              # primeiro dia do mês de referência
    status_mensalidade: str,     # "PAGO" | "PENDENTE" | "ISENTO"
    valor: Optional[Decimal],
    data_pagamento: Optional[datetime],
    dia_vencimento: int,
    criado_por: UUID,
) -> None:
    """Create or update the ContaFinanceira that mirrors a mensalidade event."""

    if status_mensalidade == "ISENTO":
        return

    ref = _make_ref(tipo_pessoa, pessoa_id, mes_date)
    categoria_id = await _get_or_create_categoria(db, tenant_id)
    conta = await _find_conta(db, tenant_id, ref)

    valor_float = float(valor) if valor else 0.0
    vencimento = _vencimento_for_mes(mes_date, dia_vencimento)
    mes_label = mes_date.strftime("%m/%Y")
    descricao = f"Mensalidade — {pessoa_nome} — {mes_label}"

    if status_mensalidade == "PAGO":
        conta_status = "pago"
        data_pag = data_pagamento.date() if data_pagamento else date.today()
    else:
        conta_status = "pendente"
        data_pag = None
        if vencimento < date.today():
            conta_status = "vencido"

    if conta is None:
        conta = ContaFinanceira(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            tipo="receber",
            descricao=descricao,
            valor=Decimal(str(valor_float)),
            data_vencimento=vencimento,
            status=conta_status,
            data_pagamento=data_pag,
            valor_pago=Decimal(str(valor_float)) if conta_status == "pago" else None,
            categoria_id=categoria_id,
            criado_por=criado_por,
            external_ref=ref,
        )
        db.add(conta)
    else:
        conta.descricao = descricao
        conta.valor = Decimal(str(valor_float))
        conta.status = conta_status
        conta.data_pagamento = data_pag
        conta.valor_pago = Decimal(str(valor_float)) if conta_status == "pago" else conta.valor_pago
        if categoria_id and not conta.categoria_id:
            conta.categoria_id = categoria_id

    await db.flush()


async def criar_conta_proxima_mensalidade(
    *,
    db: AsyncSession,
    tenant_id: UUID,
    tipo_pessoa: str,            # "mediun" | "associado"
    pessoa_id: UUID,
    pessoa_nome: str,
    valor: Decimal,
    dia_vencimento: int,
    criado_por: UUID,
) -> None:
    """Create a pending ContaFinanceira for the next month after creation."""
    if valor <= 0:
        return

    next_mes = _next_month(date.today())
    ref = _make_ref(tipo_pessoa, pessoa_id, next_mes)

    existing = await _find_conta(db, tenant_id, ref)
    if existing:
        return

    categoria_id = await _get_or_create_categoria(db, tenant_id)
    vencimento = _vencimento_for_mes(next_mes, dia_vencimento)
    mes_label = next_mes.strftime("%m/%Y")
    descricao = f"Mensalidade — {pessoa_nome} — {mes_label}"

    conta = ContaFinanceira(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        tipo="receber",
        descricao=descricao,
        valor=valor,
        data_vencimento=vencimento,
        status="pendente",
        categoria_id=categoria_id,
        criado_por=criado_por,
        external_ref=ref,
    )
    db.add(conta)
    await db.flush()
