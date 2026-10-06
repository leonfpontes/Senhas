"""Admin Financeiro — Contas a Pagar / Contas a Receber (Premium).

Routes:
  GET    /api/v1/admin/financeiro/contas                          — List entries
  POST   /api/v1/admin/financeiro/contas                          — Create entry
  GET    /api/v1/admin/financeiro/contas/resumo                   — Dashboard summary
  GET    /api/v1/admin/financeiro/contas/{id}                     — Get entry
  PUT    /api/v1/admin/financeiro/contas/{id}                     — Update entry
  DELETE /api/v1/admin/financeiro/contas/{id}                     — Soft-delete entry
  POST   /api/v1/admin/financeiro/contas/{id}/baixa               — Mark as paid (gera a próxima
                                                                     ocorrência se recorrente)
  POST   /api/v1/admin/financeiro/contas/{id}/cancelar            — Cancel an open entry
  POST   /api/v1/admin/financeiro/contas/{id}/reabrir             — Estorna baixa / reabre cancelado
  GET    /api/v1/admin/financeiro/fluxo-de-caixa                  — Monthly cash flow
  GET    /api/v1/admin/financeiro/categorias                      — List categories (?incluir_inativos)
  POST   /api/v1/admin/financeiro/categorias                      — Create category
  PUT    /api/v1/admin/financeiro/categorias/{id}                 — Update category (inclui ativo)
  DELETE /api/v1/admin/financeiro/categorias/{id}                 — Soft-delete category
  GET    /api/v1/admin/financeiro/contas-bancarias                — List bank accounts (?incluir_inativos)
  POST   /api/v1/admin/financeiro/contas-bancarias                — Create bank account
  PUT    /api/v1/admin/financeiro/contas-bancarias/{id}           — Update bank account (inclui ativo)
  DELETE /api/v1/admin/financeiro/contas-bancarias/{id}           — Soft-delete bank account

Status "vencido" é DERIVADO: lançamento em aberto (pendente/vencido gravado) com vencimento antes
de hoje em Brasília aparece como vencido na listagem, no filtro e no resumo — sem depender de
nenhum GET gravar o status (antes só a listagem marcava, depois de aplicar o filtro).

Recorrência (mensal/anual): ao dar baixa num lançamento recorrente, o próximo é criado UMA vez
(external_ref "recorrencia:{id_origem}:d{dia}", checado por prefixo — inclusive soft-deleted, para
não recriar um que o usuário apagou). O dia do vencimento original é preservado e só é ajustado ao
fim do mês quando o mês não tem esse dia (31/jan → 28/fev → 31/mar).
"""

from __future__ import annotations

import calendar
import uuid
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.api.dependencies import get_current_user, require_group_permission, require_plan_feature
from src.core.database import get_db
from src.core.tz import today_local
from src.models import User, PermissionFeature
from src.models.contas_financeiras import (
    CategoriaFinanceira,
    ContaBancaria,
    ContaFinanceira,
)
from src.services.audit_service import AuditService
from src.services.mensalidade_contas_service import MSG_CONTA_ESPELHO, is_conta_espelho_mensalidade

router = APIRouter(
    prefix="/api/v1/admin/financeiro",
    tags=["admin-contas-financeiras"],
    # Gate de plano único (P-05): plano com contas_financeiras E assinatura em dia.
    # Antes só o plano era checado: tenant PRO suspenso/cancelado mantinha o módulo.
    dependencies=[Depends(require_plan_feature("contas_financeiras"))],
)


async def _validar_referencias_do_tenant(
    db: AsyncSession,
    tenant_id: UUID,
    categoria_id: Optional[UUID] = None,
    conta_bancaria_id: Optional[UUID] = None,
) -> None:
    """Garante que categoria/conta bancária citadas no body pertencem ao tenant.

    Sem isso um lançamento podia apontar para categoria/conta bancária de OUTRO tenant (bastava
    conhecer o UUID) e a resposta devolvia o nome dela (categoria_nome/conta_bancaria_nome).
    Registro soft-deleted do próprio tenant não é barrado de propósito: editar lançamento que já
    aponta para categoria arquivada continua funcionando.
    """
    if categoria_id is not None:
        found = await db.execute(
            select(CategoriaFinanceira.id).where(
                CategoriaFinanceira.id == categoria_id,
                CategoriaFinanceira.tenant_id == tenant_id,
            )
        )
        if found.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=422,
                detail="Categoria não encontrada.",
            )
    if conta_bancaria_id is not None:
        found = await db.execute(
            select(ContaBancaria.id).where(
                ContaBancaria.id == conta_bancaria_id,
                ContaBancaria.tenant_id == tenant_id,
            )
        )
        if found.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=422,
                detail="Conta bancária não encontrada.",
            )


# ── Schemas ───────────────────────────────────────────────────────────────────

class CategoriaOut(BaseModel):
    id: UUID
    nome: str
    tipo: str
    cor: Optional[str]
    ativo: bool

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


class ContaBancariaCreate(BaseModel):
    nome: str = Field(..., min_length=1, max_length=100)
    banco: Optional[str] = Field(None, max_length=100)
    saldo_inicial: float = 0.0


class CategoriaUpdate(BaseModel):
    nome: Optional[str] = Field(None, min_length=1, max_length=100)
    tipo: Optional[str] = Field(None, pattern="^(pagar|receber|ambos)$")
    cor: Optional[str] = Field(None, pattern="^#[0-9a-fA-F]{6}$")
    ativo: Optional[bool] = None


class ContaBancariaUpdate(BaseModel):
    nome: Optional[str] = Field(None, min_length=1, max_length=100)
    banco: Optional[str] = Field(None, max_length=100)
    saldo_inicial: Optional[float] = None
    ativo: Optional[bool] = None


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
    # Espelho de Mensalidade (external_ref "mensalidade:*"): somente leitura aqui.
    origem_mensalidade: bool = False

    model_config = ConfigDict(from_attributes=True)


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

_EM_ABERTO = ("pendente", "vencido")
_RECORRENCIA_MESES = {"mensal": 1, "anual": 12}
_REF_RECORRENCIA = "recorrencia:"
_REF_MENSALIDADE = "mensalidade:"


def _valor(enum_or_str: Any) -> Any:
    return enum_or_str.value if hasattr(enum_or_str, "value") else enum_or_str


def _status_efetivo(c: ContaFinanceira, hoje: date) -> str:
    """Status exibido: em aberto + vencimento antes de hoje (Brasília) = vencido."""
    status_val = _valor(c.status)
    if status_val in _EM_ABERTO:
        return "vencido" if c.data_vencimento < hoje else "pendente"
    return status_val


def _status_efetivo_sql(hoje: date):
    """Mesma regra de `_status_efetivo`, como expressão SQL (filtro e resumo)."""
    em_aberto = ContaFinanceira.status.in_(_EM_ABERTO)
    return case(
        (em_aberto & (ContaFinanceira.data_vencimento < hoje), "vencido"),
        (em_aberto, "pendente"),
        else_=ContaFinanceira.status,
    )


def _aplicar_patch(obj: Any, dados: Dict[str, Any], obrigatorios: set[str]) -> None:
    """Aplica só os campos ENVIADOS (exclude_unset): null explícito limpa campo opcional.

    Antes era exclude_none, então não havia como limpar categoria, conta bancária,
    competência ou observações de um registro. Campo NOT NULL com null explícito → 422.
    """
    for field, value in dados.items():
        if value is None and field in obrigatorios:
            raise HTTPException(status_code=422, detail=f"O campo '{field}' não pode ficar vazio.")
        setattr(obj, field, value)


def _somar_meses(base: date, meses: int, dia: int) -> date:
    """`base` + `meses`, no dia `dia` (ajustado ao último dia do mês quando não existe)."""
    total = base.year * 12 + (base.month - 1) + meses
    ano, mes = divmod(total, 12)
    mes += 1
    return date(ano, mes, min(dia, calendar.monthrange(ano, mes)[1]))


def _dia_ancora(c: ContaFinanceira) -> int:
    """Dia original da série: vem do external_ref da ocorrência gerada, senão do vencimento."""
    ref = c.external_ref or ""
    if ref.startswith(_REF_RECORRENCIA) and ":d" in ref:
        try:
            return int(ref.rsplit(":d", 1)[1])
        except ValueError:
            pass
    return c.data_vencimento.day


async def _gerar_proxima_ocorrencia(
    db: AsyncSession,
    conta: ContaFinanceira,
    criado_por: UUID,
    observacoes_origem: Optional[str],
) -> Optional[ContaFinanceira]:
    """Cria a próxima ocorrência de um lançamento recorrente (idempotente, sem commit).

    Já existe filho com o prefixo "recorrencia:{conta.id}:" (inclusive soft-deleted) → não cria.
    """
    meses = _RECORRENCIA_MESES.get(_valor(conta.recorrencia) or "")
    if not meses:
        return None
    prefixo = f"{_REF_RECORRENCIA}{conta.id}:"
    existente = await db.execute(
        select(ContaFinanceira.id).where(
            ContaFinanceira.tenant_id == conta.tenant_id,
            ContaFinanceira.external_ref.like(f"{prefixo}%"),
        ).limit(1)
    )
    if existente.scalar_one_or_none() is not None:
        return None

    dia = _dia_ancora(conta)
    competencia = None
    if conta.data_competencia:
        competencia = _somar_meses(conta.data_competencia, meses, conta.data_competencia.day)
    proxima = ContaFinanceira(
        id=uuid.uuid4(),
        tenant_id=conta.tenant_id,
        tipo=_valor(conta.tipo),
        descricao=conta.descricao,
        valor=conta.valor,
        data_vencimento=_somar_meses(conta.data_vencimento, meses, dia),
        data_competencia=competencia,
        categoria_id=conta.categoria_id,
        conta_bancaria_id=conta.conta_bancaria_id,
        recorrencia=_valor(conta.recorrencia),
        observacoes=observacoes_origem,
        criado_por=criado_por,
        status="pendente",
        external_ref=f"{prefixo}d{dia}",
    )
    db.add(proxima)
    await db.flush()
    return proxima


async def _carregar_conta(db: AsyncSession, tenant_id: UUID, conta_id: UUID) -> ContaFinanceira:
    """Recarrega o lançamento com categoria/conta bancária (para a resposta)."""
    stmt = (
        select(ContaFinanceira)
        .options(
            selectinload(ContaFinanceira.categoria),
            selectinload(ContaFinanceira.conta_bancaria),
        )
        .where(
            ContaFinanceira.id == conta_id,
            ContaFinanceira.tenant_id == tenant_id,
        )
        .execution_options(populate_existing=True)
    )
    result = await db.execute(stmt)
    return result.scalar_one()


async def _buscar_conta_ativa(db: AsyncSession, tenant_id: UUID, conta_id: UUID) -> ContaFinanceira:
    stmt = select(ContaFinanceira).where(
        ContaFinanceira.id == conta_id,
        ContaFinanceira.tenant_id == tenant_id,
        ContaFinanceira.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    conta = result.scalar_one_or_none()
    if not conta:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")
    return conta


def _conta_to_out(c: ContaFinanceira, hoje: Optional[date] = None) -> ContaFinanceiraOut:
    return ContaFinanceiraOut(
        id=c.id,
        tipo=c.tipo.value if hasattr(c.tipo, "value") else c.tipo,
        descricao=c.descricao,
        valor=float(c.valor),
        data_vencimento=c.data_vencimento,
        data_competencia=c.data_competencia,
        status=_status_efetivo(c, hoje or today_local()),
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
        origem_mensalidade=is_conta_espelho_mensalidade(c.external_ref),
    )


def _bloquear_espelho_mensalidade(conta: ContaFinanceira) -> None:
    """Conta gerada pela Mensalidade não muda pelos Lançamentos (409).

    Editar/baixar/excluir aqui não volta para a Mensalidade e as duas telas
    divergiam; a mudança tem de ser feita em Financeiro → Mensalidades, que
    atualiza este espelho.
    """
    if is_conta_espelho_mensalidade(conta.external_ref):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=MSG_CONTA_ESPELHO)


# ── Categorias ────────────────────────────────────────────────────────────────

@router.get(
    "/categorias",
    response_model=List[CategoriaOut],
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "view"))],
)
async def list_categorias(
    incluir_inativos: bool = Query(False, description="Inclui categorias desativadas (tela de configuração)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CategoriaFinanceira).where(
        CategoriaFinanceira.tenant_id == current_user.tenant_id,
        CategoriaFinanceira.deleted_at.is_(None),
    )
    if not incluir_inativos:
        stmt = stmt.where(CategoriaFinanceira.ativo.is_(True))
    stmt = stmt.order_by(CategoriaFinanceira.nome)
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
    cat = CategoriaFinanceira(
        id=uuid.uuid4(),
        tenant_id=current_user.tenant_id,
        nome=body.nome,
        tipo=body.tipo,
        cor=body.cor,
    )
    db.add(cat)
    await db.flush()
    await db.commit()
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
    stmt = select(CategoriaFinanceira).where(
        CategoriaFinanceira.id == categoria_id,
        CategoriaFinanceira.tenant_id == current_user.tenant_id,
        CategoriaFinanceira.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria não encontrada.")
    _aplicar_patch(cat, body.model_dump(exclude_unset=True), {"nome", "tipo", "ativo"})
    await db.flush()
    await db.commit()
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
    await db.commit()


# ── Contas Bancárias ──────────────────────────────────────────────────────────

@router.get(
    "/contas-bancarias",
    response_model=List[ContaBancariaOut],
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "view"))],
)
async def list_contas_bancarias(
    incluir_inativos: bool = Query(False, description="Inclui contas desativadas (tela de configuração)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ContaBancaria).where(
        ContaBancaria.tenant_id == current_user.tenant_id,
        ContaBancaria.deleted_at.is_(None),
    )
    if not incluir_inativos:
        stmt = stmt.where(ContaBancaria.ativo.is_(True))
    stmt = stmt.order_by(ContaBancaria.nome)
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
    conta = ContaBancaria(
        id=uuid.uuid4(),
        tenant_id=current_user.tenant_id,
        nome=body.nome,
        banco=body.banco,
        saldo_inicial=body.saldo_inicial,
    )
    db.add(conta)
    await db.flush()
    await db.commit()
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
    stmt = select(ContaBancaria).where(
        ContaBancaria.id == conta_id,
        ContaBancaria.tenant_id == current_user.tenant_id,
        ContaBancaria.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    conta = result.scalar_one_or_none()
    if not conta:
        raise HTTPException(status_code=404, detail="Conta bancária não encontrada.")
    _aplicar_patch(conta, body.model_dump(exclude_unset=True), {"nome", "saldo_inicial", "ativo"})
    await db.flush()
    await db.commit()
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
    await db.commit()


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
    hoje = today_local()
    tenant_id = current_user.tenant_id

    # Determine the reference month window
    ref_ano = ano or hoje.year
    ref_mes = mes or hoje.month
    first_of_month = date(ref_ano, ref_mes, 1)
    last_of_month = date(ref_ano, ref_mes, calendar.monthrange(ref_ano, ref_mes)[1])
    status_efetivo = _status_efetivo_sql(hoje)

    async def _sum_vencimento(tipo: str, status_alvo: str) -> float:
        """Soma por status EFETIVO (vencido derivado); janela de vencimento quando há filtro de mês."""
        stmt = select(func.coalesce(func.sum(ContaFinanceira.valor), 0)).where(
            ContaFinanceira.tenant_id == tenant_id,
            ContaFinanceira.deleted_at.is_(None),
            ContaFinanceira.tipo == tipo,
            status_efetivo == status_alvo,
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
        total_pagar_pendente=await _sum_vencimento("pagar", "pendente"),
        total_receber_pendente=await _sum_vencimento("receber", "pendente"),
        total_pagar_vencido=await _sum_vencimento("pagar", "vencido"),
        total_receber_vencido=await _sum_vencimento("receber", "vencido"),
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
    status_filter: Optional[str] = Query(None, alias="status", pattern="^(pendente|pago|vencido|cancelado)$"),
    categoria_id: Optional[UUID] = Query(None),
    data_vencimento_de: Optional[date] = Query(None),
    data_vencimento_ate: Optional[date] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    hoje = today_local()
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
        # Filtro pelo status efetivo: "pendente" não traz o que já venceu e "vencido" traz
        # o que venceu mesmo sem nenhum GET anterior ter gravado o status.
        stmt = stmt.where(_status_efetivo_sql(hoje) == status_filter)
    if categoria_id:
        stmt = stmt.where(ContaFinanceira.categoria_id == categoria_id)
    if data_vencimento_de:
        stmt = stmt.where(ContaFinanceira.data_vencimento >= data_vencimento_de)
    if data_vencimento_ate:
        stmt = stmt.where(ContaFinanceira.data_vencimento <= data_vencimento_ate)

    stmt = stmt.order_by(ContaFinanceira.data_vencimento)
    result = await db.execute(stmt)
    contas = result.scalars().all()
    return [_conta_to_out(c, hoje) for c in contas]


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
    await _validar_referencias_do_tenant(
        db, current_user.tenant_id, body.categoria_id, body.conta_bancaria_id
    )
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

    # Auditoria ANTES do commit: AuditLogRepository.create só faz flush, e get_db fecha a
    # sessão sem commit — gravada depois do commit, a linha de auditoria era descartada.
    audit = AuditService(db)
    await audit.log_create(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type=f"conta_{body.tipo}",
        resource_id=conta.id,
        details={"descricao": body.descricao, "valor": float(body.valor)},
    )
    await db.commit()
    return _conta_to_out(await _carregar_conta(db, current_user.tenant_id, conta.id))


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
    stmt = select(ContaFinanceira).where(
        ContaFinanceira.id == conta_id,
        ContaFinanceira.tenant_id == current_user.tenant_id,
        ContaFinanceira.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    conta = result.scalar_one_or_none()
    if not conta:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")
    _bloquear_espelho_mensalidade(conta)

    await _validar_referencias_do_tenant(
        db, current_user.tenant_id, body.categoria_id, body.conta_bancaria_id
    )
    dados = body.model_dump(exclude_unset=True)
    _aplicar_patch(conta, dados, {"descricao", "valor", "data_vencimento", "status"})
    await db.flush()

    audit = AuditService(db)
    await audit.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type=f"conta_{_valor(conta.tipo)}",
        resource_id=conta_id,
        new_state={k: (str(v) if v is not None else None) for k, v in dados.items()},
    )
    await db.commit()
    return _conta_to_out(await _carregar_conta(db, current_user.tenant_id, conta_id))


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
    conta = await _buscar_conta_ativa(db, current_user.tenant_id, conta_id)
    _bloquear_espelho_mensalidade(conta)
    conta.deleted_at = datetime.now(timezone.utc)
    await db.flush()

    audit = AuditService(db)
    await audit.log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type=f"conta_{_valor(conta.tipo)}",
        resource_id=conta_id,
        previous_state={"descricao": conta.descricao},
    )
    await db.commit()


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
    """Mark a payable/receivable as paid; recorrente (mensal/anual) gera a próxima ocorrência."""
    conta = await _buscar_conta_ativa(db, current_user.tenant_id, conta_id)
    _bloquear_espelho_mensalidade(conta)

    status_val = _valor(conta.status)
    if status_val == "pago":
        raise HTTPException(status_code=409, detail="Lançamento já está pago.")
    if status_val == "cancelado":
        raise HTTPException(status_code=409, detail="Lançamento cancelado não pode ser baixado.")

    await _validar_referencias_do_tenant(
        db, current_user.tenant_id, conta_bancaria_id=body.conta_bancaria_id
    )
    observacoes_origem = conta.observacoes
    conta.status = "pago"
    conta.data_pagamento = body.data_pagamento
    conta.valor_pago = body.valor_pago
    if body.conta_bancaria_id:
        conta.conta_bancaria_id = body.conta_bancaria_id
    if body.observacoes:
        conta.observacoes = body.observacoes
    await db.flush()

    proxima = await _gerar_proxima_ocorrencia(db, conta, current_user.id, observacoes_origem)

    audit = AuditService(db)
    await audit.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type=f"conta_{_valor(conta.tipo)}",
        resource_id=conta_id,
        new_state={
            "acao": "baixa",
            "valor_pago": body.valor_pago,
            "data_pagamento": str(body.data_pagamento),
            "proxima_ocorrencia_id": str(proxima.id) if proxima else None,
        },
    )
    if proxima is not None:
        await audit.log_create(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            resource_type=f"conta_{_valor(proxima.tipo)}",
            resource_id=proxima.id,
            details={
                "origem": "recorrencia",
                "conta_origem_id": str(conta_id),
                "data_vencimento": str(proxima.data_vencimento),
            },
        )
    await db.commit()
    return _conta_to_out(await _carregar_conta(db, current_user.tenant_id, conta_id))


def _bloquear_espelho_de_mensalidade(conta: ContaFinanceira) -> None:
    if (conta.external_ref or "").startswith(_REF_MENSALIDADE):
        raise HTTPException(
            status_code=409,
            detail="Lançamento gerado pela mensalidade: altere pela tela de Mensalidades.",
        )


@router.post(
    "/contas/{conta_id}/cancelar",
    response_model=ContaFinanceiraOut,
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "edit"))],
)
async def cancelar_conta(
    conta_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancela um lançamento em aberto (pendente/vencido). Pago precisa ser estornado antes."""
    conta = await _buscar_conta_ativa(db, current_user.tenant_id, conta_id)
    _bloquear_espelho_de_mensalidade(conta)
    status_val = _valor(conta.status)
    if status_val == "cancelado":
        raise HTTPException(status_code=409, detail="Lançamento já está cancelado.")
    if status_val == "pago":
        raise HTTPException(status_code=409, detail="Estorne a baixa antes de cancelar o lançamento.")
    conta.status = "cancelado"
    await db.flush()

    audit = AuditService(db)
    await audit.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type=f"conta_{_valor(conta.tipo)}",
        resource_id=conta_id,
        previous_state={"status": status_val},
        new_state={"acao": "cancelar", "status": "cancelado"},
    )
    await db.commit()
    return _conta_to_out(await _carregar_conta(db, current_user.tenant_id, conta_id))


@router.post(
    "/contas/{conta_id}/reabrir",
    response_model=ContaFinanceiraOut,
    dependencies=[Depends(require_group_permission(PermissionFeature.CONTAS_FINANCEIRAS, "edit"))],
)
async def reabrir_conta(
    conta_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Estorna a baixa (pago → em aberto) ou reabre um cancelado.

    A próxima ocorrência de um recorrente, se já gerada, é mantida; dar baixa de novo não
    duplica (idempotente).
    """
    conta = await _buscar_conta_ativa(db, current_user.tenant_id, conta_id)
    _bloquear_espelho_de_mensalidade(conta)
    status_val = _valor(conta.status)
    if status_val not in ("pago", "cancelado"):
        raise HTTPException(status_code=409, detail="Só lançamento pago ou cancelado pode ser reaberto.")
    anterior = {
        "status": status_val,
        "data_pagamento": str(conta.data_pagamento) if conta.data_pagamento else None,
        "valor_pago": float(conta.valor_pago) if conta.valor_pago is not None else None,
    }
    conta.status = "pendente"
    conta.data_pagamento = None
    conta.valor_pago = None
    await db.flush()

    audit = AuditService(db)
    await audit.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type=f"conta_{_valor(conta.tipo)}",
        resource_id=conta_id,
        previous_state=anterior,
        new_state={"acao": "estornar_baixa" if status_val == "pago" else "reabrir", "status": "pendente"},
    )
    await db.commit()
    return _conta_to_out(await _carregar_conta(db, current_user.tenant_id, conta_id))


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

    Aceita data_inicio + data_fim (date range) ou meses (legado, padrão 12). Com intervalo, o
    primeiro e o último mês são recortados pelas datas exatas (antes o mês inteiro entrava).

    saldo_acumulado parte do saldo de abertura: soma do saldo_inicial das contas bancárias
    ativas + receitas − despesas realizadas (pagas) ANTES do início do intervalo.
    """
    tenant_id = current_user.tenant_id
    hoje = today_local()

    # Lista de (ano, mes, primeiro_dia, ultimo_dia) — recortada pelo intervalo pedido
    periods: list[tuple[int, int, date, date]] = []
    if data_inicio and data_fim:
        if data_fim < data_inicio:
            raise HTTPException(status_code=422, detail="data_fim deve ser >= data_inicio.")
        cur = date(data_inicio.year, data_inicio.month, 1)
        end = date(data_fim.year, data_fim.month, 1)
        while cur <= end:
            last = date(cur.year, cur.month, calendar.monthrange(cur.year, cur.month)[1])
            periods.append((cur.year, cur.month, max(cur, data_inicio), min(last, data_fim)))
            cur = _somar_meses(cur, 1, 1)
    else:
        n = meses if meses is not None else 12
        for delta in range(n - 1, -1, -1):
            first = _somar_meses(date(hoje.year, hoje.month, 1), -delta, 1)
            last = date(first.year, first.month, calendar.monthrange(first.year, first.month)[1])
            periods.append((first.year, first.month, first, last))

    window_start = periods[0][2]
    window_end = periods[-1][3]

    stmt = select(ContaFinanceira).where(
        ContaFinanceira.tenant_id == tenant_id,
        ContaFinanceira.deleted_at.is_(None),
    ).where(
        # pagas dentro da janela OU com vencimento dentro da janela
        (
            (ContaFinanceira.data_pagamento >= window_start)
            & (ContaFinanceira.data_pagamento <= window_end)
        ) |
        (
            (ContaFinanceira.data_vencimento >= window_start) &
            (ContaFinanceira.data_vencimento <= window_end)
        ),
    )
    result = await db.execute(stmt)
    all_contas = result.scalars().all()

    # Saldo de abertura: saldo inicial das contas bancárias ativas + realizado antes da janela
    saldo_inicial_res = await db.execute(
        select(func.coalesce(func.sum(ContaBancaria.saldo_inicial), 0)).where(
            ContaBancaria.tenant_id == tenant_id,
            ContaBancaria.deleted_at.is_(None),
            ContaBancaria.ativo.is_(True),
        )
    )
    realizado_res = await db.execute(
        select(
            func.coalesce(
                func.sum(
                    case(
                        (ContaFinanceira.tipo == "receber", func.coalesce(ContaFinanceira.valor_pago, ContaFinanceira.valor)),
                        else_=-func.coalesce(ContaFinanceira.valor_pago, ContaFinanceira.valor),
                    )
                ),
                0,
            )
        ).where(
            ContaFinanceira.tenant_id == tenant_id,
            ContaFinanceira.deleted_at.is_(None),
            ContaFinanceira.status == "pago",
            ContaFinanceira.data_pagamento < window_start,
        )
    )
    saldo_acumulado = float(saldo_inicial_res.scalar() or 0) + float(realizado_res.scalar() or 0)

    rows: list[FluxoCaixaMes] = []
    for ano, mes, first, last in periods:
        receitas = 0.0
        despesas = 0.0
        a_receber = 0.0
        a_pagar = 0.0

        for c in all_contas:
            status_val = _valor(c.status)
            tipo = _valor(c.tipo)
            valor = float(c.valor)
            valor_pago = float(c.valor_pago) if c.valor_pago is not None else valor

            if status_val == "pago" and c.data_pagamento and first <= c.data_pagamento <= last:
                if tipo == "receber":
                    receitas += valor_pago
                else:
                    despesas += valor_pago
            elif status_val in _EM_ABERTO and c.data_vencimento and first <= c.data_vencimento <= last:
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
