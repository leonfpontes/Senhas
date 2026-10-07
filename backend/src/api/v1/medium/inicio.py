"""GET /api/v1/medium/inicio — tela Início da Área do Médium (AM-06).

Tudo é "meu": o terreiro vem de `ctx.tenant_id` e o médium de `ctx.medium` (nunca da
requisição). Devolve, numa chamada só:

- `pendencias`: o que o médium precisa resolver, já na ordem da tela (D-24: escala → mensalidade
  a vencer/vencida → aviso novo). Escala entra no AM-17.
- `proxima_gira`: a próxima gira ativa do terreiro (ou a que está acontecendo agora), só com o
  que a corrente precisa — nome, horário e local. Nada de senhas ou consulentes.
  `orientacoes` = `giras.orientacoes_corrente` (AM-07: o que levar, só na Área).
- `mensalidade`: a do mês corrente (Brasília), só com o plano `mensalidade_mediun` e a
  configuração de mensalidade ativa; regras em `services/medium_inicio.py`.
- `avisos` (AM-09): `{nao_lidos, ultimos}` — quantos avisos o médium ainda não leu e os 3 mais
  novos deles (só título/data/fixado); zerado quando a casa desligou o módulo "avisos" (AM-10).
"""
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import MediumContext, require_medium
from src.api.v1.medium.avisos import avisos_do_medium
from src.core.database import get_db
from src.core.tz import today_local, utc_now
from src.models import Gira, MensalidadeConfig, MensalidadePagamento
from src.repositories.subscription_repo import SubscriptionRepository
from src.services.medium_area import get_area_medium_config
from src.services.medium_inicio import MensalidadeDoMes, montar_pendencias, situacao_mensalidade
from src.services.plan_features import get_effective_plan_features

router = APIRouter()

# Gira sem horário de término: continua sendo "a próxima" até algumas horas depois do início
# (a corrente abre a Área durante a gira para ver o que precisa).
GIRA_SEM_FIM_DURACAO = timedelta(hours=6)


class ProximaGira(BaseModel):
    id: str
    nome: str
    data_inicio: datetime
    data_fim: Optional[datetime] = None
    local: Optional[str] = None
    # O que levar / orientações para a corrente (`giras.orientacoes_corrente`, AM-07).
    orientacoes: Optional[str] = None


class MensalidadeInicio(BaseModel):
    mes: str
    status: str
    valor: Optional[float] = None
    vencimento: Optional[date] = None
    data_pagamento: Optional[datetime] = None


class AvisoInicio(BaseModel):
    id: str
    titulo: str
    fixado: bool
    publicado_em: datetime


class AvisosInicio(BaseModel):
    nao_lidos: int = 0
    ultimos: List[AvisoInicio] = []


class InicioResponse(BaseModel):
    hoje: date
    pendencias: List[dict]
    proxima_gira: Optional[ProximaGira] = None
    mensalidade: Optional[MensalidadeInicio] = None
    avisos: AvisosInicio


async def _proxima_gira(db: AsyncSession, ctx: MediumContext) -> Optional[ProximaGira]:
    agora = utc_now()
    gira = (
        await db.execute(
            select(Gira)
            .where(
                Gira.tenant_id == ctx.tenant_id,
                Gira.deleted_at.is_(None),
                Gira.is_active.is_(True),
                or_(
                    Gira.data_inicio >= agora,
                    and_(Gira.data_fim.is_not(None), Gira.data_fim >= agora),
                    and_(Gira.data_fim.is_(None), Gira.data_inicio >= agora - GIRA_SEM_FIM_DURACAO),
                ),
            )
            .order_by(Gira.data_inicio.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if gira is None:
        return None
    return ProximaGira(
        id=str(gira.id),
        nome=gira.nome,
        data_inicio=gira.data_inicio,
        data_fim=gira.data_fim,
        local=gira.local,
        orientacoes=(gira.orientacoes_corrente or "").strip() or None,
    )


async def _mensalidade(db: AsyncSession, ctx: MediumContext, hoje: date) -> Optional[MensalidadeDoMes]:
    sub = await SubscriptionRepository(db).get_by_tenant(ctx.tenant_id)
    if not get_effective_plan_features(sub).mensalidade_mediun:
        return None
    config = (
        await db.execute(select(MensalidadeConfig).where(MensalidadeConfig.tenant_id == ctx.tenant_id))
    ).scalar_one_or_none()
    if config is None or not config.ativo:
        return None
    pagamento = (
        await db.execute(
            select(MensalidadePagamento).where(
                MensalidadePagamento.tenant_id == ctx.tenant_id,
                MensalidadePagamento.mediun_id == ctx.medium.id,
                MensalidadePagamento.mes_referencia == hoje.replace(day=1),
            )
        )
    ).scalar_one_or_none()
    situacao = situacao_mensalidade(
        hoje=hoje,
        data_entrada=ctx.medium.data_entrada,
        isento_permanente=bool(ctx.medium.mensalidade_isento),
        valor_config=config.valor_mensal,
        dia_vencimento=config.dia_vencimento,
        pagamento_status=pagamento.status if pagamento else None,
        pagamento_valor_vigente=pagamento.valor_vigente if pagamento else None,
        pagamento_valor_pago=pagamento.valor_pago if pagamento else None,
        pagamento_data=pagamento.data_pagamento if pagamento else None,
    )
    return situacao


async def _avisos(db: AsyncSession, ctx: MediumContext) -> AvisosInicio:
    """Avisos não lidos (AM-09): contagem e os 3 mais novos. Módulo desligado → vazio."""
    if not (await get_area_medium_config(db, ctx.tenant_id)).avisos:
        return AvisosInicio()
    nao_lidos = [c for c, lido_em in await avisos_do_medium(db, ctx) if lido_em is None]
    nao_lidos.sort(key=lambda c: c.publicar_em, reverse=True)
    return AvisosInicio(
        nao_lidos=len(nao_lidos),
        ultimos=[
            AvisoInicio(id=str(c.id), titulo=c.titulo, fixado=c.fixado, publicado_em=c.publicar_em)
            for c in nao_lidos[:3]
        ],
    )


@router.get("/inicio", response_model=InicioResponse)
async def get_medium_inicio(
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> InicioResponse:
    hoje = today_local()
    mensalidade = await _mensalidade(db, ctx, hoje)
    avisos = await _avisos(db, ctx)
    return InicioResponse(
        hoje=hoje,
        pendencias=montar_pendencias(hoje=hoje, mensalidade=mensalidade, avisos_nao_lidos=avisos.nao_lidos),
        proxima_gira=await _proxima_gira(db, ctx),
        mensalidade=MensalidadeInicio(**mensalidade.as_dict()) if mensalidade else None,
        avisos=avisos,
    )
