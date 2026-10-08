"""Minha ficha e minha caminhada — Área do Médium (AM-19).

    GET    /api/v1/medium/ficha                  campos que a casa liberou (com o meu valor), minha
                                                 linha do tempo (marcos visíveis) e a autorização
    POST   /api/v1/medium/ficha/consentimento    autorizo a casa a guardar meus dados religiosos
    DELETE /api/v1/medium/ficha/consentimento    retiro a autorização (a direção é avisada)
    POST   /api/v1/medium/ficha/sugestoes        sugiro um valor (campos "o médium pode sugerir")

Além do `require_medium` (área + plano `area_medium`), exige o plano `ficha_espiritual` (Pro):
sem ele, 403 neutro `MEDIUM_MODULO_INDISPONIVEL` (o médium não vê oferta de upgrade) e a tela some
do Perfil (`ficha` em `GET /medium/me`).

Tudo é "meu" (`ctx.medium`, `ctx.tenant_id`). Sem autorização em vigor nada da ficha sai (nem os
campos), e nada se grava. Retirar a autorização deixa os dados inacessíveis e avisa a direção por
e-mail discreto para apagá-los (`services/ficha_espiritual`). A sugestão nunca grava na ficha: fica
pendente até a direção aceitar (uma pendente por campo; sugerir de novo troca o texto).
Escritas recusadas sob impersonação; auditoria `medium_ficha` só com a ação e ids — nunca o valor.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import MediumContext, require_medium, require_not_impersonated
from src.core.database import get_db
from src.core.errors import ForbiddenError, ValidationError
from src.core.limiter import limiter
from src.core.tz import utc_now
from src.models import FichaSugestao
from src.models.ficha_espiritual import SUGESTAO_PENDENTE, VALOR_MAX
from src.repositories.subscription_repo import SubscriptionRepository
from src.services import ficha_espiritual as fe
from src.services.audit_service import AuditService
from src.services.plan_features import get_effective_plan_features

router = APIRouter()

FICHA_INDISPONIVEL = "A ficha não está disponível na Área do Médium. Fale com a direção da casa."


async def ficha_no_plano(db: AsyncSession, tenant_id: uuid.UUID) -> bool:
    sub = await SubscriptionRepository(db).get_by_tenant(tenant_id)
    return get_effective_plan_features(sub).ficha_espiritual


async def require_ficha_na_area(
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> MediumContext:
    """Plano da casa com `ficha_espiritual` (senão 403 neutro, sem oferta)."""
    if not await ficha_no_plano(db, ctx.tenant_id):
        raise ForbiddenError(FICHA_INDISPONIVEL, details={"error_code": "MEDIUM_MODULO_INDISPONIVEL"})
    return ctx


# ── Schemas ─────────────────────────────────────────────────────────────────


class MeuConsentimento(BaseModel):
    dado: bool
    em: Optional[datetime] = None
    versao: Optional[str] = None
    versao_atual: str
    revogado_em: Optional[datetime] = None


class MinhaSugestao(BaseModel):
    valor: str
    criado_em: datetime


class MeuCampo(BaseModel):
    id: uuid.UUID
    rotulo: str
    tipo: str
    opcoes: Optional[list[str]] = None
    valor: Optional[str] = None
    pode_sugerir: bool
    sugestao_pendente: Optional[MinhaSugestao] = None


class MeuMarco(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tipo: str
    titulo: str
    data: date
    observacao: Optional[str] = None


class MinhaFichaResponse(BaseModel):
    consentimento: MeuConsentimento
    campos: list[MeuCampo]
    marcos: list[MeuMarco]


class ConsentimentoBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirmo: bool
    versao: str = Field(..., max_length=20)


class SugestaoBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    campo_id: uuid.UUID
    valor: str = Field(..., max_length=VALOR_MAX * 2)


# ── Leitura ─────────────────────────────────────────────────────────────────


async def _minha_ficha(db: AsyncSession, ctx: MediumContext) -> MinhaFichaResponse:
    medium = ctx.medium
    consentimento = MeuConsentimento(**fe.consentimento_payload(medium))
    if not fe.tem_consentimento(medium):
        return MinhaFichaResponse(consentimento=consentimento, campos=[], marcos=[])

    campos = await fe.campos_do_tenant(db, ctx.tenant_id, so_visiveis=True)
    valores = await fe.valores_do_medium(db, ctx.tenant_id, ctx.medium.id)
    pendentes = {
        s.campo_id: s
        for s in (
            await db.execute(
                select(FichaSugestao).where(
                    FichaSugestao.tenant_id == ctx.tenant_id,
                    FichaSugestao.medium_id == ctx.medium.id,
                    FichaSugestao.status == SUGESTAO_PENDENTE,
                )
            )
        ).scalars().all()
    }
    marcos = await fe.marcos_do_medium(db, ctx.tenant_id, ctx.medium.id, so_visiveis=True)
    return MinhaFichaResponse(
        consentimento=consentimento,
        campos=[
            MeuCampo(
                id=c.id,
                rotulo=c.rotulo,
                tipo=c.tipo,
                opcoes=c.opcoes,
                valor=valores[c.id].valor if c.id in valores else None,
                pode_sugerir=c.medium_pode_sugerir,
                sugestao_pendente=(
                    MinhaSugestao(valor=pendentes[c.id].valor_sugerido, criado_em=pendentes[c.id].created_at)
                    if c.id in pendentes
                    else None
                ),
            )
            for c in campos
        ],
        marcos=[MeuMarco.model_validate(m) for m in marcos],
    )


@router.get("/ficha", response_model=MinhaFichaResponse)
async def get_minha_ficha(
    ctx: MediumContext = Depends(require_ficha_na_area),
    db: AsyncSession = Depends(get_db),
) -> MinhaFichaResponse:
    return await _minha_ficha(db, ctx)


# ── Autorização ─────────────────────────────────────────────────────────────


async def _auditar(db: AsyncSession, ctx: MediumContext, acao: str, extra: Optional[dict] = None) -> None:
    await AuditService(db).log_update(
        tenant_id=ctx.tenant_id,
        user_id=ctx.user.id,
        resource_type="medium_ficha",
        resource_id=ctx.medium.id,
        previous_state={},
        new_state={"acao": acao, **(extra or {})},
    )


@router.post("/ficha/consentimento", response_model=MinhaFichaResponse, dependencies=[Depends(require_not_impersonated)])
@limiter.limit("20/hour")
async def dar_consentimento(
    request: Request,
    body: ConsentimentoBody,
    ctx: MediumContext = Depends(require_ficha_na_area),
    db: AsyncSession = Depends(get_db),
) -> MinhaFichaResponse:
    if not body.confirmo:
        raise ValidationError("Marque a caixa para autorizar.")
    fe.conferir_versao(body.versao)
    medium = ctx.medium
    if not fe.tem_consentimento(medium):
        fe.registrar_consentimento(medium, ctx.user.id)
        await _auditar(db, ctx, "médium autorizou a ficha espiritual", {"versao": fe.CONSENTIMENTO_FICHA_VERSAO})
        await db.commit()
    return await _minha_ficha(db, ctx)


@router.delete("/ficha/consentimento", response_model=MinhaFichaResponse, dependencies=[Depends(require_not_impersonated)])
@limiter.limit("20/hour")
async def retirar_consentimento(
    request: Request,
    ctx: MediumContext = Depends(require_ficha_na_area),
    db: AsyncSession = Depends(get_db),
) -> MinhaFichaResponse:
    medium = ctx.medium
    if fe.revogar_consentimento(medium):
        await _auditar(db, ctx, "médium retirou a autorização da ficha espiritual")
        await db.commit()
        await fe.avisar_admins_revogacao(db, ctx.tenant_id)
    return await _minha_ficha(db, ctx)


# ── Sugestão ────────────────────────────────────────────────────────────────


@router.post(
    "/ficha/sugestoes",
    response_model=MinhaFichaResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_not_impersonated)],
)
@limiter.limit("30/hour")
async def sugerir(
    request: Request,
    body: SugestaoBody,
    ctx: MediumContext = Depends(require_ficha_na_area),
    db: AsyncSession = Depends(get_db),
) -> MinhaFichaResponse:
    fe.exigir_consentimento(ctx.medium)
    campo = await fe.campo_do_tenant(db, ctx.tenant_id, body.campo_id)
    if not (campo.visivel_ao_medium and campo.medium_pode_sugerir):
        raise ValidationError("A casa não recebe sugestões neste campo.")
    valor = fe.normalizar_valor(campo, body.valor)
    if valor is None:
        raise ValidationError("Escreva a sua sugestão.")
    pendente = (
        await db.execute(
            select(FichaSugestao).where(
                FichaSugestao.tenant_id == ctx.tenant_id,
                FichaSugestao.medium_id == ctx.medium.id,
                FichaSugestao.campo_id == campo.id,
                FichaSugestao.status == SUGESTAO_PENDENTE,
            )
        )
    ).scalar_one_or_none()
    if pendente is not None:
        pendente.valor_sugerido = valor
        pendente.updated_at = utc_now()
        sugestao_id = pendente.id
    else:
        nova = FichaSugestao(tenant_id=ctx.tenant_id, medium_id=ctx.medium.id, campo_id=campo.id, valor_sugerido=valor)
        db.add(nova)
        await db.flush()
        sugestao_id = nova.id
    await _auditar(db, ctx, "médium sugeriu um valor na ficha", {"campo_id": str(campo.id), "sugestao_id": str(sugestao_id)})
    await db.commit()
    return await _minha_ficha(db, ctx)
