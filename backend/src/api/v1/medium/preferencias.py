"""Avisos por e-mail do médium (AM-15) — "Avisos por e-mail" no Perfil da Área.

    GET /api/v1/medium/preferencias   o que o médium recebe por e-mail (um liga/desliga por tipo)
    PUT /api/v1/medium/preferencias   muda os tipos enviados (os outros ficam como estão)

Tipos: `mensalidade` (lembretes D-3/D+3 e troca da chave PIX), `escalas` (entrou na escala, véspera,
cancelamento), `confirmacao` (D-2 sem "Vou / Não vou"), `faltas` (convite para contar o motivo de
uma ausência) e `avisos` (aviso da casa com "Avisar por e-mail também"). Sem linha gravada = tudo
ligado. `disponiveis` diz quais fazem sentido para este médium agora (módulo da casa, plano,
isenção) — a tela só mostra esses.

D-07 (AM-27): `mostrar_nome_colegas` — "Mostrar meu primeiro nome para os colegas de escala" (padrão
desligado), em `PUT /preferencias/colegas`; `colegas_disponivel` diz se a casa tem troca de escala
(planos `atividades_corrente` + `escalas`) — a tela só mostra a opção com ele.

Tudo é "meu" (`ctx.medium`, `ctx.tenant_id`); o PUT é recusado sob impersonação e vai para a
auditoria do terreiro como `medium_perfil` (só os tipos, nunca o e-mail). O link do rodapé dos
e-mails (`/descadastro/<token>`) desliga sem login: `api/v1/public/avisos_email.py`.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import MediumContext, require_medium, require_not_impersonated
from src.core.database import get_db
from src.core.limiter import limiter
from src.core.tz import utc_now
from src.models import MediumPreferencia
from src.models.medium_lembretes import PREFERENCIAS
from src.repositories.subscription_repo import SubscriptionRepository
from src.services.audit_service import AuditService
from src.services.medium_area import get_area_medium_config, modulos_visiveis
from src.services.medium_lembretes import garantir_preferencia, preferencias_payload
from src.services.plan_features import get_effective_plan_features

router = APIRouter()


class PreferenciasEmail(BaseModel):
    mensalidade: bool = True
    escalas: bool = True
    confirmacao: bool = True
    faltas: bool = True
    avisos: bool = True


class PreferenciasResponse(BaseModel):
    preferencias: PreferenciasEmail
    disponiveis: list[str]
    # D-07 (AM-27): primeiro nome visível aos colegas de escala na hora de pedir troca.
    mostrar_nome_colegas: bool = False
    colegas_disponivel: bool = False


class ColegasUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mostrar_nome: bool


class PreferenciasUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mensalidade: Optional[bool] = None
    escalas: Optional[bool] = None
    confirmacao: Optional[bool] = None
    faltas: Optional[bool] = None
    avisos: Optional[bool] = None


async def _disponiveis(db: AsyncSession, ctx: MediumContext) -> list[str]:
    features = get_effective_plan_features(await SubscriptionRepository(db).get_by_tenant(ctx.tenant_id))
    modulos = modulos_visiveis(await get_area_medium_config(db, ctx.tenant_id), features.mensalidade_mediun)
    tem = {
        "mensalidade": "mensalidade" in modulos and not ctx.medium.mensalidade_isento,
        "escalas": features.atividades_corrente or features.escalas,
        "confirmacao": features.atividades_corrente or features.escalas,
        "faltas": features.atividades_corrente,
        "avisos": "avisos" in modulos,
    }
    return [p for p in PREFERENCIAS if tem[p]]


async def _minha(db: AsyncSession, ctx: MediumContext) -> Optional[MediumPreferencia]:
    return (
        await db.execute(
            select(MediumPreferencia).where(
                MediumPreferencia.tenant_id == ctx.tenant_id,
                MediumPreferencia.medium_id == ctx.medium.id,
            )
        )
    ).scalar_one_or_none()


async def _resposta(db: AsyncSession, ctx: MediumContext, pref: Optional[MediumPreferencia]) -> PreferenciasResponse:
    features = get_effective_plan_features(await SubscriptionRepository(db).get_by_tenant(ctx.tenant_id))
    return PreferenciasResponse(
        preferencias=PreferenciasEmail(**preferencias_payload(pref)),
        disponiveis=await _disponiveis(db, ctx),
        mostrar_nome_colegas=bool(pref is not None and pref.mostrar_nome_colegas),
        colegas_disponivel=bool(features.escalas and features.atividades_corrente),
    )


@router.get("/preferencias", response_model=PreferenciasResponse)
async def get_preferencias(
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> PreferenciasResponse:
    return await _resposta(db, ctx, await _minha(db, ctx))


@router.put(
    "/preferencias",
    response_model=PreferenciasResponse,
    dependencies=[Depends(require_not_impersonated)],
)
@limiter.limit("30/hour")
async def atualizar_preferencias(
    request: Request,
    body: PreferenciasUpdate,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> PreferenciasResponse:
    novos = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    pref = await _minha(db, ctx)
    atuais = preferencias_payload(pref)
    mudou = [k for k, v in novos.items() if atuais[k] != v]
    if mudou:
        if pref is None:
            pref = await garantir_preferencia(db, ctx.tenant_id, ctx.medium.id)
        for campo in mudou:
            setattr(pref, f"email_{campo}", novos[campo])
        pref.updated_at = utc_now()
        await AuditService(db).log_update(
            tenant_id=ctx.tenant_id,
            user_id=ctx.user.id,
            resource_type="medium_perfil",
            resource_id=ctx.medium.id,
            previous_state={},
            new_state={"acao": "médium mudou os avisos por e-mail", "campos": sorted(mudou)},
        )
        await db.commit()
        pref = await _minha(db, ctx)
    return await _resposta(db, ctx, pref)


@router.put(
    "/preferencias/colegas",
    response_model=PreferenciasResponse,
    dependencies=[Depends(require_not_impersonated)],
)
@limiter.limit("30/hour")
async def mostrar_nome_aos_colegas(
    request: Request,
    body: ColegasUpdate,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> PreferenciasResponse:
    """D-07: liga/desliga o primeiro nome visível aos colegas de escala (pedido de troca)."""
    pref = await _minha(db, ctx)
    atual = bool(pref is not None and pref.mostrar_nome_colegas)
    if atual != body.mostrar_nome:
        if pref is None:
            pref = await garantir_preferencia(db, ctx.tenant_id, ctx.medium.id)
        pref.mostrar_nome_colegas = body.mostrar_nome
        pref.updated_at = utc_now()
        await AuditService(db).log_update(
            tenant_id=ctx.tenant_id,
            user_id=ctx.user.id,
            resource_type="medium_perfil",
            resource_id=ctx.medium.id,
            previous_state={"mostrar_nome_colegas": atual},
            new_state={"acao": "médium mudou o nome visível aos colegas de escala", "mostrar_nome_colegas": body.mostrar_nome},
        )
        await db.commit()
        pref = await _minha(db, ctx)
    return await _resposta(db, ctx, pref)
