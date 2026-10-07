"""Trava: nada de ``datetime.utcnow()`` no backend.

O valor sem fuso que ele devolve é gravado pelo asyncpg em ``timestamptz`` usando o fuso LOCAL da
máquina (numa máquina em Brasília, 3 h adiantado) e comparar com coluna aware levanta TypeError.
Use ``src.core.tz.utc_now()``.
"""
import re
from pathlib import Path

SRC = Path(__file__).resolve().parents[2] / "src"
UTCNOW = re.compile(r"\butcnow\(\)")


def test_src_nao_usa_utcnow():
    ofensores = []
    for path in SRC.rglob("*.py"):
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            code = line.split("#", 1)[0]
            # Docstrings que só citam o nome entre crases não contam.
            if UTCNOW.search(code) and "``" not in code:
                ofensores.append(f"{path.relative_to(SRC.parent)}:{n}: {line.strip()}")
    assert not ofensores, "Use src.core.tz.utc_now() em vez de datetime.utcnow():\n" + "\n".join(ofensores)


def test_utc_now_tem_fuso():
    from src.core.tz import utc_now

    agora = utc_now()
    assert agora.tzinfo is not None
    assert agora.utcoffset().total_seconds() == 0
