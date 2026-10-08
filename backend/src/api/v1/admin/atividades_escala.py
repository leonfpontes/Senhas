"""Escala por função no painel — quem trabalha em cada gira e em que função (AM-18).

Mesmo prefixo das atividades; gates de plano `area_medium` + `atividades_corrente` + `escalas`
(Pro: fora do plano → 403) e grupo de permissão `ESCALAS`. Vale para a gira (pela âncora,
`services/atividades.atividade_da_gira`) e para atividades cujo tipo tem `modo_escala =
'funcoes'` (senão 409).

- ``POST /api/v1/admin/atividades/da-gira/{gira_id}/escala``          — âncora da gira para abrir a
  aba Escala (`ESCALAS:view`; cria a âncora na primeira vez, sem dado de negócio); devolve o id.
- ``GET  /api/v1/admin/atividades/{id}/escala``                       — funções da casa com quem
  está em cada uma (um a um e grupos inteiros), quem saiu, médiuns elegíveis e a anterior com
  escala (`ESCALAS:view`).
- ``PUT  /api/v1/admin/atividades/{id}/escala``                       — salva a escala inteira
  (`ESCALAS:edit`): por função, médiuns e/ou grupos; quem tinha função e saiu fica dispensado.
- ``POST /api/v1/admin/atividades/{id}/escala/copiar-anterior``       — copia a última anterior do
  mesmo tipo com escala (`ESCALAS:edit`); grupos entram com os membros de hoje.
- ``POST /api/v1/admin/atividades/{id}/escala/rodizio``               — rodízio de uma função entre
  médiuns ou grupos, em ordem circular, por esta e as próximas N-1 do mesmo tipo (`ESCALAS:edit`).

Todo `funcao_id`/`medium_id`/`grupo_id` do corpo é conferido no terreiro antes de gravar
(`_validar_funcoes_do_tenant`, `validar_mediuns_ativos_do_tenant`,
`validar_grupos_ativos_do_tenant`). Regras em `services/escala_gira.py`; a auditoria grava só ids.
Avisos aos médiuns são do AM-15 (gancho em `escala_gira.aplicar_plano`).
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user, require_group_permission, require_plan_feature
from src.core.database import get_db
from src.core.errors import ConflictError, ValidationError
from src.models import CorrenteGrupo, FuncaoCorrente, Medium, PermissionFeature, User
from src.services.audit_service import AuditService
from src.services.corrente_grupos import validar_grupos_ativos_do_tenant, validar_mediuns_ativos_do_tenant
from src.services.escala_gira import (
    MSG_SEM_ANTERIOR,
    ORIGEM_FUNCAO,
    ORIGEM_GRUPO,
    ORIGEM_RODIZIO,
    RODIZIO_MAX_ATIVIDADES,
    RODIZIO_MAX_POR_VEZ,
    PedidoFuncao,
    PlanoEscala,
    anterior_com_escala,
    aplicar_plano,
    editavel,
    exigir_editavel,
    exigir_modo_funcoes,
    linha_atual,
    linhas_da_escala,
    planejar_escala,
    proximas_do_tipo,
    rodizio,
    travar_atividade,
)
from src.services.presenca import (
    AtividadeCtx,
    ctx_da_atividade,
    ctx_da_gira,
    elegiveis_entre,
    membros_ativos_dos_grupos,
)

router = APIRouter(
    prefix="/api/v1/admin/atividades",
    tags=["admin-atividades-escala"],
    dependencies=[
        Depends(require_plan_feature("area_medium")),
        Depends(require_plan_feature("atividades_corrente")),
        Depends(require_plan_feature("escalas")),
    ],
)

MSG_FUNCOES = "Escolha funções da casa."


# ── Schemas ─────────────────────────────────────────────────────────────────


class TipoMini(BaseModel):
    id: uuid.UUID
    nome: str
    icone: str
    cor: Optional[str] = None


class EscalaInfo(BaseModel):
    atividade_id: uuid.UUID
    origem: str
    ref_id: uuid.UUID
    titulo: str
    inicio: datetime
    fim: Optional[datetime] = None
    local: Optional[str] = None
    tipo: TipoMini
    convocacao_padrao: str
    cancelada: bool
    chamada_encerrada: bool
    pode_editar: bool


class PessoaEscala(BaseModel):
    medium_id: uuid.UUID
    nome: str
    origem: str
    resposta: str


class GrupoNaFuncao(BaseModel):
    id: uuid.UUID
    nome: str
    cor: str
    mediuns: list[PessoaEscala]


class FuncaoNaEscala(BaseModel):
    id: uuid.UUID
    nome: str
    descricao: Optional[str] = None
    arquivada: bool = False
    # Um a um (origem "funcao"/"rodizio") e grupos inteiros (origem "grupo").
    mediuns: list[PessoaEscala]
    grupos: list[GrupoNaFuncao]


class TiradoDaEscala(BaseModel):
    medium_id: uuid.UUID
    nome: str
    funcao: Optional[str] = None


class MediumOpcao(BaseModel):
    id: uuid.UUID
    nome: str


class AnteriorInfo(BaseModel):
    atividade_id: uuid.UUID
    titulo: str
    inicio: datetime


class EscalaResponse(BaseModel):
    atividade: EscalaInfo
    funcoes: list[FuncaoNaEscala]
    tirados: list[TiradoDaEscala]
    # Médiuns ativos que o tipo alcança (o Combobox de cada função).
    elegiveis: list[MediumOpcao]
    anterior: Optional[AnteriorInfo] = None
    total_na_escala: int


class EscalaResultado(BaseModel):
    novos: int
    trocados: int
    mantidos: int
    tirados: int
    fora_da_elegibilidade_nomes: list[str] = []
    repetidos_nomes: list[str] = []
    em_outra_funcao_nomes: list[str] = []


class EscalaSalvaResponse(EscalaResponse):
    resultado: EscalaResultado


class AncoraResponse(BaseModel):
    atividade_id: uuid.UUID


class FuncaoPedida(BaseModel):
    funcao_id: uuid.UUID
    medium_ids: list[uuid.UUID] = Field(default_factory=list, max_length=300)
    grupo_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)


class EscalaBody(BaseModel):
    """A escala inteira: o que não vier sai (quem tinha função fica dispensado)."""

    funcoes: list[FuncaoPedida] = Field(default_factory=list, max_length=60)


class RodizioBody(BaseModel):
    """Uma função, médiuns OU grupos na ordem do rodízio, por quantas atividades."""

    funcao_id: uuid.UUID
    medium_ids: list[uuid.UUID] = Field(default_factory=list, max_length=300)
    grupo_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)
    quantidade: int = Field(4, ge=1, le=RODIZIO_MAX_ATIVIDADES)
    por_vez: int = Field(1, ge=1, le=RODIZIO_MAX_POR_VEZ)

    @model_validator(mode="after")
    def _um_dos_dois(self) -> "RodizioBody":
        if bool(self.medium_ids) == bool(self.grupo_ids):
            raise ValueError("Escolha médiuns ou grupos para o rodízio (um dos dois).")
        return self


class RodizioAtividade(BaseModel):
    atividade_id: uuid.UUID
    origem: str
    ref_id: uuid.UUID
    titulo: str
    inicio: datetime
    escolhidos: list[str]
    em_outra_funcao_nomes: list[str] = []


class RodizioResponse(EscalaResponse):
    rodizio: list[RodizioAtividade]


# ── Ajudantes ───────────────────────────────────────────────────────────────


async def _validar_funcoes_do_tenant(
    db: AsyncSession, tenant_id: uuid.UUID, funcao_ids: list[uuid.UUID], *, so_ativas: bool = False
) -> dict[uuid.UUID, FuncaoCorrente]:
    """Todas as funções são do terreiro (e não arquivadas, com `so_ativas`); senão 422."""
    ids = set(funcao_ids)
    if not ids:
        return {}
    stmt = select(FuncaoCorrente).where(FuncaoCorrente.tenant_id == tenant_id, FuncaoCorrente.id.in_(ids))
    if so_ativas:
        stmt = stmt.where(FuncaoCorrente.arquivado_em.is_(None))
    achadas = {f.id: f for f in (await db.execute(stmt)).scalars().all()}
    if set(achadas) != ids:
        raise ValidationError(MSG_FUNCOES)
    return achadas


async def _nomes_de_mediuns(db: AsyncSession, tenant_id: uuid.UUID, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not ids:
        return {}
    rows = await db.execute(select(Medium.id, Medium.nome).where(Medium.tenant_id == tenant_id, Medium.id.in_(ids)))
    return dict(rows.all())


async def _planejar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    ctx: AtividadeCtx,
    pedidos: list[PedidoFuncao],
    *,
    funcoes_afetadas: Optional[set[uuid.UUID]],
    origem_individual: str,
) -> PlanoEscala:
    """Membros ATIVOS dos grupos pedidos (já conferidos no terreiro), quem deles o tipo alcança e
    as linhas de hoje → `planejar_escala`."""
    grupo_ids = [g for p in pedidos for g in p.grupo_ids]
    membros_rows = await membros_ativos_dos_grupos(db, tenant_id, grupo_ids)
    membros: dict[uuid.UUID, list[uuid.UUID]] = {}
    for medium, gid in membros_rows:
        membros.setdefault(gid, []).append(medium.id)
    elegiveis = await elegiveis_entre(db, tenant_id, ctx.tipo, [m for m, _ in membros_rows])
    linhas = await linhas_da_escala(db, tenant_id, ctx.atividade_id)
    return planejar_escala(
        pedidos,
        membros=membros,
        elegiveis=elegiveis,
        atuais={mid: linha_atual(p) for mid, p in linhas.items()},
        funcoes_afetadas=funcoes_afetadas,
        origem_individual=origem_individual,
    )


async def _resultado(db: AsyncSession, tenant_id: uuid.UUID, plano: PlanoEscala) -> EscalaResultado:
    ids = set(plano.fora_da_elegibilidade) | set(plano.repetidos) | set(plano.em_outra_funcao)
    nomes = await _nomes_de_mediuns(db, tenant_id, ids)

    def lista(xs: list[uuid.UUID]) -> list[str]:
        return sorted((nomes.get(m, "Médium") for m in xs), key=str.lower)

    return EscalaResultado(
        novos=len(plano.novos),
        trocados=len(plano.trocados),
        mantidos=len(plano.mantidos),
        tirados=len(plano.tirados),
        fora_da_elegibilidade_nomes=lista(plano.fora_da_elegibilidade),
        repetidos_nomes=lista(plano.repetidos),
        em_outra_funcao_nomes=lista(plano.em_outra_funcao),
    )


async def _auditar(
    db: AsyncSession, current_user: User, ctx: AtividadeCtx, acao: str, plano: PlanoEscala, extra: Optional[dict] = None
) -> None:
    """Só ids e contagens (nunca nomes)."""
    assert ctx.atividade is not None
    await AuditService(db).log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="atividade_escala",
        resource_id=ctx.atividade.id,
        previous_state={},
        new_state={
            "acao": acao,
            "funcoes": {str(m): str(a.funcao_id) for m, a in plano.atribuir.items()},
            "tirados": [str(m) for m in plano.tirados],
            **(extra or {}),
        },
    )


async def _escala(db: AsyncSession, tenant_id: uuid.UUID, ctx: AtividadeCtx) -> EscalaResponse:
    """A escala da atividade: funções ativas (e arquivadas ainda em uso), quem está em cada uma
    (só médiuns ativos), quem saiu, elegíveis e a anterior com escala."""
    tipo = ctx.tipo
    assert tipo is not None and ctx.atividade is not None
    linhas = await linhas_da_escala(db, tenant_id, ctx.atividade.id)
    com_funcao = [p for p in linhas.values() if p.funcao_id is not None]
    em_uso = {p.funcao_id for p in com_funcao if p.dispensado_em is None and p.substituida_por_id is None}
    funcoes = (
        await db.execute(
            select(FuncaoCorrente)
            .where(FuncaoCorrente.tenant_id == tenant_id)
            .order_by(FuncaoCorrente.ordem, func.lower(FuncaoCorrente.nome))
        )
    ).scalars().all()
    nomes_funcao = {f.id: f.nome for f in funcoes}
    funcoes = [f for f in funcoes if f.arquivado_em is None or f.id in em_uso]

    ativos_rows = (
        await db.execute(
            select(Medium)
            .where(Medium.tenant_id == tenant_id, Medium.deleted_at.is_(None), Medium.is_active.is_(True))
            .order_by(func.lower(Medium.nome))
        )
    ).scalars().all()
    ativos = {m.id: m for m in ativos_rows}
    elegiveis_ids = await elegiveis_entre(db, tenant_id, tipo, list(ativos_rows))
    nomes = await _nomes_de_mediuns(db, tenant_id, {p.medium_id for p in com_funcao})

    grupo_ids = {p.grupo_id for p in com_funcao if p.origem == ORIGEM_GRUPO and p.grupo_id}
    grupos = (
        {
            g.id: g
            for g in (
                await db.execute(
                    select(CorrenteGrupo).where(CorrenteGrupo.tenant_id == tenant_id, CorrenteGrupo.id.in_(grupo_ids))
                )
            ).scalars().all()
        }
        if grupo_ids
        else {}
    )

    por_funcao: dict[uuid.UUID, FuncaoNaEscala] = {
        f.id: FuncaoNaEscala(
            id=f.id, nome=f.nome, descricao=f.descricao, arquivada=f.arquivado_em is not None, mediuns=[], grupos=[]
        )
        for f in funcoes
    }
    grupos_por_funcao: dict[tuple[uuid.UUID, uuid.UUID], GrupoNaFuncao] = {}
    tirados: list[TiradoDaEscala] = []
    total = 0
    for p in sorted(com_funcao, key=lambda x: nomes.get(x.medium_id, "").lower()):
        if p.dispensado_em is not None or p.substituida_por_id is not None:
            tirados.append(
                TiradoDaEscala(medium_id=p.medium_id, nome=nomes.get(p.medium_id, "Médium"), funcao=nomes_funcao.get(p.funcao_id))
            )
            continue
        alvo = por_funcao.get(p.funcao_id)
        if alvo is None or p.medium_id not in ativos:
            continue  # médium que saiu da casa: some daqui e sai na próxima gravação
        pessoa = PessoaEscala(medium_id=p.medium_id, nome=nomes.get(p.medium_id, "Médium"), origem=p.origem, resposta=p.resposta)
        total += 1
        grupo = grupos.get(p.grupo_id) if p.origem == ORIGEM_GRUPO and p.grupo_id else None
        if grupo is None:
            alvo.mediuns.append(pessoa)
            continue
        chave = (p.funcao_id, grupo.id)
        if chave not in grupos_por_funcao:
            grupos_por_funcao[chave] = GrupoNaFuncao(id=grupo.id, nome=grupo.nome, cor=grupo.cor, mediuns=[])
            alvo.grupos.append(grupos_por_funcao[chave])
        grupos_por_funcao[chave].mediuns.append(pessoa)

    anterior = await anterior_com_escala(db, tenant_id, ctx)
    return EscalaResponse(
        atividade=EscalaInfo(
            atividade_id=ctx.atividade.id,
            origem=ctx.origem,
            ref_id=ctx.ref_id,
            titulo=ctx.titulo,
            inicio=ctx.inicio,
            fim=ctx.fim,
            local=ctx.local,
            tipo=TipoMini(id=tipo.id, nome=tipo.nome, icone=tipo.icone, cor=tipo.cor),
            convocacao_padrao=tipo.convocacao_padrao,
            cancelada=ctx.cancelada,
            chamada_encerrada=ctx.encerrada_em is not None,
            pode_editar=editavel(ctx),
        ),
        funcoes=list(por_funcao.values()),
        tirados=tirados,
        elegiveis=[MediumOpcao(id=m.id, nome=m.nome) for m in ativos_rows if m.id in elegiveis_ids],
        anterior=(
            AnteriorInfo(atividade_id=anterior.atividade_id, titulo=anterior.titulo, inicio=anterior.inicio)
            if anterior is not None and anterior.atividade_id is not None
            else None
        ),
        total_na_escala=total,
    )


async def _ctx_com_escala(db: AsyncSession, tenant_id: uuid.UUID, atividade_id: uuid.UUID) -> AtividadeCtx:
    ctx = await ctx_da_atividade(db, tenant_id, atividade_id)
    exigir_modo_funcoes(ctx)
    return ctx


# ── Rotas ───────────────────────────────────────────────────────────────────


@router.post(
    "/da-gira/{gira_id}/escala",
    response_model=AncoraResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "view"))],
)
async def abrir_escala_da_gira(
    gira_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AncoraResponse:
    """A âncora da gira (criada na primeira vez) para abrir a aba Escala."""
    tenant_id = current_user.tenant_id
    ctx = await ctx_da_gira(db, tenant_id, gira_id, criar_ancora=True, so_ativa=False)
    exigir_modo_funcoes(ctx)
    await db.commit()
    return AncoraResponse(atividade_id=ctx.atividade_id)


@router.get(
    "/{atividade_id}/escala",
    response_model=EscalaResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "view"))],
)
async def ver_escala(
    atividade_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EscalaResponse:
    tenant_id = current_user.tenant_id
    ctx = await _ctx_com_escala(db, tenant_id, atividade_id)
    return await _escala(db, tenant_id, ctx)


@router.put(
    "/{atividade_id}/escala",
    response_model=EscalaSalvaResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "edit"))],
)
async def salvar_escala(
    body: EscalaBody,
    atividade_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EscalaSalvaResponse:
    """Salva a escala inteira: por função, médiuns um a um e/ou grupos inteiros."""
    tenant_id = current_user.tenant_id
    ctx = await _ctx_com_escala(db, tenant_id, atividade_id)
    exigir_editavel(ctx)
    await _validar_funcoes_do_tenant(db, tenant_id, [f.funcao_id for f in body.funcoes])
    await validar_mediuns_ativos_do_tenant(db, tenant_id, [m for f in body.funcoes for m in f.medium_ids])
    await validar_grupos_ativos_do_tenant(db, tenant_id, [g for f in body.funcoes for g in f.grupo_ids])
    pedidos = [
        PedidoFuncao(f.funcao_id, tuple(dict.fromkeys(f.medium_ids)), tuple(dict.fromkeys(f.grupo_ids)))
        for f in body.funcoes
    ]
    await travar_atividade(db, tenant_id, ctx)
    plano = await _planejar(db, tenant_id, ctx, pedidos, funcoes_afetadas=None, origem_individual=ORIGEM_FUNCAO)
    await aplicar_plano(db, tenant_id, ctx.atividade.id, plano)
    await _auditar(db, current_user, ctx, "salvou", plano)
    resultado = await _resultado(db, tenant_id, plano)
    await db.commit()
    escala = await _escala(db, tenant_id, await _ctx_com_escala(db, tenant_id, atividade_id))
    return EscalaSalvaResponse(**escala.model_dump(), resultado=resultado)


@router.post(
    "/{atividade_id}/escala/copiar-anterior",
    response_model=EscalaSalvaResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "edit"))],
)
async def copiar_escala_anterior(
    atividade_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EscalaSalvaResponse:
    """Copia a última anterior do mesmo tipo com escala (substitui a escala desta).

    Médiuns um a um que ainda estão ativos e grupos não arquivados (com os membros de hoje); as
    funções arquivadas ficam de fora.
    """
    tenant_id = current_user.tenant_id
    ctx = await _ctx_com_escala(db, tenant_id, atividade_id)
    exigir_editavel(ctx)
    anterior = await anterior_com_escala(db, tenant_id, ctx)
    if anterior is None or anterior.atividade_id is None:
        raise ConflictError(MSG_SEM_ANTERIOR, details={"error_code": "SEM_ANTERIOR"})
    linhas = [
        p
        for p in (await linhas_da_escala(db, tenant_id, anterior.atividade_id)).values()
        if p.funcao_id is not None and p.dispensado_em is None and p.substituida_por_id is None
    ]
    funcoes_ativas = set(
        (
            await db.execute(
                select(FuncaoCorrente.id).where(
                    FuncaoCorrente.tenant_id == tenant_id,
                    FuncaoCorrente.id.in_({p.funcao_id for p in linhas}),
                    FuncaoCorrente.arquivado_em.is_(None),
                )
            )
        ).scalars().all()
    )
    mediuns_ativos = set(
        (
            await db.execute(
                select(Medium.id).where(
                    Medium.tenant_id == tenant_id,
                    Medium.id.in_({p.medium_id for p in linhas}),
                    Medium.deleted_at.is_(None),
                    Medium.is_active.is_(True),
                )
            )
        ).scalars().all()
    )
    grupos_ativos = set(
        (
            await db.execute(
                select(CorrenteGrupo.id).where(
                    CorrenteGrupo.tenant_id == tenant_id,
                    CorrenteGrupo.id.in_({p.grupo_id for p in linhas if p.grupo_id}),
                    CorrenteGrupo.arquivado_em.is_(None),
                )
            )
        ).scalars().all()
    )
    individuais: dict[uuid.UUID, list[uuid.UUID]] = {}
    de_grupo: dict[uuid.UUID, list[uuid.UUID]] = {}
    for p in linhas:
        if p.funcao_id not in funcoes_ativas:
            continue
        if p.origem == ORIGEM_GRUPO and p.grupo_id is not None:
            if p.grupo_id in grupos_ativos and p.grupo_id not in de_grupo.setdefault(p.funcao_id, []):
                de_grupo[p.funcao_id].append(p.grupo_id)
        elif p.medium_id in mediuns_ativos:
            individuais.setdefault(p.funcao_id, []).append(p.medium_id)
    pedidos = [
        PedidoFuncao(fid, tuple(individuais.get(fid, [])), tuple(de_grupo.get(fid, [])))
        for fid in sorted(set(individuais) | set(de_grupo), key=str)
    ]
    await travar_atividade(db, tenant_id, ctx)
    plano = await _planejar(db, tenant_id, ctx, pedidos, funcoes_afetadas=None, origem_individual=ORIGEM_FUNCAO)
    await aplicar_plano(db, tenant_id, ctx.atividade.id, plano)
    await _auditar(db, current_user, ctx, "copiou da anterior", plano, {"de": str(anterior.atividade_id)})
    resultado = await _resultado(db, tenant_id, plano)
    await db.commit()
    escala = await _escala(db, tenant_id, await _ctx_com_escala(db, tenant_id, atividade_id))
    return EscalaSalvaResponse(**escala.model_dump(), resultado=resultado)


@router.post(
    "/{atividade_id}/escala/rodizio",
    response_model=RodizioResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "edit"))],
)
async def rodizio_da_funcao(
    body: RodizioBody,
    atividade_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RodizioResponse:
    """Rodízio de uma função: esta atividade e as próximas do mesmo tipo recebem, em ordem
    circular, `por_vez` médiuns (ou grupos) da lista. Só a função do rodízio muda em cada uma;
    quem já tem outra função lá continua nela (e volta em `em_outra_funcao_nomes`)."""
    tenant_id = current_user.tenant_id
    ctx = await _ctx_com_escala(db, tenant_id, atividade_id)
    exigir_editavel(ctx)
    await _validar_funcoes_do_tenant(db, tenant_id, [body.funcao_id], so_ativas=True)
    mediuns = await validar_mediuns_ativos_do_tenant(db, tenant_id, body.medium_ids)
    grupos = await validar_grupos_ativos_do_tenant(db, tenant_id, body.grupo_ids)
    ordem: list[uuid.UUID] = list(mediuns) if mediuns else [g.id for g in grupos]
    distribuicao = rodizio(ordem, body.quantidade, body.por_vez)
    alvos = await proximas_do_tipo(db, tenant_id, ctx, body.quantidade)
    nomes_grupo = {g.id: g.nome for g in grupos}
    nomes_medium = await _nomes_de_mediuns(db, tenant_id, set(mediuns))
    feitos: list[RodizioAtividade] = []
    for alvo, escolhidos in zip(alvos, distribuicao):
        if mediuns:
            pedido = PedidoFuncao(body.funcao_id, medium_ids=tuple(escolhidos))
        else:
            pedido = PedidoFuncao(body.funcao_id, grupo_ids=tuple(escolhidos))
        await travar_atividade(db, tenant_id, alvo)
        plano = await _planejar(
            db, tenant_id, alvo, [pedido], funcoes_afetadas={body.funcao_id}, origem_individual=ORIGEM_RODIZIO
        )
        await aplicar_plano(db, tenant_id, alvo.atividade.id, plano)
        await _auditar(db, current_user, alvo, "rodízio", plano, {"funcao_id": str(body.funcao_id)})
        outros = await _resultado(db, tenant_id, plano)
        feitos.append(
            RodizioAtividade(
                atividade_id=alvo.atividade.id,
                origem=alvo.origem,
                ref_id=alvo.ref_id,
                titulo=alvo.titulo,
                inicio=alvo.inicio,
                escolhidos=[(nomes_medium if mediuns else nomes_grupo).get(x, "—") for x in escolhidos],
                em_outra_funcao_nomes=outros.em_outra_funcao_nomes,
            )
        )
    await db.commit()
    escala = await _escala(db, tenant_id, await _ctx_com_escala(db, tenant_id, atividade_id))
    return RodizioResponse(**escala.model_dump(), rodizio=feitos)
