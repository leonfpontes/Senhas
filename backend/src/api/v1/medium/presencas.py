"""Presença na Área do Médium — /api/v1/medium/atividades/* e /api/v1/medium/presencas (AM-17/AM-28).

Na tela (D-17/D-18/D-19): "Você está na escala", **Vou** / **Não vou** (+ "Conte o motivo"),
**Cheguei** e "Conte o motivo" depois de uma falta — nunca "convocado" nem "check-in".

- `POST /atividades/{origem}/{id}/resposta` — `vou` | `nao_vou` (+ `justificativa`, obrigatória
  quando o tipo exige); muda até o início. `origem`: `gira` (id da gira — a âncora nasce aqui,
  `atividade_da_gira`) ou `atividade`.
- `POST /atividades/{origem}/{id}/checkin` — "Cheguei": modo `app` dentro da janela do tipo;
  modo `qr` com o código do QR do dia no corpo (`codigo`), conferido no servidor para AQUELA
  atividade e janela; modo confiança → 409 (não há "Cheguei").
- `POST /atividades/{origem}/{id}/justificativa` — "Conte o motivo" de uma falta, até o prazo
  da casa (padrão 7 dias depois).
- `GET /presencas` — próximas escalas, histórico (últimos 90 dias) e o percentual de presença.

Tudo "meu": tenant de `ctx.tenant_id`, médium de `ctx.medium.id` — nunca `medium_id` da
requisição; só a própria linha de participação aparece (D-07). Escrita sob impersonação → 403
(`require_not_impersonated`, D-06). Plano sem `atividades_corrente` → 403. A justificativa nunca
vai para a auditoria (só a ação).

Também daqui: `atividade_visivel_ao_medium` (Agenda), `itens_do_periodo` e
`participacoes_do_medium` (Agenda, Início e Minhas presenças).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import and_, exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import MediumContext, require_medium, require_not_impersonated, require_plan_feature
from src.core.database import get_db
from src.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from src.core.limiter import limiter
from src.core.tz import APP_TZ, utc_now
from src.models import (
    Atividade,
    AtividadeParticipacao,
    AtividadeTipo,
    AtividadeTipoGrupo,
    CorrenteGrupo,
    CorrenteGrupoMembro,
    FuncaoCorrente,
    Gira,
    ParticipacaoTroca,
)
from src.models.atividades import STATUS_TROCA_ABERTOS
from src.repositories.subscription_repo import SubscriptionRepository
from src.services.atividades import elegiveis_fixos_do_medium, grupos_dos_tipos, tipo_da_gira, tipo_resumo
from src.services.audit_service import AuditService
from src.services.plan_features import get_effective_plan_features
from src.services.presenca import (
    MODO_CONFIANCA,
    MODO_QR,
    PRESENCA_AUSENTE,
    PRESENCA_PRESENTE,
    RESPOSTA_NAO_VOU,
    RESPOSTA_VOU,
    SITUACAO_DISPENSADO,
    SITUACAO_PRESENTE,
    SITUACAO_SUBSTITUIDO,
    AtividadeCtx,
    codigo_qr_valido,
    config_presenca,
    ctx_da_gira,
    ctx_de,
    dentro_da_janela,
    dentro_do_prazo,
    gravar_justificativa,
    upsert_participacao,
    grupos_ativos_do_medium,
    janela_checkin,
    limpar_justificativa,
    medium_esperado,
    minha_participacao,
    modo_efetivo,
    percentual,
    prazo_justificativa,
    registrar_presenca,
)

router = APIRouter()

_PLANO = Depends(require_plan_feature("atividades_corrente"))
ORIGENS = ("gira", "atividade")
HISTORICO_DIAS = 90
PROXIMAS_DIAS = 60

MSG_FORA_DA_ESCALA = "Você não está na escala desta atividade."
MSG_CANCELADA = "Esta atividade foi cancelada pela casa."
MSG_DISPENSADO = "A casa tirou você da escala desta atividade."
MSG_ENCERRADA = "A casa já encerrou a chamada desta atividade."


# ── Schemas ─────────────────────────────────────────────────────────────────


class RespostaBody(BaseModel):
    resposta: str = Field(..., pattern="^(vou|nao_vou)$")
    justificativa: Optional[str] = Field(None, max_length=2000)


class CheckinBody(BaseModel):
    # Modo QR: o código lido do QR (ou digitado) — também aceita o link inteiro do QR.
    codigo: Optional[str] = Field(None, max_length=400)


class JustificativaBody(BaseModel):
    justificativa: str = Field(..., max_length=2000)


class TipoItem(BaseModel):
    nome: str
    icone: str
    cor: Optional[str] = None


class MinhaParticipacao(BaseModel):
    convocado: bool
    situacao: str
    resposta: str
    presenca: str
    presenca_em: Optional[datetime] = None
    justificativa: Optional[str] = None
    justificativa_avaliacao: Optional[str] = None
    grupo: Optional[str] = None
    funcao: Optional[str] = None
    pede_confirmacao: bool
    exige_justificativa: bool
    controla_presenca: bool
    modo_presenca: str
    pode_responder: bool
    responder_ate: datetime
    pode_checkin: bool
    checkin_abre_em: Optional[datetime] = None
    checkin_fecha_em: Optional[datetime] = None
    pode_justificar: bool
    justificar_ate: Optional[date] = None
    chamada_encerrada: bool


class ItemPresenca(BaseModel):
    origem: str
    id: str
    tipo: TipoItem
    titulo: str
    inicio: datetime
    fim: Optional[datetime] = None
    local: Optional[str] = None
    cancelada: bool = False
    minha_participacao: Optional[MinhaParticipacao] = None


class ResumoPresenca(BaseModel):
    presentes: int
    total: int
    percentual: Optional[int] = None
    desde: date


class PresencasResponse(BaseModel):
    proximas: list[ItemPresenca]
    historico: list[ItemPresenca]
    resumo: ResumoPresenca
    prazo_justificativa_dias: int


# ── Visibilidade e itens ────────────────────────────────────────────────────


def atividade_visivel_ao_medium(ctx: MediumContext):
    """Condição "a atividade interna é para mim".

    Não excluída, não âncora de gira, e: (`visibilidade = 'corrente'` e o tipo alcança o médium —
    todos · só atendimento · só cambones · grupos ATIVOS dele) OU o médium tem participação nela
    (AM-17: "só quem estiver na escala" aparece para quem está na escala; quem a casa convocou à
    mão também vê) OU o médium é o colega chamado de um pedido de troca aberto (AM-27). Quem usa junta `Atividade.tenant_id == ctx.tenant_id` e
    `AtividadeTipo.tenant_id == ctx.tenant_id` na mesma query (o auditor confere ali).
    """
    nos_meus_grupos = exists(
        select(AtividadeTipoGrupo.tipo_id)
        .join(CorrenteGrupoMembro, CorrenteGrupoMembro.grupo_id == AtividadeTipoGrupo.grupo_id)
        .join(CorrenteGrupo, CorrenteGrupo.id == AtividadeTipoGrupo.grupo_id)
        .where(
            AtividadeTipoGrupo.tipo_id == AtividadeTipo.id,
            AtividadeTipoGrupo.tenant_id == ctx.tenant_id,
            CorrenteGrupoMembro.tenant_id == ctx.tenant_id,
            CorrenteGrupoMembro.medium_id == ctx.medium.id,
            CorrenteGrupo.tenant_id == ctx.tenant_id,
            CorrenteGrupo.arquivado_em.is_(None),
        )
    )
    tenho_participacao = exists(
        select(AtividadeParticipacao.id).where(
            AtividadeParticipacao.tenant_id == ctx.tenant_id,
            AtividadeParticipacao.medium_id == ctx.medium.id,
            AtividadeParticipacao.atividade_id == Atividade.id,
        )
    )
    # AM-27: o colega chamado para uma troca vê a atividade enquanto o pedido está aberto.
    chamado_para_troca = exists(
        select(ParticipacaoTroca.id).where(
            ParticipacaoTroca.tenant_id == ctx.tenant_id,
            ParticipacaoTroca.substituto_id == ctx.medium.id,
            ParticipacaoTroca.atividade_id == Atividade.id,
            ParticipacaoTroca.status.in_(STATUS_TROCA_ABERTOS),
        )
    )
    return and_(
        Atividade.deleted_at.is_(None),
        Atividade.gira_id.is_(None),
        or_(
            and_(
                Atividade.visibilidade == "corrente",
                or_(
                    AtividadeTipo.elegiveis.in_(elegiveis_fixos_do_medium(ctx.medium.is_atendimento)),
                    and_(AtividadeTipo.elegiveis == "grupos", nos_meus_grupos),
                ),
            ),
            tenho_participacao,
            chamado_para_troca,
        ),
    )


async def itens_do_periodo(db: AsyncSession, ctx: MediumContext, de: datetime, ate: datetime) -> list[AtividadeCtx]:
    """Giras ativas e atividades internas visíveis ao médium com início em [de, ate), em ordem."""
    giras = (
        await db.execute(
            select(Gira)
            .where(
                Gira.tenant_id == ctx.tenant_id,
                Gira.deleted_at.is_(None),
                Gira.is_active.is_(True),
                Gira.data_inicio >= de,
                Gira.data_inicio < ate,
            )
            .order_by(Gira.data_inicio.asc(), Gira.nome.asc())
        )
    ).scalars().all()
    tipo_gira = await tipo_da_gira(db, ctx.tenant_id)
    ancoras: dict[uuid.UUID, Atividade] = {}
    if giras:
        ancoras = {
            a.gira_id: a
            for a in (
                await db.execute(
                    select(Atividade).where(
                        Atividade.tenant_id == ctx.tenant_id, Atividade.gira_id.in_([g.id for g in giras])
                    )
                )
            ).scalars().all()
        }
    itens = [ctx_de(ancoras.get(g.id), tipo_gira, g) for g in giras]
    atividades = (
        await db.execute(
            select(Atividade, AtividadeTipo)
            .join(AtividadeTipo, AtividadeTipo.id == Atividade.tipo_id)
            .where(
                Atividade.tenant_id == ctx.tenant_id,
                AtividadeTipo.tenant_id == ctx.tenant_id,
                atividade_visivel_ao_medium(ctx),
                Atividade.inicio >= de,
                Atividade.inicio < ate,
            )
            .order_by(Atividade.inicio.asc())
        )
    ).all()
    itens += [ctx_de(a, t, None) for a, t in atividades]
    itens.sort(key=lambda i: (i.inicio, i.titulo.lower()))
    return itens


async def presenca_no_plano(db: AsyncSession, ctx: MediumContext) -> bool:
    sub = await SubscriptionRepository(db).get_by_tenant(ctx.tenant_id)
    return bool(get_effective_plan_features(sub).atividades_corrente)


async def participacoes_do_medium(
    db: AsyncSession, ctx: MediumContext, itens: list[AtividadeCtx], agora: Optional[datetime] = None
) -> dict[tuple[str, uuid.UUID], tuple[Optional[dict], bool]]:
    """{(origem, id): (minha participação ou None, tem linha gravada)} para os itens."""
    agora = agora or utc_now()
    if not itens:
        return {}
    modo_casa, prazo_dias = await config_presenca(db, ctx.tenant_id)
    meus_grupos = await grupos_ativos_do_medium(db, ctx.tenant_id, ctx.medium.id)
    tipo_ids = list({i.tipo.id for i in itens if i.tipo is not None})
    grupos_tipo = {tid: {g.id for g in gs} for tid, gs in (await grupos_dos_tipos(db, ctx.tenant_id, tipo_ids)).items()}
    atividade_ids = [i.atividade_id for i in itens if i.atividade_id is not None]
    linhas: dict[uuid.UUID, AtividadeParticipacao] = {}
    if atividade_ids:
        linhas = {
            p.atividade_id: p
            for p in (
                await db.execute(
                    select(AtividadeParticipacao).where(
                        AtividadeParticipacao.tenant_id == ctx.tenant_id,
                        AtividadeParticipacao.medium_id == ctx.medium.id,
                        AtividadeParticipacao.atividade_id.in_(atividade_ids),
                    )
                )
            ).scalars().all()
        }
    funcao_ids = {p.funcao_id for p in linhas.values() if p.funcao_id is not None}
    funcoes: dict[uuid.UUID, str] = {}
    if funcao_ids:
        funcoes = {
            fid: nome
            for fid, nome in (
                await db.execute(
                    select(FuncaoCorrente.id, FuncaoCorrente.nome).where(
                        FuncaoCorrente.tenant_id == ctx.tenant_id, FuncaoCorrente.id.in_(funcao_ids)
                    )
                )
            ).all()
        }
    out: dict[tuple[str, uuid.UUID], tuple[Optional[dict], bool]] = {}
    for item in itens:
        linha = linhas.get(item.atividade_id) if item.atividade_id is not None else None
        if item.tipo is None:
            out[(item.origem, item.ref_id)] = (None, linha is not None)
            continue
        esperado = medium_esperado(
            item.tipo,
            is_atendimento=ctx.medium.is_atendimento,
            data_entrada=ctx.medium.data_entrada,
            dia=item.inicio.astimezone(APP_TZ).date(),
            grupos_do_medium=set(meus_grupos),
            grupos_do_tipo=grupos_tipo.get(item.tipo.id, set()),
        )
        # Só o nome do PRÓPRIO grupo (D-07): o da escala, senão o grupo dele que o tipo chama.
        grupo = None
        if linha is not None and linha.grupo_id is not None:
            grupo = meus_grupos.get(linha.grupo_id)
        elif item.tipo.elegiveis == "grupos":
            grupo = next((meus_grupos[g] for g in grupos_tipo.get(item.tipo.id, set()) if g in meus_grupos), None)
        participacao = minha_participacao(
            ctx=item,
            linha=linha,
            esperado=esperado,
            modo=modo_efetivo(item.tipo.presenca_modo, modo_casa),
            prazo_dias=prazo_dias,
            agora=agora,
            grupo=grupo,
            funcao=funcoes.get(linha.funcao_id) if linha is not None and linha.funcao_id else None,
        )
        out[(item.origem, item.ref_id)] = (participacao, linha is not None)
    return out


def item_de(c: AtividadeCtx, participacao: Optional[dict]) -> dict:
    """Formato unificado da Agenda (`{origem, id, tipo, titulo, inicio, fim, local, cancelada,
    minha_participacao}`)."""
    return {
        "origem": c.origem,
        "id": str(c.ref_id),
        "tipo": tipo_resumo(c.tipo),
        "titulo": c.titulo,
        "inicio": c.inicio,
        "fim": c.fim,
        "local": c.local or None,
        "cancelada": c.cancelada if c.origem == "atividade" else False,
        "minha_participacao": participacao,
    }


# ── Uma atividade do médium (para as escritas) ──────────────────────────────


async def _item_do_medium(db: AsyncSession, ctx: MediumContext, origem: str, ref_id: uuid.UUID) -> AtividadeCtx:
    """A gira (com a âncora, criada aqui se faltar) ou a atividade visível ao médium; senão 404."""
    if origem == "gira":
        return await ctx_da_gira(db, ctx.tenant_id, ref_id, criar_ancora=True)
    if origem != "atividade":
        raise NotFoundError("Atividade")
    row = (
        await db.execute(
            select(Atividade, AtividadeTipo)
            .join(AtividadeTipo, AtividadeTipo.id == Atividade.tipo_id)
            .where(
                Atividade.id == ref_id,
                Atividade.tenant_id == ctx.tenant_id,
                AtividadeTipo.tenant_id == ctx.tenant_id,
                atividade_visivel_ao_medium(ctx),
            )
        )
    ).first()
    if row is None:
        raise NotFoundError("Atividade")
    return ctx_de(row[0], row[1], None)


async def _minha_linha(
    db: AsyncSession, ctx: MediumContext, item: AtividadeCtx
) -> tuple[AtividadeParticipacao, bool, str, int]:
    """(minha linha travada, esperado, modo, prazo) — recusa quem não está na escala (403)."""
    assert item.atividade is not None and item.tipo is not None
    modo_casa, prazo_dias = await config_presenca(db, ctx.tenant_id)
    meus_grupos = await grupos_ativos_do_medium(db, ctx.tenant_id, ctx.medium.id)
    grupos_tipo = {g.id for g in (await grupos_dos_tipos(db, ctx.tenant_id, [item.tipo.id])).get(item.tipo.id, [])}
    esperado = medium_esperado(
        item.tipo,
        is_atendimento=ctx.medium.is_atendimento,
        data_entrada=ctx.medium.data_entrada,
        dia=item.inicio.astimezone(APP_TZ).date(),
        grupos_do_medium=set(meus_grupos),
        grupos_do_tipo=grupos_tipo,
    )
    existente = (
        await db.execute(
            select(AtividadeParticipacao.convocado).where(
                AtividadeParticipacao.tenant_id == ctx.tenant_id,
                AtividadeParticipacao.medium_id == ctx.medium.id,
                AtividadeParticipacao.atividade_id == item.atividade.id,
            )
        )
    ).scalar_one_or_none()
    if not esperado and not existente:
        raise ForbiddenError(MSG_FORA_DA_ESCALA, details={"error_code": "FORA_DA_ESCALA"})
    linha = await upsert_participacao(
        db, ctx.tenant_id, item.atividade.id, ctx.medium.id, origem="elegivel", convocado=True
    )
    if esperado and not linha.convocado:
        linha.convocado = True
    return linha, esperado, modo_efetivo(item.tipo.presenca_modo, modo_casa), prazo_dias


def _recusar_se_inativa(item: AtividadeCtx, linha: AtividadeParticipacao) -> None:
    if item.cancelada:
        raise ConflictError(MSG_CANCELADA)
    if linha.dispensado_em is not None or linha.substituida_por_id is not None:
        raise ConflictError(MSG_DISPENSADO)


async def _resposta(db: AsyncSession, ctx: MediumContext, item: AtividadeCtx) -> MinhaParticipacao:
    """Minha participação depois da escrita (mesma regra da Agenda)."""
    participacoes = await participacoes_do_medium(db, ctx, [item])
    participacao, _ = participacoes[(item.origem, item.ref_id)]
    if participacao is None:  # pragma: no cover — acabou de gravar
        raise NotFoundError("Atividade")
    return MinhaParticipacao(**participacao)


async def _auditar(db: AsyncSession, ctx: MediumContext, linha: AtividadeParticipacao, acao: str) -> None:
    """Ação do médium na auditoria — NUNCA o texto da justificativa (§6.8)."""
    await AuditService(db).log_update(
        tenant_id=ctx.tenant_id,
        user_id=ctx.user.id,
        resource_type="medium_presenca",
        resource_id=linha.id,
        previous_state={},
        new_state={"acao": acao},
    )


def _origem_valida(origem: str) -> str:
    if origem not in ORIGENS:
        raise HTTPException(status_code=404, detail="Atividade não encontrada")
    return origem


# ── Rotas ───────────────────────────────────────────────────────────────────


@router.post(
    "/atividades/{origem}/{ref_id}/resposta",
    response_model=MinhaParticipacao,
    dependencies=[_PLANO, Depends(require_not_impersonated)],
)
async def responder(
    origem: str,
    ref_id: uuid.UUID,
    body: RespostaBody,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> MinhaParticipacao:
    """Vou / Não vou. "Não vou" pede o motivo quando o tipo exige. Muda até o início."""
    item = await _item_do_medium(db, ctx, _origem_valida(origem), ref_id)
    if item.tipo is None or not item.tipo.pede_confirmacao:
        raise ConflictError("Esta atividade não pede confirmação.")
    linha, _, _, _ = await _minha_linha(db, ctx, item)
    _recusar_se_inativa(item, linha)
    agora = utc_now()
    if item.encerrada_em is not None:
        raise ConflictError(MSG_ENCERRADA)
    if agora >= item.inicio:
        raise ConflictError("Já passou da hora de responder: a atividade começou.")
    if body.resposta == RESPOSTA_NAO_VOU:
        texto = limpar_justificativa(body.justificativa, obrigatoria=bool(item.tipo.exige_justificativa))
        gravar_justificativa(linha, texto, agora)
    else:
        gravar_justificativa(linha, None, agora)
    linha.resposta = body.resposta
    linha.respondido_em = agora
    linha.updated_at = agora
    await _auditar(db, ctx, linha, "respondeu vou" if body.resposta == RESPOSTA_VOU else "respondeu não vou")
    await db.commit()
    return await _resposta(db, ctx, item)


@router.post(
    "/atividades/{origem}/{ref_id}/checkin",
    response_model=MinhaParticipacao,
    dependencies=[_PLANO, Depends(require_not_impersonated)],
)
@limiter.limit("60/minute")
async def cheguei(
    request: Request,
    origem: str,
    ref_id: uuid.UUID,
    body: CheckinBody,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> MinhaParticipacao:
    """"Cheguei": modo app na janela do tipo; modo QR com o código do dia; confiança → 409."""
    item = await _item_do_medium(db, ctx, _origem_valida(origem), ref_id)
    if item.tipo is None or not item.tipo.controla_presenca:
        raise ConflictError("Esta atividade não tem marcação de presença.")
    linha, _, modo, _ = await _minha_linha(db, ctx, item)
    _recusar_se_inativa(item, linha)
    if modo == MODO_CONFIANCA:
        raise ConflictError(
            "Nesta casa a sua confirmação já vale como presença. Não precisa marcar “Cheguei”.",
            details={"error_code": "MODO_CONFIANCA"},
        )
    if item.encerrada_em is not None:
        raise ConflictError(MSG_ENCERRADA)
    agora = utc_now()
    abre, fecha = janela_checkin(item.inicio, item.tipo.checkin_antes_min, item.tipo.checkin_depois_min)
    if not dentro_da_janela(agora, abre, fecha):
        quando = "ainda não abriu" if agora < abre else "já fechou"
        raise ConflictError(
            f"O “Cheguei” {quando}: vale das {abre.astimezone(APP_TZ):%H:%M} às {fecha.astimezone(APP_TZ):%H:%M}.",
            details={"error_code": "FORA_DA_JANELA"},
        )
    if linha.presenca == PRESENCA_PRESENTE:
        await db.commit()
        return await _resposta(db, ctx, item)
    if linha.presenca == PRESENCA_AUSENTE:
        raise ConflictError("A casa já fez a sua chamada nesta atividade. Fale com quem está na chamada.")
    if modo == MODO_QR and not codigo_qr_valido(ctx.tenant_id, item.origem, item.ref_id, body.codigo, agora):
        raise ValidationError(
            "Esse código não vale. Aponte a câmera para o QR que está na tela da casa agora.",
            details={"error_code": "QR_INVALIDO"},
        )
    registrar_presenca(linha, PRESENCA_PRESENTE, "checkin_medium", ctx.user.id, agora)
    await _auditar(db, ctx, linha, "marcou Cheguei")
    await db.commit()
    return await _resposta(db, ctx, item)


@router.post(
    "/atividades/{origem}/{ref_id}/justificativa",
    response_model=MinhaParticipacao,
    dependencies=[_PLANO, Depends(require_not_impersonated)],
)
async def contar_o_motivo(
    origem: str,
    ref_id: uuid.UUID,
    body: JustificativaBody,
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> MinhaParticipacao:
    """"Conte o motivo" de uma falta já registrada, até o prazo da casa."""
    item = await _item_do_medium(db, ctx, _origem_valida(origem), ref_id)
    if item.tipo is None or not item.tipo.controla_presenca:
        raise ConflictError("Esta atividade não tem marcação de presença.")
    linha, _, _, prazo_dias = await _minha_linha(db, ctx, item)
    if linha.dispensado_em is not None:
        raise ConflictError(MSG_DISPENSADO)
    if linha.presenca != PRESENCA_AUSENTE:
        raise ConflictError("Só dá para contar o motivo depois que a falta for registrada.")
    agora = utc_now()
    prazo = prazo_justificativa(item.fim_efetivo, prazo_dias)
    if not dentro_do_prazo(agora.astimezone(APP_TZ).date(), prazo):
        raise ConflictError(f"O prazo para contar o motivo terminou em {prazo:%d/%m}.")
    gravar_justificativa(linha, limpar_justificativa(body.justificativa, obrigatoria=True), agora)
    linha.updated_at = agora
    await _auditar(db, ctx, linha, "contou o motivo de uma ausência")
    await db.commit()
    return await _resposta(db, ctx, item)


@router.get("/presencas", response_model=PresencasResponse, dependencies=[_PLANO])
async def minhas_presencas(
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> PresencasResponse:
    """Próximas escalas (60 dias), histórico (90 dias) e o percentual de presença.

    Percentual = presentes ÷ convocações com chamada encerrada, sem dispensados (regra do AM-26).
    """
    agora = utc_now()
    desde = agora - timedelta(days=HISTORICO_DIAS)
    itens = await itens_do_periodo(db, ctx, desde, agora + timedelta(days=PROXIMAS_DIAS))
    participacoes = await participacoes_do_medium(db, ctx, itens, agora)
    proximas: list[ItemPresenca] = []
    historico: list[ItemPresenca] = []
    presentes = total = 0
    for item in itens:
        participacao, tem_linha = participacoes.get((item.origem, item.ref_id), (None, False))
        if participacao is None:
            continue
        dado = ItemPresenca(**item_de(item, participacao))
        if item.fim_efetivo >= agora:
            if participacao["situacao"] not in (SITUACAO_DISPENSADO, SITUACAO_SUBSTITUIDO):
                proximas.append(dado)
            continue
        if not tem_linha:
            continue  # convocação virtual de atividade sem chamada: não entra no histórico
        historico.append(dado)
        if (
            participacao["chamada_encerrada"]
            and participacao["convocado"]
            and participacao["situacao"] not in (SITUACAO_DISPENSADO, SITUACAO_SUBSTITUIDO)
        ):
            total += 1
            presentes += participacao["situacao"] == SITUACAO_PRESENTE
    historico.reverse()
    _, prazo_dias = await config_presenca(db, ctx.tenant_id)
    return PresencasResponse(
        proximas=proximas,
        historico=historico,
        resumo=ResumoPresenca(
            presentes=presentes,
            total=total,
            percentual=percentual(presentes, total),
            desde=desde.astimezone(APP_TZ).date(),
        ),
        prazo_justificativa_dias=prazo_dias,
    )
