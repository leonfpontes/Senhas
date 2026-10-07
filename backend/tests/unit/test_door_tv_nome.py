"""T-04 — nome reduzido do modo TV, calculado no servidor (mesma regra do antigo
`nomeParaTv` do frontend)."""
import pytest

from src.api.v1.admin.door_control import nome_para_tv


@pytest.mark.parametrize(
    "nome,esperado",
    [
        ("Maria da Silva", "Maria S."),
        ("  maria   silva  ", "maria S."),
        ("Bento", "Bento"),
        ("Ana Lúcia de Oliveira écio", "Ana É."),
        ("", None),
        ("   ", None),
        (None, None),
    ],
)
def test_nome_para_tv(nome, esperado):
    assert nome_para_tv(nome) == esperado
