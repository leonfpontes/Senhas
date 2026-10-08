"""Agenda da casa para a corrente — /api/v1/medium/agenda* (AM-07, atividades no AM-08).

- `GET /agenda?inicio&fim`: giras ativas do terreiro e atividades internas visíveis ao médium
  no período (padrão: mês corrente + 2, em Brasília; até 6 meses), passadas e futuras, na
  ordem do dia. Formato unificado `{origem, id, tipo{nome, icone, cor}, titulo, inicio, fim,
  local, cancelada, minha_participacao}`. O tipo das giras é o tipo de sistema "Gira" da casa
  (renomeável). `minha_participacao` (AM-17): na escala ou não, resposta, presença, o que dá para
  fazer agora (Vou/Não vou, "Cheguei", "Conte o motivo") — só a do próprio médium, só com o plano
  `atividades_corrente` (senão null); regras em `services/presenca.minha_participacao`.
- Atividade interna visível (AM-08/AM-17, `presencas.atividade_visivel_ao_medium`): não
  excluída e (`visibilidade = 'corrente'` e o tipo alcança o médium — todos · só atendimento · só
  cambones · grupos da corrente em que ele está, grupo arquivado não conta — OU o médium tem
  participação nela: "só quem estiver na escala" aparece para quem está na escala). Cancelada
  continua na lista, marcada (`cancelada`).
- `GET /agenda/atividade/{id}` e `/agenda/atividade/{id}/ics`: detalhe e .ics da atividade,
  com a mesma regra de visibilidade (fora dela → 404). Atividade nunca tem link público.
- `GET /agenda/gira/{id}`: detalhe — horário, local ou endereço do terreiro com link do mapa,
  descrição, `orientacoes_corrente` (só aqui e no Início; nunca em rota pública, e-mail ou
  bilhete), situação das senhas para o público (sem dado de consulente), link público da
  gira e os links "Adicionar à agenda do celular".
- `GET /agenda/gira/{id}/ics`: o arquivo .ics (text/calendar — no iPhone o Safari oferece
  "Adicionar à agenda"; no Android o Chrome baixa e abre o app de agenda).

Tudo "meu": tenant de `ctx.tenant_id`; gira de outro terreiro, excluída ou inativa → 404.
Módulo "agenda" desligado pela casa (AM-10) → 403 com mensagem neutra.
"""
from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import MediumContext, require_medium
from src.core.config import settings
from src.core.database import get_db
from src.core.errors import ForbiddenError
from src.core.tz import APP_TZ, local_day_bounds_utc, today_local, utc_now
from src.models import Atividade, AtividadeTipo, Gira, Tenant, TenantConfig
from src.models.senha_controls import SenhaControl
from src.services.atividades import tipo_da_gira, tipo_resumo
from src.services.medium_agenda import (
    PeriodoInvalido,
    descricao_do_evento,
    google_agenda_url,
    ics_da_gira,
    item_da_atividade,
    item_da_gira,
    link_publico_da_gira,
    mapa_url,
    nome_arquivo_ics,
    periodo_da_agenda,
    situacao_senhas,
)
from src.services.medium_area import get_area_medium_config
from src.services.presenca import AtividadeCtx, ctx_de

from .presencas import (
    MinhaParticipacao,
    atividade_visivel_ao_medium,
    item_de,
    itens_do_periodo,
    participacoes_do_medium,
    presenca_no_plano,
)

router = APIRouter()

AGENDA_INDISPONIVEL = "A agenda não está disponível na Área do Médium desta casa."


async def require_agenda_ligada(
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> MediumContext:
    """Módulo "agenda" ligado pela casa (AM-10); senão 403 neutro."""
    if not (await get_area_medium_config(db, ctx.tenant_id)).agenda:
        raise ForbiddenError(AGENDA_INDISPONIVEL, details={"error_code": "MEDIUM_MODULO_INDISPONIVEL"})
    return ctx


class TipoItem(BaseModel):
    nome: str
    icone: str
    cor: Optional[str] = None


class AgendaItem(BaseModel):
    origem: str
    id: str
    tipo: TipoItem
    titulo: str
    inicio: datetime
    fim: Optional[datetime] = None
    local: Optional[str] = None
    # Atividade cancelada pela casa continua na agenda, marcada (gira desmarcada sai).
    cancelada: bool = False
    # AM-17: na escala, resposta, presença e o que dá para fazer agora. Null: fora da escala
    # (ou plano sem `atividades_corrente`).
    minha_participacao: Optional[MinhaParticipacao] = None


class AgendaResponse(BaseModel):
    inicio: date
    fim: date
    itens: List[AgendaItem]


class SenhasPublico(BaseModel):
    # abertas | esgotadas | abrem_em | encerradas | sem_senhas
    situacao: str
    abrem_em: Optional[datetime] = None


class AgendaCelular(BaseModel):
    ics_path: str
    google_url: str


class AtividadeDetalhe(AgendaItem):
    descricao: Optional[str] = None
    orientacoes_corrente: Optional[str] = None
    endereco: Optional[str] = None
    mapa_url: Optional[str] = None
    cancelamento_motivo: Optional[str] = None
    agenda_celular: AgendaCelular


class GiraDetalhe(AgendaItem):
    descricao: Optional[str] = None
    orientacoes_corrente: Optional[str] = None
    endereco: Optional[str] = None
    mapa_url: Optional[str] = None
    senhas: SenhasPublico
    link_publico: str
    agenda_celular: AgendaCelular


def _parse_dia(valor: Optional[str], campo: str) -> Optional[date]:
    if valor is None or not valor.strip():
        return None
    try:
        return date.fromisoformat(valor.strip()[:10])
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{campo} deve estar no formato AAAA-MM-DD")


async def _gira_do_terreiro(db: AsyncSession, ctx: MediumContext, gira_id: UUID) -> Gira:
    gira = (
        await db.execute(
            select(Gira).where(
                Gira.id == gira_id,
                Gira.tenant_id == ctx.tenant_id,
                Gira.deleted_at.is_(None),
                Gira.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if gira is None:
        raise HTTPException(status_code=404, detail="Gira não encontrada")
    return gira


async def _terreiro(db: AsyncSession, ctx: MediumContext) -> tuple[Tenant, Optional[str]]:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))).scalar_one()
    endereco = (
        await db.execute(select(TenantConfig.endereco).where(TenantConfig.tenant_id == ctx.tenant_id))
    ).scalar_one_or_none()
    return tenant, ((endereco or "").strip() or None)


async def _emitidas(db: AsyncSession, ctx: MediumContext, gira_id: UUID) -> int:
    """Senhas comuns já emitidas (líquidas de cancelamentos) — só a contagem."""
    sc = (
        await db.execute(
            select(SenhaControl).where(
                SenhaControl.tenant_id == ctx.tenant_id,
                SenhaControl.gira_id == gira_id,
                SenhaControl.is_sponsor.is_(False),
            )
        )
    ).scalar_one_or_none()
    return max(0, sc.total_emitido - sc.slots_returned) if sc else 0


def _local_do_evento(gira: Gira, endereco: Optional[str]) -> Optional[str]:
    return " · ".join(p for p in ((gira.local or "").strip(), endereco or "") if p) or None


def _local_da_atividade(atividade: Atividade, endereco: Optional[str]) -> Optional[str]:
    return " · ".join(p for p in ((atividade.local or "").strip(), endereco or "") if p) or None


async def _atividade_do_medium(db: AsyncSession, ctx: MediumContext, atividade_id: UUID) -> tuple[Atividade, AtividadeTipo]:
    row = (
        await db.execute(
            select(Atividade, AtividadeTipo)
            .join(AtividadeTipo, AtividadeTipo.id == Atividade.tipo_id)
            .where(
                Atividade.id == atividade_id,
                Atividade.tenant_id == ctx.tenant_id,
                AtividadeTipo.tenant_id == ctx.tenant_id,
                atividade_visivel_ao_medium(ctx),
            )
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Atividade não encontrada")
    return row[0], row[1]


async def _participacao(db: AsyncSession, ctx: MediumContext, item: AtividadeCtx) -> Optional[dict]:
    """Minha participação num item (null sem o plano `atividades_corrente`)."""
    if not await presenca_no_plano(db, ctx):
        return None
    return (await participacoes_do_medium(db, ctx, [item])).get((item.origem, item.ref_id), (None, False))[0]


async def _ancora(db: AsyncSession, ctx: MediumContext, gira: Gira) -> Optional[Atividade]:
    return (
        await db.execute(
            select(Atividade).where(Atividade.tenant_id == ctx.tenant_id, Atividade.gira_id == gira.id)
        )
    ).scalar_one_or_none()


@router.get("/agenda", response_model=AgendaResponse)
async def get_agenda(
    inicio: Optional[str] = Query(None, description="Primeiro dia (AAAA-MM-DD, Brasília)"),
    fim: Optional[str] = Query(None, description="Último dia (AAAA-MM-DD, Brasília)"),
    ctx: MediumContext = Depends(require_agenda_ligada),
    db: AsyncSession = Depends(get_db),
) -> AgendaResponse:
    try:
        ini, fim_ = periodo_da_agenda(today_local(), _parse_dia(inicio, "inicio"), _parse_dia(fim, "fim"))
    except PeriodoInvalido as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    de, ate = local_day_bounds_utc(ini, fim_)
    itens_ctx = await itens_do_periodo(db, ctx, de, ate)
    participacoes = await participacoes_do_medium(db, ctx, itens_ctx) if await presenca_no_plano(db, ctx) else {}
    itens = [
        AgendaItem(**item_de(c, participacoes.get((c.origem, c.ref_id), (None, False))[0])) for c in itens_ctx
    ]
    return AgendaResponse(inicio=ini, fim=fim_, itens=itens)


@router.get("/agenda/gira/{gira_id}", response_model=GiraDetalhe)
async def get_agenda_gira(
    gira_id: UUID,
    ctx: MediumContext = Depends(require_agenda_ligada),
    db: AsyncSession = Depends(get_db),
) -> GiraDetalhe:
    gira = await _gira_do_terreiro(db, ctx, gira_id)
    tenant, endereco = await _terreiro(db, ctx)
    senhas = situacao_senhas(
        agora=utc_now(),
        max_tickets=gira.max_tickets,
        release_start_at=gira.release_start_at,
        release_end_at=gira.release_end_at,
        emitidas=await _emitidas(db, ctx, gira.id),
    )
    orientacoes = (gira.orientacoes_corrente or "").strip() or None
    base = settings.FRONTEND_URL.rstrip("/")
    descricao_evento = descricao_do_evento(orientacoes, f"{base}/medium/agenda/gira/{gira.id}")
    tipo_gira = await tipo_da_gira(db, ctx.tenant_id)
    item = item_da_gira(gira, tipo_resumo(tipo_gira))
    item["minha_participacao"] = await _participacao(db, ctx, ctx_de(await _ancora(db, ctx, gira), tipo_gira, gira))
    return GiraDetalhe(
        **item,
        descricao=(gira.descricao or "").strip() or None,
        orientacoes_corrente=orientacoes,
        endereco=endereco,
        mapa_url=mapa_url(endereco or gira.local),
        senhas=SenhasPublico(situacao=senhas.situacao, abrem_em=senhas.abrem_em),
        link_publico=link_publico_da_gira(
            settings.FRONTEND_URL, gira.id, tenant.slug, tem_senhas=senhas.situacao != "sem_senhas"
        ),
        agenda_celular=AgendaCelular(
            ics_path=f"/api/v1/medium/agenda/gira/{gira.id}/ics",
            google_url=google_agenda_url(
                titulo=gira.nome,
                terreiro=tenant.name,
                inicio=gira.data_inicio,
                fim=gira.data_fim,
                local=_local_do_evento(gira, endereco),
                descricao=descricao_evento,
            ),
        ),
    )


@router.get("/agenda/gira/{gira_id}/ics", response_class=Response)
async def get_agenda_gira_ics(
    gira_id: UUID,
    ctx: MediumContext = Depends(require_agenda_ligada),
    db: AsyncSession = Depends(get_db),
) -> Response:
    gira = await _gira_do_terreiro(db, ctx, gira_id)
    tenant, endereco = await _terreiro(db, ctx)
    orientacoes = (gira.orientacoes_corrente or "").strip() or None
    link_area = f"{settings.FRONTEND_URL.rstrip('/')}/medium/agenda/gira/{gira.id}"
    corpo = ics_da_gira(
        gira_id=gira.id,
        titulo=gira.nome,
        terreiro=tenant.name,
        inicio=gira.data_inicio,
        fim=gira.data_fim,
        local=_local_do_evento(gira, endereco),
        descricao=descricao_do_evento(orientacoes, link_area),
        url=link_area,
        agora=utc_now(),
    )
    arquivo = nome_arquivo_ics(gira.nome, gira.data_inicio.astimezone(APP_TZ).date())
    return Response(
        content=corpo,
        media_type="text/calendar; charset=utf-8",
        headers={
            # inline: o Safari do iPhone abre "Adicionar à agenda"; o Chrome do Android baixa.
            "Content-Disposition": f'inline; filename="{arquivo}"',
            "Cache-Control": "private, no-store",
        },
    )


@router.get("/agenda/atividade/{atividade_id}", response_model=AtividadeDetalhe)
async def get_agenda_atividade(
    atividade_id: UUID,
    ctx: MediumContext = Depends(require_agenda_ligada),
    db: AsyncSession = Depends(get_db),
) -> AtividadeDetalhe:
    atividade, tipo = await _atividade_do_medium(db, ctx, atividade_id)
    tenant, endereco = await _terreiro(db, ctx)
    orientacoes = (atividade.orientacoes or "").strip() or None
    base = settings.FRONTEND_URL.rstrip("/")
    item = item_da_atividade(atividade, tipo_resumo(tipo))
    item["minha_participacao"] = await _participacao(db, ctx, ctx_de(atividade, tipo, None))
    return AtividadeDetalhe(
        **item,
        descricao=(atividade.descricao or "").strip() or None,
        orientacoes_corrente=orientacoes,
        endereco=endereco,
        mapa_url=mapa_url(endereco or atividade.local),
        cancelamento_motivo=atividade.cancelamento_motivo if atividade.cancelada_em else None,
        agenda_celular=AgendaCelular(
            ics_path=f"/api/v1/medium/agenda/atividade/{atividade.id}/ics",
            google_url=google_agenda_url(
                titulo=item["titulo"],
                terreiro=tenant.name,
                inicio=atividade.inicio,
                fim=atividade.fim,
                local=_local_da_atividade(atividade, endereco),
                descricao=descricao_do_evento(orientacoes, f"{base}/medium/agenda/atividade/{atividade.id}"),
            ),
        ),
    )


@router.get("/agenda/atividade/{atividade_id}/ics", response_class=Response)
async def get_agenda_atividade_ics(
    atividade_id: UUID,
    ctx: MediumContext = Depends(require_agenda_ligada),
    db: AsyncSession = Depends(get_db),
) -> Response:
    atividade, tipo = await _atividade_do_medium(db, ctx, atividade_id)
    tenant, endereco = await _terreiro(db, ctx)
    orientacoes = (atividade.orientacoes or "").strip() or None
    link_area = f"{settings.FRONTEND_URL.rstrip('/')}/medium/agenda/atividade/{atividade.id}"
    titulo = atividade.titulo or tipo.nome
    corpo = ics_da_gira(
        gira_id=atividade.id,
        uid_prefixo="atividade",
        titulo=titulo,
        terreiro=tenant.name,
        inicio=atividade.inicio,
        fim=atividade.fim,
        local=_local_da_atividade(atividade, endereco),
        descricao=descricao_do_evento(orientacoes, link_area),
        url=link_area,
        agora=utc_now(),
    )
    arquivo = nome_arquivo_ics(titulo, atividade.inicio.astimezone(APP_TZ).date())
    return Response(
        content=corpo,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'inline; filename="{arquivo}"',
            "Cache-Control": "private, no-store",
        },
    )
