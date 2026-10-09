"""MensalidadeContasService — syncs mensalidade events to contas_financeiras.

Responsibilities:
  1. sync_pagamento  — called after a mensalidade payment is registered.
     Creates or updates a ContaFinanceira (tipo=receber) for that person+month.
     ISENTO cancels the mirrored conta (if any) — the month is not owed.
  2. criar_conta_proxima_mensalidade — called after a new médium or associado
     is created. Creates a pending ContaFinanceira for the next month.
  3. cancelar_contas_futuras_pendentes — called when a médium/associado is
     inactivated, deleted or becomes permanently exempt. Cancels the pending
     contas of months after the reference date (signup creates next month's).

external_ref format:
  "mensalidade:{tipo}:{pessoa_id}:{YYYY-MM}"
  e.g. "mensalidade:mediun:uuid:2026-07"
       "mensalidade:associado:uuid:2026-07"

Contas with this prefix are a mirror of Mensalidades: the Lançamentos
endpoints refuse to edit, pay off or delete them (409, see
``is_conta_espelho_mensalidade``). Every change goes through Mensalidades.

"Hoje" is always the Brasília date (``today_local``) — the server runs in UTC.
"""
from __future__ import annotations

import calendar
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.tz import today_local
from src.models.contas_financeiras import ContaFinanceira

EXTERNAL_REF_PREFIX = "mensalidade:"

# Mensagem única do 409 quando alguém tenta mexer no espelho pelos Lançamentos.
MSG_CONTA_ESPELHO = (
    "Este lançamento é gerado pela Mensalidade e não pode ser alterado aqui. "
    "Registre o pagamento, a isenção ou a correção em Financeiro → Mensalidades."
)


# ── helpers ───────────────────────────────────────────────────────────────────

def is_conta_espelho_mensalidade(external_ref: Optional[str]) -> bool:
    """True quando a conta espelha uma mensalidade (somente leitura em Lançamentos)."""
    return isinstance(external_ref, str) and external_ref.startswith(EXTERNAL_REF_PREFIX)


def _make_ref(tipo: str, pessoa_id: UUID, mes_date: date) -> str:
    return f"mensalidade:{tipo}:{pessoa_id}:{mes_date.strftime('%Y-%m')}"


def _ref_prefix(tipo: str, pessoa_id: UUID) -> str:
    return f"mensalidade:{tipo}:{pessoa_id}:"


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

    cat_id = uuid.uuid4()
    cat = CategoriaFinanceira(
        id=cat_id,
        tenant_id=tenant_id,
        nome="Mensalidades",
        tipo="receber",
        cor="#1D9E75",
    )
    db.add(cat)
    return cat_id


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


def _to_decimal(v: Optional[Decimal]) -> Decimal:
    return Decimal(str(v)) if v else Decimal("0")


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
    valor: Optional[Decimal],    # valor vigente (esperado) do mês
    data_pagamento: Optional[datetime],
    dia_vencimento: int,
    criado_por: Optional[UUID],  # None = baixa automática do gateway (F-02), sem usuário
    valor_pago: Optional[Decimal] = None,  # valor efetivamente pago (formulário)
) -> None:
    """Create or update the ContaFinanceira that mirrors a mensalidade event.

    - PAGO: conta "pago" com ``valor_pago`` = valor informado no registro
      (sem ele, o valor vigente).
    - PENDENTE: conta "pendente" (ou "vencido" se o vencimento já passou).
    - ISENTO: o mês não é devido — a conta espelho, se existir, é cancelada
      (volta a valer se o mês for registrado de novo como pago/pendente).
    """
    ref = _make_ref(tipo_pessoa, pessoa_id, mes_date)
    conta = await _find_conta(db, tenant_id, ref)

    if status_mensalidade == "ISENTO":
        if conta is not None:
            conta.status = "cancelado"
            conta.data_pagamento = None
            conta.valor_pago = None
        return

    categoria_id = await _get_or_create_categoria(db, tenant_id)

    valor_dec = _to_decimal(valor)
    vencimento = _vencimento_for_mes(mes_date, dia_vencimento)
    mes_label = mes_date.strftime("%m/%Y")
    descricao = f"Mensalidade — {pessoa_nome} — {mes_label}"
    hoje = today_local()

    if status_mensalidade == "PAGO":
        conta_status = "pago"
        data_pag = data_pagamento.date() if data_pagamento else hoje
        pago_dec: Optional[Decimal] = (
            Decimal(str(valor_pago)) if valor_pago is not None else valor_dec
        )
        if valor_dec <= 0 and pago_dec:
            # Sem valor configurado: o esperado é o que foi pago.
            valor_dec = pago_dec
    else:
        conta_status = "vencido" if vencimento < hoje else "pendente"
        data_pag = None
        pago_dec = None

    if conta is None:
        conta = ContaFinanceira(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            tipo="receber",
            descricao=descricao,
            valor=valor_dec,
            data_vencimento=vencimento,
            status=conta_status,
            data_pagamento=data_pag,
            valor_pago=pago_dec,
            categoria_id=categoria_id,
            criado_por=criado_por,
            external_ref=ref,
        )
        db.add(conta)
    else:
        conta.descricao = descricao
        conta.valor = valor_dec
        conta.status = conta_status
        conta.data_pagamento = data_pag
        conta.valor_pago = pago_dec
        if categoria_id and not conta.categoria_id:
            conta.categoria_id = categoria_id


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

    next_mes = _next_month(today_local())
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


async def cancelar_contas_futuras_pendentes(
    *,
    db: AsyncSession,
    tenant_id: UUID,
    tipo_pessoa: str,            # "mediun" | "associado"
    pessoa_id: UUID,
    referencia: Optional[date] = None,
) -> int:
    """Cancel pending/overdue mirrored contas of months AFTER ``referencia``.

    ``referencia`` é a data de saída (inativação) ou hoje (exclusão/isenção);
    o mês dela continua devido, os seguintes não. Contas pagas ficam como
    estão. Devolve quantas contas foram canceladas.
    """
    ref_date = referencia or today_local()
    mes_limite = ref_date.strftime("%Y-%m")
    prefix = _ref_prefix(tipo_pessoa, pessoa_id)

    stmt = select(ContaFinanceira).where(
        ContaFinanceira.tenant_id == tenant_id,
        ContaFinanceira.external_ref.startswith(prefix, autoescape=True),
        ContaFinanceira.deleted_at.is_(None),
        ContaFinanceira.status.in_(["pendente", "vencido"]),
    )
    result = await db.execute(stmt)
    canceladas = 0
    for conta in result.scalars().all():
        mes_conta = (conta.external_ref or "")[len(prefix):]
        if mes_conta > mes_limite:
            conta.status = "cancelado"
            canceladas += 1
    return canceladas
