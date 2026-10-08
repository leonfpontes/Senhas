"""Relatório de assiduidade (AM-26) — quem vem, quem falta e por quê, por médium e por grupo.

Quem usa: `api/v1/admin/atividades_assiduidade.py` (painel, aba "Relatórios" de Atividades e
escalas). Substitui o relatório do F-06.

Regra (§8.5 e §8.10 do plano da Área do Médium, a MESMA do "Minhas presenças" da Área):

- **Percentual = presentes ÷ convocações** de atividades com a **chamada encerrada**, sem
  dispensados, substituídos e atividades canceladas.
- Cada linha de `atividade_participacoes` cai numa **categoria** (`categoria`):
  - `dispensado`: tirado da escala, substituído ou atividade (ou gira) cancelada — fora da conta;
  - `avulso`: veio sem estar na escala (`convocado = false`, "Adicionar quem veio") — informativo,
    não é convocação nem entra no percentual;
  - `futura`: convocação de atividade que ainda não começou — fora da conta;
  - `sem_chamada`: convocação de atividade que já começou e não teve a chamada encerrada — não
    entra no percentual (mostrada à parte);
  - com chamada encerrada: `presente` (inclusive o "vou" do modo confiança, gravado como presente
    no encerramento ou, se a presença foi limpa depois, o "vou" com a atividade terminada),
    `ausente_justificado` (ausente com motivo, dado antes ou depois) ou `ausente`.
  Convocações = presentes + ausências com e sem justificativa.
- Só tipos que controlam presença; atividade ou gira excluída não aparece. A convocação virtual
  dos "todos os elegíveis" vira linha quando a chamada é encerrada (`encerrar_chamada`), então
  toda atividade com chamada encerrada tem o denominador completo.
- **Por grupo** (plano Pro, `escalas`): soma das linhas dos membros ATUAIS do grupo (quem está em
  dois grupos conta nos dois).

Consultas: um `GROUP BY` sobre os fatos de cada linha (convocado, cancelada, dispensado, chamada
encerrada, começou, presença, resposta, tem motivo, confiança terminada) — volta poucas linhas por
médium/grupo, e a categoria sai de `categoria` (uma regra só, testada sem banco). Usa os índices
(`tenant_id`, `medium_id`) e (`tenant_id`, `atividade_id`) de `atividade_participacoes`.

Justificativa (§6.8, pode ter dado de saúde): o agregado só diz SE há motivo. O texto só sai no
detalhe por médium (`detalhe_do_medium`), na tela de quem tem `ESCALAS:view` — nunca no PDF, CSV,
e-mail ou auditoria.
"""
from __future__ import annotations

import calendar
import uuid
from dataclasses import asdict, dataclass
from datetime import date, datetime
from typing import Iterable, Optional

from sqlalchemy import and_, case, exists, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.tz import local_day_bounds_utc
from ..models.atividades import Atividade, AtividadeParticipacao, AtividadeTipo
from ..models.corrente_grupos import CorrenteGrupo, CorrenteGrupoMembro
from ..models.giras import Gira
from ..models.mediuns import Medium
from .medium_agenda import PeriodoInvalido
from .presenca import (
    MODO_CONFIANCA,
    PRESENCA_NAO_REGISTRADA,
    PRESENCA_PRESENTE,
    RESPOSTA_SEM,
    SITUACAO_PRESENTE,
    config_presenca,
    ctx_de,
    situacao,
)

# Período: no máximo um ano por consulta (o atalho "Ano" cabe).
DIAS_MAXIMO = 366

CAT_PRESENTE = "presente"
CAT_AUSENTE_JUSTIFICADO = "ausente_justificado"
CAT_AUSENTE = "ausente"
CAT_SEM_CHAMADA = "sem_chamada"
CAT_DISPENSADO = "dispensado"
CAT_AVULSO = "avulso"
CAT_FUTURA = "futura"
CAT_IGNORADA = "ignorada"  # sem convocação e sem presença (avulso desfeito): não aparece
CATEGORIAS = (
    CAT_PRESENTE,
    CAT_AUSENTE_JUSTIFICADO,
    CAT_AUSENTE,
    CAT_SEM_CHAMADA,
    CAT_DISPENSADO,
    CAT_AVULSO,
    CAT_FUTURA,
)
# Entram no percentual (o denominador).
CATEGORIAS_DA_CONTA = (CAT_PRESENTE, CAT_AUSENTE_JUSTIFICADO, CAT_AUSENTE)

AGRUPAR_MEDIUM = "medium"
AGRUPAR_GRUPO = "grupo"


# ── Regras puras ────────────────────────────────────────────────────────────


def periodo_do_relatorio(hoje: date, inicio: Optional[date], fim: Optional[date]) -> tuple[date, date]:
    """(início, fim) inclusivos, em dias de Brasília. Padrão: o mês de `hoje` (ou o mês do início).

    Fim antes do início ou mais de um ano → `PeriodoInvalido`.
    """
    ini = inicio or hoje.replace(day=1)
    fim_ = fim or ini.replace(day=calendar.monthrange(ini.year, ini.month)[1])
    if fim_ < ini:
        raise PeriodoInvalido("A data final precisa ser depois da inicial.")
    if (fim_ - ini).days > DIAS_MAXIMO:
        raise PeriodoInvalido("Escolha um período de até um ano.")
    return ini, fim_


def categoria(
    *,
    convocado: bool,
    cancelada: bool,
    dispensado: bool,
    encerrada: bool,
    iniciou: bool,
    presenca: str = PRESENCA_NAO_REGISTRADA,
    resposta: str = RESPOSTA_SEM,
    tem_justificativa: bool = False,
    confianca_terminou: bool = False,
) -> str:
    """Em que conta uma linha de participação entra (ver o docstring do módulo)."""
    if cancelada or dispensado:
        return CAT_DISPENSADO
    if not convocado:
        return CAT_AVULSO if presenca == PRESENCA_PRESENTE else CAT_IGNORADA
    if not encerrada:
        return CAT_SEM_CHAMADA if iniciou else CAT_FUTURA
    sit = situacao(
        convocado=True,
        resposta=resposta,
        presenca=presenca,
        justificativa="sim" if tem_justificativa else None,
        confianca_terminou=confianca_terminou,
    )
    if sit == SITUACAO_PRESENTE:
        return CAT_PRESENTE
    # Chamada encerrada e não presente = ausência (o encerramento já marca; aqui vale também para
    # a presença limpa depois, numa correção).
    return CAT_AUSENTE_JUSTIFICADO if tem_justificativa else CAT_AUSENTE


@dataclass
class Contagem:
    convocacoes: int = 0
    presencas: int = 0
    ausencias_justificadas: int = 0
    ausencias_sem_justificativa: int = 0
    sem_chamada: int = 0
    dispensados: int = 0
    avulsos: int = 0

    def somar(self, cat: str, n: int = 1) -> None:
        if cat == CAT_PRESENTE:
            self.presencas += n
        elif cat == CAT_AUSENTE_JUSTIFICADO:
            self.ausencias_justificadas += n
        elif cat == CAT_AUSENTE:
            self.ausencias_sem_justificativa += n
        elif cat == CAT_SEM_CHAMADA:
            self.sem_chamada += n
        elif cat == CAT_DISPENSADO:
            self.dispensados += n
        elif cat == CAT_AVULSO:
            self.avulsos += n
        if cat in CATEGORIAS_DA_CONTA:
            self.convocacoes += n

    def juntar(self, outra: "Contagem") -> None:
        for chave, valor in asdict(outra).items():
            setattr(self, chave, getattr(self, chave) + valor)

    @property
    def percentual(self) -> Optional[int]:
        """Presentes ÷ convocações com chamada encerrada (arredondado); None sem convocação."""
        if self.convocacoes <= 0:
            return None
        return round(self.presencas * 100 / self.convocacoes)

    @property
    def vazia(self) -> bool:
        return not any(asdict(self).values())

    def como_dict(self) -> dict:
        return {**asdict(self), "percentual": self.percentual}


# ── Consultas ───────────────────────────────────────────────────────────────


@dataclass
class Filtros:
    tenant_id: uuid.UUID
    de: datetime  # UTC, inclusivo
    ate: datetime  # UTC, exclusivo
    agora: datetime
    modo_casa: str
    tipo_id: Optional[uuid.UUID] = None
    # Só os membros (atuais) destes grupos; None = sem filtro de grupo.
    grupo_ids: Optional[list[uuid.UUID]] = None
    medium_id: Optional[uuid.UUID] = None


async def filtros(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    ini: date,
    fim: date,
    agora: datetime,
    *,
    tipo_id: Optional[uuid.UUID] = None,
    grupo_ids: Optional[list[uuid.UUID]] = None,
    medium_id: Optional[uuid.UUID] = None,
) -> Filtros:
    de, ate = local_day_bounds_utc(ini, fim)
    modo_casa, _ = await config_presenca(db, tenant_id)
    return Filtros(tenant_id, de, ate, agora, modo_casa, tipo_id, grupo_ids, medium_id)


def _inicio_efetivo():
    # Âncora de gira: horário da gira; atividade interna: o da atividade.
    return func.coalesce(Gira.data_inicio, Atividade.inicio)


def _fim_efetivo():
    """O mesmo de `presenca.fim_efetivo`: fim informado; senão início + duração do tipo (só
    atividade interna); senão início + 3 h."""
    tres_horas = func.make_interval(0, 0, 0, 0, 3)
    return case(
        (Gira.id.is_not(None), func.coalesce(Gira.data_fim, Gira.data_inicio + tres_horas)),
        else_=func.coalesce(
            Atividade.fim,
            Atividade.inicio + func.make_interval(0, 0, 0, 0, 0, func.coalesce(AtividadeTipo.duracao_min, 180)),
        ),
    )


def _base(f: Filtros, *colunas):
    """SELECT das participações do terreiro no período, com atividade, tipo e gira (âncora)."""
    tenant_id = f.tenant_id
    inicio = _inicio_efetivo()
    stmt = (
        select(*colunas)
        .select_from(AtividadeParticipacao)
        .join(
            Atividade,
            and_(Atividade.id == AtividadeParticipacao.atividade_id, Atividade.tenant_id == tenant_id),
        )
        .join(AtividadeTipo, and_(AtividadeTipo.id == Atividade.tipo_id, AtividadeTipo.tenant_id == tenant_id))
        .outerjoin(Gira, and_(Gira.id == Atividade.gira_id, Gira.tenant_id == tenant_id))
        .join(Medium, and_(Medium.id == AtividadeParticipacao.medium_id, Medium.tenant_id == tenant_id))
        .where(
            AtividadeParticipacao.tenant_id == tenant_id,
            Atividade.deleted_at.is_(None),
            or_(Atividade.gira_id.is_(None), and_(Gira.id.is_not(None), Gira.deleted_at.is_(None))),
            AtividadeTipo.controla_presenca.is_(True),
            Medium.deleted_at.is_(None),
            inicio >= f.de,
            inicio < f.ate,
        )
    )
    if f.tipo_id is not None:
        stmt = stmt.where(Atividade.tipo_id == f.tipo_id)
    if f.medium_id is not None:
        stmt = stmt.where(AtividadeParticipacao.medium_id == f.medium_id)
    return stmt


def _fatos(f: Filtros):
    """Colunas booleanas/enums de cada linha que decidem a categoria."""
    cancelada = or_(Atividade.cancelada_em.is_not(None), and_(Gira.id.is_not(None), Gira.is_active.is_(False)))
    dispensado = or_(
        AtividadeParticipacao.dispensado_em.is_not(None), AtividadeParticipacao.substituida_por_id.is_not(None)
    )
    modo = func.coalesce(AtividadeTipo.presenca_modo, literal(f.modo_casa))
    return [
        AtividadeParticipacao.convocado.label("convocado"),
        cancelada.label("cancelada"),
        dispensado.label("dispensado"),
        Atividade.chamada_encerrada_em.is_not(None).label("encerrada"),
        (_inicio_efetivo() <= f.agora).label("iniciou"),
        AtividadeParticipacao.presenca.label("presenca"),
        AtividadeParticipacao.resposta.label("resposta"),
        (func.length(func.trim(func.coalesce(AtividadeParticipacao.justificativa, ""))) > 0).label("tem_justificativa"),
        and_(modo == MODO_CONFIANCA, _fim_efetivo() < f.agora).label("confianca_terminou"),
    ]


_FATOS = (
    "convocado",
    "cancelada",
    "dispensado",
    "encerrada",
    "iniciou",
    "presenca",
    "resposta",
    "tem_justificativa",
    "confianca_terminou",
)


def _categoria_da_linha(row) -> str:
    return categoria(**{k: (getattr(row, k) if k in ("presenca", "resposta") else bool(getattr(row, k))) for k in _FATOS})


async def _contagens(db: AsyncSession, stmt_fatos, chave: str) -> dict[uuid.UUID, Contagem]:
    """Agrupa os fatos por `chave` (+ cada fato) num subselect — o GROUP BY sai por colunas do
    subselect (sem repetir parâmetros) — e soma as categorias por chave."""
    sub = stmt_fatos.subquery()
    colunas = [sub.c[chave], *(sub.c[k] for k in _FATOS)]
    rows = (await db.execute(select(*colunas, func.count().label("n")).group_by(*colunas))).all()
    out: dict[uuid.UUID, Contagem] = {}
    for row in rows:
        out.setdefault(getattr(row, chave), Contagem()).somar(_categoria_da_linha(row), int(row.n))
    return out


async def contagens_por_medium(db: AsyncSession, f: Filtros) -> dict[uuid.UUID, Contagem]:
    """Por médium (com `grupo_ids`: só quem é membro de algum desses grupos — cada um uma vez)."""
    if f.grupo_ids is not None and not f.grupo_ids:
        return {}
    stmt = _base(f, AtividadeParticipacao.medium_id.label("chave"), *_fatos(f))
    if f.grupo_ids:
        stmt = stmt.where(
            exists(
                select(CorrenteGrupoMembro.medium_id).where(
                    CorrenteGrupoMembro.tenant_id == f.tenant_id,
                    CorrenteGrupoMembro.grupo_id.in_(f.grupo_ids),
                    CorrenteGrupoMembro.medium_id == AtividadeParticipacao.medium_id,
                )
            )
        )
    return await _contagens(db, stmt, "chave")


async def contagens_por_grupo(db: AsyncSession, f: Filtros) -> dict[uuid.UUID, Contagem]:
    """Por grupo: as linhas dos membros atuais (a linha do médium conta em cada grupo dele)."""
    if f.grupo_ids is not None and not f.grupo_ids:
        return {}
    stmt = _base(f, CorrenteGrupoMembro.grupo_id.label("chave"), *_fatos(f)).join(
        CorrenteGrupoMembro,
        and_(
            CorrenteGrupoMembro.medium_id == AtividadeParticipacao.medium_id,
            CorrenteGrupoMembro.tenant_id == f.tenant_id,
        ),
    )
    if f.grupo_ids:
        stmt = stmt.where(CorrenteGrupoMembro.grupo_id.in_(f.grupo_ids))
    return await _contagens(db, stmt, "chave")


async def atividades_por_chamada(db: AsyncSession, f: Filtros) -> tuple[int, int]:
    """(com chamada encerrada, sem chamada) entre as atividades que já começaram no período, não
    canceladas, de tipo que controla presença (âncoras de gira inclusas)."""
    tenant_id = f.tenant_id
    inicio = _inicio_efetivo()
    encerrada = Atividade.chamada_encerrada_em.is_not(None)
    stmt = (
        select(encerrada.label("encerrada"), func.count(Atividade.id))
        .select_from(Atividade)
        .join(AtividadeTipo, and_(AtividadeTipo.id == Atividade.tipo_id, AtividadeTipo.tenant_id == tenant_id))
        .outerjoin(Gira, and_(Gira.id == Atividade.gira_id, Gira.tenant_id == tenant_id))
        .where(
            Atividade.tenant_id == tenant_id,
            Atividade.deleted_at.is_(None),
            Atividade.cancelada_em.is_(None),
            or_(
                Atividade.gira_id.is_(None),
                and_(Gira.id.is_not(None), Gira.deleted_at.is_(None), Gira.is_active.is_(True)),
            ),
            AtividadeTipo.controla_presenca.is_(True),
            inicio >= f.de,
            inicio < f.ate,
            inicio <= f.agora,
        )
        .group_by(encerrada)
    )
    if f.tipo_id is not None:
        stmt = stmt.where(Atividade.tipo_id == f.tipo_id)
    com = sem = 0
    for fechada, n in (await db.execute(stmt)).all():
        if fechada:
            com += int(n)
        else:
            sem += int(n)
    return com, sem


async def mediuns_por_id(db: AsyncSession, tenant_id: uuid.UUID, ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, Medium]:
    ids = list(ids)
    if not ids:
        return {}
    rows = await db.execute(select(Medium).where(Medium.tenant_id == tenant_id, Medium.id.in_(ids)))
    return {m.id: m for m in rows.scalars().all()}


async def grupos_do_relatorio(
    db: AsyncSession, tenant_id: uuid.UUID, grupo_id: Optional[uuid.UUID]
) -> list[tuple[CorrenteGrupo, int]]:
    """Grupos ativos (ou só o filtrado, mesmo arquivado) com o número de membros (não excluídos)."""
    membros = (
        select(func.count(CorrenteGrupoMembro.medium_id))
        .select_from(CorrenteGrupoMembro)
        .join(Medium, and_(Medium.id == CorrenteGrupoMembro.medium_id, Medium.tenant_id == tenant_id))
        .where(
            CorrenteGrupoMembro.tenant_id == tenant_id,
            CorrenteGrupoMembro.grupo_id == CorrenteGrupo.id,
            Medium.deleted_at.is_(None),
        )
        .scalar_subquery()
    )
    stmt = select(CorrenteGrupo, membros).where(CorrenteGrupo.tenant_id == tenant_id)
    if grupo_id is not None:
        stmt = stmt.where(CorrenteGrupo.id == grupo_id)
    else:
        stmt = stmt.where(CorrenteGrupo.arquivado_em.is_(None))
    rows = (await db.execute(stmt.order_by(func.lower(CorrenteGrupo.nome)))).all()
    return [(g, int(n or 0)) for g, n in rows]


# ── Detalhe por médium (só na tela, com a justificativa) ────────────────────


@dataclass
class ItemDetalhe:
    atividade_id: uuid.UUID
    origem: str
    ref_id: uuid.UUID
    titulo: str
    inicio: datetime
    tipo: dict
    situacao: str
    categoria: str
    conta_no_percentual: bool
    chamada_encerrada: bool
    cancelada: bool
    tem_justificativa: bool
    justificativa: Optional[str] = None


async def detalhe_do_medium(db: AsyncSession, f: Filtros) -> tuple[Contagem, list[ItemDetalhe]]:
    """Linhas do médium (`f.medium_id`, já conferido no terreiro) no período, mais recentes primeiro.

    Mesma categoria do agregado; a situação é a da tela de confirmações (§8.5). Traz o texto da
    justificativa — quem chama só usa isso na tela de quem tem `ESCALAS:view`.
    """
    assert f.medium_id is not None
    stmt = _base(f, AtividadeParticipacao, Atividade, AtividadeTipo, Gira).order_by(_inicio_efetivo().desc())
    resumo = Contagem()
    itens: list[ItemDetalhe] = []
    for p, a, t, g in (await db.execute(stmt)).all():
        ctx = ctx_de(a, t, g)
        modo = t.presenca_modo if t.presenca_modo else f.modo_casa
        dispensado = p.dispensado_em is not None or p.substituida_por_id is not None
        tem_just = bool((p.justificativa or "").strip())
        conf_terminou = modo == MODO_CONFIANCA and ctx.fim_efetivo < f.agora
        cat = categoria(
            convocado=bool(p.convocado),
            cancelada=ctx.cancelada,
            dispensado=dispensado,
            encerrada=ctx.encerrada_em is not None,
            iniciou=ctx.inicio <= f.agora,
            presenca=p.presenca,
            resposta=p.resposta,
            tem_justificativa=tem_just,
            confianca_terminou=conf_terminou,
        )
        if cat == CAT_IGNORADA:
            continue
        resumo.somar(cat)
        itens.append(
            ItemDetalhe(
                atividade_id=a.id,
                origem=ctx.origem,
                ref_id=ctx.ref_id,
                titulo=ctx.titulo,
                inicio=ctx.inicio,
                tipo={"id": t.id, "nome": t.nome, "icone": t.icone, "cor": t.cor},
                situacao=situacao(
                    convocado=bool(p.convocado),
                    resposta=p.resposta,
                    presenca=p.presenca,
                    justificativa=p.justificativa,
                    dispensado=dispensado,
                    substituido=p.substituida_por_id is not None,
                    cancelada=ctx.cancelada,
                    confianca_terminou=conf_terminou and bool(t.controla_presenca),
                ),
                categoria=cat,
                conta_no_percentual=cat in CATEGORIAS_DA_CONTA,
                chamada_encerrada=ctx.encerrada_em is not None,
                cancelada=ctx.cancelada,
                tem_justificativa=tem_just,
                justificativa=p.justificativa if tem_just else None,
            )
        )
    return resumo, itens

