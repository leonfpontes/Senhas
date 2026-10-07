"""Versões dos documentos legais: o backend grava no aceite a mesma versão que /termos e
/privacidade mostram (LEGAL_VERSIONS de frontend/src/constants/legal.ts)."""
import re
from pathlib import Path

from src.core.legal_versions import DOCUMENTOS_DO_CADASTRO, LEGAL_VERSIONS

FRONT_LEGAL = Path(__file__).resolve().parents[3] / "frontend" / "src" / "constants" / "legal.ts"


def _versoes_do_frontend() -> dict[str, str]:
    texto = FRONT_LEGAL.read_text(encoding="utf-8")
    return dict(re.findall(r"(\w+):\s*\{\s*version:\s*'([^']+)'", texto))


def test_versoes_espelham_o_frontend():
    front = _versoes_do_frontend()
    for documento in DOCUMENTOS_DO_CADASTRO:
        assert LEGAL_VERSIONS[documento] == front[documento], (
            f"Versão de '{documento}' diverge: backend {LEGAL_VERSIONS[documento]} × frontend {front[documento]}. "
            "Suba nos dois: src/core/legal_versions.py e frontend/src/constants/legal.ts."
        )


def test_cadastro_aceita_termos_e_privacidade():
    assert set(DOCUMENTOS_DO_CADASTRO) == {"termos", "privacidade"}
