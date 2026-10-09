"""GET /api/v1/medium/inicio — tela Início da Área do Médium (AM-06).

Tudo é "meu": o terreiro vem de `ctx.tenant_id` e o médium de `ctx.medium` (nunca da
requisição). Devolve, numa chamada só:

- `pendencias`: o que o médium precisa resolver, já na ordem da tela (D-24: escala → mensalidade
  a vencer/vencida → aviso novo). Escala (AM-17): quantas escalas pedem "Vou / Não vou" ou estão
  com o "Cheguei" aberto agora.
- `escalas` (AM-17): as próximas giras/atividades em que o médium está na escala (até 21 dias, e
  as que estão acontecendo), com `minha_participacao` — o Início mostra "Você está na escala" com
  Vou / Não vou, "Responda até…" e o "Cheguei" na janela. Vazio sem o plano `atividades_corrente`.
- `proxima_gira`: a próxima gira ativa do terreiro (ou a que está acontecendo agora), só com o
  que a corrente precisa — nome, horário e local. Nada de senhas ou consulentes.
  `orientacoes` = `giras.orientacoes_corrente` (AM-07: o que levar, só na Área).
- `mensalidade`: a do mês corrente (Brasília), só com o plano `mensalidade_mediun` e a
  configuração de mensalidade ativa; regras em `services/medium_inicio.py`. `pix_disponivel`
  (AM-29) diz só se a casa cadastrou a chave PIX (AM-10) — a chave nunca sai no Início.
- `avisos` (AM-09): `{nao_lidos, ultimos}` — quantos avisos o médium ainda não leu e os 3 mais
  novos deles (só título/data/fixado); zerado quando a casa desligou o módulo "avisos" (AM-10).
- `aniversariantes` (AM-20): médiuns ATIVOS da casa, com a Área, que aceitaram mostrar o
  aniversário (`aniversario_visivel`) e fazem aniversário nesta semana (segunda a domingo,
  Brasília) — só primeiro nome, dia e mês (nunca o ano nem o id). Lista vazia = o cartão some.
- `meu_aniversario` (AM-20): no dia do aniversário do próprio médium, a mensagem da casa
  (`tenant_configs.area_medium_aniversario_mensagem` ou o texto padrão). Sem opt-in: só ele vê.
- `trocas` (AM-27): pedidos de troca que esperam a resposta do médium (`para_responder`, viram a
  pendência `troca`) e os pedidos dele ainda abertos ou resolvidos há pouco (`minhas`). Null sem
  os planos `atividades_corrente` + `escalas`.
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
from src.models import Gira, Medium, MensalidadeConfig, MensalidadePagamento, Tenant, TenantConfig
from src.repositories.subscription_repo import SubscriptionRepository
from src.services.medium_aniversarios import aniversariantes_da_semana, faz_aniversario_hoje, mensagem_aniversario
from src.services.medium_area import get_area_medium_config
from src.services.medium_inicio import MensalidadeDoMes, montar_pendencias, situacao_mensalidade
from src.services.mensalidade_parcial import RESUMO_VAZIO, comprovantes_por_pagamento, gateway_pago_por_mes
from src.services.plan_features import get_effective_plan_features
from src.services.presenca import SITUACAO_DISPENSADO, SITUACAO_SUBSTITUIDO

from .presencas import ItemPresenca, item_de, itens_do_periodo, participacoes_do_medium, presenca_no_plano
from .trocas import MinhasTrocas, minhas_trocas, trocas_no_plano

router = APIRouter()

# Gira sem horário de término: continua sendo "a próxima" até algumas horas depois do início
# (a corrente abre a Área durante a gira para ver o que precisa).
GIRA_SEM_FIM_DURACAO = timedelta(hours=6)
# Escalas que aparecem no Início: as que estão acontecendo e as dos próximos 21 dias.
ESCALAS_HORIZONTE = timedelta(days=21)
ESCALAS_PASSADO = timedelta(days=2)


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
    # Pagamento parcial (092): `valor` é o que falta; aqui o valor do mês e o já recebido.
    valor_mensalidade: Optional[float] = None
    valor_recebido: Optional[float] = None
    # A casa cadastrou a chave PIX da mensalidade (AM-10)? Só o sim/não — a chave nunca sai
    # aqui. Sem chave, o Início mostra "Ver mensalidade" no lugar de "Pagar com PIX" (AM-29).
    pix_disponivel: bool = False


class AvisoInicio(BaseModel):
    id: str
    titulo: str
    fixado: bool
    publicado_em: datetime


class AvisosInicio(BaseModel):
    nao_lidos: int = 0
    ultimos: List[AvisoInicio] = []


class AniversarianteInicio(BaseModel):
    """Só o que a corrente vê (AM-20): primeiro nome, dia e mês — nunca o ano nem o id."""

    primeiro_nome: str
    dia: int
    mes: int
    hoje: bool
    sou_eu: bool


class MeuAniversario(BaseModel):
    mensagem: str


class InicioResponse(BaseModel):
    hoje: date
    pendencias: List[dict]
    proxima_gira: Optional[ProximaGira] = None
    mensalidade: Optional[MensalidadeInicio] = None
    avisos: AvisosInicio
    escalas: List[ItemPresenca] = []
    aniversariantes: List[AniversarianteInicio] = []
    meu_aniversario: Optional[MeuAniversario] = None
    trocas: Optional[MinhasTrocas] = None


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


async def _mensalidade(
    db: AsyncSession, ctx: MediumContext, hoje: date
) -> tuple[Optional[MensalidadeDoMes], bool]:
    """Mensalidade do mês e se a casa tem chave PIX cadastrada (sem revelar a chave)."""
    sub = await SubscriptionRepository(db).get_by_tenant(ctx.tenant_id)
    if not get_effective_plan_features(sub).mensalidade_mediun:
        return None, False
    config = (
        await db.execute(select(MensalidadeConfig).where(MensalidadeConfig.tenant_id == ctx.tenant_id))
    ).scalar_one_or_none()
    if config is None or not config.ativo:
        return None, False
    pagamento = (
        await db.execute(
            select(MensalidadePagamento).where(
                MensalidadePagamento.tenant_id == ctx.tenant_id,
                MensalidadePagamento.mediun_id == ctx.medium.id,
                MensalidadePagamento.mes_referencia == hoje.replace(day=1),
            )
        )
    ).scalar_one_or_none()
    # Comprovantes do mês (092) e o que já entrou: "em conferência" sai das pendências,
    # "não confirmado" volta para elas e o valor da pendência é o que FALTA pagar.
    resumo = RESUMO_VAZIO
    recebido = None
    if pagamento is not None:
        resumo = (await comprovantes_por_pagamento(db, ctx.tenant_id, [pagamento.id])).get(pagamento.id, RESUMO_VAZIO)
        gateway = await gateway_pago_por_mes(db, ctx.tenant_id, [pagamento.mes_referencia], [ctx.medium.id])
        recebido = resumo.recebido + gateway.get((ctx.medium.id, pagamento.mes_referencia), 0)
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
        valor_recebido=recebido,
        **resumo.para_situacao(),
    )
    return situacao, bool((config.pix_chave or "").strip())


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


async def _escalas(db: AsyncSession, ctx: MediumContext) -> list[ItemPresenca]:
    """Próximas escalas do médium (e as em andamento), sem dispensadas — AM-17."""
    if not await presenca_no_plano(db, ctx):
        return []
    agora = utc_now()
    itens = await itens_do_periodo(db, ctx, agora - ESCALAS_PASSADO, agora + ESCALAS_HORIZONTE)
    participacoes = await participacoes_do_medium(db, ctx, itens, agora)
    out = []
    for item in itens:
        participacao, _ = participacoes.get((item.origem, item.ref_id), (None, False))
        if participacao is None or item.cancelada:
            continue
        if participacao["situacao"] in (SITUACAO_DISPENSADO, SITUACAO_SUBSTITUIDO):
            continue
        # Já acabou: só fica enquanto o "Cheguei" ainda está aberto.
        if item.fim_efetivo < agora and not participacao["pode_checkin"]:
            continue
        out.append(ItemPresenca(**item_de(item, participacao)))
    return out


async def _aniversariantes(db: AsyncSession, ctx: MediumContext, hoje: date) -> list[AniversarianteInicio]:
    """Quem aceitou mostrar o aniversário e faz aniversário nesta semana (AM-20).

    Lê OUTROS médiuns da casa de propósito (exceção do auditor, `EXEMPT_MEDIUM_QUERIES`): só
    ativos, com a Área (vínculo `user_id`) e com o opt-in ligado; só nome e nascimento saem do
    banco e só primeiro nome + dia/mês saem da rota.
    """
    rows = await db.execute(
        select(Medium.id, Medium.nome, Medium.data_nascimento).where(
            Medium.tenant_id == ctx.tenant_id,
            Medium.deleted_at.is_(None),
            Medium.is_active.is_(True),
            Medium.user_id.is_not(None),
            Medium.aniversario_visivel.is_(True),
            Medium.data_nascimento.is_not(None),
        )
    )
    return [
        AniversarianteInicio(**a.as_dict())
        for a in aniversariantes_da_semana(hoje, [(r[0], r[1], r[2]) for r in rows.all()], ctx.medium.id)
    ]


async def _meu_aniversario(db: AsyncSession, ctx: MediumContext, hoje: date) -> Optional[MeuAniversario]:
    """Mensagem da casa no dia do aniversário do próprio médium (sem opt-in: só ele vê)."""
    if not faz_aniversario_hoje(ctx.medium.data_nascimento, hoje):
        return None
    terreiro = (
        await db.execute(select(Tenant.name).where(Tenant.id == ctx.tenant_id))
    ).scalar_one_or_none() or ""
    personalizada = (
        await db.execute(
            select(TenantConfig.area_medium_aniversario_mensagem).where(TenantConfig.tenant_id == ctx.tenant_id)
        )
    ).scalar_one_or_none()
    return MeuAniversario(mensagem=mensagem_aniversario(terreiro, ctx.medium.nome, personalizada))


def escalas_pendentes(escalas: list[ItemPresenca]) -> int:
    """Escalas que pedem ação: responder (sem resposta) ou marcar "Cheguei" agora."""
    return sum(
        1
        for e in escalas
        if e.minha_participacao is not None
        and (
            (e.minha_participacao.pode_responder and e.minha_participacao.resposta == "sem_resposta")
            or e.minha_participacao.pode_checkin
        )
    )


@router.get("/inicio", response_model=InicioResponse)
async def get_medium_inicio(
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> InicioResponse:
    hoje = today_local()
    mensalidade, pix_disponivel = await _mensalidade(db, ctx, hoje)
    avisos = await _avisos(db, ctx)
    escalas = await _escalas(db, ctx)
    trocas = await minhas_trocas(db, ctx) if await trocas_no_plano(db, ctx) else None
    return InicioResponse(
        hoje=hoje,
        pendencias=montar_pendencias(
            hoje=hoje,
            mensalidade=mensalidade,
            avisos_nao_lidos=avisos.nao_lidos,
            escalas_a_responder=escalas_pendentes(escalas),
            trocas_a_responder=len(trocas.para_responder) if trocas else 0,
        ),
        proxima_gira=await _proxima_gira(db, ctx),
        mensalidade=(
            MensalidadeInicio(**mensalidade.as_dict(), pix_disponivel=pix_disponivel) if mensalidade else None
        ),
        avisos=avisos,
        escalas=escalas,
        aniversariantes=await _aniversariantes(db, ctx, hoje),
        meu_aniversario=await _meu_aniversario(db, ctx, hoje),
        trocas=trocas,
    )
