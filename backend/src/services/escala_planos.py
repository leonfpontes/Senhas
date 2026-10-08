"""Escala de faxina (AM-25) — planejador do mês por grupos da corrente (§8.7 do plano).

Quem usa: `api/v1/admin/escala_planos.py`. Vale para qualquer tipo de atividade com
`modo_escala = 'grupos_por_dia'` (ex.: Faxina, Cozinha).

Funções puras (testadas em `tests/unit/test_am25_escala_faxina.py`):

- `copiar_por_dia_da_semana`: o 1º sábado vai para o 1º sábado, o 2º para o 2º...; a 5ª
  ocorrência some quando o mês de destino não tem.
- `girar_grupos`: com os grupos em ordem G1..GN, cada dia passa ao PRÓXIMO grupo — G2 pega os
  dias do G1, G3 os do G2 e G1 os do GN (o rodízio mês a mês). Grupo fora da ordem fica.
- `distribuir_em_ciclo`: os dias da semana escolhidos do mês, em ordem de data, recebem os
  grupos em ciclo (G1, G2, G3, G1...).
- `diff_publicacao`: o que publicar muda — criar, cancelar, trocar o grupo de um dia
  (reaproveita a atividade), reagendar o horário. Dias que já passaram (ou com a chamada
  encerrada) ficam como estão: o passado não muda.

`escala_publicada` é o gancho dos avisos (AM-15): chamado depois do commit de cada publicação e
de cada "Atualizar convocações", com quem entrou e quem saiu da escala. Hoje não envia nada.
"""
from __future__ import annotations

import calendar
import re
import uuid
from collections import defaultdict
from dataclasses import dataclass, field, replace
from datetime import date, datetime, time, timedelta
from typing import Iterable, Optional, Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ValidationError
from ..core.tz import APP_TZ
from ..models.atividades import TITULO_MAX

HORA_PADRAO = time(9, 0)
MSG_MES = "Mês inválido. Use AAAA-MM."
MSG_TIPO = "Este tipo de atividade não usa a escala por grupos nos dias do mês."
MOTIVO_DIA_REMOVIDO = "Dia tirado da escala."
# Dias da semana no formato do calendário da tela (JavaScript): 0 = domingo ... 6 = sábado.
DIAS_SEMANA = tuple(range(7))

_RE_MES = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


# ── Mês e datas ─────────────────────────────────────────────────────────────


def mes_de_texto(valor: str) -> date:
    """'AAAA-MM' → 1º dia do mês (senão 422)."""
    m = _RE_MES.match(str(valor or "").strip())
    if not m or not 2000 <= int(m.group(1)) <= 2100:
        raise ValidationError(MSG_MES)
    return date(int(m.group(1)), int(m.group(2)), 1)


def mes_texto(mes: date) -> str:
    return f"{mes.year:04d}-{mes.month:02d}"


def mes_anterior(mes: date) -> date:
    return (mes.replace(day=1) - timedelta(days=1)).replace(day=1)


def dias_do_mes(mes: date) -> list[date]:
    total = calendar.monthrange(mes.year, mes.month)[1]
    return [date(mes.year, mes.month, d) for d in range(1, total + 1)]


def no_mes(dia: date, mes: date) -> bool:
    return (dia.year, dia.month) == (mes.year, mes.month)


def dia_semana(dia: date) -> int:
    """0 = domingo ... 6 = sábado (como o `getDay()` do navegador)."""
    return (dia.weekday() + 1) % 7


def ocorrencia(dia: date) -> int:
    """Qual ocorrência daquele dia da semana no mês (1º sábado = 1 ... 5º = 5)."""
    return (dia.day - 1) // 7 + 1


def enesimo_dia_semana(mes: date, semana: int, n: int) -> Optional[date]:
    """O n-ésimo `semana` (0 = domingo) do mês, ou None quando o mês não tem."""
    primeiro = mes.replace(day=1)
    desloc = (semana - dia_semana(primeiro)) % 7
    alvo = primeiro + timedelta(days=desloc + 7 * (n - 1))
    return alvo if no_mes(alvo, mes) else None


def hora_fim_padrao(hora_inicio: time, duracao_min: Optional[int]) -> Optional[time]:
    """Início + duração do tipo, no mesmo dia (passou da meia-noite → sem fim)."""
    if not duracao_min:
        return None
    base = datetime.combine(date(2000, 1, 1), hora_inicio)
    fim = base + timedelta(minutes=duracao_min)
    return fim.time() if fim.date() == base.date() and fim > base else None


def hora_texto(valor: Optional[time]) -> Optional[str]:
    return valor.strftime("%H:%M") if valor is not None else None


def inicio_fim(data: date, hora_inicio: time, hora_fim: Optional[time]) -> tuple[datetime, Optional[datetime]]:
    """Datas com fuso de Brasília (o horário da casa)."""
    inicio = datetime.combine(data, hora_inicio, tzinfo=APP_TZ)
    fim = datetime.combine(data, hora_fim, tzinfo=APP_TZ) if hora_fim is not None else None
    return inicio, fim


def horario_local(inicio: datetime, fim: Optional[datetime]) -> tuple[time, Optional[time]]:
    ini = inicio.astimezone(APP_TZ)
    hf = fim.astimezone(APP_TZ) if fim is not None else None
    return ini.time().replace(second=0, microsecond=0), (
        hf.time().replace(second=0, microsecond=0) if hf is not None and hf.date() == ini.date() else None
    )


def titulo_da_atividade(nome_tipo: str, nome_grupo: str) -> str:
    """"Faxina · G2" (cabe no título da atividade)."""
    return f"{nome_tipo} · {nome_grupo}"[:TITULO_MAX]


def ordem_natural(nome: str) -> list:
    """Chave de ordenação "G2" antes de "G10"."""
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", nome or "")]


# ── Dias do plano ───────────────────────────────────────────────────────────


@dataclass(frozen=True)
class DiaPlano:
    """Um grupo num dia do rascunho."""

    data: date
    grupo_id: uuid.UUID
    hora_inicio: time
    hora_fim: Optional[time] = None

    @property
    def chave(self) -> tuple[date, uuid.UUID]:
        return (self.data, self.grupo_id)


@dataclass(frozen=True)
class Publicado:
    """Um dia × grupo já publicado (com a atividade gerada)."""

    data: date
    grupo_id: uuid.UUID
    atividade_id: uuid.UUID
    hora_inicio: time
    hora_fim: Optional[time] = None
    cancelada: bool = False
    encerrada: bool = False

    @property
    def chave(self) -> tuple[date, uuid.UUID]:
        return (self.data, self.grupo_id)


def ordenar(dias: Iterable[DiaPlano]) -> list[DiaPlano]:
    """Por data e grupo, sem repetir (data, grupo) — fica o primeiro."""
    vistos: dict[tuple[date, uuid.UUID], DiaPlano] = {}
    for d in dias:
        vistos.setdefault(d.chave, d)
    return sorted(vistos.values(), key=lambda d: (d.data, str(d.grupo_id)))


def copiar_por_dia_da_semana(origem: Sequence[DiaPlano], mes_destino: date) -> tuple[list[DiaPlano], int]:
    """Copia o mês anterior pela ordem do dia da semana. Devolve (dias, quantos ficaram de fora).

    O 1º sábado vai para o 1º sábado, o 2º para o 2º...; quem estava no 5º sábado fica de fora
    quando o mês de destino só tem 4. Horários iguais aos da origem.
    """
    out: list[DiaPlano] = []
    descartados = 0
    for d in origem:
        alvo = enesimo_dia_semana(mes_destino, dia_semana(d.data), ocorrencia(d.data))
        if alvo is None:
            descartados += 1
            continue
        out.append(replace(d, data=alvo))
    return ordenar(out), descartados


def girar_grupos(dias: Sequence[DiaPlano], ordem: Sequence[uuid.UUID]) -> list[DiaPlano]:
    """Rodízio: cada dia passa ao próximo grupo da ordem (G1→G2, G2→G3, ..., GN→G1).

    Ou seja, G2 pega os dias do G1, G3 os do G2 e G1 os do último. Grupo fora da ordem não muda.
    É uma permutação: um dia com dois grupos continua com dois grupos diferentes.
    """
    grupos = list(dict.fromkeys(ordem))
    if len(grupos) < 2:
        return ordenar(dias)
    proximo = {g: grupos[(i + 1) % len(grupos)] for i, g in enumerate(grupos)}
    return ordenar(replace(d, grupo_id=proximo.get(d.grupo_id, d.grupo_id)) for d in dias)


def distribuir_em_ciclo(
    mes: date,
    dias_semana: Iterable[int],
    grupos: Sequence[uuid.UUID],
    hora_inicio: time,
    hora_fim: Optional[time] = None,
) -> list[DiaPlano]:
    """Os dias do mês nos dias da semana escolhidos (0 = domingo), em ordem de data, recebem os
    grupos em ciclo: o 1º dia vai para o 1º grupo, o 2º para o 2º... e recomeça."""
    semana = {int(s) for s in dias_semana}
    if semana - set(DIAS_SEMANA):
        raise ValidationError("Escolha dias da semana válidos.")
    ordem = list(dict.fromkeys(grupos))
    if not semana or not ordem:
        return []
    datas = [d for d in dias_do_mes(mes) if dia_semana(d) in semana]
    return [DiaPlano(d, ordem[i % len(ordem)], hora_inicio, hora_fim) for i, d in enumerate(datas)]


# ── Diff da publicação ──────────────────────────────────────────────────────


@dataclass(frozen=True)
class Troca:
    """Grupo trocado num dia: a atividade do grupo antigo é reaproveitada para o novo."""

    anterior: Publicado
    novo: DiaPlano


@dataclass
class DiffPublicacao:
    criar: list[DiaPlano] = field(default_factory=list)
    cancelar: list[Publicado] = field(default_factory=list)
    trocar: list[Troca] = field(default_factory=list)
    reagendar: list[tuple[Publicado, DiaPlano]] = field(default_factory=list)
    sem_mudanca: list[Publicado] = field(default_factory=list)
    # Mudanças do rascunho em dias que já passaram (ou com a chamada encerrada): não valem.
    ignorados_passado: int = 0

    @property
    def tem_mudancas(self) -> bool:
        return bool(self.criar or self.cancelar or self.trocar or self.reagendar)


def diff_publicacao(
    publicados: Sequence[Publicado],
    rascunho: Sequence[DiaPlano],
    *,
    hoje: date,
    ordem: Sequence[uuid.UUID] = (),
) -> DiffPublicacao:
    """O que a publicação faz para o publicado virar o rascunho.

    - (dia, grupo) nos dois: o mesmo (respostas e presenças ficam); horário diferente → reagendar.
    - Num mesmo dia, grupo que saiu e grupo que entrou formam pares (na ordem dos grupos):
      troca — a atividade é reaproveitada, os do grupo antigo são dispensados e os do novo
      convocados. O que sobrar: dia removido → cancelar; dia novo → criar.
    - Dia que já passou (antes de `hoje`) ou com a chamada encerrada fica como está, e mudança
      do rascunho nesses dias conta em `ignorados_passado`. Atividade já cancelada à mão não
      entra em troca (só sai do plano).
    """
    posicao = {g: i for i, g in enumerate(dict.fromkeys(ordem))}

    def chave_grupo(grupo_id: uuid.UUID) -> tuple[int, str]:
        return (posicao.get(grupo_id, len(posicao)), str(grupo_id))

    def congelado(p: Publicado) -> bool:
        return p.data < hoje or p.encerrada

    pub: dict[tuple[date, uuid.UUID], Publicado] = {}
    for p in publicados:
        pub.setdefault(p.chave, p)
    ras: dict[tuple[date, uuid.UUID], DiaPlano] = {}
    for d in rascunho:
        ras.setdefault(d.chave, d)

    diff = DiffPublicacao()
    for k in sorted(pub.keys() & ras.keys(), key=lambda k: (k[0], chave_grupo(k[1]))):
        p, d = pub[k], ras[k]
        mesmo_horario = (p.hora_inicio, p.hora_fim) == (d.hora_inicio, d.hora_fim)
        if congelado(p):
            diff.sem_mudanca.append(p)
            diff.ignorados_passado += 0 if mesmo_horario else 1
        elif mesmo_horario:
            diff.sem_mudanca.append(p)
        else:
            diff.reagendar.append((p, d))

    removidos: dict[date, list[Publicado]] = defaultdict(list)
    adicionados: dict[date, list[DiaPlano]] = defaultdict(list)
    for k in pub.keys() - ras.keys():
        p = pub[k]
        if congelado(p):
            diff.sem_mudanca.append(p)
            diff.ignorados_passado += 1
        elif p.cancelada:
            diff.cancelar.append(p)
        else:
            removidos[p.data].append(p)
    for k in ras.keys() - pub.keys():
        d = ras[k]
        if d.data < hoje:
            diff.ignorados_passado += 1
        else:
            adicionados[d.data].append(d)

    for dia in sorted(set(removidos) | set(adicionados)):
        rem = sorted(removidos.get(dia, []), key=lambda p: chave_grupo(p.grupo_id))
        add = sorted(adicionados.get(dia, []), key=lambda d: chave_grupo(d.grupo_id))
        diff.trocar.extend(Troca(p, d) for p, d in zip(rem, add))
        diff.cancelar.extend(rem[len(add):])
        diff.criar.extend(add[len(rem):])
    diff.cancelar.sort(key=lambda p: (p.data, chave_grupo(p.grupo_id)))
    return diff


# ── Gancho dos avisos (AM-15) ───────────────────────────────────────────────


@dataclass
class ResultadoPublicacao:
    """O que uma publicação (ou "Atualizar convocações") mudou — para a resposta e o AM-15."""

    motivo: str = "publicacao"  # "publicacao" | "atualizacao"
    criadas: int = 0
    canceladas: int = 0
    trocadas: int = 0
    reagendadas: int = 0
    atividades: int = 0  # "atualizacao": quantas faxinas futuras foram conferidas
    ignorados_passado: int = 0
    fora_da_elegibilidade: int = 0
    # (atividade_id, medium_id) de quem entrou na escala e de quem saiu dela.
    convocados: list[tuple[uuid.UUID, uuid.UUID]] = field(default_factory=list)
    dispensados: list[tuple[uuid.UUID, uuid.UUID]] = field(default_factory=list)
    atividades_canceladas: list[uuid.UUID] = field(default_factory=list)
    atividades_reagendadas: list[uuid.UUID] = field(default_factory=list)


async def escala_publicada(
    db: AsyncSession, tenant_id: uuid.UUID, plano_id: uuid.UUID, resultado: ResultadoPublicacao
) -> None:
    """Gancho do AM-15 (avisos por e-mail): chamado DEPOIS do commit da publicação e do
    "Atualizar convocações das próximas faxinas".

    `resultado.convocados` = quem passou a estar na escala ("Você está na escala da faxina..."),
    `resultado.dispensados` = quem saiu (dia removido, grupo trocado ou saiu do grupo),
    `resultado.atividades_canceladas`/`atividades_reagendadas` = dias cancelados/com horário novo.
    Hoje não envia nada — o envio (e o controle de "já avisado") é do AM-15.
    """
    return None
