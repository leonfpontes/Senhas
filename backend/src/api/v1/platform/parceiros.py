"""Platform API — pedidos do Programa de Parceiros GiraHub (C-06).

Todos os endpoints exigem SUPER_ADMIN (`require_super_admin`). A tabela é da plataforma
(`parceiro_interesses`, sem `tenant_id`): os pedidos vêm do formulário público de `/parceiros`.

    GET   /api/v1/platform/parceiros          → lista (filtro por status, busca), com contagem por status
    GET   /api/v1/platform/parceiros/{id}     → um pedido
    PATCH /api/v1/platform/parceiros/{id}     → muda status, cupom e observações
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import require_super_admin
from src.core.database import get_db
from src.core.errors import NotFoundError
from src.models import User
from src.models.parceiro_interesse import (
    CUPOM_MAX,
    OBSERVACOES_MAX,
    STATUS_PARCEIRO,
    ParceiroInteresse,
)

router = APIRouter(prefix="/api/v1/platform/parceiros", tags=["platform-parceiros"])

CUPOM_RE = re.compile(r"^[A-Z0-9_-]{3,40}$")


class ParceiroInteresseOut(BaseModel):
    id: UUID
    nome: str
    tipo: str
    nome_negocio: Optional[str]
    cidade: str
    uf: str
    whatsapp: str
    email: str
    como_divulgar: str
    aceite_regulamento_em: datetime
    status: str
    cupom: Optional[str]
    observacoes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ParceiroInteresseList(BaseModel):
    items: List[ParceiroInteresseOut]
    total: int
    counts: Dict[str, int]


class ParceiroInteresseUpdate(BaseModel):
    status: Optional[str] = None
    cupom: Optional[str] = Field(None, max_length=CUPOM_MAX)
    observacoes: Optional[str] = Field(None, max_length=OBSERVACOES_MAX)

    @field_validator("status")
    @classmethod
    def _status_valido(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in STATUS_PARCEIRO:
            raise ValueError("Status inválido.")
        return v

    @field_validator("cupom")
    @classmethod
    def _cupom_valido(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip().upper()
        if v and not CUPOM_RE.match(v):
            raise ValueError("Cupom: de 3 a 40 letras, números, hífen ou sublinhado.")
        return v


async def _get_or_404(db: AsyncSession, pedido_id: UUID) -> ParceiroInteresse:
    pedido = await db.get(ParceiroInteresse, pedido_id)
    if not pedido:
        raise NotFoundError("Pedido de parceria")
    return pedido


@router.get("", response_model=ParceiroInteresseList)
async def listar_pedidos(
    status: Optional[str] = Query(
        None, pattern="^(novo|em_contato|aprovado|recusado)$", description="novo · em_contato · aprovado · recusado"
    ),
    q: Optional[str] = Query(None, max_length=100, description="Busca por nome, loja, cidade ou e-mail"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> ParceiroInteresseList:
    filtros = []
    if status:
        filtros.append(ParceiroInteresse.status == status)
    if q and q.strip():
        termo = f"%{q.strip()}%"
        filtros.append(
            or_(
                ParceiroInteresse.nome.ilike(termo),
                ParceiroInteresse.nome_negocio.ilike(termo),
                ParceiroInteresse.cidade.ilike(termo),
                ParceiroInteresse.email.ilike(termo),
                ParceiroInteresse.cupom.ilike(termo),
            )
        )

    total = await db.scalar(select(func.count()).select_from(ParceiroInteresse).where(*filtros)) or 0
    rows = (
        await db.execute(
            select(ParceiroInteresse)
            .where(*filtros)
            .order_by(ParceiroInteresse.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    contagem = dict(
        (
            await db.execute(
                select(ParceiroInteresse.status, func.count()).group_by(ParceiroInteresse.status)
            )
        ).all()
    )
    counts = {s: int(contagem.get(s, 0)) for s in STATUS_PARCEIRO}
    return ParceiroInteresseList(
        items=[ParceiroInteresseOut.model_validate(r) for r in rows], total=int(total), counts=counts
    )


@router.get("/{pedido_id}", response_model=ParceiroInteresseOut)
async def obter_pedido(
    pedido_id: UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> ParceiroInteresseOut:
    return ParceiroInteresseOut.model_validate(await _get_or_404(db, pedido_id))


@router.patch("/{pedido_id}", response_model=ParceiroInteresseOut)
async def atualizar_pedido(
    pedido_id: UUID,
    body: ParceiroInteresseUpdate,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> ParceiroInteresseOut:
    pedido = await _get_or_404(db, pedido_id)
    dados = body.model_dump(exclude_unset=True)
    if dados.get("status") is not None:
        pedido.status = dados["status"]
    if "cupom" in dados:
        pedido.cupom = dados["cupom"] or None
    if "observacoes" in dados:
        obs = (dados["observacoes"] or "").strip()
        pedido.observacoes = obs or None
    await db.commit()
    await db.refresh(pedido)
    return ParceiroInteresseOut.model_validate(pedido)
