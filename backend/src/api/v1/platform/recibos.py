"""Platform API — recibos emitidos pela GiraHub para terreiros.

Todos os endpoints exigem SUPER_ADMIN (`require_super_admin`). Uso típico: terreiro bonificado que
paga um valor avulso. O PDF é montado no navegador (`frontend/src/lib/pdf/reciboPdf.ts`) a partir
do que estes endpoints devolvem — inclusive `numero_formatado` e `valor_extenso`.

    GET  /api/v1/platform/recibos/emissor          → dados do emissor que irão no próximo recibo
    GET  /api/v1/platform/recibos/assinatura       → PNG da assinatura (404 se não configurada)
    GET  /api/v1/platform/recibos?tenant_id=       → recibos (de um terreiro ou todos), mais novos antes
    POST /api/v1/platform/recibos                  → emite (número sequencial do ano)
    GET  /api/v1/platform/recibos/{id}             → um recibo (2ª via)
    POST /api/v1/platform/recibos/{id}/cancelar    → cancela (não apaga; o PDF sai marcado)
"""
from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import require_super_admin
from src.core.config import settings
from src.core.database import get_db
from src.core.errors import ConflictError, NotFoundError
from src.core.tz import today_local, utc_now
from src.models import Tenant, User
from src.models.audit_logs import AuditAction
from src.models.platform_recibo import (
    DOCUMENTO_MAX,
    FORMAS_PAGAMENTO,
    MOTIVO_MAX,
    PAGADOR_MAX,
    REFERENTE_MAX,
    PlatformRecibo,
)
from src.services.platform_audit import log_platform_action
from src.services.valor_extenso import reais_por_extenso

router = APIRouter(prefix="/api/v1/platform/recibos", tags=["platform-recibos"])

# Chave do pg_advisory_xact_lock que serializa a numeração (dois cliques ao mesmo tempo).
_LOCK_NUMERACAO = 7_097_001


class EmissorOut(BaseModel):
    nome: str
    empresa: str
    cnpj: Optional[str]
    cidade: Optional[str]


class ReciboCreate(BaseModel):
    tenant_id: UUID
    pagador_nome: str = Field(..., min_length=2, max_length=PAGADOR_MAX)
    pagador_documento: Optional[str] = Field(None, max_length=DOCUMENTO_MAX)
    valor: Decimal = Field(..., gt=0, le=Decimal("99999999.99"), decimal_places=2)
    referente: str = Field(..., min_length=3, max_length=REFERENTE_MAX)
    forma_pagamento: Optional[str] = None
    data_pagamento: Optional[date] = None

    @field_validator("pagador_nome", "referente")
    @classmethod
    def _sem_espacos_sobrando(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 2:
            raise ValueError("Campo obrigatório.")
        return v

    @field_validator("pagador_documento")
    @classmethod
    def _documento(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        digitos = re.sub(r"\D", "", v)
        if len(digitos) not in (11, 14):
            raise ValueError("CPF (11 dígitos) ou CNPJ (14 dígitos).")
        return digitos

    @field_validator("forma_pagamento")
    @classmethod
    def _forma(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in FORMAS_PAGAMENTO:
            raise ValueError("Forma de pagamento inválida.")
        return v

    @field_validator("data_pagamento")
    @classmethod
    def _data(cls, v: Optional[date]) -> Optional[date]:
        if v is not None and v > today_local():
            raise ValueError("A data do pagamento não pode ser no futuro.")
        return v


class ReciboCancelar(BaseModel):
    motivo: str = Field(..., min_length=3, max_length=MOTIVO_MAX)


class ReciboOut(BaseModel):
    id: UUID
    numero: int
    ano: int
    numero_formatado: str
    tenant_id: Optional[UUID]
    tenant_nome: str
    pagador_nome: str
    pagador_documento: Optional[str]
    valor: Decimal
    valor_extenso: str
    referente: str
    forma_pagamento: Optional[str]
    data_pagamento: date
    emissor_nome: str
    emissor_empresa: str
    emissor_cnpj: Optional[str]
    emissor_cidade: Optional[str]
    cancelado_em: Optional[datetime]
    motivo_cancelamento: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def of(cls, r: PlatformRecibo) -> "ReciboOut":
        campos = {c: getattr(r, c) for c in cls.model_fields if c != "valor_extenso"}
        return cls(**campos, valor_extenso=reais_por_extenso(r.valor))


class ReciboList(BaseModel):
    items: List[ReciboOut]
    total: int


def _emissor() -> EmissorOut:
    return EmissorOut(
        nome=settings.RECIBO_EMISSOR_NOME,
        empresa=settings.RECIBO_EMISSOR_EMPRESA,
        cnpj=settings.RECIBO_EMISSOR_CNPJ or None,
        cidade=settings.RECIBO_EMISSOR_CIDADE or None,
    )


async def _get_or_404(db: AsyncSession, recibo_id: UUID) -> PlatformRecibo:
    recibo = await db.get(PlatformRecibo, recibo_id)
    if not recibo:
        raise NotFoundError("Recibo")
    return recibo


@router.get("/emissor", response_model=EmissorOut)
async def obter_emissor(current_user: User = Depends(require_super_admin)) -> EmissorOut:
    return _emissor()


@router.get("/assinatura", response_class=FileResponse)
async def obter_assinatura(current_user: User = Depends(require_super_admin)) -> FileResponse:
    """Assinatura do emissor, lida do disco do servidor (nunca do repositório, que é público)."""
    caminho = Path(settings.RECIBO_ASSINATURA_PATH)
    if not caminho.is_file():
        raise NotFoundError("Assinatura")
    return FileResponse(caminho, media_type="image/png", headers={"Cache-Control": "no-store"})


@router.get("", response_model=ReciboList)
async def listar_recibos(
    tenant_id: Optional[UUID] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> ReciboList:
    filtros = [PlatformRecibo.tenant_id == tenant_id] if tenant_id else []
    total = await db.scalar(select(func.count()).select_from(PlatformRecibo).where(*filtros)) or 0
    rows = (
        await db.execute(
            select(PlatformRecibo)
            .where(*filtros)
            .order_by(PlatformRecibo.ano.desc(), PlatformRecibo.numero.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return ReciboList(items=[ReciboOut.of(r) for r in rows], total=int(total))


@router.post("", response_model=ReciboOut, status_code=201)
async def emitir_recibo(
    body: ReciboCreate,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> ReciboOut:
    tenant = await db.get(Tenant, body.tenant_id)
    if not tenant:
        raise NotFoundError("Terreiro")

    hoje = today_local()
    data_pagamento = body.data_pagamento or hoje
    ano = hoje.year
    await db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _LOCK_NUMERACAO})
    ultimo = await db.scalar(select(func.max(PlatformRecibo.numero)).where(PlatformRecibo.ano == ano))
    emissor = _emissor()
    recibo = PlatformRecibo(
        ano=ano,
        numero=(ultimo or 0) + 1,
        tenant_id=tenant.id,
        tenant_nome=tenant.name,
        pagador_nome=body.pagador_nome,
        pagador_documento=body.pagador_documento,
        valor=body.valor,
        referente=body.referente,
        forma_pagamento=body.forma_pagamento,
        data_pagamento=data_pagamento,
        emissor_nome=emissor.nome,
        emissor_empresa=emissor.empresa,
        emissor_cnpj=emissor.cnpj,
        emissor_cidade=emissor.cidade,
        emitido_por=current_user.id,
    )
    db.add(recibo)
    await db.flush()
    log_platform_action(
        db,
        actor_id=current_user.id,
        action=AuditAction.CREATE,
        platform_action="recibo_emitido",
        description=f"Emitiu o recibo nº {recibo.numero_formatado} de R$ {body.valor:.2f} para {tenant.name}",
        tenant_id=tenant.id,
        resource_type="platform_recibo",
        resource_id=recibo.id,
        numero=recibo.numero_formatado,
        valor=str(body.valor),
    )
    await db.commit()
    await db.refresh(recibo)
    return ReciboOut.of(recibo)


@router.get("/{recibo_id}", response_model=ReciboOut)
async def obter_recibo(
    recibo_id: UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> ReciboOut:
    return ReciboOut.of(await _get_or_404(db, recibo_id))


@router.post("/{recibo_id}/cancelar", response_model=ReciboOut)
async def cancelar_recibo(
    recibo_id: UUID,
    body: ReciboCancelar,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> ReciboOut:
    recibo = await _get_or_404(db, recibo_id)
    if recibo.cancelado_em:
        raise ConflictError("Este recibo já está cancelado.")
    recibo.cancelado_em = utc_now()
    recibo.motivo_cancelamento = " ".join(body.motivo.split())
    log_platform_action(
        db,
        actor_id=current_user.id,
        action=AuditAction.UPDATE,
        platform_action="recibo_cancelado",
        description=f"Cancelou o recibo nº {recibo.numero_formatado} ({recibo.tenant_nome})",
        tenant_id=recibo.tenant_id,
        resource_type="platform_recibo",
        resource_id=recibo.id,
        numero=recibo.numero_formatado,
        motivo=recibo.motivo_cancelamento,
    )
    await db.commit()
    await db.refresh(recibo)
    return ReciboOut.of(recibo)
