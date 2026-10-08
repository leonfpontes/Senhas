"""Escala por função (AM-18) — quem trabalha em cada gira e em que função.

Quem usa: `api/v1/admin/atividades_escala.py` (aba "Escala" da gira e das atividades de tipo com
`modo_escala = 'funcoes'`). A Área do Médium lê a função pela participação (`services/presenca.
minha_participacao`, "Você é Cambone na gira de sábado").

Regras (§8.8 do plano da Área do Médium):

- A escala grava `funcao_id` na PRÓPRIA participação (`atividade_participacoes`, a mesma linha da
  presença): um médium tem no máximo uma função por atividade (único `atividade_id` + `medium_id`).
- Por função, médiuns um a um (`origem = 'funcao'`; `'rodizio'` quando veio do rodízio) ou um
  grupo da corrente inteiro (`origem = 'grupo'` + `grupo_id`: os membros ATIVOS que o tipo alcança,
  com a função como padrão). Pedido um a um ganha do grupo; membro de dois grupos em funções
  diferentes fica na primeira (e volta no resultado).
- Salvar a escala substitui as funções pedidas; trocar de função só muda a linha; quem volta perde
  o `dispensado_em`. Quem tinha função e saiu: em tipo "só escalados" fica com `dispensado_em` (a
  linha e a função ficam, para o histórico); em tipo "todos os elegíveis" (gira) e alcançado pelo
  tipo, só perde a função — continua esperado, como qualquer médium da corrente
  (`PlanoEscala.so_sem_funcao`). Médiuns sem função continuam convocados pelo tipo.
- **Rodízio** (`rodizio`, herdado do F-07): para uma função, distribui em ordem circular entre
  médiuns ou grupos pelas próximas N atividades do mesmo tipo — função pura.
- **Copiar da anterior**: a última atividade do mesmo tipo (gira: a última gira) com escala.
- Avisos (AM-15): `PlanoEscala.novos/trocados/tirados` é o gancho — aqui nada é enviado.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import AbstractSet, Mapping, Optional, Sequence, TypeVar

from sqlalchemy import and_, exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ConflictError, ValidationError
from ..core.tz import utc_now
from ..models.atividades import Atividade, AtividadeParticipacao
from ..models.giras import Gira
from .atividades import atividade_da_gira
from .presenca import AtividadeCtx, ctx_de, upsert_participacao

T = TypeVar("T")

MODO_FUNCOES = "funcoes"
ORIGEM_FUNCAO = "funcao"
ORIGEM_GRUPO = "grupo"
ORIGEM_RODIZIO = "rodizio"
ORIGEM_ELEGIVEL = "elegivel"

RODIZIO_MAX_ATIVIDADES = 12
RODIZIO_MAX_POR_VEZ = 20

MSG_SEM_ESCALA = "Este tipo de atividade não tem escala por função. Mude em “Tipos e funções”."
MSG_CANCELADA = "Esta atividade foi cancelada."
MSG_ENCERRADA = "A chamada desta atividade já foi encerrada."
MSG_FUNCAO_REPETIDA = "Cada função aparece uma vez na escala."
MSG_DUAS_FUNCOES = "Um médium tem uma função por vez. Tire-o de uma das funções."
MSG_SEM_ANTERIOR = "Não achamos uma anterior com escala para copiar."


# ── Regras puras ────────────────────────────────────────────────────────────


def rodizio(ordem: Sequence[T], quantidade: int, por_vez: int = 1, comeca_em: int = 0) -> list[list[T]]:
    """Distribui `ordem` em ciclo por `quantidade` atividades, `por_vez` itens em cada uma.

    A atividade i recebe os itens a partir da posição `comeca_em + i * por_vez` (dando a volta no
    fim da lista). Repetidos em `ordem` contam uma vez; `por_vez` maior que a lista vira a lista
    inteira (ninguém repete na mesma atividade). Lista vazia ou quantidade < 1 → erro.
    """
    itens = list(dict.fromkeys(ordem))
    if not itens:
        raise ValidationError("Escolha quem entra no rodízio.")
    if quantidade < 1:
        raise ValidationError("Escolha para quantas atividades é o rodízio.")
    if por_vez < 1:
        raise ValidationError("Escolha quantos por vez.")
    n = len(itens)
    k = min(por_vez, n)
    return [[itens[(comeca_em + i * por_vez + j) % n] for j in range(k)] for i in range(quantidade)]


@dataclass(frozen=True)
class PedidoFuncao:
    """O que a escala pede para uma função: médiuns um a um e/ou grupos inteiros (em ordem)."""

    funcao_id: uuid.UUID
    medium_ids: tuple[uuid.UUID, ...] = ()
    grupo_ids: tuple[uuid.UUID, ...] = ()


@dataclass(frozen=True)
class LinhaAtual:
    """A participação de hoje do médium, do ponto de vista da escala."""

    funcao_id: Optional[uuid.UUID]
    # Só quando a função veio de um grupo inteiro (origem "grupo").
    grupo_id: Optional[uuid.UUID]
    ativa: bool  # sem dispensa nem troca


@dataclass(frozen=True)
class Atribuicao:
    funcao_id: uuid.UUID
    grupo_id: Optional[uuid.UUID]
    origem: str


@dataclass
class PlanoEscala:
    """Resultado de `planejar_escala`. `novos`/`trocados`/`tirados` são o gancho dos avisos (AM-15)."""

    atribuir: dict[uuid.UUID, Atribuicao] = field(default_factory=dict)
    tirados: list[uuid.UUID] = field(default_factory=list)
    novos: list[uuid.UUID] = field(default_factory=list)
    trocados: list[uuid.UUID] = field(default_factory=list)
    mantidos: list[uuid.UUID] = field(default_factory=list)
    fora_da_elegibilidade: list[uuid.UUID] = field(default_factory=list)
    # Membro de dois grupos pedidos em funções diferentes: ficou na primeira.
    repetidos: list[uuid.UUID] = field(default_factory=list)
    # Rodízio: já tinha outra função nesta atividade (fora da que o rodízio mexe) e ficou nela.
    em_outra_funcao: list[uuid.UUID] = field(default_factory=list)
    # Tirados que o tipo convoca mesmo sem função ("todos os elegíveis"): perdem só a função.
    so_sem_funcao: set[uuid.UUID] = field(default_factory=set)


def planejar_escala(
    pedidos: Sequence[PedidoFuncao],
    *,
    membros: Mapping[uuid.UUID, Sequence[uuid.UUID]],
    elegiveis: AbstractSet[uuid.UUID],
    atuais: Mapping[uuid.UUID, LinhaAtual],
    funcoes_afetadas: Optional[AbstractSet[uuid.UUID]] = None,
    origem_individual: str = ORIGEM_FUNCAO,
) -> PlanoEscala:
    """Regra pura da escala por função (uma atividade).

    `membros` = {grupo_id: médiuns ATIVOS do grupo}; `elegiveis` = quais desses membros o tipo
    alcança (pedido um a um não passa por isso — a casa escolheu a pessoa); `atuais` = linhas de
    hoje. `funcoes_afetadas` None = a escala inteira é substituída (salvar, copiar); um conjunto =
    só essas funções mudam (rodízio), e quem tem outra função continua nela.
    """
    vistas: set[uuid.UUID] = set()
    for p in pedidos:
        if p.funcao_id in vistas:
            raise ValidationError(MSG_FUNCAO_REPETIDA)
        vistas.add(p.funcao_id)
    explicitos: dict[uuid.UUID, uuid.UUID] = {}
    for p in pedidos:
        for mid in p.medium_ids:
            if explicitos.setdefault(mid, p.funcao_id) != p.funcao_id:
                raise ValidationError(MSG_DUAS_FUNCOES, details={"medium_id": str(mid)})

    afetadas = set(funcoes_afetadas) if funcoes_afetadas is not None else None

    def em_outra(mid: uuid.UUID) -> bool:
        a = atuais.get(mid)
        return bool(
            afetadas is not None and a is not None and a.ativa and a.funcao_id and a.funcao_id not in afetadas
        )

    plano = PlanoEscala()

    def anotar(lista: list[uuid.UUID], mid: uuid.UUID) -> None:
        if mid not in lista:
            lista.append(mid)

    for mid, funcao_id in explicitos.items():
        if em_outra(mid):
            anotar(plano.em_outra_funcao, mid)
            continue
        plano.atribuir[mid] = Atribuicao(funcao_id, None, origem_individual)
    for p in pedidos:
        for gid in dict.fromkeys(p.grupo_ids):
            for mid in membros.get(gid, ()):
                if mid in explicitos:
                    continue
                ja = plano.atribuir.get(mid)
                if ja is not None:
                    if ja.funcao_id != p.funcao_id:
                        anotar(plano.repetidos, mid)
                    continue
                if mid not in elegiveis:
                    anotar(plano.fora_da_elegibilidade, mid)
                    continue
                if em_outra(mid):
                    anotar(plano.em_outra_funcao, mid)
                    continue
                plano.atribuir[mid] = Atribuicao(p.funcao_id, gid, ORIGEM_GRUPO)

    for mid, a in atuais.items():
        if (
            a.ativa
            and a.funcao_id is not None
            and (afetadas is None or a.funcao_id in afetadas)
            and mid not in plano.atribuir
        ):
            plano.tirados.append(mid)
    for mid, at in plano.atribuir.items():
        a = atuais.get(mid)
        if a is None or not a.ativa or a.funcao_id is None:
            plano.novos.append(mid)
        elif a.funcao_id != at.funcao_id:
            plano.trocados.append(mid)
        else:
            plano.mantidos.append(mid)
    return plano


def linha_atual(p: AtividadeParticipacao) -> LinhaAtual:
    return LinhaAtual(
        funcao_id=p.funcao_id,
        grupo_id=p.grupo_id if p.origem == ORIGEM_GRUPO else None,
        ativa=p.dispensado_em is None and p.substituida_por_id is None,
    )


# ── Guardas ─────────────────────────────────────────────────────────────────


def exigir_modo_funcoes(ctx: AtividadeCtx) -> None:
    if ctx.tipo is None or ctx.tipo.modo_escala != MODO_FUNCOES:
        raise ConflictError(MSG_SEM_ESCALA, details={"error_code": "SEM_ESCALA_POR_FUNCAO"})


def exigir_editavel(ctx: AtividadeCtx) -> None:
    if ctx.cancelada:
        raise ConflictError(MSG_CANCELADA)
    if ctx.encerrada_em is not None:
        raise ConflictError(MSG_ENCERRADA)


def editavel(ctx: AtividadeCtx) -> bool:
    return not ctx.cancelada and ctx.encerrada_em is None


# ── Gravação ────────────────────────────────────────────────────────────────


async def aplicar_plano(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    atividade_id: uuid.UUID,
    plano: PlanoEscala,
    *,
    agora: Optional[datetime] = None,
) -> None:
    """Grava o plano nas participações (sem commit). Quem chama conferiu atividade, médiuns,
    grupos e funções no terreiro. Cada linha é travada (`upsert_participacao`, FOR UPDATE)."""
    agora = agora or utc_now()
    for medium_id, at in plano.atribuir.items():
        p = await upsert_participacao(
            db, tenant_id, atividade_id, medium_id, origem=at.origem, convocado=True, grupo_id=at.grupo_id
        )
        mesma = (
            p.funcao_id == at.funcao_id
            and p.dispensado_em is None
            and p.substituida_por_id is None
            and (p.grupo_id if p.origem == ORIGEM_GRUPO else None) == at.grupo_id
        )
        if not mesma:
            p.funcao_id = at.funcao_id
            p.origem = at.origem
            if at.grupo_id is not None:
                p.grupo_id = at.grupo_id
            p.dispensado_em = None
        p.convocado = True
        p.updated_at = agora
    for medium_id in plano.tirados:
        p = await upsert_participacao(
            db, tenant_id, atividade_id, medium_id, origem=ORIGEM_FUNCAO, convocado=True
        )
        if medium_id in plano.so_sem_funcao:
            # Gira "todos os elegíveis": sai da função e continua esperado, como os demais.
            p.funcao_id = None
            p.origem = ORIGEM_ELEGIVEL
            p.grupo_id = None
        else:
            # A função fica gravada (histórico de quem estava escalado e saiu).
            p.dispensado_em = p.dispensado_em or agora
        p.updated_at = agora
    # TODO(AM-15): avisar `plano.novos` ("Você é Cambone na gira de sábado"), `plano.trocados`
    # e `plano.tirados` — este card não envia nada.


async def linhas_da_escala(
    db: AsyncSession, tenant_id: uuid.UUID, atividade_id: Optional[uuid.UUID]
) -> dict[uuid.UUID, AtividadeParticipacao]:
    if atividade_id is None:
        return {}
    rows = await db.execute(
        select(AtividadeParticipacao).where(
            AtividadeParticipacao.tenant_id == tenant_id, AtividadeParticipacao.atividade_id == atividade_id
        )
    )
    return {p.medium_id: p for p in rows.scalars().all()}


async def travar_atividade(db: AsyncSession, tenant_id: uuid.UUID, ctx: AtividadeCtx) -> None:
    """Serializa duas gravações da escala da mesma atividade (FOR UPDATE até o commit)."""
    assert ctx.atividade is not None
    await db.execute(
        select(Atividade.id)
        .where(Atividade.id == ctx.atividade.id, Atividade.tenant_id == tenant_id)
        .with_for_update()
    )


# ── Anterior e próximas do mesmo tipo ───────────────────────────────────────


def _tem_escala(tenant_id: uuid.UUID):
    return exists(
        select(AtividadeParticipacao.id).where(
            AtividadeParticipacao.tenant_id == tenant_id,
            AtividadeParticipacao.atividade_id == Atividade.id,
            AtividadeParticipacao.funcao_id.is_not(None),
            AtividadeParticipacao.dispensado_em.is_(None),
        )
    )


async def anterior_com_escala(db: AsyncSession, tenant_id: uuid.UUID, ctx: AtividadeCtx) -> Optional[AtividadeCtx]:
    """A última atividade do mesmo tipo antes desta que tem escala (gira: a última gira)."""
    if ctx.origem == "gira":
        row = (
            await db.execute(
                select(Atividade, Gira)
                .join(Gira, and_(Gira.id == Atividade.gira_id, Gira.tenant_id == tenant_id))
                .where(
                    Atividade.tenant_id == tenant_id,
                    Atividade.deleted_at.is_(None),
                    Gira.deleted_at.is_(None),
                    Gira.data_inicio < ctx.inicio,
                    _tem_escala(tenant_id),
                )
                .order_by(Gira.data_inicio.desc())
                .limit(1)
            )
        ).first()
        return ctx_de(row[0], ctx.tipo, row[1]) if row else None
    row = (
        await db.execute(
            select(Atividade)
            .where(
                Atividade.tenant_id == tenant_id,
                Atividade.tipo_id == ctx.tipo.id,
                Atividade.gira_id.is_(None),
                Atividade.deleted_at.is_(None),
                Atividade.inicio < ctx.inicio,
                _tem_escala(tenant_id),
            )
            .order_by(Atividade.inicio.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return ctx_de(row, ctx.tipo, None) if row else None


async def proximas_do_tipo(
    db: AsyncSession, tenant_id: uuid.UUID, ctx: AtividadeCtx, quantidade: int
) -> list[AtividadeCtx]:
    """Esta atividade e as seguintes do mesmo tipo (ativas, não excluídas), até `quantidade`.

    Gira: as próximas giras ativas, com a âncora criada aqui (`atividade_da_gira`, sem commit).
    Atividade: as próximas do mesmo tipo, não canceladas. Chamada já encerrada fica de fora.
    """
    assert ctx.atividade is not None and ctx.tipo is not None
    out = [ctx]
    if quantidade <= 1:
        return out
    if ctx.origem == "gira":
        giras = (
            await db.execute(
                select(Gira)
                .where(
                    Gira.tenant_id == tenant_id,
                    Gira.deleted_at.is_(None),
                    Gira.is_active.is_(True),
                    Gira.data_inicio >= ctx.inicio,
                    Gira.id != ctx.ref_id,
                )
                .order_by(Gira.data_inicio.asc(), Gira.id.asc())
                .limit(quantidade * 2)
            )
        ).scalars().all()
        for gira in giras:
            if len(out) >= quantidade:
                break
            ancora = await atividade_da_gira(db, tenant_id, gira.id)
            if ancora.deleted_at is not None or ancora.chamada_encerrada_em is not None:
                continue
            out.append(ctx_de(ancora, ctx.tipo, gira))
        return out
    atividades = (
        await db.execute(
            select(Atividade)
            .where(
                Atividade.tenant_id == tenant_id,
                Atividade.tipo_id == ctx.tipo.id,
                Atividade.gira_id.is_(None),
                Atividade.deleted_at.is_(None),
                Atividade.cancelada_em.is_(None),
                Atividade.chamada_encerrada_em.is_(None),
                Atividade.inicio >= ctx.inicio,
                Atividade.id != ctx.atividade.id,
            )
            .order_by(Atividade.inicio.asc(), Atividade.id.asc())
            .limit(quantidade - 1)
        )
    ).scalars().all()
    out += [ctx_de(a, ctx.tipo, None) for a in atividades]
    return out

