"""Comprovantes de mensalidade enviados pelos médiuns na Área (AM-12, decisão D-25).

    GET   /api/v1/admin/financeiro/mensalidades/comprovantes-para-conferir   FINANCEIRO:view
    PATCH /api/v1/admin/financeiro/mensalidades/{mediun_id}/{mes}/recusa      FINANCEIRO:edit

Ambos com o plano `mensalidade_mediun` (`require_plan_feature`). O fluxo completo:
1. o médium envia o comprovante pela Área (`POST /api/v1/medium/mensalidades/{mes}/comprovante`):
   o registro do mês fica PENDENTE com `comprovante_enviado_em`;
2. a fila acima mostra o que falta conferir (todos os meses, o mais antigo primeiro) — o
   arquivo continua no download que já existia (`GET .../{mediun_id}/{mes}/comprovante`);
3. **confirmar** = o POST de registro de sempre (`mensalidades.py`, FINANCEIRO:insert) com
   status PAGO: espelha em contas a receber como qualquer pagamento;
4. **não confirmar** = este PATCH com o motivo, que o médium vê na Área; ele pode reenviar
   (o reenvio limpa a recusa e o mês volta para a fila).
"""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user, require_group_permission, require_plan_feature
from src.core.database import get_db
from src.core.errors import APIException, ConflictError, ValidationError
from src.core.tz import utc_now
from src.models import Medium, MensalidadeConfig, MensalidadePagamento, MensalidadeStatus, PermissionFeature, User
from src.services.audit_service import AuditService
from src.services.medium_mensalidade import RECUSA_MOTIVO_MAX, comprovante_para_conferir, parse_mes

router = APIRouter(prefix="/api/v1/admin/financeiro", tags=["admin-financeiro"])

_GATE = Depends(require_plan_feature("mensalidade_mediun"))


class ComprovanteParaConferir(BaseModel):
    pagamento_id: UUID
    mediun_id: UUID
    mediun_nome: str
    mes: str
    valor: Optional[float] = None
    comprovante_enviado_em: datetime
    comprovante_filename: Optional[str] = None
    comprovante_mime: Optional[str] = None


class RecusaRequest(BaseModel):
    motivo: str = Field(..., min_length=1, max_length=RECUSA_MOTIVO_MAX)


class RecusaResponse(BaseModel):
    mediun_id: UUID
    mes: str
    recusa_motivo: str
    recusado_em: datetime


@router.get(
    "/mensalidades/comprovantes-para-conferir",
    response_model=List[ComprovanteParaConferir],
    dependencies=[_GATE, Depends(require_group_permission(PermissionFeature.FINANCEIRO, "view"))],
)
async def listar_comprovantes_para_conferir(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[ComprovanteParaConferir]:
    """Comprovantes enviados pelos médiuns e ainda não conferidos (todos os meses)."""
    tenant_id = current_user.tenant_id
    valor_config = (
        await db.execute(select(MensalidadeConfig.valor_mensal).where(MensalidadeConfig.tenant_id == tenant_id))
    ).scalar_one_or_none()
    rows = (
        await db.execute(
            select(
                MensalidadePagamento.id,
                MensalidadePagamento.mediun_id,
                Medium.nome,
                MensalidadePagamento.mes_referencia,
                MensalidadePagamento.valor_vigente,
                MensalidadePagamento.comprovante_enviado_em,
                MensalidadePagamento.comprovante_filename,
                MensalidadePagamento.comprovante_mime,
            )
            .join(Medium, and_(Medium.id == MensalidadePagamento.mediun_id, Medium.tenant_id == tenant_id))
            .where(
                MensalidadePagamento.tenant_id == tenant_id,
                MensalidadePagamento.status == MensalidadeStatus.PENDENTE,
                MensalidadePagamento.comprovante_enviado_em.is_not(None),
                MensalidadePagamento.comprovante_filename.is_not(None),
                or_(
                    MensalidadePagamento.recusado_em.is_(None),
                    MensalidadePagamento.recusado_em < MensalidadePagamento.comprovante_enviado_em,
                ),
                Medium.deleted_at.is_(None),
            )
            .order_by(MensalidadePagamento.comprovante_enviado_em.asc())
        )
    ).all()
    itens = []
    for pid, mediun_id, nome, mes, valor_vigente, enviado_em, filename, mime in rows:
        valor = valor_vigente if valor_vigente is not None else valor_config
        itens.append(
            ComprovanteParaConferir(
                pagamento_id=pid,
                mediun_id=mediun_id,
                mediun_nome=nome,
                mes=mes.strftime("%Y-%m"),
                valor=float(valor) if valor is not None else None,
                comprovante_enviado_em=enviado_em,
                comprovante_filename=filename,
                comprovante_mime=mime,
            )
        )
    return itens


def _mes(texto: str) -> date:
    try:
        return parse_mes(texto)
    except ValueError:
        raise ValidationError("Mês inválido. Use AAAA-MM.", details={"error_code": "MES_INVALIDO"})


@router.patch(
    "/mensalidades/{mediun_id}/{mes}/recusa",
    response_model=RecusaResponse,
    dependencies=[_GATE, Depends(require_group_permission(PermissionFeature.FINANCEIRO, "edit"))],
)
async def recusar_comprovante(
    body: RecusaRequest,
    mediun_id: UUID = Path(...),
    mes: str = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RecusaResponse:
    """Não confirma o comprovante enviado pelo médium; o motivo aparece para ele na Área."""
    motivo = " ".join(body.motivo.split())
    if len(motivo) < 3:
        raise ValidationError("Conte ao médium por que o comprovante não foi confirmado.", details={"field": "motivo"})
    mes_date = _mes(mes)
    tenant_id = current_user.tenant_id
    pagamento = (
        await db.execute(
            select(MensalidadePagamento)
            .join(Medium, and_(Medium.id == MensalidadePagamento.mediun_id, Medium.tenant_id == tenant_id))
            .where(
                MensalidadePagamento.tenant_id == tenant_id,
                MensalidadePagamento.mediun_id == mediun_id,
                MensalidadePagamento.mes_referencia == mes_date,
                Medium.deleted_at.is_(None),
            )
            .with_for_update(of=MensalidadePagamento)
        )
    ).scalar_one_or_none()
    if pagamento is None:
        raise APIException(
            "Não há comprovante deste médium neste mês.",
            status_code=404,
            error_code="NOT_FOUND",
            details={"error_code": "COMPROVANTE_NAO_ENCONTRADO"},
        )
    if not comprovante_para_conferir(
        pagamento.status,
        pagamento.comprovante_enviado_em,
        bool(pagamento.comprovante_filename),
        pagamento.recusado_em,
    ):
        raise ConflictError(
            "Este comprovante não está esperando conferência (já foi confirmado, recusado ou removido).",
            details={"error_code": "COMPROVANTE_NAO_PENDENTE"},
        )
    agora = utc_now()
    pagamento.recusa_motivo = motivo
    pagamento.recusado_em = agora
    pagamento.updated_at = agora
    await db.flush()
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="mensalidade_comprovante_medium",
        resource_id=pagamento.id,
        new_state={"mediun_id": str(mediun_id), "mes": mes_date.strftime("%Y-%m"), "acao": "nao_confirmado", "motivo": motivo},
    )
    await db.commit()
    return RecusaResponse(
        mediun_id=mediun_id, mes=mes_date.strftime("%Y-%m"), recusa_motivo=motivo, recusado_em=agora
    )
