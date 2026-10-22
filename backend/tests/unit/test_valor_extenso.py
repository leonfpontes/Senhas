from decimal import Decimal

import pytest

from src.services.valor_extenso import reais_por_extenso


@pytest.mark.parametrize(
    "valor, esperado",
    [
        ("1", "um real"),
        ("0.01", "um centavo"),
        ("0.50", "cinquenta centavos"),
        ("100", "cem reais"),
        ("101", "cento e um reais"),
        ("150.20", "cento e cinquenta reais e vinte centavos"),
        ("1000", "mil reais"),
        ("1200", "mil e duzentos reais"),
        ("1230", "mil duzentos e trinta reais"),
        ("2005", "dois mil e cinco reais"),
        ("21999.99", "vinte e um mil novecentos e noventa e nove reais e noventa e nove centavos"),
        ("1000000", "um milhão de reais"),
        ("2500300", "dois milhões quinhentos mil e trezentos reais"),
    ],
)
def test_reais_por_extenso(valor, esperado):
    assert reais_por_extenso(Decimal(valor)) == esperado
