"""Admin Financeiro — Contas a Pagar / Contas a Receber (PRO+ feature).

Routes:
  GET    /api/v1/admin/financeiro/contas                          — List entries
  POST   /api/v1/admin/financeiro/contas                          — Create entry
  GET    /api/v1/admin/financeiro/contas/resumo                   — Dashboard summary
  GET    /api/v1/admin/financeiro/contas/{id}                     — Get entry
  PUT    /api/v1/admin/financeiro/contas/{id}                     — Update entry
  DELETE /api/v1/admin/financeiro/contas/{id}                     — Soft-delete entry
  POST   /api/v1/admin/financeiro/contas/{id}/baixa               — Mark as paid
  GET    /api/v1/admin/financeiro/categorias                      — List categories
  POST   /api/v1/admin/financeiro/categorias                      — Create category
  DELETE /api/v1/admin/financeiro/categorias/{id}                 — Delete category
  GET    /api/v1/admin/financeiro/contas-bancarias                — List bank accounts
  POST   /api/v1/admin/financeiro/contas-bancarias                — Create bank account
  DELETE /api/v1/admin/financeiro/contas-bancarias/{id}           — Delete bank account
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.api.dependencies import get_current_user, require_group_permission
from src.core.database import get_db
from src.models import User, PermissionFeature
from src.models.contas_financeiras import (
    CategoriaFinanceira,
    ContaBancaria,
    ContaFinanceira,
)
from src.models.subscriptions import PlanType
from src.repositories.subscription_repo import SubscriptionRepository
from src.services.audit_service import AuditService

router = APIRouter(prefix="/api/v1/admin/financeiro", tags=["admin-contas-financeiras"])

_PRO_OR_PREMIUM = {PlanType.PRO, PlanType.PREMIUM}


# ── Plan guard ────────────────────────────────────────────────────────────────

async def _require_pro_or_premium(current_user: User, db: AsyncSession) -> None:
    sub_repo = SubscriptionRepository(db)
    sub = await sub_repo.get_by_tenant(current_user.tenant_id)
    plan = sub.plan if sub else PlanType.FREE
    if plan not in _PRO_OR_PREMIUM:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Contas a Pagar/Receber está disponível nos planos Pro e Premium.",
        )


# ── Schemas ───────────────────────────────────────────────────────────────────

class CategoriaOut(BaseModel):
    id: UUID
    nome: str
    tipo: str
    cor: Optional[str]
    ativo: bool

    class Config:
        from_attributes = True


class CategoriaCreate(BaseModel):
    nome: str = Field(..., min_length=1, max_length=100)
    tipo: str = Field("ambos", pattern="^(pagar|receber|ambos)$")
    cor: Optional[str] = Field(None, pattern="^#[0-9a-fA-F]{6}$")


class ContaBancariaOut(BaseModel):
    id: UUID
    nome: str
    banco: Optional[str]
    saldo_inicial: float
    ativo: bool

    class Config:
        from_attributes = True


class ContaBancariaCreate(BaseModel):
    nome: str = Field(..., min_length=1, max_length=100)
    banco: Optional[str] = Field(None, max_length=100)
    saldo_inicial: float = 0.0


class CategoriaUpdate(BaseModel):
    nome: Optional[str] = Field(None, min_length=1, max_length=100)
    tipo: Optional[str] = Field(None, pattern="^(pagar|receber|ambos)$")
    cor: Optional[str] = Field(None, pattern="^#[0-9a-fA-F]{6}$")


class ContaBancariaUpdate(BaseModel):
    nome: Optional[str] = Field(None, min_length=1, max_length=100)
    banco: Optional[str] = Field(None, max_length=100)
    saldo_inicial: Optional[float] = None


class ContaFinanceiraOut(BaseModel):
    id: UUID
    tipo: str
    descricao: str
    valor: float
    data_vencimento: date
    data_competencia: Optional[date]
    status: str
    data_pagamento: Optional[date]
    valor_pago: Optional[float]
    categoria_id: Optional[UUID]
    categoria_nome: Optional[str]
    conta_bancaria_id: Optional[UUID]
    conta_bancaria_nome: Optional[str]
    recorrencia: Optional[str]
    observacoes: Optional[str]
    comprovante_url: Optional[str]
    criado_por: Optional[UUID]
    created_at: datetime

    class Config:
        from_attributes = True


class ContaFinanceiraCreate(BaseModel):
    tipo: str = Field(..., pattern="^(pagar|receber)$")
    descricao: str = Field(..., min_length=1, max_length=255)
    valor: float = Field(..., gt=0)
    data_vencimento: date
    data_competencia: Optional[date] = None
    categoria_id: Optional[UUID] = None
    conta_bancaria_id: Optional[UUID] = None
    recorrencia: Optional[str] = Field(None, pattern="^(unica|mensal|anual)$")
    observacoes: Optional[str] = None


class ContaFinanceiraUpdate(BaseModel):
    descricao: Optional[str] = Field(None, min_length=1, max_length=255)
    valor: Optional[float] = Field(None, gt=0)
    data_vencimento: Optional[date] = None
    data_competencia: Optional[date] = None
    categoria_id: Optional[UUID] = None
    conta_bancaria_id: Optional[UUID] = None
    recorrencia: Optional[str] = Field(None, pattern="^(unica|mensal|anual)$")
    observacoes: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(pendente|pago|vencido|cancelado)$")


class BaixaRequest(BaseModel):
    data_pagamento: date
    valor_pago: float = Field(..., gt=0)
    conta_bancaria_id: Optional[UUID] = None
    observacoes: Optional[str] = None


class ResumoFinanceiro(BaseModel):
    total_pagar_pendente: float
    total_receber_pendente: float
    total_pagar_vencido: float
    total_receber_vencido: float
    total_pagar_pago_mes: float
    total_receber_pago_mes: float


class FluxoCaixaMes(BaseModel):
    ano: int
    mes: int
    mes_label: str          # "Jan/25"
    receitas: float         # contas receber pagas no mês
    despesas: float         # contas pagar pagas no mês
    saldo: float            # receitas - despesas
    saldo_acumulado: float  # running total
    a_receber: float        # pendente/vencido com vencimento no mês
    a_pagar: float          # pendente/vencido com vencimento no mês


# ── Helpers ───────────────────────────────────────────────────────────────────

def _conta_to_out(c: ContaFinanceira) -> ContaFinanceiraOut:
    return ContaFinanceiraOut(
        id=c.id,
        tipo=c.tipo.value if hasattr(c.tipo, "value") else c.tipo,
        descricao=c.descricao,
        valor=float(c.valor),
        data_vencimento=c.data_vencimento,
        data_competencia=c.data_competencia,
        status=c.status.value if hasattr(c.status, "value") else c.status,
        data_pagamento=c.data_pagamento,
        valor_pago=float(c.valor_pago) if c.valor_pago is not None else None,
        categoria_id=c.categoria_id,
        categoria_nome=c.categoria.nome if c.categoria else None,
        conta_bancaria_id=c.conta_bancaria_id,
        conta_bancaria_nome=c.conta_bancaria.nome if c.conta_bancaria else None,
        recorrencia=c.recorrencia.value if c.recorrencia and hasattr(c.recorrencia, "value") else c.recorrencia,
        observacoes=c.observacoes,
        comprovante_url=c.comprovante_url,
        criado_por=c.criado_por,
        created_at=c.created_at,
    )


# ── Categorias ────────────────────────────────────────────────────────────────

@router.get(
    "/categorias",
    response_model=List[CategoriaOut],
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "view"))],
)
async def list_categorias(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro_or_premium(current_user, db)
    stmt = (
        select(CategoriaFinanceira)
        .where(
            CategoriaFinanceira.tenant_id == current_user.tenant_id,
            CategoriaFinanceira.deleted_at.is_(None),
            CategoriaFinanceira.ativo.is_(True),
        )
        .order_by(CategoriaFinanceira.nome)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "/categorias",
    response_model=CategoriaOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "insert"))],
)
async def create_categoria(
    body: CategoriaCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro_or_premium(current_user, db)
    cat = CategoriaFinanceira(
        id=uuid.uuid4(),
        tenant_id=current_user.tenant_id,
        nome=body.nome,
        tipo=body.tipo,
        cor=body.cor,
    )
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    return cat


@router.put(
    "/categorias/{categoria_id}",
    response_model=CategoriaOut,
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "edit"))],
)
async def update_categoria(
    categoria_id: UUID,
    body: CategoriaUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro_or_premium(current_user, db)
    stmt = select(CategoriaFinanceira).where(
        CategoriaFinanceira.id == categoria_id,
        CategoriaFinanceira.tenant_id == current_user.tenant_id,
        CategoriaFinanceira.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria não encontrada.")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(cat, field, value)
    await db.flush()
    await db.refresh(cat)
    return cat


@router.delete(
    "/categorias/{categoria_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "delete"))],
)
async def delete_categoria(
    categoria_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro_or_premium(current_user, db)
    stmt = select(CategoriaFinanceira).where(
        CategoriaFinanceira.id == categoria_id,
        CategoriaFinanceira.tenant_id == current_user.tenant_id,
        CategoriaFinanceira.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria não encontrada.")
    cat.deleted_at = datetime.now(timezone.utc)
    await db.flush()


# ── Contas Bancárias ──────────────────────────────────────────────────────────

@router.get(
    "/contas-bancarias",
    response_model=List[ContaBancariaOut],
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "view"))],
)
async def list_contas_bancarias(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro_or_premium(current_user, db)
    stmt = (
        select(ContaBancaria)
        .where(
            ContaBancaria.tenant_id == current_user.tenant_id,
            ContaBancaria.deleted_at.is_(None),
            ContaBancaria.ativo.is_(True),
        )
        .order_by(ContaBancaria.nome)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "/contas-bancarias",
    response_model=ContaBancariaOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "insert"))],
)
async def create_conta_bancaria(
    body: ContaBancariaCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro_or_premium(current_user, db)
    conta = ContaBancaria(
        id=uuid.uuid4(),
        tenant_id=current_user.tenant_id,
        nome=body.nome,
        banco=body.banco,
        saldo_inicial=body.saldo_inicial,
    )
    db.add(conta)
    await db.flush()
    await db.refresh(conta)
    return conta


@router.put(
    "/contas-bancarias/{conta_id}",
    response_model=ContaBancariaOut,
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "edit"))],
)
async def update_conta_bancaria(
    conta_id: UUID,
    body: ContaBancariaUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro_or_premium(current_user, db)
    stmt = select(ContaBancaria).where(
        ContaBancaria.id == conta_id,
        ContaBancaria.tenant_id == current_user.tenant_id,
        ContaBancaria.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    conta = result.scalar_one_or_none()
    if not conta:
        raise HTTPException(status_code=404, detail="Conta bancária não encontrada.")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(conta, field, value)
    await db.flush()
    await db.refresh(conta)
    return conta


@router.delete(
    "/contas-bancarias/{conta_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "delete"))],
)
async def delete_conta_bancaria(
    conta_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro_or_premium(current_user, db)
    stmt = select(ContaBancaria).where(
        ContaBancaria.id == conta_id,
        ContaBancaria.tenant_id == current_user.tenant_id,
        ContaBancaria.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    conta = result.scalar_one_or_none()
    if not conta:
        raise HTTPException(status_code=404, detail="Conta bancária não encontrada.")
    conta.deleted_at = datetime.now(timezone.utc)
    await db.flush()


# ── Contas Financeiras ────────────────────────────────────────────────────────

@router.get(
    "/contas/resumo",
    response_model=ResumoFinanceiro,
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "view"))],
)
async def get_resumo(
    mes: Optional[int] = Query(None, ge=1, le=12),
    ano: Optional[int] = Query(None, ge=2000, le=2100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro_or_premium(current_user, db)
    today = date.today()
    tenant_id = current_user.tenant_id

    # Determine the reference month window
    ref_ano = ano or today.year
    ref_mes = mes or today.month
    import calendar
    first_of_month = date(ref_ano, ref_mes, 1)
    last_of_month = date(ref_ano, ref_mes, calendar.monthrange(ref_ano, ref_mes)[1])

    async def _sum_vencimento(tipo: str, status_list: list) -> float:
        """Sum by vencimento window when mes filter is active, otherwise all pending."""
        stmt = select(func.coalesce(func.sum(ContaFinanceira.valor), 0)).where(
            ContaFinanceira.tenant_id == tenant_id,
            ContaFinanceira.deleted_at.is_(None),
            ContaFinanceira.tipo == tipo,
            ContaFinanceira.status.in_(status_list),
        )
        if mes:
            stmt = stmt.where(
                ContaFinanceira.data_vencimento >= first_of_month,
                ContaFinanceira.data_vencimento <= last_of_month,
            )
        result = await db.execute(stmt)
        return float(result.scalar() or 0)

    async def _sum_pago_mes(tipo: str) -> float:
        stmt = select(func.coalesce(func.sum(ContaFinanceira.valor_pago), 0)).where(
            ContaFinanceira.tenant_id == tenant_id,
            ContaFinanceira.deleted_at.is_(None),
            ContaFinanceira.tipo == tipo,
            ContaFinanceira.status == "pago",
            ContaFinanceira.data_pagamento >= first_of_month,
            ContaFinanceira.data_pagamento <= last_of_month,
        )
        result = await db.execute(stmt)
        return float(result.scalar() or 0)

    return ResumoFinanceiro(
        total_pagar_pendente=await _sum_vencimento("pagar", ["pendente"]),
        total_receber_pendente=await _sum_vencimento("receber", ["pendente"]),
        total_pagar_vencido=await _sum_vencimento("pagar", ["vencido"]),
        total_receber_vencido=await _sum_vencimento("receber", ["vencido"]),
        total_pagar_pago_mes=await _sum_pago_mes("pagar"),
        total_receber_pago_mes=await _sum_pago_mes("receber"),
    )


@router.get(
    "/contas",
    response_model=List[ContaFinanceiraOut],
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "view"))],
)
async def list_contas(
    tipo: Optional[str] = Query(None, pattern="^(pagar|receber)$"),
    status_filter: Optional[str] = Query(None, alias="status"),
    categoria_id: Optional[UUID] = Query(None),
    data_vencimento_de: Optional[date] = Query(None),
    data_vencimento_ate: Optional[date] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro_or_premium(current_user, db)
    stmt = (
        select(ContaFinanceira)
        .options(
            selectinload(ContaFinanceira.categoria),
            selectinload(ContaFinanceira.conta_bancaria),
        )
        .where(
            ContaFinanceira.tenant_id == current_user.tenant_id,
            ContaFinanceira.deleted_at.is_(None),
        )
    )
    if tipo:
        stmt = stmt.where(ContaFinanceira.tipo == tipo)
    if status_filter:
        stmt = stmt.where(ContaFinanceira.status == status_filter)
    if categoria_id:
        stmt = stmt.where(ContaFinanceira.categoria_id == categoria_id)
    if data_vencimento_de:
        stmt = stmt.where(ContaFinanceira.data_vencimento >= data_vencimento_de)
    if data_vencimento_ate:
        stmt = stmt.where(ContaFinanceira.data_vencimento <= data_vencimento_ate)

    stmt = stmt.order_by(ContaFinanceira.data_vencimento)
    result = await db.execute(stmt)
    contas = result.scalars().all()

    # Auto-mark overdue
    today = date.today()
    updated = False
    for c in contas:
        status_val = c.status.value if hasattr(c.status, "value") else c.status
        if status_val == "pendente" and c.data_vencimento < today:
            c.status = "vencido"
            updated = True
    if updated:
        await db.flush()

    return [_conta_to_out(c) for c in contas]


@router.post(
    "/contas",
    response_model=ContaFinanceiraOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "insert"))],
)
async def create_conta(
    body: ContaFinanceiraCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro_or_premium(current_user, db)
    conta = ContaFinanceira(
        id=uuid.uuid4(),
        tenant_id=current_user.tenant_id,
        tipo=body.tipo,
        descricao=body.descricao,
        valor=body.valor,
        data_vencimento=body.data_vencimento,
        data_competencia=body.data_competencia,
        categoria_id=body.categoria_id,
        conta_bancaria_id=body.conta_bancaria_id,
        recorrencia=body.recorrencia,
        observacoes=body.observacoes,
        criado_por=current_user.id,
        status="pendente",
    )
    db.add(conta)
    await db.flush()

    stmt = (
        select(ContaFinanceira)
        .options(
            selectinload(ContaFinanceira.categoria),
            selectinload(ContaFinanceira.conta_bancaria),
        )
        .where(ContaFinanceira.id == conta.id)
    )
    result = await db.execute(stmt)
    conta = result.scalar_one()

    audit = AuditService(db)
    await audit.log_create(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type=f"conta_{body.tipo}",
        resource_id=conta.id,
        details={"descricao": conta.descricao, "valor": float(conta.valor)},
    )
    return _conta_to_out(conta)


@router.get(
    "/contas/{conta_id}",
    response_model=ContaFinanceiraOut,
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "view"))],
)
async def get_conta(
    conta_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro_or_premium(current_user, db)
    stmt = (
        select(ContaFinanceira)
        .options(
            selectinload(ContaFinanceira.categoria),
            selectinload(ContaFinanceira.conta_bancaria),
        )
        .where(
            ContaFinanceira.id == conta_id,
            ContaFinanceira.tenant_id == current_user.tenant_id,
            ContaFinanceira.deleted_at.is_(None),
        )
    )
    result = await db.execute(stmt)
    conta = result.scalar_one_or_none()
    if not conta:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")
    return _conta_to_out(conta)


@router.put(
    "/contas/{conta_id}",
    response_model=ContaFinanceiraOut,
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "edit"))],
)
async def update_conta(
    conta_id: UUID,
    body: ContaFinanceiraUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro_or_premium(current_user, db)
    stmt = select(ContaFinanceira).where(
        ContaFinanceira.id == conta_id,
        ContaFinanceira.tenant_id == current_user.tenant_id,
        ContaFinanceira.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    conta = result.scalar_one_or_none()
    if not conta:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(conta, field, value)

    await db.flush()

    stmt2 = (
        select(ContaFinanceira)
        .options(
            selectinload(ContaFinanceira.categoria),
            selectinload(ContaFinanceira.conta_bancaria),
        )
        .where(ContaFinanceira.id == conta_id)
    )
    result2 = await db.execute(stmt2)
    return _conta_to_out(result2.scalar_one())


@router.delete(
    "/contas/{conta_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "delete"))],
)
async def delete_conta(
    conta_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_pro_or_premium(current_user, db)
    stmt = select(ContaFinanceira).where(
        ContaFinanceira.id == conta_id,
        ContaFinanceira.tenant_id == current_user.tenant_id,
        ContaFinanceira.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    conta = result.scalar_one_or_none()
    if not conta:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")
    conta.deleted_at = datetime.now(timezone.utc)
    await db.flush()

    audit = AuditService(db)
    await audit.log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type=f"conta_{conta.tipo}",
        resource_id=conta_id,
        previous_state={"descricao": conta.descricao},
    )


@router.post(
    "/contas/{conta_id}/baixa",
    response_model=ContaFinanceiraOut,
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "edit"))],
)
async def dar_baixa(
    conta_id: UUID,
    body: BaixaRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a payable/receivable as paid."""
    await _require_pro_or_premium(current_user, db)
    stmt = select(ContaFinanceira).where(
        ContaFinanceira.id == conta_id,
        ContaFinanceira.tenant_id == current_user.tenant_id,
        ContaFinanceira.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    conta = result.scalar_one_or_none()
    if not conta:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")

    status_val = conta.status.value if hasattr(conta.status, "value") else conta.status
    if status_val == "pago":
        raise HTTPException(status_code=409, detail="Lançamento já está pago.")
    if status_val == "cancelado":
        raise HTTPException(status_code=409, detail="Lançamento cancelado não pode ser baixado.")

    conta.status = "pago"
    conta.data_pagamento = body.data_pagamento
    conta.valor_pago = body.valor_pago
    if body.conta_bancaria_id:
        conta.conta_bancaria_id = body.conta_bancaria_id
    if body.observacoes:
        conta.observacoes = body.observacoes

    await db.flush()

    stmt2 = (
        select(ContaFinanceira)
        .options(
            selectinload(ContaFinanceira.categoria),
            selectinload(ContaFinanceira.conta_bancaria),
        )
        .where(ContaFinanceira.id == conta_id)
    )
    result2 = await db.execute(stmt2)
    conta = result2.scalar_one()

    audit = AuditService(db)
    await audit.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type=f"conta_{conta.tipo}",
        resource_id=conta_id,
        new_state={"acao": "baixa", "valor_pago": body.valor_pago, "data_pagamento": str(body.data_pagamento)},
    )
    return _conta_to_out(conta)


# ── Fluxo de Caixa ────────────────────────────────────────────────────────────

_MES_LABELS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]


@router.get(
    "/fluxo-de-caixa",
    response_model=List[FluxoCaixaMes],
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "view"))],
)
async def get_fluxo_de_caixa(
    meses: int = Query(None, ge=1, le=60, description="Quantos meses incluir (legado)"),
    data_inicio: Optional[date] = Query(None, description="Primeiro dia do intervalo (YYYY-MM-DD)"),
    data_fim: Optional[date] = Query(None, description="Último dia do intervalo (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retorna o fluxo de caixa mensal: receitas realizadas, despesas realizadas,
    projeção de a receber / a pagar, saldo e saldo acumulado.

    Aceita data_inicio + data_fim (date range) ou meses (legado, padrão 12)."""
    import calendar
    await _require_pro_or_premium(current_user, db)
    tenant_id = current_user.tenant_id
    today = date.today()

    # Build list of (ano, mes) from date range or legacy meses param
    periods: list[tuple[int, int]] = []
    if data_inicio and data_fim:
        if data_fim < data_inicio:
            raise HTTPException(status_code=422, detail="data_fim deve ser >= data_inicio.")
        cur = date(data_inicio.year, data_inicio.month, 1)
        end = date(data_fim.year, data_fim.month, 1)
        while cur <= end:
            periods.append((cur.year, cur.month))
            # advance one month
            if cur.month == 12:
                cur = date(cur.year + 1, 1, 1)
            else:
                cur = date(cur.year, cur.month + 1, 1)
    else:
        n = meses if meses is not None else 12
        for delta in range(n - 1, -1, -1):
            total_months = today.year * 12 + today.month - 1 - delta
            y = total_months // 12
            m = total_months % 12 + 1
            periods.append((y, m))

    # Fetch all relevant contas once (avoid N queries)
    first_period = date(periods[0][0], periods[0][1], 1)
    last_period_y, last_period_m = periods[-1]
    last_period = date(last_period_y, last_period_m, calendar.monthrange(last_period_y, last_period_m)[1])

    stmt = select(ContaFinanceira).where(
        ContaFinanceira.tenant_id == tenant_id,
        ContaFinanceira.deleted_at.is_(None),
    ).where(
        # include contas paid within window OR with vencimento within window
        (ContaFinanceira.data_pagamento >= first_period) |
        (
            (ContaFinanceira.data_vencimento >= first_period) &
            (ContaFinanceira.data_vencimento <= last_period)
        ),
    )
    result = await db.execute(stmt)
    all_contas = result.scalars().all()

    # Group into buckets
    rows: list[FluxoCaixaMes] = []
    saldo_acumulado = 0.0

    for ano, mes in periods:
        first = date(ano, mes, 1)
        last = date(ano, mes, calendar.monthrange(ano, mes)[1])

        receitas = 0.0
        despesas = 0.0
        a_receber = 0.0
        a_pagar = 0.0

        for c in all_contas:
            status = c.status.value if hasattr(c.status, "value") else c.status
            tipo = c.tipo.value if hasattr(c.tipo, "value") else c.tipo
            valor = float(c.valor)
            valor_pago = float(c.valor_pago) if c.valor_pago is not None else valor

            if status == "pago" and c.data_pagamento and first <= c.data_pagamento <= last:
                if tipo == "receber":
                    receitas += valor_pago
                else:
                    despesas += valor_pago
            elif status in ("pendente", "vencido") and c.data_vencimento and first <= c.data_vencimento <= last:
                if tipo == "receber":
                    a_receber += valor
                else:
                    a_pagar += valor

        saldo = receitas - despesas
        saldo_acumulado += saldo

        rows.append(FluxoCaixaMes(
            ano=ano,
            mes=mes,
            mes_label=f"{_MES_LABELS[mes - 1]}/{str(ano)[2:]}",
            receitas=round(receitas, 2),
            despesas=round(despesas, 2),
            saldo=round(saldo, 2),
            saldo_acumulado=round(saldo_acumulado, 2),
            a_receber=round(a_receber, 2),
            a_pagar=round(a_pagar, 2),
        ))

    return rows
