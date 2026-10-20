"""Duplas da noite (Porta) — quem trabalha na gira e qual cambone auxilia cada médium.

Quem usa: `api/v1/admin/door_duplas.py` (gaveta "Duplas da noite" e modal "Chamar" da Porta).
Modelo e regras de banco em `models/gira_duplas.py`.

Regras:
- Médium da dupla: ativo, do terreiro e de atendimento (`is_atendimento`) — quem é só cambone
  não trabalha como médium, igual ao "Chamar".
- Cambone: qualquer ativo do terreiro; auxilia **um** médium por vez (uma dupla por gira) e não
  pode estar trabalhando como médium na mesma noite.
- Salvar substitui as duplas da gira inteira (o porteiro edita a lista e salva).
- Listas da gaveta: se a casa usa a Área do Médium e há resposta na gira (vou/não vou/presente),
  ela vai junto (`confirmacoes`); quem está escalado na função "Cambone" (AM-18) vem marcado.
  Sem nada disso, a gaveta mostra o cadastro. A justificativa de quem não vai nunca sai daqui.
- Sugestão pelo histórico: as senhas guardam `medium_nome`/`cambone_nome` em texto; nas últimas
  `HISTORICO_GIRAS` giras, o cambone que mais acompanhou cada médium (mínimo `SUGESTAO_MIN_GIRAS`
  giras juntos). Nome casado com o cadastro sem diferenciar maiúsculas nem espaços; nome que
  aparece em dois cadastros fica de fora (ambíguo).
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable, Mapping, Optional, Sequence

from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ValidationError
from ..models import Gira, GiraDupla, Medium, Ticket
from ..models.atividades import Atividade, AtividadeParticipacao, FuncaoCorrente

HISTORICO_GIRAS = 10
SUGESTAO_MIN_GIRAS = 2
MAX_DUPLAS = 200

CONFIRMOU = "vou"
NAO_VAI = "nao_vou"
PRESENTE = "presente"


@dataclass(frozen=True)
class PedidoDupla:
    medium_id: uuid.UUID
    cambone_id: Optional[uuid.UUID]


@dataclass(frozen=True)
class Sugestao:
    medium_id: uuid.UUID
    cambone_id: uuid.UUID
    juntos: int  # giras em que o cambone acompanhou o médium
    giras_do_medium: int  # giras (do histórico) em que o médium atendeu


# ── Regras puras ────────────────────────────────────────────────────────────


def normalizar_nome(nome: Optional[str]) -> str:
    return " ".join((nome or "").split()).casefold()


def validar_duplas(pedidos: Sequence[PedidoDupla], pessoas: Mapping[uuid.UUID, Medium]) -> None:
    """Confere o pedido inteiro antes de gravar. `pessoas`: médiuns ativos do terreiro."""
    if len(pedidos) > MAX_DUPLAS:
        raise ValidationError(f"No máximo {MAX_DUPLAS} duplas por gira.")

    def nome(mid: uuid.UUID) -> str:
        return pessoas[mid].nome

    for p in pedidos:
        if p.medium_id not in pessoas:
            raise ValidationError("Um dos médiuns não está ativo no cadastro. Atualize a lista e tente de novo.")
        if p.cambone_id is not None and p.cambone_id not in pessoas:
            raise ValidationError("Um dos cambones não está ativo no cadastro. Atualize a lista e tente de novo.")

    mediuns: dict[uuid.UUID, PedidoDupla] = {}
    for p in pedidos:
        if p.medium_id in mediuns:
            raise ValidationError(f"{nome(p.medium_id)} aparece duas vezes na lista.")
        if not pessoas[p.medium_id].is_atendimento:
            raise ValidationError(
                f"{nome(p.medium_id)} está cadastrado só como cambone. "
                "Para trabalhar como médium, marque “atendimento” no cadastro."
            )
        mediuns[p.medium_id] = p

    cambone_de: dict[uuid.UUID, uuid.UUID] = {}
    for p in pedidos:
        c = p.cambone_id
        if c is None:
            continue
        if c == p.medium_id:
            raise ValidationError(f"{nome(c)} não pode ser cambone de si mesmo.")
        if c in mediuns:
            raise ValidationError(f"{nome(c)} está trabalhando como médium nesta gira e não pode ser cambone.")
        if c in cambone_de:
            raise ValidationError(
                f"{nome(c)} já é cambone de {nome(cambone_de[c])}. Um cambone auxilia um médium por vez."
            )
        cambone_de[c] = p.medium_id


def sugerir_cambones(
    historico: Iterable[tuple[uuid.UUID, Optional[str], Optional[str]]],
    pessoas: Sequence[Medium],
    *,
    minimo: int = SUGESTAO_MIN_GIRAS,
) -> list[Sugestao]:
    """`historico`: (gira_id, medium_nome, cambone_nome) das senhas atendidas nas últimas giras.

    Para cada médium de atendimento, o cambone que esteve com ele em mais giras (empate: o que
    acompanhou mais senhas; depois o nome). Só sugere com `minimo` giras juntos.
    """
    por_nome: dict[str, list[Medium]] = defaultdict(list)
    for m in pessoas:
        por_nome[normalizar_nome(m.nome)].append(m)

    def unico(nome: Optional[str]) -> Optional[Medium]:
        achados = por_nome.get(normalizar_nome(nome), [])
        return achados[0] if len(achados) == 1 else None

    giras_do_medium: dict[uuid.UUID, set] = defaultdict(set)
    giras_juntos: dict[tuple[uuid.UUID, uuid.UUID], set] = defaultdict(set)
    senhas_juntos: dict[tuple[uuid.UUID, uuid.UUID], int] = defaultdict(int)
    for gira_id, medium_nome, cambone_nome in historico:
        medium = unico(medium_nome)
        if medium is None or not medium.is_atendimento:
            continue
        giras_do_medium[medium.id].add(gira_id)
        cambone = unico(cambone_nome)
        if cambone is None or cambone.id == medium.id:
            continue
        giras_juntos[(medium.id, cambone.id)].add(gira_id)
        senhas_juntos[(medium.id, cambone.id)] += 1

    nomes = {m.id: normalizar_nome(m.nome) for m in pessoas}
    melhor: dict[uuid.UUID, tuple[uuid.UUID, int, int]] = {}
    for (mid, cid), giras in giras_juntos.items():
        chave = (len(giras), senhas_juntos[(mid, cid)])
        atual = melhor.get(mid)
        if (
            atual is None
            or chave > (atual[1], atual[2])
            or (chave == (atual[1], atual[2]) and nomes[cid] < nomes[atual[0]])
        ):
            melhor[mid] = (cid, len(giras), senhas_juntos[(mid, cid)])

    return sorted(
        (
            Sugestao(medium_id=mid, cambone_id=cid, juntos=juntos, giras_do_medium=len(giras_do_medium[mid]))
            for mid, (cid, juntos, _) in melhor.items()
            if juntos >= minimo
        ),
        key=lambda s: nomes[s.medium_id],
    )


def situacao_na_area(p: AtividadeParticipacao) -> Optional[str]:
    """O que a gaveta mostra da participação: presente > vou > não vou; nada além disso."""
    if p.dispensado_em is not None:
        return None
    if p.presenca == PRESENTE:
        return PRESENTE
    if p.resposta == CONFIRMOU:
        return CONFIRMOU
    if p.resposta == NAO_VAI:
        return NAO_VAI
    return None


def eh_funcao_cambone(nome: Optional[str]) -> bool:
    return normalizar_nome(nome).startswith("cambone")


# ── Banco ───────────────────────────────────────────────────────────────────


async def gira_do_tenant(db: AsyncSession, tenant_id: uuid.UUID, gira_id: uuid.UUID) -> Optional[Gira]:
    stmt = select(Gira).where(Gira.id == gira_id, Gira.tenant_id == tenant_id, Gira.deleted_at.is_(None))
    return (await db.execute(stmt)).scalar_one_or_none()


async def pessoas_ativas(db: AsyncSession, tenant_id: uuid.UUID) -> list[Medium]:
    stmt = (
        select(Medium)
        .where(Medium.tenant_id == tenant_id, Medium.deleted_at.is_(None), Medium.is_active.is_(True))
        .order_by(Medium.nome)
    )
    return list((await db.execute(stmt)).scalars().all())


async def duplas_da_gira(db: AsyncSession, tenant_id: uuid.UUID, gira_id: uuid.UUID) -> list[GiraDupla]:
    stmt = (
        select(GiraDupla)
        .where(GiraDupla.tenant_id == tenant_id, GiraDupla.gira_id == gira_id)
        .order_by(GiraDupla.ordem, GiraDupla.created_at)
    )
    return list((await db.execute(stmt)).scalars().all())


async def salvar_duplas(
    db: AsyncSession, tenant_id: uuid.UUID, gira: Gira, pedidos: Sequence[PedidoDupla]
) -> list[GiraDupla]:
    """Substitui as duplas da gira (valida antes; quem chama faz o commit)."""
    pessoas = {m.id: m for m in await pessoas_ativas(db, tenant_id)}
    validar_duplas(pedidos, pessoas)
    await db.execute(
        delete(GiraDupla).where(GiraDupla.tenant_id == tenant_id, GiraDupla.gira_id == gira.id)
    )
    # O DELETE precisa chegar ao banco antes dos INSERTs: os índices únicos são por gira.
    await db.flush()
    novas = [
        GiraDupla(tenant_id=tenant_id, gira_id=gira.id, medium_id=p.medium_id, cambone_id=p.cambone_id, ordem=i)
        for i, p in enumerate(pedidos)
    ]
    db.add_all(novas)
    await db.flush()
    return novas


async def situacoes_da_area(
    db: AsyncSession, tenant_id: uuid.UUID, gira_id: uuid.UUID
) -> tuple[dict[uuid.UUID, str], set[uuid.UUID]]:
    """Confirmações da Área para a gira (sem criar a âncora) e quem está escalado como Cambone."""
    ancora = (
        await db.execute(
            select(Atividade.id).where(
                Atividade.tenant_id == tenant_id,
                Atividade.gira_id == gira_id,
                Atividade.deleted_at.is_(None),
                Atividade.cancelada_em.is_(None),
            )
        )
    ).scalar_one_or_none()
    if ancora is None:
        return {}, set()
    rows = (
        await db.execute(
            select(AtividadeParticipacao, FuncaoCorrente.nome)
            .outerjoin(
                FuncaoCorrente,
                and_(
                    FuncaoCorrente.id == AtividadeParticipacao.funcao_id,
                    FuncaoCorrente.tenant_id == tenant_id,
                ),
            )
            .where(AtividadeParticipacao.tenant_id == tenant_id, AtividadeParticipacao.atividade_id == ancora)
        )
    ).all()
    situacoes: dict[uuid.UUID, str] = {}
    cambones: set[uuid.UUID] = set()
    for p, funcao_nome in rows:
        s = situacao_na_area(p)
        if s is not None:
            situacoes[p.medium_id] = s
        if p.dispensado_em is None and eh_funcao_cambone(funcao_nome):
            cambones.add(p.medium_id)
    return situacoes, cambones


async def _giras_anteriores(db: AsyncSession, tenant_id: uuid.UUID, gira: Gira, limite: int) -> list[uuid.UUID]:
    stmt = (
        select(Gira.id)
        .where(
            Gira.tenant_id == tenant_id,
            Gira.deleted_at.is_(None),
            Gira.id != gira.id,
            Gira.data_inicio < gira.data_inicio,
        )
        .order_by(Gira.data_inicio.desc())
        .limit(limite)
    )
    return list((await db.execute(stmt)).scalars().all())


async def historico_de_atendimentos(
    db: AsyncSession, tenant_id: uuid.UUID, gira: Gira
) -> list[tuple[uuid.UUID, Optional[str], Optional[str]]]:
    giras = await _giras_anteriores(db, tenant_id, gira, HISTORICO_GIRAS)
    if not giras:
        return []
    stmt = select(Ticket.gira_id, Ticket.medium_nome, Ticket.cambone_nome).where(
        Ticket.tenant_id == tenant_id,
        Ticket.gira_id.in_(giras),
        Ticket.medium_nome.isnot(None),
    )
    return [tuple(r) for r in (await db.execute(stmt)).all()]


async def duplas_anteriores(
    db: AsyncSession, tenant_id: uuid.UUID, gira: Gira
) -> tuple[Optional[Gira], list[GiraDupla]]:
    """As duplas da gira mais recente antes desta que teve duplas (para "Copiar da última gira")."""
    stmt = (
        select(Gira)
        .where(
            Gira.tenant_id == tenant_id,
            Gira.deleted_at.is_(None),
            Gira.id != gira.id,
            Gira.data_inicio < gira.data_inicio,
            select(func.count(GiraDupla.id))
            .where(GiraDupla.tenant_id == tenant_id, GiraDupla.gira_id == Gira.id)
            .scalar_subquery()
            > 0,
        )
        .order_by(Gira.data_inicio.desc())
        .limit(1)
    )
    anterior = (await db.execute(stmt)).scalar_one_or_none()
    if anterior is None:
        return None, []
    return anterior, await duplas_da_gira(db, tenant_id, anterior.id)
