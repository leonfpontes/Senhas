"""Segredo em repouso (F-02): cifra credenciais de terceiros antes de gravar no banco.

Uso típico: token OAuth do Mercado Pago de cada terreiro (`mensalidade_gateways.mp_*_enc`).
O Stripe Connect guarda só o id da conta conectada (não é segredo) e não passa por aqui.

- Algoritmo: Fernet (AES-128-CBC + HMAC-SHA256, com timestamp), da biblioteca `cryptography`.
- Chave: `SECRETS_ENCRYPTION_KEY` (32 bytes em base64 url-safe). Gerar com
  ``python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"``.
  Várias chaves separadas por vírgula = rotação: a PRIMEIRA cifra, todas decifram
  (`MultiFernet`). Para trocar: ponha a nova na frente, rode o recifrar (``rotate``) e depois
  tire a antiga.
- Sem chave (ou chave inválida), **nada é gravado**: `encrypt` levanta `SecretBoxIndisponivel`
  e quem chama esconde a opção (ex.: o botão "Mercado Pago" não aparece). Nunca há fallback
  para texto puro.
- Nunca logar o texto puro nem o token cifrado.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Optional

from src.core.config import settings

logger = logging.getLogger(__name__)


class SecretBoxIndisponivel(RuntimeError):
    """`SECRETS_ENCRYPTION_KEY` ausente ou inválida: o segredo não pode ser gravado/lido."""


class SegredoInvalido(ValueError):
    """O texto cifrado não abre com nenhuma das chaves (adulterado ou chave trocada)."""


@lru_cache(maxsize=4)
def _caixa(raw_keys: str):
    from cryptography.fernet import Fernet, MultiFernet

    chaves = [k.strip() for k in (raw_keys or "").split(",") if k.strip()]
    if not chaves:
        return None
    try:
        return MultiFernet([Fernet(k.encode()) for k in chaves])
    except (ValueError, TypeError):
        logger.error("SECRETS_ENCRYPTION_KEY inválida: segredos em repouso desligados.")
        return None


def _box(raw_keys: Optional[str] = None):
    return _caixa(settings.SECRETS_ENCRYPTION_KEY if raw_keys is None else raw_keys)


def disponivel() -> bool:
    """Há chave válida configurada (as opções que guardam segredo podem aparecer)."""
    return _box() is not None


def encrypt(texto: str) -> str:
    """Cifra `texto`. Sem chave válida → `SecretBoxIndisponivel` (nunca grava em claro)."""
    box = _box()
    if box is None:
        raise SecretBoxIndisponivel("SECRETS_ENCRYPTION_KEY não configurada: segredo não gravado.")
    if not isinstance(texto, str) or not texto:
        raise ValueError("Segredo vazio.")
    return box.encrypt(texto.encode("utf-8")).decode("ascii")


def decrypt(token: str) -> str:
    """Decifra o que `encrypt` gerou. Sem chave → `SecretBoxIndisponivel`; adulterado → `SegredoInvalido`."""
    from cryptography.fernet import InvalidToken

    box = _box()
    if box is None:
        raise SecretBoxIndisponivel("SECRETS_ENCRYPTION_KEY não configurada: segredo indisponível.")
    try:
        return box.decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, AttributeError, UnicodeError) as exc:
        raise SegredoInvalido("Segredo não abre com a chave configurada.") from exc


def rotate(token: str) -> str:
    """Recifra com a primeira chave (rotação de `SECRETS_ENCRYPTION_KEY`)."""
    box = _box()
    if box is None:
        raise SecretBoxIndisponivel("SECRETS_ENCRYPTION_KEY não configurada.")
    return box.rotate(token.encode("ascii")).decode("ascii")
