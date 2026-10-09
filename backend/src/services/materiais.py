"""Estudos e documentos da casa (AM-21) — regras puras, sem banco.

As consultas ficam nos endpoints (`api/v1/admin/materiais.py` e `api/v1/medium/materiais.py`),
onde o auditor de tenant confere os filtros; aqui só o que dá para testar sem Postgres:

- **Endereço** (`validar_url`): só `http://` ou `https://` com domínio, sem espaço, sem caractere
  de controle e sem usuário/senha no endereço (`https://banco.com@golpe.net`). `javascript:`,
  `data:`, `file:` e afins são recusados. Até 500 caracteres.
- **Fonte** (`fonte_do_link`, `youtube_id`): YouTube (o id de 11 caracteres vira o player
  `youtube-nocookie` na Área — o `frame-src` do nginx já libera), Google Drive/Docs ou site comum.
- **Texto** (`limpar_texto_material`): a mesma limpeza do corpo dos avisos (`limpar_corpo`: sem
  HTML, quebras de linha preservadas), até 15 000 caracteres.
- **Tipo** (`validar_conteudo`): `link` exige endereço (texto é descrição opcional); `texto` exige
  texto; `ponto` exige a letra e aceita um link de áudio/vídeo.
- **Público**: as mesmas regras dos avisos (`services/comunicados.publicos_do_medium`).
"""
from __future__ import annotations

import re
from typing import Optional
from urllib.parse import parse_qs, urlsplit

from ..core.errors import ValidationError
from ..models.materiais import CATEGORIA_MAX, CATEGORIA_PADRAO, TEXTO_MAX, TITULO_MAX, URL_MAX, MaterialTipo
from .comunicados import limpar_corpo, limpar_titulo

MSG_URL = "Use um endereço que comece com http:// ou https:// (link do Drive, do YouTube ou de um site)."
MSG_URL_OBRIGATORIA = "Cole o link do material."
MSG_TEXTO_OBRIGATORIO = "Escreva o texto do material."
MSG_LETRA_OBRIGATORIA = "Escreva a letra do ponto."
MSG_TITULO = f"Dê um título ao material (até {TITULO_MAX} letras)."
MSG_CATEGORIA = f"A categoria vai até {CATEGORIA_MAX} letras."
MSG_TEXTO_LONGO = f"O texto vai até {TEXTO_MAX:,} letras.".replace(",", ".")

FONTE_YOUTUBE = "youtube"
FONTE_DRIVE = "drive"
FONTE_LINK = "link"

_YOUTUBE_HOSTS = {"youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "youtu.be"}
_DRIVE_HOSTS = {"drive.google.com", "docs.google.com"}
_YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
_PROIBIDO_NA_URL = re.compile(r"[\s\x00-\x1f\x7f<>\"'`\\]")


def validar_url(valor: Optional[str]) -> Optional[str]:
    """Endereço http(s) limpo, ou None se vazio. Erro 422 se não for um link seguro."""
    url = (valor or "").strip()
    if not url:
        return None
    if len(url) > URL_MAX or _PROIBIDO_NA_URL.search(url):
        raise ValidationError(MSG_URL)
    try:
        partes = urlsplit(url)
        host = partes.hostname or ""
        _ = partes.port  # porta inválida levanta ValueError
    except ValueError:
        raise ValidationError(MSG_URL)
    if partes.scheme.lower() not in ("http", "https"):
        raise ValidationError(MSG_URL)
    if not host or "." not in host or partes.username is not None or partes.password is not None:
        raise ValidationError(MSG_URL)
    return url


def _host(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def youtube_id(url: Optional[str]) -> Optional[str]:
    """Id do vídeo (watch?v=, youtu.be/, /embed/, /shorts/, /live/) ou None."""
    if not url:
        return None
    try:
        host = _host(url)
        partes = urlsplit(url)
    except ValueError:
        return None
    if host not in _YOUTUBE_HOSTS:
        return None
    candidato: Optional[str] = None
    caminho = [p for p in partes.path.split("/") if p]
    if host == "youtu.be":
        candidato = caminho[0] if caminho else None
    elif caminho and caminho[0] in ("embed", "shorts", "live", "v") and len(caminho) > 1:
        candidato = caminho[1]
    else:
        candidato = (parse_qs(partes.query).get("v") or [None])[0]
    return candidato if candidato and _YOUTUBE_ID.match(candidato) else None


def fonte_do_link(url: Optional[str]) -> Optional[str]:
    """`youtube`, `drive` ou `link` (site comum); None sem endereço."""
    if not url:
        return None
    try:
        host = _host(url)
    except ValueError:
        return FONTE_LINK
    if host in _YOUTUBE_HOSTS:
        return FONTE_YOUTUBE
    if host in _DRIVE_HOSTS:
        return FONTE_DRIVE
    return FONTE_LINK


def limpar_titulo_material(valor: Optional[str]) -> str:
    titulo = limpar_titulo(valor)
    if not titulo or len(titulo) > TITULO_MAX:
        raise ValidationError(MSG_TITULO)
    return titulo


def limpar_categoria(valor: Optional[str]) -> str:
    """Categoria numa linha; vazia vira "Estudos"."""
    categoria = limpar_titulo(valor)
    if len(categoria) > CATEGORIA_MAX:
        raise ValidationError(MSG_CATEGORIA)
    return categoria or CATEGORIA_PADRAO


def limpar_texto_material(valor: Optional[str]) -> Optional[str]:
    texto = limpar_corpo(valor)
    if len(texto) > TEXTO_MAX:
        raise ValidationError(MSG_TEXTO_LONGO)
    return texto or None


def validar_conteudo(tipo: str, url: Optional[str], texto: Optional[str]) -> None:
    """Cada tipo com o que ele precisa (url e texto já limpos)."""
    if tipo == MaterialTipo.LINK.value and not url:
        raise ValidationError(MSG_URL_OBRIGATORIA)
    if tipo == MaterialTipo.TEXTO.value and not texto:
        raise ValidationError(MSG_TEXTO_OBRIGATORIO)
    if tipo == MaterialTipo.PONTO.value and not texto:
        raise ValidationError(MSG_LETRA_OBRIGATORIA)
