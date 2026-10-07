"""BR Code estático do PIX ("PIX copia e cola") — função pura (AM-10).

Fonte: *Manual de Padrões para Iniciação do Pix*, Banco Central do Brasil,
versão 2.10.0, §2.5 a §2.6 (QR Code estático), que segue o EMV® QRCPS-MPM
(Merchant Presented Mode). Cada campo é TLV: ID (2) + tamanho (2) + valor.

    00 Payload Format Indicator   "01"
    26 Merchant Account Information (≤ 99)
       00 GUI                     "br.gov.bcb.pix"
       01 chave                   chave no formato do DICT (services/pix_chave.py)
       02 infoAdicional           texto livre opcional (disputa os 99 com a chave)
    52 Merchant Category Code     "0000"
    53 Transaction Currency       "986" (R$)
    54 Transaction Amount         opcional, "123.45" (até 13 caracteres)
    58 Country Code               "BR"
    59 Merchant Name              ≤ 25 (o app do banco mostra o nome do DICT, não este)
    60 Merchant City              ≤ 15
    62 Additional Data Field
       05 Reference Label (txid)  ≤ 25, só [A-Za-z0-9]; "***" quando não há txid
    63 CRC16                      CRC16-CCITT-FALSE (polinômio 0x1021, inicial
                                  0xFFFF) sobre o payload inteiro incluindo "6304",
                                  4 dígitos hexadecimais maiúsculos

Exemplo do manual (§2.6.3), usado nos testes:
``00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D``

Nome e cidade saem sem acento e em maiúsculas (ASCII): o tamanho do campo EMV é
contado em caracteres e alguns apps recusam UTF-8 nesses campos. O ID 01 (Point
of Initiation Method) é omitido: no QR estático ele é opcional ("11" = reutilizável).
"""
from __future__ import annotations

import re
import uuid
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional, Union

from .pix_chave import CIDADE_MAX, NOME_RECEBEDOR_MAX, texto_ascii

GUI_PIX = "br.gov.bcb.pix"
TXID_MAX = 25
_TXID_RE = re.compile(r"^[A-Za-z0-9]{1,25}$")
_MAI_MAX = 99  # tamanho máximo do valor do template 26 (EMV)
_VALOR_MAX_LEN = 13


def crc16_ccitt(payload: str) -> str:
    """CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF, sem reflexão, sem xor final)."""
    crc = 0xFFFF
    for byte in payload.encode("utf-8"):
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if crc & 0x8000 else (crc << 1)
            crc &= 0xFFFF
    return f"{crc:04X}"


def _tlv(campo: str, valor: str) -> str:
    if len(valor) > 99:
        raise ValueError(f"Campo {campo} com {len(valor)} caracteres (máximo 99).")
    return f"{campo}{len(valor):02d}{valor}"


def _formatar_valor(valor: Union[Decimal, float, int, str]) -> str:
    d = Decimal(str(valor)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if d <= 0:
        raise ValueError("O valor do PIX precisa ser maior que zero.")
    texto = f"{d:.2f}"
    if len(texto) > _VALOR_MAX_LEN:
        raise ValueError("Valor do PIX grande demais para o BR Code.")
    return texto


def txid_mensalidade(mes: date, medium_id: uuid.UUID) -> str:
    """txid de 20 caracteres que identifica o mês e o médium: ``MENS`` + AAAAMM + 10 hex do id.

    Só letras e dígitos (regra do txid no QR estático, §2.6.2). O id inteiro não
    cabe (25 no máximo); 10 hex bastam para o terreiro achar o médium no extrato.
    """
    return f"MENS{mes.year:04d}{mes.month:02d}{medium_id.hex[:10].upper()}"


def build_static_brcode(
    chave: str,
    nome_recebedor: str,
    cidade: str,
    valor: Optional[Union[Decimal, float, int, str]] = None,
    txid: Optional[str] = None,
    descricao: Optional[str] = None,
) -> str:
    """Monta o "PIX copia e cola" estático.

    - ``chave``: já normalizada (`pix_chave.normalizar_chave`);
    - ``nome_recebedor``/``cidade``: sem acento, maiúsculas, cortados em 25/15;
    - ``valor``: opcional; sem ele o pagador digita o valor no app;
    - ``txid``: até 25 letras/dígitos; sem ele vai ``***``;
    - ``descricao``: texto livre (26-02), sem acento, cortado no espaço que a
      chave deixa no template 26.
    """
    chave = (chave or "").strip()
    if not chave:
        raise ValueError("Chave PIX obrigatória.")
    nome = texto_ascii(nome_recebedor).upper()[:NOME_RECEBEDOR_MAX].strip()
    cid = texto_ascii(cidade).upper()[:CIDADE_MAX].strip()
    if not nome:
        raise ValueError("Nome do recebedor obrigatório.")
    if not cid:
        raise ValueError("Cidade do recebedor obrigatória.")
    if txid is not None and not _TXID_RE.fullmatch(txid):
        raise ValueError("txid aceita só letras e números, até 25 caracteres.")

    conta = _tlv("00", GUI_PIX) + _tlv("01", chave)
    if len(conta) > _MAI_MAX:
        raise ValueError("Chave PIX longa demais para o BR Code.")
    espaco = _MAI_MAX - len(conta) - 4  # ID + tamanho do 02
    desc = texto_ascii(descricao)[: max(espaco, 0)].strip()
    if desc:
        conta += _tlv("02", desc)

    payload = (
        _tlv("00", "01")
        + _tlv("26", conta)
        + _tlv("52", "0000")
        + _tlv("53", "986")
        + (_tlv("54", _formatar_valor(valor)) if valor is not None else "")
        + _tlv("58", "BR")
        + _tlv("59", nome)
        + _tlv("60", cid)
        + _tlv("62", _tlv("05", txid or "***"))
        + "6304"
    )
    return payload + crc16_ccitt(payload)
