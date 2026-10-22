"""Valor em reais por extenso, para recibos ("cento e cinquenta reais e vinte centavos")."""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

_UNIDADES = (
    "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
    "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
)
_DEZENAS = ("", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa")
_CENTENAS = (
    "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
    "seiscentos", "setecentos", "oitocentos", "novecentos",
)


def _ate_mil(n: int) -> str:
    """0 < n < 1000."""
    if n == 100:
        return "cem"
    c, resto = divmod(n, 100)
    partes = []
    if c:
        partes.append(_CENTENAS[c])
    if resto:
        if resto < 20:
            partes.append(_UNIDADES[resto])
        else:
            d, u = divmod(resto, 10)
            partes.append(_DEZENAS[d] + (f" e {_UNIDADES[u]}" if u else ""))
    return " e ".join(partes)


def _inteiro(n: int) -> str:
    if n == 0:
        return "zero"
    grupos = []  # (valor, escala singular, escala plural)
    escalas = (("", ""), ("mil", "mil"), ("milhão", "milhões"), ("bilhão", "bilhões"))
    i = 0
    while n:
        n, g = divmod(n, 1000)
        grupos.append((g, *escalas[i]))
        i += 1
    nao_zero = [(g, sing, plur) for g, sing, plur in reversed(grupos) if g]
    texto = ""
    for i, (g, sing, plur) in enumerate(nao_zero):
        if sing == "mil":
            parte = "mil" if g == 1 else f"{_ate_mil(g)} mil"
        elif sing:
            parte = f"{_ate_mil(g)} {sing if g == 1 else plur}"
        else:
            parte = _ate_mil(g)
        if texto:
            # Só antes do último grupo, e se ele for < 100 ou centena redonda:
            # "mil e duzentos", "dois mil e cinco", mas "mil duzentos e trinta".
            ultimo = i == len(nao_zero) - 1
            texto += " e " if ultimo and (g < 100 or g % 100 == 0) else " "
        texto += parte
    return texto


def reais_por_extenso(valor: Decimal) -> str:
    valor = Decimal(valor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if valor < 0:
        raise ValueError("valor negativo")
    reais = int(valor)
    centavos = int((valor - reais) * 100)
    partes = []
    if reais:
        sufixo = "real" if reais == 1 else "reais"
        # "um milhão de reais", "dois milhões de reais"
        if reais % 1_000_000 == 0:
            sufixo = "de " + sufixo
        partes.append(f"{_inteiro(reais)} {sufixo}")
    if centavos:
        partes.append(f"{_inteiro(centavos)} {'centavo' if centavos == 1 else 'centavos'}")
    if not partes:
        return "zero real"
    return " e ".join(partes)
