"""Admin endpoints — Controle de Estoque (Plano Pro+).

Grupos de material, itens, movimentações e relatórios de posição de estoque.
"""
import base64
import csv
import io
import logging
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.api.dependencies import get_current_user
from src.core.database import get_db
from src.models import User
from src.models.estoque import EstoqueMovimentacao, EstoqueMovimentacaoTipo
from src.models.subscriptions import PlanType
from src.repositories.config_repo import TenantConfigRepository
from src.repositories.estoque_repo import (
    EstoqueGrupoRepository,
    EstoqueItemRepository,
    EstoqueMovimentacaoRepository,
)
from src.repositories.subscription_repo import SubscriptionRepository
from src.services.audit_service import AuditService

router = APIRouter(prefix="/api/v1/admin/estoque", tags=["admin-estoque"])
logger = logging.getLogger(__name__)

_PLAN_TIER = {
    PlanType.FREE: 0,
    PlanType.BASIC: 1,
    PlanType.PRO: 2,
    PlanType.PREMIUM: 3,
}

ALLOWED_FOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FOTO_BYTES = 2 * 1024 * 1024  # 2 MB
UNIDADES_MEDIDA = {"UN", "KG", "G", "L", "ML", "M", "CM", "CX", "PCT", "RO"}


async def _require_estoque_plan(user: User, db: AsyncSession) -> None:
    """Verifica que o tenant possui plano Pro ou superior."""
    if user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Superadmin deve impersonar um tenant para operar o estoque.",
        )
    sub_repo = SubscriptionRepository(db)
    sub = await sub_repo.get_by_tenant(user.tenant_id)
    tier = _PLAN_TIER.get(sub.plan if sub else PlanType.FREE, 0)
    if tier < 2:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Controle de Estoque disponível a partir do plano Pro.",
        )


# ──────────────────────────────────────────────────────────────
# Schemas — Grupos
# ──────────────────────────────────────────────────────────────

class GrupoCreate(BaseModel):
    nome: str
    descricao: Optional[str] = None

    @field_validator("nome")
    @classmethod
    def validate_nome(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Nome não pode ser vazio")
        return stripped


class GrupoUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None

    @field_validator("nome")
    @classmethod
    def validate_nome(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        stripped = v.strip()
        if not stripped:
            raise ValueError("Nome não pode ser vazio")
        return stripped


class GrupoResponse(BaseModel):
    id: UUID
    nome: str
    descricao: Optional[str]

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────────────────────
# Schemas — Itens
# ──────────────────────────────────────────────────────────────

class ItemCreate(BaseModel):
    nome: str
    grupo_id: Optional[UUID] = None
    descricao: Optional[str] = None
    unidade_medida: str = "UN"
    estoque_minimo: int = 0
    custo_unitario: Optional[float] = None
    observacoes: Optional[str] = None
    # Foto enviada como base64 (data URI ou raw base64)
    foto_base64: Optional[str] = None
    foto_content_type: Optional[str] = None

    @field_validator("nome")
    @classmethod
    def validate_nome(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Nome não pode ser vazio")
        return stripped

    @field_validator("unidade_medida")
    @classmethod
    def validate_unidade(cls, v: str) -> str:
        v = v.upper().strip()
        if v not in UNIDADES_MEDIDA:
            raise ValueError(f"Unidade de medida deve ser uma de: {', '.join(sorted(UNIDADES_MEDIDA))}")
        return v

    @field_validator("estoque_minimo")
    @classmethod
    def validate_estoque_minimo(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Estoque mínimo não pode ser negativo")
        return v


class ItemUpdate(BaseModel):
    nome: Optional[str] = None
    grupo_id: Optional[UUID] = None
    descricao: Optional[str] = None
    unidade_medida: Optional[str] = None
    estoque_minimo: Optional[int] = None
    custo_unitario: Optional[float] = None
    observacoes: Optional[str] = None
    foto_base64: Optional[str] = None
    foto_content_type: Optional[str] = None

    @field_validator("nome")
    @classmethod
    def validate_nome(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        stripped = v.strip()
        if not stripped:
            raise ValueError("Nome não pode ser vazio")
        return stripped

    @field_validator("unidade_medida")
    @classmethod
    def validate_unidade(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.upper().strip()
        if v not in UNIDADES_MEDIDA:
            raise ValueError(f"Unidade de medida deve ser uma de: {', '.join(sorted(UNIDADES_MEDIDA))}")
        return v


class ItemResponse(BaseModel):
    id: UUID
    nome: str
    grupo_id: Optional[UUID]
    grupo_nome: Optional[str] = None
    descricao: Optional[str]
    unidade_medida: str
    estoque_minimo: int
    custo_unitario: Optional[float]
    observacoes: Optional[str]
    tem_foto: bool = False

    class Config:
        from_attributes = True


class ItemWithSaldoResponse(ItemResponse):
    saldo: int = 0


# ──────────────────────────────────────────────────────────────
# Schemas — Movimentações
# ──────────────────────────────────────────────────────────────

class MovimentacaoCreate(BaseModel):
    item_id: UUID
    tipo: EstoqueMovimentacaoTipo
    quantidade: int
    data_movimentacao: datetime
    motivo: Optional[str] = None
    requisitante: Optional[str] = None

    @field_validator("quantidade")
    @classmethod
    def validate_quantidade(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Quantidade deve ser maior que zero")
        return v


class MovimentacaoResponse(BaseModel):
    id: UUID
    item_id: UUID
    item_nome: Optional[str] = None
    tipo: str
    quantidade: int
    motivo: Optional[str]
    data_movimentacao: datetime
    requisitante: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────────────────────
# Schemas — Relatório
# ──────────────────────────────────────────────────────────────

class RelatorioItemResponse(BaseModel):
    item_id: UUID
    item_nome: str
    grupo_id: Optional[UUID]
    grupo_nome: Optional[str]
    unidade_medida: str
    saldo: int
    estoque_minimo: int
    status: str  # "ok" | "atencao" | "critico"
    ultima_movimentacao: Optional[datetime]


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def _decode_foto(foto_base64: Optional[str], content_type: Optional[str]) -> tuple[Optional[bytes], Optional[str]]:
    """Decodifica foto de base64. Suporta data URI ou raw base64."""
    if not foto_base64:
        return None, None
    raw = foto_base64
    if raw.startswith("data:"):
        # data URI: data:image/png;base64,<data>
        try:
            header, raw = raw.split(",", 1)
            if not content_type:
                content_type = header.split(";")[0].split(":")[1]
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de data URI inválido")
    else:
        # raw base64 — content_type obrigatório
        if not content_type:
            raise HTTPException(status_code=422, detail="foto_content_type é obrigatório para base64 puro")
    if content_type and content_type not in ALLOWED_FOTO_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de foto inválido. Use JPG, PNG ou WEBP")
    try:
        data = base64.b64decode(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Foto base64 inválida")
    if len(data) > MAX_FOTO_BYTES:
        raise HTTPException(status_code=400, detail="Foto excede o limite de 2 MB")
    return data, content_type


def _item_to_response(item, saldo: int = 0) -> ItemWithSaldoResponse:
    return ItemWithSaldoResponse(
        id=item.id,
        nome=item.nome,
        grupo_id=item.grupo_id,
        grupo_nome=item.grupo.nome if item.grupo else None,
        descricao=item.descricao,
        unidade_medida=item.unidade_medida,
        estoque_minimo=item.estoque_minimo,
        custo_unitario=float(item.custo_unitario) if item.custo_unitario is not None else None,
        observacoes=item.observacoes,
        tem_foto=bool(item.foto_data),
        saldo=saldo,
    )


def _mov_to_response(mov) -> MovimentacaoResponse:
    return MovimentacaoResponse(
        id=mov.id,
        item_id=mov.item_id,
        item_nome=mov.item.nome if mov.item else None,
        tipo=mov.tipo.value,
        quantidade=mov.quantidade,
        motivo=mov.motivo,
        data_movimentacao=mov.data_movimentacao,
        requisitante=mov.requisitante,
        created_at=mov.created_at,
    )


def _saldo_status(saldo: int, minimo: int) -> str:
    if saldo < 0:
        return "critico"
    if minimo > 0 and saldo == 0:
        return "critico"
    if minimo > 0 and saldo < minimo:
        return "atencao"
    return "ok"


# ──────────────────────────────────────────────────────────────
# Endpoints — Grupos
# ──────────────────────────────────────────────────────────────

@router.get("/grupos", response_model=List[GrupoResponse])
async def list_grupos(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_estoque_plan(current_user, db)
    repo = EstoqueGrupoRepository(db)
    grupos = await repo.list_all(current_user.tenant_id)
    return [GrupoResponse.model_validate(g) for g in grupos]


@router.post("/grupos", response_model=GrupoResponse, status_code=201)
async def create_grupo(
    body: GrupoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_estoque_plan(current_user, db)
    repo = EstoqueGrupoRepository(db)
    grupo = await repo.create_grupo(
        tenant_id=current_user.tenant_id, nome=body.nome, descricao=body.descricao
    )
    audit = AuditService(db)
    await audit.log_create(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="EstoqueGrupo",
        resource_id=grupo.id,
        details={"nome": grupo.nome},
    )
    await db.commit()
    await db.refresh(grupo)
    return GrupoResponse.model_validate(grupo)


@router.get("/grupos/{grupo_id}", response_model=GrupoResponse)
async def get_grupo(
    grupo_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_estoque_plan(current_user, db)
    repo = EstoqueGrupoRepository(db)
    grupo = await repo.get_by_id(grupo_id, current_user.tenant_id)
    if not grupo:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    return GrupoResponse.model_validate(grupo)


@router.put("/grupos/{grupo_id}", response_model=GrupoResponse)
async def update_grupo(
    grupo_id: UUID,
    body: GrupoUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_estoque_plan(current_user, db)
    repo = EstoqueGrupoRepository(db)
    grupo = await repo.update_grupo(
        grupo_id=grupo_id,
        tenant_id=current_user.tenant_id,
        nome=body.nome,
        descricao=body.descricao,
    )
    if not grupo:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    audit = AuditService(db)
    await audit.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="EstoqueGrupo",
        resource_id=grupo.id,
        new_state={"nome": grupo.nome},
    )
    await db.commit()
    await db.refresh(grupo)
    return GrupoResponse.model_validate(grupo)


@router.delete("/grupos/{grupo_id}", status_code=204)
async def delete_grupo(
    grupo_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_estoque_plan(current_user, db)
    repo = EstoqueGrupoRepository(db)
    item_repo = EstoqueItemRepository(db)
    count = await item_repo.count_by_grupo(grupo_id, current_user.tenant_id)
    if count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Grupo possui {count} iten(s). Mova ou exclua os itens antes de remover o grupo.",
        )
    deleted = await repo.delete_grupo(grupo_id, current_user.tenant_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    audit = AuditService(db)
    await audit.log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="EstoqueGrupo",
        resource_id=grupo_id,
    )
    await db.commit()


# ──────────────────────────────────────────────────────────────
# Endpoints — Itens
# ──────────────────────────────────────────────────────────────

@router.get("/itens", response_model=List[ItemWithSaldoResponse])
async def list_itens(
    grupo_id: Optional[UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_estoque_plan(current_user, db)
    item_repo = EstoqueItemRepository(db)
    items = await item_repo.list_all(
        tenant_id=current_user.tenant_id, grupo_id=grupo_id, skip=skip, limit=limit
    )
    item_ids = [item.id for item in items]
    saldos = await item_repo.get_saldos_bulk(item_ids, current_user.tenant_id) if item_ids else {}
    return [_item_to_response(item, saldos.get(item.id, 0)) for item in items]


@router.post("/itens", response_model=ItemWithSaldoResponse, status_code=201)
async def create_item(
    body: ItemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_estoque_plan(current_user, db)
    foto_data, foto_ct = _decode_foto(body.foto_base64, body.foto_content_type)
    repo = EstoqueItemRepository(db)
    item = await repo.create_item(
        tenant_id=current_user.tenant_id,
        nome=body.nome,
        grupo_id=body.grupo_id,
        descricao=body.descricao,
        unidade_medida=body.unidade_medida,
        estoque_minimo=body.estoque_minimo,
        custo_unitario=body.custo_unitario,
        observacoes=body.observacoes,
        foto_data=foto_data,
        foto_content_type=foto_ct,
    )
    audit = AuditService(db)
    await audit.log_create(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="EstoqueItem",
        resource_id=item.id,
        details={"nome": item.nome},
    )
    await db.commit()
    item = await repo.get_with_grupo(item.id, current_user.tenant_id)
    return _item_to_response(item, 0)


@router.get("/itens/{item_id}", response_model=ItemWithSaldoResponse)
async def get_item(
    item_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_estoque_plan(current_user, db)
    repo = EstoqueItemRepository(db)
    item = await repo.get_with_grupo(item_id, current_user.tenant_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    saldo = await repo.get_saldo(item_id, current_user.tenant_id)
    return _item_to_response(item, saldo)


@router.get("/itens/{item_id}/foto")
async def get_item_foto(
    item_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_estoque_plan(current_user, db)
    repo = EstoqueItemRepository(db)
    item = await repo.get_by_id(item_id, current_user.tenant_id)
    if not item or not item.foto_data:
        raise HTTPException(status_code=404, detail="Foto não encontrada")
    return Response(
        content=item.foto_data,
        media_type=item.foto_content_type or "image/jpeg",
    )


@router.put("/itens/{item_id}", response_model=ItemWithSaldoResponse)
async def update_item(
    item_id: UUID,
    body: ItemUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_estoque_plan(current_user, db)
    repo = EstoqueItemRepository(db)
    update_kwargs = body.model_dump(exclude_unset=True)
    foto_base64 = update_kwargs.pop("foto_base64", None)
    foto_content_type = update_kwargs.pop("foto_content_type", None)
    if foto_base64 is not None:
        foto_data, foto_ct = _decode_foto(foto_base64, foto_content_type)
        update_kwargs["foto_data"] = foto_data
        update_kwargs["foto_content_type"] = foto_ct
    item = await repo.update_item(item_id, current_user.tenant_id, **update_kwargs)
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    audit = AuditService(db)
    await audit.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="EstoqueItem",
        resource_id=item.id,
        new_state={"nome": item.nome},
    )
    await db.commit()
    item = await repo.get_with_grupo(item_id, current_user.tenant_id)
    saldo = await repo.get_saldo(item_id, current_user.tenant_id)
    return _item_to_response(item, saldo)


@router.delete("/itens/{item_id}", status_code=204)
async def delete_item(
    item_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_estoque_plan(current_user, db)
    repo = EstoqueItemRepository(db)
    deleted = await repo.delete_item(item_id, current_user.tenant_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    audit = AuditService(db)
    await audit.log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="EstoqueItem",
        resource_id=item_id,
    )
    await db.commit()


# ──────────────────────────────────────────────────────────────
# Endpoints — Movimentações
# ──────────────────────────────────────────────────────────────

@router.get("/movimentacoes", response_model=List[MovimentacaoResponse])
async def list_movimentacoes(
    item_id: Optional[UUID] = Query(None),
    tipo: Optional[EstoqueMovimentacaoTipo] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_estoque_plan(current_user, db)
    repo = EstoqueMovimentacaoRepository(db)
    movs = await repo.list_filtered(
        tenant_id=current_user.tenant_id,
        item_id=item_id,
        tipo=tipo,
        date_from=date_from,
        date_to=date_to,
        skip=skip,
        limit=limit,
    )
    return [_mov_to_response(m) for m in movs]


@router.post("/movimentacoes", response_model=MovimentacaoResponse, status_code=201)
async def create_movimentacao(
    body: MovimentacaoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_estoque_plan(current_user, db)

    # Valida que o item pertence ao tenant
    item_repo = EstoqueItemRepository(db)
    item = await item_repo.get_by_id(body.item_id, current_user.tenant_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")

    mov_repo = EstoqueMovimentacaoRepository(db)
    mov = await mov_repo.create_movimentacao(
        tenant_id=current_user.tenant_id,
        item_id=body.item_id,
        tipo=body.tipo,
        quantidade=body.quantidade,
        data_movimentacao=body.data_movimentacao,
        motivo=body.motivo,
        requisitante=body.requisitante,
        usuario_id=current_user.id,
    )

    # Audit log condicional — respeita flag enable_estoque_log
    config_repo = TenantConfigRepository(db)
    config = await config_repo.get_by_tenant(current_user.tenant_id)
    if config and config.enable_estoque_log:
        audit = AuditService(db)
        await audit.log_create(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            resource_type="EstoqueMovimentacao",
            resource_id=mov.id,
            details={
                "item_id": str(body.item_id),
                "item_nome": item.nome,
                "tipo": body.tipo.value,
                "quantidade": body.quantidade,
                "motivo": body.motivo,
                "requisitante": body.requisitante,
                "data_movimentacao": body.data_movimentacao.isoformat(),
            },
        )

    await db.commit()

    # Recarrega com relacionamentos
    stmt = (
        sa_select(EstoqueMovimentacao)
        .options(selectinload(EstoqueMovimentacao.item))
        .where(EstoqueMovimentacao.id == mov.id)
    )
    mov = (await db.execute(stmt)).scalar_one()
    return _mov_to_response(mov)


# ──────────────────────────────────────────────────────────────
# Endpoints — Relatório
# ──────────────────────────────────────────────────────────────

@router.get("/relatorio/posicao", response_model=List[RelatorioItemResponse])
async def relatorio_posicao(
    grupo_id: Optional[UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_estoque_plan(current_user, db)
    mov_repo = EstoqueMovimentacaoRepository(db)
    posicao = await mov_repo.get_posicao_estoque(
        tenant_id=current_user.tenant_id, grupo_id=grupo_id
    )
    result = []
    for row in posicao:
        item = row["item"]
        saldo = row["saldo"]
        result.append(
            RelatorioItemResponse(
                item_id=item.id,
                item_nome=item.nome,
                grupo_id=item.grupo_id,
                grupo_nome=item.grupo.nome if item.grupo else None,
                unidade_medida=item.unidade_medida,
                saldo=saldo,
                estoque_minimo=item.estoque_minimo,
                status=_saldo_status(saldo, item.estoque_minimo),
                ultima_movimentacao=row["ultima_movimentacao"],
            )
        )
    return result


def _safe_csv(value: object) -> str:
    """Sanitize string values for CSV export to prevent formula injection in spreadsheets."""
    s = str(value) if value is not None else ""
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + s
    return s


@router.get("/relatorio/posicao/csv")
async def relatorio_posicao_csv(
    grupo_id: Optional[UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export relatório de posição de estoque como CSV (plano Pro+; botão visível apenas Premium)."""
    await _require_estoque_plan(current_user, db)
    mov_repo = EstoqueMovimentacaoRepository(db)
    posicao = await mov_repo.get_posicao_estoque(
        tenant_id=current_user.tenant_id, grupo_id=grupo_id
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Item", "Grupo", "Unidade", "Saldo", "Estoque Mínimo", "Status", "Última Movimentação"])
    for row in posicao:
        item = row["item"]
        saldo = row["saldo"]
        ultima = row["ultima_movimentacao"]
        writer.writerow([
            _safe_csv(item.nome),
            _safe_csv(item.grupo.nome) if item.grupo else "",
            item.unidade_medida,
            saldo,
            item.estoque_minimo,
            _saldo_status(saldo, item.estoque_minimo),
            ultima.isoformat() if ultima else "",
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=estoque_posicao.csv"},
    )
