"""Presença no painel — confirmações, convocação, chamada e QR do dia (AM-17/AM-28).

Mesmo prefixo e mesmos gates de plano das atividades (`area_medium` + `atividades_corrente`);
grupo de permissão `ESCALAS`. A chamada de uma GIRA também abre para quem tem `PORTA:edit` (o
porteiro faz a chamada da corrente na porta, §8.6) e o QR da gira para `PORTA:view` (modo TV).

- ``POST /api/v1/admin/atividades/da-gira/{gira_id}/chamada`` — âncora da gira para abrir a
  chamada (`ESCALAS:edit` ou `PORTA:edit`); devolve o id da atividade.
- ``GET  /api/v1/admin/atividades/da-gira/{gira_id}/qr``     — QR da gira para a Porta/TV, sem
  criar a âncora (`ESCALAS:edit` ou `PORTA:view`).
- ``GET  /api/v1/admin/atividades/{id}/confirmacoes``        — contadores (confirmados, ausências
  avisadas, sem resposta...) e a lista com as justificativas (`ESCALAS:view`).
- ``GET  /api/v1/admin/atividades/convocar/mediuns``         — médiuns ativos para escolher na
  criação da atividade (`ESCALAS:insert`; só id e nome).
- ``POST /api/v1/admin/atividades/{id}/convocar``            — "Pôr na escala" (`ESCALAS:insert`):
  médiuns um a um e/ou grupos inteiros (AM-29; membros ativos que o tipo alcança, origem "grupo").
- ``POST /api/v1/admin/atividades/{id}/dispensar``           — tira da escala (`ESCALAS:edit`).
- ``GET  /api/v1/admin/atividades/{id}/chamada``             — lista da chamada (`ESCALAS:edit`; na
  gira também `PORTA:edit`).
- ``PUT  /api/v1/admin/atividades/{id}/chamada``             — presente/ausente, "Marcar todos os
  confirmados como presentes", "Adicionar quem veio" (avulso). Vale também depois de encerrada
  (correção; fica gravado quem mudou e quando).
- ``POST /api/v1/admin/atividades/{id}/chamada/encerrar``    — encerra (idempotente): materializa
  os esperados, confiança + "vou" → presente, o resto → ausente.
- ``GET  /api/v1/admin/atividades/{id}/qr``                  — código do QR do dia (rotativo, 60 s;
  `ESCALAS:edit`, ou `PORTA:view` na gira). Sem dado pessoal.

A justificativa (pode ter dado de saúde, §6.8) só sai para quem tem `ESCALAS:view`; quem abre a
chamada só pela Porta vê que há motivo, não o texto. Nunca vai para a auditoria.
Todo `medium_id` do corpo é conferido no terreiro antes de gravar (`_validar_mediuns_do_tenant`) e
todo `grupo_id`, no terreiro e não arquivado (`validar_grupos_ativos_do_tenant`).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Path, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import (
    get_current_user,
    require_any_group_permission,
    require_group_permission,
    require_plan_feature,
)
from src.core.config import settings
from src.core.database import get_db
from src.core.errors import ConflictError, GroupPermissionDeniedError, ValidationError
from src.core.tz import utc_now
from src.models import (
    CorrenteGrupo,
    FuncaoCorrente,
    Medium,
    PermissionFeature,
    User,
)
from src.services.audit_service import AuditService
from src.services.corrente_grupos import validar_grupos_ativos_do_tenant
from src.services.permission_service import PermissionService
from src.services.presenca import (
    MODO_CONFIANCA,
    MODO_QR,
    PRESENCA_NAO_REGISTRADA,
    PRESENCA_PRESENTE,
    QR_INTERVALO_S,
    RESPOSTA_NAO_VOU,
    RESPOSTA_SEM,
    RESPOSTA_VOU,
    SITUACAO_DISPENSADO,
    SITUACAO_SUBSTITUIDO,
    AtividadeCtx,
    codigo_qr,
    conteudo_qr,
    ctx_da_atividade,
    ctx_da_gira,
    dentro_da_janela,
    elegiveis_entre,
    encerrar_chamada,
    upsert_participacao,
    janela_checkin,
    janela_qr,
    mediuns_esperados,
    membros_ativos_dos_grupos,
    modo_da_atividade,
    participacoes_da_atividade,
    planejar_convocacao,
    registrar_presenca,
    situacao,
)

router = APIRouter(
    prefix="/api/v1/admin/atividades",
    tags=["admin-atividades-presenca"],
    dependencies=[
        Depends(require_plan_feature("area_medium")),
        Depends(require_plan_feature("atividades_corrente")),
    ],
)


MSG_SEM_PRESENCA = "Este tipo de atividade não controla presença."
MSG_CANCELADA = "Esta atividade foi cancelada."


# ── Schemas ─────────────────────────────────────────────────────────────────


class TipoMini(BaseModel):
    id: Optional[uuid.UUID] = None
    nome: str
    icone: str
    cor: Optional[str] = None


class AtividadeInfo(BaseModel):
    atividade_id: uuid.UUID
    origem: str
    ref_id: uuid.UUID
    titulo: str
    inicio: datetime
    fim: Optional[datetime] = None
    local: Optional[str] = None
    tipo: TipoMini
    modo_presenca: str
    controla_presenca: bool
    pede_confirmacao: bool
    exige_justificativa: bool
    convocacao_padrao: str
    cancelada: bool
    chamada_encerrada_em: Optional[datetime] = None
    chamada_encerrada_por: Optional[str] = None
    pode_encerrar: bool


class Pessoa(BaseModel):
    medium_id: uuid.UUID
    nome: str
    convocado: bool
    origem: str
    grupo: Optional[str] = None
    funcao: Optional[str] = None
    resposta: str
    respondido_em: Optional[datetime] = None
    presenca: str
    presenca_origem: Optional[str] = None
    presenca_registrada_em: Optional[datetime] = None
    presenca_registrada_por: Optional[str] = None
    situacao: str
    tem_justificativa: bool
    # Só para quem tem ESCALAS:view (§6.8).
    justificativa: Optional[str] = None
    dispensado: bool


class Contadores(BaseModel):
    esperados: int
    confirmados: int
    ausencias_avisadas: int
    sem_resposta: int
    presentes: int
    ausentes: int
    sem_registro: int
    dispensados: int


class MediumOpcao(BaseModel):
    id: uuid.UUID
    nome: str


class ListaResponse(BaseModel):
    atividade: AtividadeInfo
    contadores: Contadores
    pessoas: list[Pessoa]
    # Chamada: médiuns ativos fora da lista ("Adicionar quem veio" / "Convocar").
    outros_mediuns: list[MediumOpcao] = []
    ver_justificativa: bool


class AncoraResponse(BaseModel):
    atividade_id: uuid.UUID


class MediunsBody(BaseModel):
    medium_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=300)


class ConvocarBody(BaseModel):
    """Médiuns um a um e/ou grupos da corrente inteiros (AM-29) — pelo menos um dos dois."""

    medium_ids: list[uuid.UUID] = Field(default_factory=list, max_length=300)
    grupo_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def _algum(self) -> "ConvocarBody":
        if not self.medium_ids and not self.grupo_ids:
            raise ValueError("Escolha médiuns ou grupos para pôr na escala.")
        return self


class ConvocarResultado(BaseModel):
    novos: int
    ja_estavam: int
    fora_da_elegibilidade: int
    # Nomes de quem ficou de fora (o tipo da atividade não alcança) — para a casa conferir.
    fora_da_elegibilidade_nomes: list[str] = []


class ConvocarResponse(ListaResponse):
    resultado: ConvocarResultado


class Marcacao(BaseModel):
    medium_id: uuid.UUID
    presenca: Literal["presente", "ausente", "nao_registrada"]


class ChamadaUpdate(BaseModel):
    marcacoes: list[Marcacao] = Field(default_factory=list, max_length=500)
    medium_ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)  # avulsos ("quem veio")
    marcar_confirmados: bool = False


class QrResponse(BaseModel):
    modo: str
    ativo: bool
    # Só com `ativo`: o código curto (para digitar) e o conteúdo do QR (link da Área).
    codigo: Optional[str] = None
    conteudo: Optional[str] = None
    expira_em: Optional[datetime] = None
    intervalo_s: int = QR_INTERVALO_S
    janela_abre_em: Optional[datetime] = None
    janela_fecha_em: Optional[datetime] = None
    titulo: str


# ── Ajudantes ───────────────────────────────────────────────────────────────


async def _pode(db: AsyncSession, request: Request, user: User, feature: PermissionFeature, action: str) -> bool:
    return await PermissionService(db).check_permission(
        user=user, feature=feature, action=action, token_data=getattr(request.state, "token", None)
    )


async def _exigir_chamada(db: AsyncSession, request: Request, user: User, ctx: AtividadeCtx) -> None:
    """ESCALAS:edit; na gira, PORTA:edit também abre a chamada."""
    if await _pode(db, request, user, PermissionFeature.ESCALAS, "edit"):
        return
    if ctx.origem == "gira" and await _pode(db, request, user, PermissionFeature.PORTA, "edit"):
        return
    raise GroupPermissionDeniedError(PermissionFeature.ESCALAS.value, "edit")


async def _exigir_qr(db: AsyncSession, request: Request, user: User, origem: str) -> None:
    """ESCALAS:edit; na gira, PORTA:view (Porta/modo TV) também vê o QR."""
    if await _pode(db, request, user, PermissionFeature.ESCALAS, "edit"):
        return
    if origem == "gira" and await _pode(db, request, user, PermissionFeature.PORTA, "view"):
        return
    raise GroupPermissionDeniedError(PermissionFeature.ESCALAS.value, "edit")


async def _validar_mediuns_do_tenant(
    db: AsyncSession, tenant_id: uuid.UUID, medium_ids: list[uuid.UUID], *, so_ativos: bool = True
) -> dict[uuid.UUID, Medium]:
    """Todos os ids são médiuns do terreiro (ativos, se `so_ativos`); senão 422."""
    ids = set(medium_ids)
    if not ids:
        return {}
    stmt = select(Medium).where(
        Medium.tenant_id == tenant_id, Medium.id.in_(medium_ids), Medium.deleted_at.is_(None)
    )
    if so_ativos:
        stmt = stmt.where(Medium.is_active.is_(True))
    encontrados = {m.id: m for m in (await db.execute(stmt)).scalars().all()}
    if set(encontrados) != ids:
        raise ValidationError("Escolha médiuns ativos da casa.")
    return encontrados


async def _ctx(db: AsyncSession, tenant_id: uuid.UUID, atividade_id: uuid.UUID) -> AtividadeCtx:
    return await ctx_da_atividade(db, tenant_id, atividade_id)


async def _info(db: AsyncSession, tenant_id: uuid.UUID, ctx: AtividadeCtx, modo: str) -> AtividadeInfo:
    tipo = ctx.tipo
    assert tipo is not None and ctx.atividade is not None
    por = None
    if ctx.atividade.chamada_encerrada_por is not None:
        por = (
            await db.execute(
                select(User.full_name, User.username).where(
                    User.id == ctx.atividade.chamada_encerrada_por, User.tenant_id == tenant_id
                )
            )
        ).first()
    agora = utc_now()
    return AtividadeInfo(
        atividade_id=ctx.atividade.id,
        origem=ctx.origem,
        ref_id=ctx.ref_id,
        titulo=ctx.titulo,
        inicio=ctx.inicio,
        fim=ctx.fim,
        local=ctx.local,
        tipo=TipoMini(id=tipo.id, nome=tipo.nome, icone=tipo.icone, cor=tipo.cor),
        modo_presenca=modo,
        controla_presenca=tipo.controla_presenca,
        pede_confirmacao=tipo.pede_confirmacao,
        exige_justificativa=tipo.exige_justificativa,
        convocacao_padrao=tipo.convocacao_padrao,
        cancelada=ctx.cancelada,
        chamada_encerrada_em=ctx.encerrada_em,
        chamada_encerrada_por=(por[0] or por[1]) if por else None,
        pode_encerrar=(
            ctx.encerrada_em is None and not ctx.cancelada and tipo.controla_presenca and agora >= ctx.inicio
        ),
    )


async def _lista(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    ctx: AtividadeCtx,
    *,
    ver_justificativa: bool,
    com_outros: bool,
) -> ListaResponse:
    """Esperados (virtuais) ∪ participações gravadas, com nomes, situação e contadores."""
    modo = await modo_da_atividade(db, tenant_id, ctx.tipo)
    linhas = {p.medium_id: p for p in await participacoes_da_atividade(db, tenant_id, ctx.atividade_id)}
    esperados = {m.id: m for m in await mediuns_esperados(db, tenant_id, ctx)}
    ids = set(linhas) | set(esperados)
    nomes = {}
    if ids:
        nomes = {
            mid: nome
            for mid, nome in (
                await db.execute(select(Medium.id, Medium.nome).where(Medium.tenant_id == tenant_id, Medium.id.in_(ids)))
            ).all()
        }
    grupo_ids = {p.grupo_id for p in linhas.values() if p.grupo_id}
    funcao_ids = {p.funcao_id for p in linhas.values() if p.funcao_id}
    user_ids = {p.presenca_registrada_por for p in linhas.values() if p.presenca_registrada_por}
    grupos = (
        dict(
            (
                await db.execute(
                    select(CorrenteGrupo.id, CorrenteGrupo.nome).where(
                        CorrenteGrupo.tenant_id == tenant_id, CorrenteGrupo.id.in_(grupo_ids)
                    )
                )
            ).all()
        )
        if grupo_ids
        else {}
    )
    funcoes = (
        dict(
            (
                await db.execute(
                    select(FuncaoCorrente.id, FuncaoCorrente.nome).where(
                        FuncaoCorrente.tenant_id == tenant_id, FuncaoCorrente.id.in_(funcao_ids)
                    )
                )
            ).all()
        )
        if funcao_ids
        else {}
    )
    usuarios = {}
    if user_ids:
        usuarios = {
            uid: (nome or login)
            for uid, nome, login in (
                await db.execute(
                    select(User.id, User.full_name, User.username).where(
                        User.tenant_id == tenant_id, User.id.in_(user_ids)
                    )
                )
            ).all()
        }
    agora = utc_now()
    confianca_terminou = bool(ctx.tipo.controla_presenca) and modo == MODO_CONFIANCA and agora > ctx.fim_efetivo
    pessoas: list[Pessoa] = []
    for mid in ids:
        p = linhas.get(mid)
        convocado = bool(p is not None and p.convocado) or mid in esperados
        dispensado = p is not None and p.dispensado_em is not None
        sit = situacao(
            convocado=convocado,
            resposta=p.resposta if p else RESPOSTA_SEM,
            presenca=p.presenca if p else PRESENCA_NAO_REGISTRADA,
            justificativa=p.justificativa if p else None,
            dispensado=dispensado,
            substituido=p is not None and p.substituida_por_id is not None,
            cancelada=ctx.cancelada,
            confianca_terminou=confianca_terminou,
        )
        tem_just = bool(p is not None and (p.justificativa or "").strip())
        pessoas.append(
            Pessoa(
                medium_id=mid,
                nome=nomes.get(mid, "Médium"),
                convocado=convocado,
                origem=p.origem if p else "elegivel",
                grupo=grupos.get(p.grupo_id) if p and p.grupo_id else None,
                funcao=funcoes.get(p.funcao_id) if p and p.funcao_id else None,
                resposta=p.resposta if p else RESPOSTA_SEM,
                respondido_em=p.respondido_em if p else None,
                presenca=p.presenca if p else PRESENCA_NAO_REGISTRADA,
                presenca_origem=p.presenca_origem if p else None,
                presenca_registrada_em=p.presenca_registrada_em if p else None,
                presenca_registrada_por=usuarios.get(p.presenca_registrada_por) if p and p.presenca_registrada_por else None,
                situacao=sit,
                tem_justificativa=tem_just,
                justificativa=(p.justificativa if (ver_justificativa and p is not None) else None),
                dispensado=dispensado,
            )
        )
    pessoas.sort(key=lambda x: x.nome.lower())
    ativos = [x for x in pessoas if x.situacao not in (SITUACAO_DISPENSADO, SITUACAO_SUBSTITUIDO)]
    contadores = Contadores(
        esperados=sum(1 for x in ativos if x.convocado),
        confirmados=sum(1 for x in ativos if x.resposta == RESPOSTA_VOU),
        ausencias_avisadas=sum(1 for x in ativos if x.resposta == RESPOSTA_NAO_VOU),
        sem_resposta=sum(1 for x in ativos if x.convocado and x.resposta == RESPOSTA_SEM),
        presentes=sum(1 for x in ativos if x.presenca == PRESENCA_PRESENTE),
        ausentes=sum(1 for x in ativos if x.presenca == "ausente"),
        sem_registro=sum(1 for x in ativos if x.presenca == PRESENCA_NAO_REGISTRADA),
        dispensados=len(pessoas) - len(ativos),
    )
    outros: list[MediumOpcao] = []
    if com_outros:
        outros = [
            MediumOpcao(id=mid, nome=nome)
            for mid, nome in (
                await db.execute(
                    select(Medium.id, Medium.nome)
                    .where(Medium.tenant_id == tenant_id, Medium.deleted_at.is_(None), Medium.is_active.is_(True))
                    .order_by(Medium.nome)
                )
            ).all()
            if mid not in ids
        ]
    return ListaResponse(
        atividade=await _info(db, tenant_id, ctx, modo),
        contadores=contadores,
        pessoas=pessoas,
        outros_mediuns=outros,
        ver_justificativa=ver_justificativa,
    )


def _recusar_sem_presenca(ctx: AtividadeCtx) -> None:
    if ctx.tipo is None or not ctx.tipo.controla_presenca:
        raise ConflictError(MSG_SEM_PRESENCA)


def _qr(tenant_id: uuid.UUID, ctx: AtividadeCtx, modo: str, agora: datetime) -> QrResponse:
    """Código do QR do dia — só no modo QR, com a janela do "Cheguei" aberta."""
    tipo = ctx.tipo
    titulo = ctx.titulo
    if tipo is None or not tipo.controla_presenca:
        return QrResponse(modo=modo, ativo=False, titulo=titulo)
    abre, fecha = janela_checkin(ctx.inicio, tipo.checkin_antes_min, tipo.checkin_depois_min)
    ativo = (
        modo == MODO_QR
        and not ctx.cancelada
        and ctx.encerrada_em is None
        and dentro_da_janela(agora, abre, fecha)
    )
    if not ativo:
        return QrResponse(modo=modo, ativo=False, janela_abre_em=abre, janela_fecha_em=fecha, titulo=titulo)
    janela = janela_qr(agora)
    codigo = codigo_qr(tenant_id, ctx.origem, ctx.ref_id, janela)
    return QrResponse(
        modo=modo,
        ativo=True,
        codigo=codigo,
        conteudo=conteudo_qr(settings.FRONTEND_URL, ctx.origem, ctx.ref_id, codigo),
        expira_em=datetime.fromtimestamp((janela + 1) * QR_INTERVALO_S, tz=timezone.utc),
        janela_abre_em=abre,
        janela_fecha_em=fecha,
        titulo=titulo,
    )


# ── Rotas: gira ─────────────────────────────────────────────────────────────


@router.post("/da-gira/{gira_id}/chamada", response_model=AncoraResponse, dependencies=[Depends(require_any_group_permission(PermissionFeature.ESCALAS, PermissionFeature.PORTA, action="edit"))],
)
async def abrir_chamada_da_gira(
    request: Request,
    gira_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AncoraResponse:
    """A âncora da gira (criada na primeira vez) para abrir a tela da chamada."""
    tenant_id = current_user.tenant_id
    ctx = await ctx_da_gira(db, tenant_id, gira_id, criar_ancora=True, so_ativa=False)
    await _exigir_chamada(db, request, current_user, ctx)
    await db.commit()
    return AncoraResponse(atividade_id=ctx.atividade_id)


@router.get("/da-gira/{gira_id}/qr", response_model=QrResponse, dependencies=[Depends(require_any_group_permission(PermissionFeature.ESCALAS, PermissionFeature.PORTA, action="view"))],
)
async def qr_da_gira(
    request: Request,
    gira_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QrResponse:
    """QR da gira para a Porta e o modo TV (não cria a âncora; sem dado pessoal)."""
    tenant_id = current_user.tenant_id
    await _exigir_qr(db, request, current_user, "gira")
    ctx = await ctx_da_gira(db, tenant_id, gira_id, criar_ancora=False)
    modo = await modo_da_atividade(db, tenant_id, ctx.tipo) if ctx.tipo is not None else MODO_CONFIANCA
    return _qr(tenant_id, ctx, modo, utc_now())


# ── Rotas: confirmações e convocação ────────────────────────────────────────


@router.get(
    "/{atividade_id}/confirmacoes",
    response_model=ListaResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "view"))],
)
async def confirmacoes(
    atividade_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ListaResponse:
    """Confirmados, ausências avisadas, sem resposta — e as justificativas (ESCALAS:view)."""
    ctx = await _ctx(db, current_user.tenant_id, atividade_id)
    return await _lista(db, current_user.tenant_id, ctx, ver_justificativa=True, com_outros=True)


@router.get(
    "/convocar/mediuns",
    response_model=list[MediumOpcao],
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "insert"))],
)
async def mediuns_para_convocar(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MediumOpcao]:
    """Médiuns ativos (id e nome) para o "Pôr na escala" da criação da atividade (AM-29)."""
    rows = await db.execute(
        select(Medium.id, Medium.nome)
        .where(
            Medium.tenant_id == current_user.tenant_id,
            Medium.deleted_at.is_(None),
            Medium.is_active.is_(True),
        )
        .order_by(Medium.nome)
    )
    return [MediumOpcao(id=mid, nome=nome) for mid, nome in rows.all()]


def _na_escala(linhas: dict, esperados: set[uuid.UUID]) -> set[uuid.UUID]:
    """Quem já está na escala: convocado (linha ou convocação virtual), sem dispensa nem troca."""
    out: set[uuid.UUID] = set()
    for mid in set(linhas) | esperados:
        p = linhas.get(mid)
        convocado = mid in esperados or bool(p is not None and p.convocado)
        fora = p is not None and (p.dispensado_em is not None or p.substituida_por_id is not None)
        if convocado and not fora:
            out.add(mid)
    return out


@router.post(
    "/{atividade_id}/convocar",
    response_model=ConvocarResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "insert"))],
)
async def convocar(
    body: ConvocarBody,
    atividade_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConvocarResponse:
    """Põe na escala ("só escalados" e ritual individual): médiuns um a um e/ou grupos inteiros.

    Médium pedido um a um entra sempre (quem estava dispensado volta). Grupo (AM-29): os membros
    ATIVOS naquele momento que o tipo da atividade alcança entram com origem "grupo" e o
    `grupo_id`; quem o tipo não alcança fica de fora e volta no `resultado`. Quem já estava na
    escala fica como estava (a linha é única por atividade + médium; origem e resposta não mudam).
    """
    tenant_id = current_user.tenant_id
    ctx = await _ctx(db, tenant_id, atividade_id)
    if ctx.cancelada:
        raise ConflictError(MSG_CANCELADA)
    if ctx.encerrada_em is not None:
        raise ConflictError("A chamada desta atividade já foi encerrada.")
    pedidos = list(body.medium_ids)
    grupo_ids = list(body.grupo_ids)
    mediuns = await _validar_mediuns_do_tenant(db, tenant_id, pedidos)
    grupos = await validar_grupos_ativos_do_tenant(db, tenant_id, grupo_ids)
    membros = await membros_ativos_dos_grupos(db, tenant_id, grupo_ids)  # conferidos acima
    elegiveis = await elegiveis_entre(db, tenant_id, ctx.tipo, [m for m, _ in membros])
    linhas = {p.medium_id: p for p in await participacoes_da_atividade(db, tenant_id, ctx.atividade.id)}
    esperados = {m.id for m in await mediuns_esperados(db, tenant_id, ctx)}
    plano = planejar_convocacao(
        pedidos=pedidos,
        membros=[(m.id, gid) for m, gid in membros],
        elegiveis=elegiveis,
        na_escala=_na_escala(linhas, esperados),
    )

    agora = utc_now()
    for medium_id in pedidos:  # conferidos no terreiro (_validar_mediuns_do_tenant acima)
        p = await upsert_participacao(
            db, tenant_id, ctx.atividade.id, medium_id=medium_id, origem="manual", convocado=True
        )
        p.convocado = True
        p.dispensado_em = None
        p.updated_at = agora
    do_grupo: dict[uuid.UUID, list[uuid.UUID]] = {}
    for membro_id, gid in plano.do_grupo:
        do_grupo.setdefault(gid, []).append(membro_id)
    for grupo_id in grupo_ids:  # conferidos no terreiro (validar_grupos_ativos_do_tenant acima)
        for membro_id in do_grupo.pop(grupo_id, []):  # membros ativos desse grupo (uma vez)
            p = await upsert_participacao(
                db,
                tenant_id,
                ctx.atividade.id,
                medium_id=membro_id,
                origem="grupo",
                convocado=True,
                grupo_id=grupo_id,
            )
            p.convocado = True
            p.dispensado_em = None
            p.updated_at = agora
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="atividade_escala",
        resource_id=ctx.atividade.id,
        previous_state={},
        new_state={
            "convocou": [str(m) for m in mediuns],
            "grupos": [str(g.id) for g in grupos],
            "do_grupo": [str(m) for m, _ in plano.do_grupo],
        },
    )
    await db.commit()
    nomes = {m.id: m.nome for m, _ in membros}
    lista = await _lista(db, tenant_id, await _ctx(db, tenant_id, atividade_id), ver_justificativa=True, com_outros=True)
    return ConvocarResponse(
        **lista.model_dump(),
        resultado=ConvocarResultado(
            novos=plano.novos,
            ja_estavam=plano.ja_estavam,
            fora_da_elegibilidade=len(plano.fora_da_elegibilidade),
            fora_da_elegibilidade_nomes=sorted((nomes[m] for m in plano.fora_da_elegibilidade), key=str.lower),
        ),
    )


@router.post(
    "/{atividade_id}/dispensar",
    response_model=ListaResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "edit"))],
)
async def dispensar(
    body: MediunsBody,
    atividade_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ListaResponse:
    """Tira da escala (situação "Dispensado"). O histórico da linha fica."""
    tenant_id = current_user.tenant_id
    ctx = await _ctx(db, tenant_id, atividade_id)
    if ctx.encerrada_em is not None:
        raise ConflictError("A chamada desta atividade já foi encerrada.")
    mediuns = await _validar_mediuns_do_tenant(db, tenant_id, body.medium_ids, so_ativos=False)
    agora = utc_now()
    for medium_id in body.medium_ids:  # conferidos no terreiro (_validar_mediuns_do_tenant acima)
        p = await upsert_participacao(
            db, tenant_id, ctx.atividade.id, medium_id=medium_id, origem="manual", convocado=True
        )
        p.dispensado_em = p.dispensado_em or agora
        p.updated_at = agora
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="atividade_escala",
        resource_id=ctx.atividade.id,
        previous_state={},
        new_state={"dispensou": [str(m) for m in mediuns]},
    )
    await db.commit()
    return await _lista(db, tenant_id, await _ctx(db, tenant_id, atividade_id), ver_justificativa=True, com_outros=True)


# ── Rotas: chamada ──────────────────────────────────────────────────────────


@router.get("/{atividade_id}/chamada", response_model=ListaResponse, dependencies=[Depends(require_any_group_permission(PermissionFeature.ESCALAS, PermissionFeature.PORTA, action="edit"))],
)
async def ver_chamada(
    request: Request,
    atividade_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ListaResponse:
    tenant_id = current_user.tenant_id
    ctx = await _ctx(db, tenant_id, atividade_id)
    await _exigir_chamada(db, request, current_user, ctx)
    ver = await _pode(db, request, current_user, PermissionFeature.ESCALAS, "view")
    return await _lista(db, tenant_id, ctx, ver_justificativa=ver, com_outros=True)


@router.put("/{atividade_id}/chamada", response_model=ListaResponse, dependencies=[Depends(require_any_group_permission(PermissionFeature.ESCALAS, PermissionFeature.PORTA, action="edit"))],
)
async def marcar_chamada(
    request: Request,
    body: ChamadaUpdate,
    atividade_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ListaResponse:
    """Presente/ausente (tocar alterna), confirmados → presentes, "Adicionar quem veio".

    Depois de encerrada continua valendo como correção (fica quem mudou e quando).
    """
    tenant_id = current_user.tenant_id
    ctx = await _ctx(db, tenant_id, atividade_id)
    await _exigir_chamada(db, request, current_user, ctx)
    _recusar_sem_presenca(ctx)
    if ctx.cancelada:
        raise ConflictError(MSG_CANCELADA)
    marcados = await _validar_mediuns_do_tenant(
        db, tenant_id, [m.medium_id for m in body.marcacoes], so_ativos=False
    )
    avulsos = await _validar_mediuns_do_tenant(db, tenant_id, body.medium_ids)
    esperados = {m.id for m in await mediuns_esperados(db, tenant_id, ctx)}
    linhas = {p.medium_id: p for p in await participacoes_da_atividade(db, tenant_id, ctx.atividade.id)}
    fora = [m for m in marcados if m not in esperados and m not in linhas]
    if fora:
        raise ValidationError("Esse médium não está na chamada. Use “Adicionar quem veio”.")
    agora = utc_now()
    por = current_user.id
    for marcacao in body.marcacoes:  # medium_id conferido no terreiro (_validar_mediuns_do_tenant acima)
        p = await upsert_participacao(
            db, tenant_id, ctx.atividade.id, medium_id=marcacao.medium_id, origem="elegivel", convocado=True
        )
        registrar_presenca(p, marcacao.presenca, "chamada", por, agora)
        if marcacao.presenca != PRESENCA_NAO_REGISTRADA:
            p.dispensado_em = None  # a marcação de quem faz a chamada vale por último
    confirmados = 0
    if body.marcar_confirmados:
        for p in await participacoes_da_atividade(db, tenant_id, ctx.atividade.id, travar=True):
            if (
                p.resposta == RESPOSTA_VOU
                and p.presenca == PRESENCA_NAO_REGISTRADA
                and p.dispensado_em is None
                and p.substituida_por_id is None
            ):
                registrar_presenca(p, PRESENCA_PRESENTE, "chamada", por, agora)
                confirmados += 1
    for medium_id in body.medium_ids:  # conferidos no terreiro (_validar_mediuns_do_tenant acima)
        p = await upsert_participacao(
            db, tenant_id, ctx.atividade.id, medium_id=medium_id, origem="avulso", convocado=medium_id in esperados
        )
        registrar_presenca(p, PRESENCA_PRESENTE, "chamada", por, agora)
        p.dispensado_em = None
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="atividade_chamada",
        resource_id=ctx.atividade.id,
        previous_state={},
        new_state={
            "marcacoes": [{"medium_id": str(m.medium_id), "presenca": m.presenca} for m in body.marcacoes],
            "avulsos": [str(m) for m in avulsos],
            "confirmados_marcados": confirmados,
            "correcao": ctx.encerrada_em is not None,
        },
    )
    await db.commit()
    ver = await _pode(db, request, current_user, PermissionFeature.ESCALAS, "view")
    return await _lista(db, tenant_id, await _ctx(db, tenant_id, atividade_id), ver_justificativa=ver, com_outros=True)


@router.post("/{atividade_id}/chamada/encerrar", response_model=ListaResponse, dependencies=[Depends(require_any_group_permission(PermissionFeature.ESCALAS, PermissionFeature.PORTA, action="edit"))],
)
async def encerrar(
    request: Request,
    atividade_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ListaResponse:
    """Encerra a chamada (idempotente): quem ficou sem marcação vira ausente (no modo confiança,
    quem confirmou "vou" vira presente)."""
    tenant_id = current_user.tenant_id
    ctx = await _ctx(db, tenant_id, atividade_id)
    await _exigir_chamada(db, request, current_user, ctx)
    _recusar_sem_presenca(ctx)
    if ctx.cancelada:
        raise ConflictError(MSG_CANCELADA)
    if ctx.encerrada_em is None and utc_now() < ctx.inicio:
        raise ConflictError("A chamada só pode ser encerrada depois que a atividade começar.")
    modo = await modo_da_atividade(db, tenant_id, ctx.tipo)
    resultado = await encerrar_chamada(db, tenant_id, ctx, por=current_user.id, modo=modo)
    if resultado.encerrada_agora:
        await AuditService(db).log_update(
            tenant_id=tenant_id,
            user_id=current_user.id,
            resource_type="atividade_chamada",
            resource_id=ctx.atividade.id,
            previous_state={"encerrada": False},
            new_state={"encerrada": True, "presentes": resultado.presentes, "ausentes": resultado.ausentes},
        )
    await db.commit()
    ver = await _pode(db, request, current_user, PermissionFeature.ESCALAS, "view")
    return await _lista(db, tenant_id, await _ctx(db, tenant_id, atividade_id), ver_justificativa=ver, com_outros=True)


@router.get("/{atividade_id}/qr", response_model=QrResponse, dependencies=[Depends(require_any_group_permission(PermissionFeature.ESCALAS, PermissionFeature.PORTA, action="view"))],
)
async def qr_da_atividade(
    request: Request,
    atividade_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QrResponse:
    """Código do QR do dia para a tela da chamada (rotativo, sem dado pessoal)."""
    tenant_id = current_user.tenant_id
    ctx = await _ctx(db, tenant_id, atividade_id)
    await _exigir_qr(db, request, current_user, ctx.origem)
    modo = await modo_da_atividade(db, tenant_id, ctx.tipo)
    return _qr(tenant_id, ctx, modo, utc_now())

