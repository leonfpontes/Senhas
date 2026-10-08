"""Troca na escala pela Área do Médium — /api/v1/medium/trocas e /atividades/{origem}/{id}/troca (AM-27).

Na tela: "Pedir troca", "Quem pode ir no seu lugar", "Deixar a direção escolher", "Aceito ir" /
"Não posso" e "Cancelar pedido" — vocabulário da escala ("Você está na escala"), nunca "convocado".

- `GET  /trocas` — os pedidos que esperam a MINHA resposta (`para_responder`) e os meus pedidos e
  trocas recentes (`minhas`).
- `GET  /atividades/{origem}/{id}/troca` — se posso pedir troca nesta atividade (e por que não), se a
  casa exige aprovação, os colegas que aceitaram aparecer (só id e PRIMEIRO nome — D-07), o meu
  pedido aqui e os pedidos em que sou o colega chamado.
- `POST /atividades/{origem}/{id}/troca` — pede a troca da MINHA participação: `colega_id` de um dos
  colegas da lista, ou vazio = "a direção escolhe"; `recado` curto opcional.
- `POST /trocas/{id}/aceitar` · `/recusar` — só quem foi chamado; aceitar com a casa sem aprovação
  já troca a escala.
- `POST /trocas/{id}/cancelar` — só quem pediu, enquanto está aberto.

Tudo "meu": tenant de `ctx.tenant_id`, médium de `ctx.medium` — a participação é a do médium logado
e cada troca só aparece/age para quem pediu ou foi chamado (senão 404). O único id de outro médium
que entra é o `colega_id`, conferido contra a lista de colegas elegíveis que aceitaram aparecer
(senão 422, nada gravado). Plano: `atividades_corrente` + `escalas` (Pro; senão 403). Escritas sob
impersonação → 403 (`require_not_impersonated`). Auditoria só com ids.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import MediumContext, require_medium, require_not_impersonated, require_plan_feature
from src.core.database import get_db
from src.core.errors import ConflictError, NotFoundError
from src.core.tz import utc_now
from src.models import AtividadeParticipacao
from src.models.atividades import (
    STATUS_TROCA_ABERTOS,
    TROCA_ACEITO,
    TROCA_APROVADO,
    TROCA_CANCELADO,
    TROCA_PEDIDO,
    TROCA_RECUSADO,
    ParticipacaoTroca,
)
from src.repositories.subscription_repo import SubscriptionRepository
from src.services.audit_service import AuditService
from src.services.plan_features import get_effective_plan_features
from src.services.presenca import AtividadeCtx, ctx_da_gira
from src.services.trocas_escala import (
    FECHADA_SOLICITANTE,
    FECHADA_SUBSTITUTO,
    TrocaVisao,
    aplicar_troca,
    colegas_visiveis,
    conferir_vigente,
    exige_aprovacao,
    fechar,
    motivo_da_linha,
    pedir_troca,
    primeiro_nome,
    status_ao_aceitar,
    substituto_visivel,
    troca_aberta_da_participacao,
    troca_travada,
    trocas_do_medium,
    validar_substituto_do_tenant,
    visoes,
)

from .presencas import TipoItem, _item_do_medium

router = APIRouter()

_PLANO = [Depends(require_plan_feature("atividades_corrente")), Depends(require_plan_feature("escalas"))]
ORIGENS = ("gira", "atividade")
RECENTES_DIAS = 30


# ── Schemas ─────────────────────────────────────────────────────────────────


class AtividadeDaTroca(BaseModel):
    origem: str
    id: str
    titulo: str
    inicio: datetime
    tipo: TipoItem
    cancelada: bool


class TrocaMedium(BaseModel):
    id: uuid.UUID
    # "pedi": eu pedi a troca; "para_mim": fui chamado para ir no lugar de alguém.
    papel: str
    status: str
    # Quem precisa agir agora: "colega" ou "direcao" (null: resolvida ou não vale mais).
    aguardando: Optional[str] = None
    vigente: bool
    atividade: AtividadeDaTroca
    funcao: Optional[str] = None
    grupo: Optional[str] = None
    # Primeiro nome do outro lado (D-07); null = "um colega da corrente" / "a direção escolhe".
    colega: Optional[str] = None
    direcao_escolhe: bool
    recado: Optional[str] = None
    criada_em: datetime
    fechada_em: Optional[datetime] = None
    fechada_por: Optional[str] = None
    pode_aceitar: bool = False
    pode_recusar: bool = False
    pode_cancelar: bool = False


class MinhasTrocas(BaseModel):
    para_responder: list[TrocaMedium]
    minhas: list[TrocaMedium]
    exige_aprovacao: bool


class Colega(BaseModel):
    id: uuid.UUID
    nome: str  # só o primeiro nome


class TrocaDaAtividade(BaseModel):
    pode_pedir: bool
    motivo: Optional[str] = None
    exige_aprovacao: bool
    colegas: list[Colega] = []
    # Meu pedido nesta atividade (o aberto, ou o mais recente).
    pedido: Optional[TrocaMedium] = None
    # Pedidos em que sou o colega chamado (abertos) ou em que fui no lugar de alguém (aprovados).
    para_mim: list[TrocaMedium] = []


class PedirTrocaBody(BaseModel):
    # Um dos colegas da lista (`GET .../troca`); vazio = a direção escolhe quem vai.
    colega_id: Optional[uuid.UUID] = None
    recado: Optional[str] = Field(None, max_length=1000)


# ── Ajudantes ───────────────────────────────────────────────────────────────


def visao_do_medium(v: TrocaVisao, eu: uuid.UUID) -> TrocaMedium:
    """A troca do ponto de vista de quem pediu ou de quem foi chamado (regras de nome do D-07)."""
    t = v.troca
    pedi = t.solicitante_id == eu
    if pedi:
        colega = (
            primeiro_nome(v.substituto_nome)
            if t.substituto_id is not None
            and substituto_visivel(indicado_pela_direcao=t.indicado_pela_direcao, mostra_nome=v.substituto_mostra_nome)
            else None
        )
    else:
        colega = primeiro_nome(v.solicitante_nome)
    para_mim_aberta = not pedi and t.status == TROCA_PEDIDO and v.vigente
    return TrocaMedium(
        id=t.id,
        papel="pedi" if pedi else "para_mim",
        status=t.status,
        aguardando=v.aguardando,
        vigente=v.vigente,
        atividade=AtividadeDaTroca(**{k: x for k, x in v.atividade_dict().items() if k != "atividade_id"}),
        funcao=v.funcao,
        grupo=v.grupo,
        colega=colega,
        direcao_escolhe=t.substituto_id is None or t.indicado_pela_direcao,
        recado=t.recado,
        criada_em=t.created_at,
        fechada_em=t.fechada_em,
        fechada_por=t.fechada_por,
        pode_aceitar=para_mim_aberta,
        pode_recusar=para_mim_aberta,
        pode_cancelar=pedi and t.aberta,
    )


def _origem_valida(origem: str) -> str:
    if origem not in ORIGENS:
        raise HTTPException(status_code=404, detail="Atividade não encontrada")
    return origem


async def _item(db: AsyncSession, ctx: MediumContext, origem: str, ref_id: uuid.UUID) -> AtividadeCtx:
    """A gira (sem criar âncora: sem âncora não há escala) ou a atividade visível ao médium."""
    if _origem_valida(origem) == "gira":
        return await ctx_da_gira(db, ctx.tenant_id, ref_id, criar_ancora=False)
    return await _item_do_medium(db, ctx, origem, ref_id)


async def _minha_linha(
    db: AsyncSession, ctx: MediumContext, item: AtividadeCtx, *, travar: bool = False
) -> Optional[AtividadeParticipacao]:
    if item.atividade_id is None:
        return None
    stmt = select(AtividadeParticipacao).where(
        AtividadeParticipacao.tenant_id == ctx.tenant_id,
        AtividadeParticipacao.medium_id == ctx.medium.id,
        AtividadeParticipacao.atividade_id == item.atividade_id,
    )
    if travar:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    return (await db.execute(stmt)).scalar_one_or_none()


async def _da_atividade(db: AsyncSession, ctx: MediumContext, item: AtividadeCtx) -> TrocaDaAtividade:
    agora = utc_now()
    linha = await _minha_linha(db, ctx, item)
    motivo = motivo_da_linha(item, linha, agora)
    trocas = (
        await trocas_do_medium(db, ctx.tenant_id, ctx.medium.id, atividade_id=item.atividade_id)
        if item.atividade_id is not None
        else []
    )
    vs = [visao_do_medium(v, ctx.medium.id) for v in await visoes(db, ctx.tenant_id, trocas, agora)]
    meus = [t for t in vs if t.papel == "pedi"]
    pedido = next((t for t in meus if t.status in STATUS_TROCA_ABERTOS), meus[0] if meus else None)
    para_mim = [t for t in vs if t.papel == "para_mim" and (t.pode_aceitar or t.status == TROCA_APROVADO)]
    aberta = linha is not None and await troca_aberta_da_participacao(db, ctx.tenant_id, linha.id) is not None
    pode = motivo is None and not aberta
    colegas = (
        [Colega(id=i, nome=n) for i, n in await colegas_visiveis(db, ctx.tenant_id, item, ctx.medium.id)] if pode else []
    )
    return TrocaDaAtividade(
        pode_pedir=pode,
        motivo=motivo,
        exige_aprovacao=await exige_aprovacao(db, ctx.tenant_id),
        colegas=colegas,
        pedido=pedido,
        para_mim=para_mim,
    )


async def _troca_minha(db: AsyncSession, ctx: MediumContext, troca_id: uuid.UUID, *, como: str) -> ParticipacaoTroca:
    """A troca travada, só se eu sou quem pediu (`como = 'solicitante'`) ou o colega chamado."""
    troca = await troca_travada(db, ctx.tenant_id, troca_id)
    dono = troca is not None and (
        troca.solicitante_id == ctx.medium.id if como == "solicitante" else troca.substituto_id == ctx.medium.id
    )
    if not dono:
        raise NotFoundError("Troca")
    return troca


async def _uma(db: AsyncSession, ctx: MediumContext, troca: ParticipacaoTroca) -> TrocaMedium:
    vs = await visoes(db, ctx.tenant_id, [troca])
    if not vs:  # pragma: no cover — atividade excluída no meio
        raise NotFoundError("Troca")
    return visao_do_medium(vs[0], ctx.medium.id)


async def _auditar(db: AsyncSession, ctx: MediumContext, troca: ParticipacaoTroca, acao: str) -> None:
    """Só ids (nunca nomes nem o recado)."""
    await AuditService(db).log_update(
        tenant_id=ctx.tenant_id,
        user_id=ctx.user.id,
        resource_type="medium_troca",
        resource_id=troca.id,
        previous_state={},
        new_state={
            "acao": acao,
            "status": troca.status,
            "atividade_id": str(troca.atividade_id),
            "participacao_id": str(troca.participacao_id),
            "substituto_id": str(troca.substituto_id) if troca.substituto_id else None,
        },
    )


async def trocas_no_plano(db: AsyncSession, ctx: MediumContext) -> bool:
    sub = await SubscriptionRepository(db).get_by_tenant(ctx.tenant_id)
    features = get_effective_plan_features(sub)
    return bool(features.escalas and features.atividades_corrente)


async def minhas_trocas(db: AsyncSession, ctx: MediumContext) -> MinhasTrocas:
    """Para o Início e a rota `GET /trocas`."""
    agora = utc_now()
    trocas = await trocas_do_medium(db, ctx.tenant_id, ctx.medium.id, desde=agora - timedelta(days=RECENTES_DIAS))
    vs = [visao_do_medium(v, ctx.medium.id) for v in await visoes(db, ctx.tenant_id, trocas, agora)]
    para_responder = [t for t in vs if t.pode_aceitar]
    para_responder.sort(key=lambda t: t.atividade.inicio)
    minhas = [t for t in vs if not t.pode_aceitar and (t.papel == "pedi" or t.status == TROCA_APROVADO)]
    return MinhasTrocas(
        para_responder=para_responder, minhas=minhas, exige_aprovacao=await exige_aprovacao(db, ctx.tenant_id)
    )


# ── Rotas ───────────────────────────────────────────────────────────────────


@router.get("/trocas", response_model=MinhasTrocas, dependencies=_PLANO)
async def listar_minhas_trocas(
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> MinhasTrocas:
    return await minhas_trocas(db, ctx)


@router.get("/atividades/{origem}/{ref_id}/troca", response_model=TrocaDaAtividade, dependencies=_PLANO)
async def troca_da_atividade(
    origem: str,
    ref_id: uuid.UUID,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> TrocaDaAtividade:
    item = await _item(db, ctx, origem, ref_id)
    return await _da_atividade(db, ctx, item)


@router.post(
    "/atividades/{origem}/{ref_id}/troca",
    response_model=TrocaDaAtividade,
    dependencies=[*_PLANO, Depends(require_not_impersonated)],
)
async def pedir(
    origem: str,
    ref_id: uuid.UUID,
    body: PedirTrocaBody,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> TrocaDaAtividade:
    """Pede a troca da minha participação: a um colega da lista ou "a direção escolhe"."""
    item = await _item(db, ctx, origem, ref_id)
    linha = await _minha_linha(db, ctx, item, travar=True)
    if linha is None:
        raise ConflictError("Você não está na escala desta atividade.", details={"error_code": "SEM_TROCA"})
    if body.colega_id is not None:
        # Só um dos colegas da lista: elegível, fora da escala e que aceitou aparecer (D-07).
        await validar_substituto_do_tenant(db, ctx.tenant_id, item, ctx.medium.id, body.colega_id, so_visiveis=True)
    troca = await pedir_troca(db, ctx.tenant_id, item, linha, substituto_id=body.colega_id, recado=body.recado)
    await _auditar(db, ctx, troca, "pediu troca")
    await db.commit()
    return await _da_atividade(db, ctx, item)


@router.post(
    "/trocas/{troca_id}/aceitar",
    response_model=TrocaMedium,
    dependencies=[*_PLANO, Depends(require_not_impersonated)],
)
async def aceitar(
    troca_id: uuid.UUID,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> TrocaMedium:
    """Aceito ir: com a casa exigindo aprovação, vai para a direção; senão a escala já troca."""
    agora = utc_now()
    troca = await _troca_minha(db, ctx, troca_id, como="substituto")
    if troca.status != TROCA_PEDIDO:
        raise ConflictError("Este pedido de troca já foi resolvido.")
    item, original = await conferir_vigente(db, ctx.tenant_id, troca, agora)
    # Eu ainda posso ir (ativo, alcançado pelo tipo e fora desta escala)?
    await validar_substituto_do_tenant(db, ctx.tenant_id, item, troca.solicitante_id, ctx.medium.id, so_visiveis=False)
    troca.respondido_em = agora
    troca.updated_at = agora
    if status_ao_aceitar(await exige_aprovacao(db, ctx.tenant_id)) == TROCA_APROVADO:
        await aplicar_troca(db, ctx.tenant_id, troca, original, ctx.medium.id, por=FECHADA_SUBSTITUTO, agora=agora)
    else:
        troca.status = TROCA_ACEITO
    await _auditar(db, ctx, troca, "aceitou a troca")
    await db.commit()
    return await _uma(db, ctx, troca)


@router.post(
    "/trocas/{troca_id}/recusar",
    response_model=TrocaMedium,
    dependencies=[*_PLANO, Depends(require_not_impersonated)],
)
async def recusar(
    troca_id: uuid.UUID,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> TrocaMedium:
    """Não posso ir: o pedido fecha e quem pediu continua na escala."""
    troca = await _troca_minha(db, ctx, troca_id, como="substituto")
    if troca.status != TROCA_PEDIDO:
        raise ConflictError("Este pedido de troca já foi resolvido.")
    agora = utc_now()
    troca.respondido_em = agora
    fechar(troca, TROCA_RECUSADO, FECHADA_SUBSTITUTO, agora)
    await _auditar(db, ctx, troca, "recusou a troca")
    await db.commit()
    return await _uma(db, ctx, troca)


@router.post(
    "/trocas/{troca_id}/cancelar",
    response_model=TrocaMedium,
    dependencies=[*_PLANO, Depends(require_not_impersonated)],
)
async def cancelar(
    troca_id: uuid.UUID,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> TrocaMedium:
    """Cancelo o meu pedido enquanto ninguém aprovou."""
    troca = await _troca_minha(db, ctx, troca_id, como="solicitante")
    if not troca.aberta:
        raise ConflictError("Este pedido de troca já foi resolvido.")
    fechar(troca, TROCA_CANCELADO, FECHADA_SOLICITANTE, utc_now())
    await _auditar(db, ctx, troca, "cancelou o pedido de troca")
    await db.commit()
    return await _uma(db, ctx, troca)
