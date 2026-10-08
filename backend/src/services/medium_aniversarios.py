"""Aniversariantes da corrente na Área do Médium (AM-20) — regras puras.

- A semana é de segunda a domingo, no fuso de Brasília (`today_local`).
- Nascido em 29/02: em ano que não é bissexto, o aniversário cai em 01/03 (mesma regra do
  aviso de aniversariantes do painel, `MediumRepository.list_aniversariantes`).
- O ano de nascimento NUNCA sai daqui: só dia e mês (e o primeiro nome).
- A lista da semana mostra só quem aceitou (`mediuns.aniversario_visivel`); a mensagem da casa
  no dia do próprio aniversário não depende do opt-in (só o aniversariante vê).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable, Optional

MENSAGEM_MAX = 200


def primeiro_nome(nome: Optional[str]) -> str:
    partes = (nome or "").split()
    return partes[0] if partes else ""


def semana_de(hoje: date) -> tuple[date, date]:
    """(segunda, domingo) da semana de `hoje`."""
    segunda = hoje - timedelta(days=hoje.weekday())
    return segunda, segunda + timedelta(days=6)


def aniversario_no_ano(nascimento: date, ano: int) -> date:
    """Data do aniversário em `ano` (29/02 vira 01/03 fora do ano bissexto)."""
    try:
        return nascimento.replace(year=ano)
    except ValueError:
        return date(ano, 3, 1)


def aniversario_na_semana(nascimento: date, hoje: date) -> Optional[date]:
    """Data do aniversário dentro da semana de `hoje` (ou None). A semana pode cruzar o ano."""
    segunda, domingo = semana_de(hoje)
    for ano in sorted({segunda.year, domingo.year}):
        dia = aniversario_no_ano(nascimento, ano)
        if segunda <= dia <= domingo:
            return dia
    return None


def faz_aniversario_hoje(nascimento: Optional[date], hoje: date) -> bool:
    return nascimento is not None and aniversario_no_ano(nascimento, hoje.year) == hoje


@dataclass(frozen=True)
class Aniversariante:
    primeiro_nome: str
    dia: int
    mes: int
    hoje: bool
    sou_eu: bool

    def as_dict(self) -> dict:
        return {
            "primeiro_nome": self.primeiro_nome,
            "dia": self.dia,
            "mes": self.mes,
            "hoje": self.hoje,
            "sou_eu": self.sou_eu,
        }


def aniversariantes_da_semana(
    hoje: date, pessoas: Iterable[tuple[object, Optional[str], Optional[date]]], meu_id: object
) -> list[Aniversariante]:
    """[(id, nome, nascimento)] → quem faz aniversário na semana, em ordem de data (depois nome).

    Quem chega aqui já aceitou mostrar (o filtro do opt-in é da consulta). Só dia/mês saem.
    """
    saida: list[tuple[date, str, Aniversariante]] = []
    for pid, nome, nascimento in pessoas:
        if nascimento is None:
            continue
        dia = aniversario_na_semana(nascimento, hoje)
        if dia is None:
            continue
        primeiro = primeiro_nome(nome)
        if not primeiro:
            continue
        saida.append(
            (dia, primeiro.lower(), Aniversariante(primeiro, dia.day, dia.month, dia == hoje, pid == meu_id))
        )
    saida.sort(key=lambda t: (t[0], t[1]))
    return [a for _, _, a in saida]


def limpar_mensagem(valor: Optional[str]) -> Optional[str]:
    """Texto simples de até 200: sem HTML/controle, espaços normalizados. Vazio → None."""
    if valor is None:
        return None
    texto = re.sub(r"<[^>]*>", "", valor)
    texto = re.sub(r"[\x00-\x1f\x7f]", " ", texto)
    texto = re.sub(r"\s+", " ", texto).strip()
    if not texto:
        return None
    if len(texto) > MENSAGEM_MAX:
        raise ValueError(f"A mensagem de aniversário pode ter até {MENSAGEM_MAX} caracteres.")
    return texto


def mensagem_padrao(terreiro: str, primeiro: str) -> str:
    casa = (terreiro or "").strip() or "casa"
    if primeiro:
        return f"A {casa} deseja um feliz aniversário, {primeiro}! Axé!"
    return f"A {casa} deseja um feliz aniversário! Axé!"


def mensagem_aniversario(terreiro: str, nome: Optional[str], personalizada: Optional[str]) -> str:
    """Mensagem do dia: a da casa (com `{nome}` trocado pelo primeiro nome) ou a padrão."""
    primeiro = primeiro_nome(nome)
    texto = (personalizada or "").strip()
    if not texto:
        return mensagem_padrao(terreiro, primeiro)
    return re.sub(r"\s+", " ", texto.replace("{nome}", primeiro)).strip()
