"""Conferência dos comprovantes de mensalidade (AM-12 + pagamento parcial, migração 092).

    GET   /api/v1/admin/financeiro/mensalidades/comprovantes-para-conferir           FINANCEIRO:view
    GET   /api/v1/admin/financeiro/mensalidades/{mediun_id}/{mes}/comprovantes       FINANCEIRO:view
    GET   /api/v1/admin/financeiro/mensalidades/comprovantes/{comprovante_id}/arquivo FINANCEIRO:view
    PATCH /api/v1/admin/financeiro/mensalidades/comprovantes/{comprovante_id}/conferir     FINANCEIRO:edit
    PATCH /api/v1/admin/financeiro/mensalidades/comprovantes/{comprovante_id}/nao-confirmar FINANCEIRO:edit
    PATCH /api/v1/admin/financeiro/mensalidades/{mediun_id}/{mes}/recusa             FINANCEIRO:edit (legado)

Todos com o plano `mensalidade_mediun` (`require_plan_feature`). O fluxo:
1. o médium envia um ou mais comprovantes pela Área (`POST /api/v1/medium/mensalidades/{mes}/
   comprovante`, cada envio é uma linha nova de `mensalidade_comprovantes`, com o valor que ele
   diz ter pago — opcional);
2. a fila mostra cada comprovante em conferência (todos os meses, o mais antigo primeiro), com
   o valor do mês, o que já entrou e o que falta;
3. **conferir** = a casa diz QUANTO entrou de fato (`valor`; "recebi só uma parte" é o mesmo
   gesto com um valor menor). Quando o recebido (conferidos + cobranças automáticas pagas)
   alcança o valor do mês, o mês vira PAGO sozinho (`services/mensalidade_parcial.
   fechar_se_quitado`: valor pago = recebido, espelho em contas a receber, auditoria). Pago a
   mais fica só informado. Comprovante conferido num mês que já estava PAGO soma ao total;
4. **não confirmar** = comprovante errado/ilegível, com o motivo que o médium vê; o histórico
   fica e ele pode enviar outro.
O registro manual (POST de registro, `mensalidades.py`) continua valendo e é a palavra final:
PAGO com o `valor_pago` informado fecha o mês como sempre.

`PATCH .../{mediun_id}/{mes}/recusa` (legado do slot único) não confirma TODOS os comprovantes
em conferência daquele mês — a tela nova usa os endpoints por comprovante.

Auditoria só com ids e valores (`mensalidade_comprovante_medium`) — nunca o motivo nem o arquivo.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Path
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user, require_group_permission, require_plan_feature
from src.core.database import get_db
from src.core.errors import APIException, ConflictError, ValidationError
from src.core.tz import utc_now
from src.models import Medium, MensalidadeConfig, MensalidadePagamento, MensalidadeStatus, PermissionFeature, User
from src.models.mensalidades import (
    COMPROVANTE_CONFERIDO,
    COMPROVANTE_EM_CONFERENCIA,
    COMPROVANTE_NAO_CONFIRMADO,
    MensalidadeComprovante,
)
from src.services import mensalidade_parcial as parcial
from src.services.audit_service import AuditService
from src.services.medium_mensalidade import RECUSA_MOTIVO_MAX, parse_mes

router = APIRouter(prefix="/api/v1/admin/financeiro", tags=["admin-financeiro"])

_GATE = Depends(require_plan_feature("mensalidade_mediun"))
_AUDIT = "mensalidade_comprovante_medium"


# ── Schemas ───────────────────────────────────────────────────────────────────


class ComprovanteParaConferir(BaseModel):
    comprovante_id: UUID
    pagamento_id: UUID
    mediun_id: UUID
    mediun_nome: str
    mes: str
    # Valor do mês (o vigente gravado; sem registro de valor, o da configuração).
    valor: Optional[float] = None
    valor_recebido: float = 0.0
    falta: Optional[float] = None
    valor_informado: Optional[float] = None
    mes_status: str
    comprovante_enviado_em: datetime
    comprovante_filename: Optional[str] = None
    comprovante_mime: Optional[str] = None


class ComprovanteItem(BaseModel):
    id: UUID
    origem: str  # medium | painel
    enviado_em: datetime
    arquivo_filename: str
    arquivo_mime: str
    arquivo_tamanho: int
    valor_informado: Optional[float] = None
    status: str  # em_conferencia | conferido | nao_confirmado
    valor_conferido: Optional[float] = None
    conferido_em: Optional[datetime] = None
    motivo: Optional[str] = None


class HistoricoMes(BaseModel):
    mediun_id: UUID
    mediun_nome: str
    mes: str
    pagamento_id: Optional[UUID] = None
    # PENDENTE | PAGO | ISENTO (None = sem registro no mês)
    status: Optional[str] = None
    valor_mensalidade: Optional[float] = None
    valor_recebido: float = 0.0
    recebido_automatico: float = 0.0
    falta: Optional[float] = None
    pago_a_mais: float = 0.0
    valor_pago: Optional[float] = None
    comprovantes: List[ComprovanteItem] = []


class ConferirRequest(BaseModel):
    valor: Decimal = Field(..., gt=0, max_digits=10, decimal_places=2)


class NaoConfirmarRequest(BaseModel):
    motivo: str = Field(..., min_length=1, max_length=RECUSA_MOTIVO_MAX)


class RecusaRequest(NaoConfirmarRequest):
    pass


class RecusaResponse(BaseModel):
    mediun_id: UUID
    mes: str
    recusa_motivo: str
    recusado_em: datetime
    nao_confirmados: int = 1


# ── Helpers ───────────────────────────────────────────────────────────────────


def _f(valor) -> Optional[float]:
    return float(valor) if valor is not None else None


def _mes(texto: str) -> date:
    try:
        return parse_mes(texto)
    except ValueError:
        raise ValidationError("Mês inválido. Use AAAA-MM.", details={"error_code": "MES_INVALIDO"})


def _motivo(texto: str) -> str:
    motivo = " ".join(texto.split())
    if len(motivo) < 3:
        raise ValidationError("Conte ao médium por que o comprovante não foi confirmado.", details={"field": "motivo"})
    return motivo


def _nao_encontrado(msg: str = "Comprovante não encontrado.") -> APIException:
    return APIException(msg, status_code=404, error_code="NOT_FOUND", details={"error_code": "COMPROVANTE_NAO_ENCONTRADO"})


async def _valor_config(db: AsyncSession, tenant_id: UUID) -> Optional[MensalidadeConfig]:
    return (
        await db.execute(select(MensalidadeConfig).where(MensalidadeConfig.tenant_id == tenant_id))
    ).scalar_one_or_none()


def _item(c: parcial.ComprovanteInfo) -> ComprovanteItem:
    return ComprovanteItem(
        id=c.id,
        origem=c.origem,
        enviado_em=c.enviado_em,
        arquivo_filename=c.arquivo_filename,
        arquivo_mime=c.arquivo_mime,
        arquivo_tamanho=c.arquivo_tamanho or 0,
        valor_informado=_f(c.valor_informado),
        status=c.status,
        valor_conferido=_f(c.valor_conferido),
        conferido_em=c.conferido_em,
        motivo=c.motivo,
    )


async def _historico(db: AsyncSession, tenant_id: UUID, medium: Medium, mes_date: date) -> HistoricoMes:
    """Saldo do mês + todos os comprovantes (sem arquivo), do mais antigo para o mais novo."""
    pagamento = (
        await db.execute(
            select(MensalidadePagamento).where(
                MensalidadePagamento.tenant_id == tenant_id,
                MensalidadePagamento.mediun_id == medium.id,
                MensalidadePagamento.mes_referencia == mes_date,
            )
        )
    ).scalar_one_or_none()
    config = await _valor_config(db, tenant_id)
    valor_config = config.valor_mensal if config is not None else None
    resumo = parcial.RESUMO_VAZIO
    if pagamento is not None:
        resumo = (await parcial.comprovantes_por_pagamento(db, tenant_id, [pagamento.id])).get(
            pagamento.id, parcial.RESUMO_VAZIO
        )
    gateway = (await parcial.gateway_pago_por_mes(db, tenant_id, [mes_date], [medium.id])).get(
        (medium.id, mes_date), parcial.ZERO
    )
    devido = pagamento.valor_vigente if pagamento is not None and pagamento.valor_vigente is not None else valor_config
    saldo = parcial.saldo_do_mes(devido, [c.valor_conferido for c in resumo.conferidos], [gateway])
    status = pagamento.status.value if pagamento is not None else None
    pago = status == MensalidadeStatus.PAGO.value
    recebido = parcial._dec(pagamento.valor_pago) if pago and pagamento.valor_pago is not None else saldo.recebido
    saldo_final = parcial.SaldoMes(devido=saldo.devido, recebido=recebido)
    return HistoricoMes(
        mediun_id=medium.id,
        mediun_nome=medium.nome,
        mes=mes_date.strftime("%Y-%m"),
        pagamento_id=pagamento.id if pagamento is not None else None,
        status=status,
        valor_mensalidade=_f(devido),
        valor_recebido=float(saldo_final.recebido),
        recebido_automatico=float(gateway),
        falta=0.0 if pago or status == MensalidadeStatus.ISENTO.value else (float(saldo_final.falta) if devido is not None else None),
        pago_a_mais=float(saldo_final.pago_a_mais),
        valor_pago=_f(pagamento.valor_pago) if pagamento is not None else None,
        comprovantes=[_item(c) for c in resumo.comprovantes],
    )


async def _medium_do_tenant(db: AsyncSession, tenant_id: UUID, mediun_id: UUID) -> Medium:
    medium = (
        await db.execute(
            select(Medium).where(Medium.id == mediun_id, Medium.tenant_id == tenant_id, Medium.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if medium is None:
        raise APIException("Médium não encontrado.", status_code=404, error_code="NOT_FOUND")
    return medium


async def _comprovante_travado(
    db: AsyncSession, tenant_id: UUID, comprovante_id: UUID
) -> tuple[MensalidadeComprovante, MensalidadePagamento, Medium]:
    """Comprovante + registro do mês com lock (conferência concorrente espera), só do tenant."""
    comp = (
        await db.execute(
            select(MensalidadeComprovante)
            .where(MensalidadeComprovante.id == comprovante_id, MensalidadeComprovante.tenant_id == tenant_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if comp is None:
        raise _nao_encontrado()
    pagamento = (
        await db.execute(
            select(MensalidadePagamento)
            .where(MensalidadePagamento.id == comp.pagamento_id, MensalidadePagamento.tenant_id == tenant_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    medium = (
        await db.execute(
            select(Medium).where(Medium.id == comp.mediun_id, Medium.tenant_id == tenant_id, Medium.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if pagamento is None or medium is None:
        raise _nao_encontrado()
    return comp, pagamento, medium


def _nao_pendente() -> ConflictError:
    return ConflictError(
        "Este comprovante não está esperando conferência (já foi conferido ou não confirmado).",
        details={"error_code": "COMPROVANTE_NAO_PENDENTE"},
    )


# ── Fila ──────────────────────────────────────────────────────────────────────


@router.get(
    "/mensalidades/comprovantes-para-conferir",
    response_model=List[ComprovanteParaConferir],
    dependencies=[_GATE, Depends(require_group_permission(PermissionFeature.FINANCEIRO, "view"))],
)
async def listar_comprovantes_para_conferir(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[ComprovanteParaConferir]:
    """Cada comprovante em conferência (todos os meses, o envio mais antigo primeiro)."""
    tenant_id = current_user.tenant_id
    config = await _valor_config(db, tenant_id)
    valor_config = config.valor_mensal if config is not None else None
    rows = (
        await db.execute(
            select(
                MensalidadeComprovante.id,
                MensalidadeComprovante.pagamento_id,
                MensalidadeComprovante.mediun_id,
                Medium.nome,
                MensalidadePagamento.mes_referencia,
                MensalidadePagamento.valor_vigente,
                MensalidadePagamento.status,
                MensalidadePagamento.valor_pago,
                MensalidadeComprovante.valor_informado,
                MensalidadeComprovante.enviado_em,
                MensalidadeComprovante.arquivo_filename,
                MensalidadeComprovante.arquivo_mime,
            )
            .join(
                MensalidadePagamento,
                and_(
                    MensalidadePagamento.id == MensalidadeComprovante.pagamento_id,
                    MensalidadePagamento.tenant_id == tenant_id,
                ),
            )
            .join(Medium, and_(Medium.id == MensalidadeComprovante.mediun_id, Medium.tenant_id == tenant_id))
            .where(
                MensalidadeComprovante.tenant_id == tenant_id,
                MensalidadeComprovante.status == COMPROVANTE_EM_CONFERENCIA,
                Medium.deleted_at.is_(None),
            )
            .order_by(MensalidadeComprovante.enviado_em.asc())
        )
    ).all()
    resumos = await parcial.comprovantes_por_pagamento(db, tenant_id, [r[1] for r in rows])
    gateway = await parcial.gateway_pago_por_mes(db, tenant_id, [r[4] for r in rows], [r[2] for r in rows])
    itens = []
    for cid, pid, mediun_id, nome, mes, valor_vigente, status, valor_pago, informado, enviado_em, filename, mime in rows:
        devido = valor_vigente if valor_vigente is not None else valor_config
        resumo = resumos.get(pid, parcial.RESUMO_VAZIO)
        saldo = parcial.saldo_do_mes(
            devido, [c.valor_conferido for c in resumo.conferidos], [gateway.get((mediun_id, mes))]
        )
        pago = status == MensalidadeStatus.PAGO
        recebido = parcial._dec(valor_pago) if pago and valor_pago is not None else saldo.recebido
        falta = parcial.SaldoMes(devido=saldo.devido, recebido=recebido).falta
        itens.append(
            ComprovanteParaConferir(
                comprovante_id=cid,
                pagamento_id=pid,
                mediun_id=mediun_id,
                mediun_nome=nome,
                mes=mes.strftime("%Y-%m"),
                valor=_f(devido),
                valor_recebido=float(recebido),
                falta=0.0 if pago or status == MensalidadeStatus.ISENTO else (float(falta) if devido is not None else None),
                valor_informado=_f(informado),
                mes_status=status.value,
                comprovante_enviado_em=enviado_em,
                comprovante_filename=filename,
                comprovante_mime=mime,
            )
        )
    return itens


# ── Histórico do mês e arquivo ────────────────────────────────────────────────


@router.get(
    "/mensalidades/{mediun_id}/{mes}/comprovantes",
    response_model=HistoricoMes,
    dependencies=[_GATE, Depends(require_group_permission(PermissionFeature.FINANCEIRO, "view"))],
)
async def historico_do_mes(
    mediun_id: UUID = Path(...),
    mes: str = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HistoricoMes:
    """Saldo do mês (valor, recebido, falta, pago a mais) e todos os comprovantes com o status."""
    mes_date = _mes(mes)
    medium = await _medium_do_tenant(db, current_user.tenant_id, mediun_id)
    return await _historico(db, current_user.tenant_id, medium, mes_date)


@router.get(
    "/mensalidades/comprovantes/{comprovante_id}/arquivo",
    dependencies=[_GATE, Depends(require_group_permission(PermissionFeature.FINANCEIRO, "view"))],
)
async def baixar_arquivo(
    comprovante_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """O arquivo de UM comprovante (imagem ou PDF)."""
    row = (
        await db.execute(
            select(
                MensalidadeComprovante.arquivo_data,
                MensalidadeComprovante.arquivo_mime,
                MensalidadeComprovante.arquivo_filename,
            ).where(
                MensalidadeComprovante.id == comprovante_id,
                MensalidadeComprovante.tenant_id == current_user.tenant_id,
            )
        )
    ).one_or_none()
    if row is None:
        raise _nao_encontrado()
    data, mime, filename = row
    return Response(
        content=data,
        media_type=mime or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename or "comprovante"}"'},
    )


# ── Conferir / não confirmar ──────────────────────────────────────────────────


@router.patch(
    "/mensalidades/comprovantes/{comprovante_id}/conferir",
    response_model=HistoricoMes,
    dependencies=[_GATE, Depends(require_group_permission(PermissionFeature.FINANCEIRO, "edit"))],
)
async def conferir_comprovante(
    body: ConferirRequest,
    comprovante_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HistoricoMes:
    """A casa confere QUANTO entrou por este comprovante; o mês fecha sozinho quando completa."""
    tenant_id = current_user.tenant_id
    comp, pagamento, medium = await _comprovante_travado(db, tenant_id, comprovante_id)
    if comp.status != COMPROVANTE_EM_CONFERENCIA:
        raise _nao_pendente()
    agora = utc_now()
    valor = parcial._dec(body.valor)
    comp.status = COMPROVANTE_CONFERIDO
    comp.valor_conferido = valor
    comp.conferido_por = current_user.id
    comp.conferido_em = agora
    comp.motivo = None
    comp.updated_at = agora
    await db.flush()

    config = await _valor_config(db, tenant_id)
    dia = config.dia_vencimento if config is not None else 10
    status_antes = pagamento.status.value
    fechou = False
    if pagamento.status == MensalidadeStatus.PENDENTE:
        saldo, fechou = await parcial.fechar_se_quitado(
            db,
            tenant_id=tenant_id,
            pagamento=pagamento,
            origem="direcao",
            user_id=current_user.id,
            data_pagamento=comp.enviado_em,
            valor_config=config.valor_mensal if config is not None else None,
            dia_vencimento=dia,
        )
    elif pagamento.status == MensalidadeStatus.PAGO:
        await parcial.somar_ao_mes_pago(
            db, tenant_id=tenant_id, pagamento=pagamento, valor=valor, user_id=current_user.id, dia_vencimento=dia
        )
    mes_txt = pagamento.mes_referencia.strftime("%Y-%m")
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type=_AUDIT,
        resource_id=comp.id,
        previous_state={"status": COMPROVANTE_EM_CONFERENCIA, "mes_status": status_antes},
        new_state={
            "acao": "conferido",
            "mediun_id": str(medium.id),
            "pagamento_id": str(pagamento.id),
            "mes": mes_txt,
            "valor_conferido": str(valor),
            "mes_status": pagamento.status.value,
            "mes_fechado": fechou,
            "valor_pago_mes": str(pagamento.valor_pago) if pagamento.valor_pago is not None else None,
        },
    )
    await db.commit()
    return await _historico(db, tenant_id, medium, pagamento.mes_referencia)


@router.patch(
    "/mensalidades/comprovantes/{comprovante_id}/nao-confirmar",
    response_model=HistoricoMes,
    dependencies=[_GATE, Depends(require_group_permission(PermissionFeature.FINANCEIRO, "edit"))],
)
async def nao_confirmar_comprovante(
    body: NaoConfirmarRequest,
    comprovante_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HistoricoMes:
    """Comprovante errado ou ilegível: o médium vê o motivo e pode enviar outro (o histórico fica)."""
    motivo = _motivo(body.motivo)
    tenant_id = current_user.tenant_id
    comp, pagamento, medium = await _comprovante_travado(db, tenant_id, comprovante_id)
    if comp.status != COMPROVANTE_EM_CONFERENCIA:
        raise _nao_pendente()
    agora = utc_now()
    comp.status = COMPROVANTE_NAO_CONFIRMADO
    comp.motivo = motivo
    comp.conferido_por = current_user.id
    comp.conferido_em = agora
    comp.updated_at = agora
    await db.flush()
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type=_AUDIT,
        resource_id=comp.id,
        previous_state={"status": COMPROVANTE_EM_CONFERENCIA},
        new_state={
            "acao": "nao_confirmado",
            "mediun_id": str(medium.id),
            "pagamento_id": str(pagamento.id),
            "mes": pagamento.mes_referencia.strftime("%Y-%m"),
        },
    )
    await db.commit()
    return await _historico(db, tenant_id, medium, pagamento.mes_referencia)


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
    """Legado (slot único): não confirma todos os comprovantes em conferência do mês."""
    motivo = _motivo(body.motivo)
    mes_date = _mes(mes)
    tenant_id = current_user.tenant_id
    comps = (
        await db.execute(
            select(MensalidadeComprovante)
            .join(Medium, and_(Medium.id == MensalidadeComprovante.mediun_id, Medium.tenant_id == tenant_id))
            .join(
                MensalidadePagamento,
                and_(
                    MensalidadePagamento.id == MensalidadeComprovante.pagamento_id,
                    MensalidadePagamento.tenant_id == tenant_id,
                ),
            )
            .where(
                MensalidadeComprovante.tenant_id == tenant_id,
                MensalidadeComprovante.mediun_id == mediun_id,
                MensalidadePagamento.mes_referencia == mes_date,
                Medium.deleted_at.is_(None),
            )
            .with_for_update(of=MensalidadeComprovante)
        )
    ).scalars().all()
    if not comps:
        raise _nao_encontrado("Não há comprovante deste médium neste mês.")
    pendentes = [c for c in comps if c.status == COMPROVANTE_EM_CONFERENCIA]
    if not pendentes:
        raise ConflictError(
            "Este comprovante não está esperando conferência (já foi confirmado, recusado ou removido).",
            details={"error_code": "COMPROVANTE_NAO_PENDENTE"},
        )
    agora = utc_now()
    for c in pendentes:
        c.status = COMPROVANTE_NAO_CONFIRMADO
        c.motivo = motivo
        c.conferido_por = current_user.id
        c.conferido_em = agora
        c.updated_at = agora
    await db.flush()
    for c in pendentes:
        await AuditService(db).log_update(
            tenant_id=tenant_id,
            user_id=current_user.id,
            resource_type=_AUDIT,
            resource_id=c.id,
            previous_state={"status": COMPROVANTE_EM_CONFERENCIA},
            new_state={"acao": "nao_confirmado", "mediun_id": str(mediun_id), "mes": mes_date.strftime("%Y-%m")},
        )
    await db.commit()
    return RecusaResponse(
        mediun_id=mediun_id,
        mes=mes_date.strftime("%Y-%m"),
        recusa_motivo=motivo,
        recusado_em=agora,
        nao_confirmados=len(pendentes),
    )
