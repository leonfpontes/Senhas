"""Avisos da casa (AM-09) — regras puras, sem banco.

As consultas ficam nos endpoints (`api/v1/admin/comunicados.py` e `api/v1/medium/avisos.py`),
onde o auditor de tenant confere os filtros; aqui só o que dá para testar sem Postgres:

- **Texto simples** (`limpar_titulo`, `limpar_corpo`): o aviso nunca guarda HTML. Tags são
  removidas, caracteres de controle somem, as quebras de linha do corpo ficam (no máximo uma
  linha em branco seguida). Os links viram clicáveis só na tela (o front escapa tudo e só
  autolinka `http(s)://`/`www.`), nunca no banco.
- **Público** (`publicos_do_medium`, `medium_no_publico`): `todos` vale para todo médium;
  `atendimento` para quem é médium de atendimento (`mediuns.is_atendimento`); `cambones` para
  quem é só cambone; `grupos` (AM-23) para quem está em pelo menos um dos grupos da corrente
  escolhidos no aviso (`comunicado_grupos`), não importa se atende ou é cambone.
- **Agenda e validade** (`situacao`, `normalizar_data`): publicado = `publicar_em` já chegou e
  `expira_em` (se houver) ainda não; antes disso "agendado", depois "expirado".
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import AbstractSet, Optional

from ..core.tz import APP_TZ
from ..models.comunicados import ComunicadoPublico

SITUACAO_AGENDADO = "agendado"
SITUACAO_PUBLICADO = "publicado"
SITUACAO_EXPIRADO = "expirado"

# Tag HTML (abre/fecha, com ou sem atributos) e comentário. "a < b" e "<3" ficam como estão.
_TAG = re.compile(r"<!--.*?-->|</?[A-Za-z][^<>]*>", re.DOTALL)
# Controle (C0/C1) exceto \t e \n; também separadores Unicode que quebram o layout.
_CONTROLE = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f  ​﻿]")
_ESPACOS = re.compile(r"\s+")
_LINHAS_EM_BRANCO = re.compile(r"\n{3,}")


def _sem_html(texto: str) -> str:
    # Repete até estabilizar: "<scr<script>ipt>" não pode sobrar como "<script>".
    anterior = None
    while anterior != texto:
        anterior = texto
        texto = _TAG.sub("", texto)
    return texto


def limpar_titulo(valor: Optional[str]) -> str:
    """Título numa linha só, sem HTML nem controle, espaços colapsados."""
    texto = _sem_html(valor or "")
    texto = _CONTROLE.sub("", texto)
    return _ESPACOS.sub(" ", texto).strip()


def limpar_corpo(valor: Optional[str]) -> str:
    """Corpo em texto simples: sem HTML nem controle, quebras de linha preservadas."""
    texto = (valor or "").replace("\r\n", "\n").replace("\r", "\n")
    texto = _sem_html(texto)
    texto = _CONTROLE.sub("", texto).replace("\t", "    ")
    linhas = [linha.rstrip() for linha in texto.split("\n")]
    texto = _LINHAS_EM_BRANCO.sub("\n\n", "\n".join(linhas))
    return texto.strip()


def publicos_do_medium(is_atendimento: bool) -> tuple[str, ...]:
    """Valores de `publico` que alcançam o médium."""
    especifico = ComunicadoPublico.ATENDIMENTO if is_atendimento else ComunicadoPublico.CAMBONES
    return (ComunicadoPublico.TODOS.value, especifico.value)


def medium_no_publico(
    publico: str,
    is_atendimento: bool,
    grupos_do_medium: AbstractSet = frozenset(),
    grupos_do_aviso: AbstractSet = frozenset(),
) -> bool:
    if publico == ComunicadoPublico.GRUPOS.value:
        return bool(set(grupos_do_medium) & set(grupos_do_aviso))
    return publico in publicos_do_medium(is_atendimento)


def normalizar_data(valor: Optional[datetime]) -> Optional[datetime]:
    """Data sem fuso é horário de Brasília (o painel trabalha no fuso da casa)."""
    if valor is None:
        return None
    if valor.tzinfo is None:
        return valor.replace(tzinfo=APP_TZ)
    return valor


def situacao(publicar_em: datetime, expira_em: Optional[datetime], agora: datetime) -> str:
    if publicar_em > agora:
        return SITUACAO_AGENDADO
    if expira_em is not None and expira_em <= agora:
        return SITUACAO_EXPIRADO
    return SITUACAO_PUBLICADO


def resumo(corpo: str, limite: int = 140) -> str:
    """Primeiras palavras do aviso numa linha (lista do médium e Início)."""
    texto = _ESPACOS.sub(" ", corpo or "").strip()
    if len(texto) <= limite:
        return texto
    corte = texto[:limite].rsplit(" ", 1)[0] or texto[:limite]
    return corte.rstrip(" .,;:") + "…"
