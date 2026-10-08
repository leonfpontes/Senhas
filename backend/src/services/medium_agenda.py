"""Agenda da Área do Médium (AM-07) — regras puras, sem banco.

As consultas ficam no endpoint (`src/api/v1/medium/agenda.py`, onde o auditor de tenant confere
o filtro por `ctx.tenant_id`); aqui só o que dá para testar sem Postgres:

- **Período** (`periodo_da_agenda`): padrão do 1º dia do mês corrente (Brasília) até o fim do
  3º mês (mês atual + 2); no máximo 6 meses por consulta.
- **Item unificado** (`item_da_gira`, `item_da_atividade`): o formato que o AM-17 (minha
  participação) estende sem quebrar — `{origem, id, tipo{nome, icone, cor}, titulo, inicio,
  fim, local, cancelada, minha_participacao}`. O tipo da gira é o tipo de sistema "Gira" do
  terreiro (AM-08, renomeável); `minha_participacao` segue null até o AM-17.
- **Senhas para o público** (`situacao_senhas`): abertas, esgotadas, abrem em <data>,
  encerradas ou sem senhas — só a situação, nunca dado de consulente.
- **Agenda do celular**: arquivo `.ics` (`ics_da_gira`, RFC 5545, horários em UTC; também para
  atividade interna com `uid_prefixo="atividade"`, AM-08) e link do Google Agenda
  (`google_agenda_url`).
- **Mapa** (`mapa_url`) e **link público** da gira (`link_publico_da_gira`).
"""
from __future__ import annotations

import calendar
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from urllib.parse import quote, urlencode

# Período padrão e máximo da consulta (meses).
MESES_PADRAO = 3
MESES_MAXIMO = 6

# Gira sem horário de término: duração usada no .ics e no Google Agenda.
DURACAO_PADRAO_GIRA = timedelta(hours=3)

# Tipo da gira no formato unificado quando o terreiro não tem o tipo de sistema. `icone` é um
# nome semântico que o front traduz (lib/icons: "gira" → CalendarDays); `cor` null = cor do
# terreiro. Com o AM-08 vale o tipo "Gira" (de sistema) de `atividade_tipos`, renomeável.
TIPO_GIRA = {"nome": "Gira", "icone": "gira", "cor": None}

SENHAS_ABERTAS = "abertas"
SENHAS_ESGOTADAS = "esgotadas"
SENHAS_ABREM_EM = "abrem_em"
SENHAS_ENCERRADAS = "encerradas"
SENHAS_SEM = "sem_senhas"


class PeriodoInvalido(ValueError):
    """Período da agenda fora das regras (mensagem pronta para a tela)."""


def somar_meses(dia: date, meses: int) -> date:
    """Mesmo dia `meses` depois (dia 31 vira o último dia do mês de destino)."""
    total = dia.month - 1 + meses
    ano, mes = dia.year + total // 12, total % 12 + 1
    return date(ano, mes, min(dia.day, calendar.monthrange(ano, mes)[1]))


def periodo_da_agenda(hoje: date, inicio: Optional[date], fim: Optional[date]) -> tuple[date, date]:
    """(início, fim) inclusivos, em dias de Brasília.

    Sem `inicio`: 1º dia do mês de `hoje`. Sem `fim`: véspera de `inicio + 3 meses`.
    `fim` antes de `inicio` ou período maior que 6 meses → `PeriodoInvalido`.
    """
    ini = inicio or hoje.replace(day=1)
    fim_ = fim or somar_meses(ini, MESES_PADRAO) - timedelta(days=1)
    if fim_ < ini:
        raise PeriodoInvalido("A data final precisa ser depois da inicial.")
    if fim_ >= somar_meses(ini, MESES_MAXIMO):
        raise PeriodoInvalido("Escolha um período de até 6 meses.")
    return ini, fim_


def item_da_gira(gira, tipo: Optional[dict] = None) -> dict:
    """Gira no formato unificado da agenda (só o que a corrente precisa).

    `tipo`: {nome, icone, cor} do tipo de sistema "Gira" do terreiro (AM-08); sem ele, o padrão.
    """
    return {
        "origem": "gira",
        "id": str(gira.id),
        "tipo": dict(tipo or TIPO_GIRA),
        "titulo": gira.nome,
        "inicio": gira.data_inicio,
        "fim": gira.data_fim,
        "local": gira.local or None,
        "cancelada": False,
        "minha_participacao": None,
    }


def item_da_atividade(atividade, tipo: dict) -> dict:
    """Atividade interna (AM-08) no formato unificado da agenda."""
    return {
        "origem": "atividade",
        "id": str(atividade.id),
        "tipo": dict(tipo),
        "titulo": atividade.titulo or tipo.get("nome") or "",
        "inicio": atividade.inicio,
        "fim": atividade.fim,
        "local": atividade.local or None,
        "cancelada": atividade.cancelada_em is not None,
        "minha_participacao": None,
    }


@dataclass(frozen=True)
class SituacaoSenhas:
    situacao: str
    abrem_em: Optional[datetime] = None


def situacao_senhas(
    *,
    agora: datetime,
    max_tickets: Optional[int],
    release_start_at: Optional[datetime],
    release_end_at: Optional[datetime],
    emitidas: int,
) -> SituacaoSenhas:
    """Situação das senhas da gira para o público (mesma regra da página de emissão)."""
    if not max_tickets or release_start_at is None or release_end_at is None:
        return SituacaoSenhas(SENHAS_SEM)
    if agora < release_start_at:
        return SituacaoSenhas(SENHAS_ABREM_EM, abrem_em=release_start_at)
    if agora > release_end_at:
        return SituacaoSenhas(SENHAS_ENCERRADAS)
    if max_tickets - emitidas <= 0:
        return SituacaoSenhas(SENHAS_ESGOTADAS)
    return SituacaoSenhas(SENHAS_ABERTAS)


def link_publico_da_gira(frontend_url: str, gira_id, tenant_slug: str, tem_senhas: bool) -> str:
    """Página pública da gira (emissão de senha) ou, sem senhas, a agenda pública da casa."""
    base = frontend_url.rstrip("/")
    if tem_senhas:
        return f"{base}/public/gira/{gira_id}"
    return f"{base}/{quote(tenant_slug)}"


def mapa_url(endereco: Optional[str]) -> Optional[str]:
    """Link do Google Maps (abre o app de mapas no celular) ou None sem endereço."""
    if not endereco or not endereco.strip():
        return None
    return f"https://www.google.com/maps/search/?api=1&query={quote(endereco.strip())}"


def fim_ou_padrao(inicio: datetime, fim: Optional[datetime]) -> datetime:
    return fim if fim is not None and fim > inicio else inicio + DURACAO_PADRAO_GIRA


def _utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _escapar(texto: str) -> str:
    return (
        texto.replace("\\", "\\\\")
        .replace("\r\n", "\n")
        .replace("\n", "\\n")
        .replace(",", "\\,")
        .replace(";", "\\;")
    )


def _dobrar(linha: str) -> str:
    """Quebra linhas acima de 75 octetos (RFC 5545 §3.1) sem partir caractere UTF-8."""
    partes: list[str] = []
    atual = ""
    for ch in linha:
        limite = 75 if not partes else 74  # continuação começa com um espaço
        if len((atual + ch).encode("utf-8")) > limite:
            partes.append(atual)
            atual = ch
        else:
            atual += ch
    partes.append(atual)
    return "\r\n ".join(partes)


def descricao_do_evento(orientacoes: Optional[str], link_area: Optional[str]) -> str:
    linhas = []
    if orientacoes and orientacoes.strip():
        linhas.append(f"Orientações para a corrente:\n{orientacoes.strip()}")
    if link_area:
        linhas.append(f"Detalhes na Área do Médium: {link_area}")
    return "\n\n".join(linhas)


def ics_da_gira(
    *,
    gira_id,
    uid_prefixo: str = "gira",
    titulo: str,
    terreiro: str,
    inicio: datetime,
    fim: Optional[datetime],
    local: Optional[str],
    descricao: str,
    url: Optional[str],
    agora: datetime,
) -> str:
    """Arquivo .ics de um evento (horários em UTC; o celular mostra no fuso dele)."""
    linhas = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//GiraHub//Area do Medium//PT",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{uid_prefixo}-{gira_id}@girahub",
        f"DTSTAMP:{_utc(agora)}",
        f"DTSTART:{_utc(inicio)}",
        f"DTEND:{_utc(fim_ou_padrao(inicio, fim))}",
        f"SUMMARY:{_escapar(f'{titulo} · {terreiro}')}",
    ]
    if local:
        linhas.append(f"LOCATION:{_escapar(local)}")
    if descricao:
        linhas.append(f"DESCRIPTION:{_escapar(descricao)}")
    if url:
        linhas.append(f"URL:{url}")
    linhas += ["END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(_dobrar(linha) for linha in linhas) + "\r\n"


def google_agenda_url(
    *,
    titulo: str,
    terreiro: str,
    inicio: datetime,
    fim: Optional[datetime],
    local: Optional[str],
    descricao: str,
) -> str:
    """Link "Adicionar ao Google Agenda" (abre o app no Android e o site no iPhone)."""
    params = {
        "action": "TEMPLATE",
        "text": f"{titulo} · {terreiro}",
        "dates": f"{_utc(inicio)}/{_utc(fim_ou_padrao(inicio, fim))}",
        "ctz": "America/Sao_Paulo",
    }
    if descricao:
        params["details"] = descricao
    if local:
        params["location"] = local
    return "https://calendar.google.com/calendar/render?" + urlencode(params, quote_via=quote)


def nome_arquivo_ics(titulo: str, inicio_local: date) -> str:
    """'gira-de-caboclos-2026-10-09.ics' (só ASCII, para o cabeçalho do download)."""
    base = unicodedata.normalize("NFKD", titulo).encode("ascii", "ignore").decode("ascii").lower()
    slug = "-".join("".join(c if c.isalnum() else " " for c in base).split())[:60] or "gira"
    return f"{slug}-{inicio_local.isoformat()}.ics"
