"""Sentinela para "campo não enviado" (diferente de ``None`` = "limpar o campo")."""
from __future__ import annotations


class _Unset:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __repr__(self) -> str:  # pragma: no cover - só para depuração
        return "UNSET"

    def __bool__(self) -> bool:
        return False


UNSET = _Unset()
