"""BR Code estático do PIX (AM-10) contra o Manual de Padrões para Iniciação do Pix (BCB v2.10.0).

Os três payloads abaixo são os exemplos publicados no manual (§2.6.3 estático, §2.7.2
dinâmico e §2.8.5 composto com valor); o CRC16 deles confere a implementação.
"""
import uuid
from datetime import date
from decimal import Decimal

import pytest

from src.services.pix_brcode import build_static_brcode, crc16_ccitt, txid_mensalidade

# Exemplo do manual, §2.6.3 (chave aleatória, sem valor, txid ***).
MANUAL_ESTATICO = (
    "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000"
    "5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D"
)
# §2.7.2 (dinâmico) e §2.8.5 (composto, com valor 100.50) — só para o CRC.
MANUAL_DINAMICO = (
    "00020101021226700014br.gov.bcb.pix2548pix.example.com/8b3da2f39a4140d1a91abd93113bd441"
    "5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***630464E4"
)
MANUAL_COMPOSTO = (
    "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000"
    "5204000053039865406100.505802BR5913Fulano de Tal6008BRASILIA62070503***"
    "80740014br.gov.bcb.pix2552pix.example.com/rec/2353c790eefb11eaadc10242ac120002"
    "63042875"
)
EVP = "123e4567-e12b-12d1-a456-426655440000"


def _tlv_fields(payload: str) -> dict:
    """Lê o nível de cima do TLV (ID → valor)."""
    out, i = {}, 0
    while i < len(payload):
        tag, size = payload[i : i + 2], int(payload[i + 2 : i + 4])
        out[tag] = payload[i + 4 : i + 4 + size]
        i += 4 + size
    return out


@pytest.mark.parametrize("payload", [MANUAL_ESTATICO, MANUAL_DINAMICO, MANUAL_COMPOSTO])
def test_crc_bate_com_os_exemplos_do_manual(payload):
    assert crc16_ccitt(payload[:-4]) == payload[-4:]


def test_crc_ccitt_false_vetor_padrao():
    # Vetor de verificação do CRC-16/CCITT-FALSE.
    assert crc16_ccitt("123456789") == "29B1"


def test_monta_o_exemplo_do_manual():
    """Mesmos dados do §2.6.3; o nome sai em maiúsculas (ASCII), o resto é idêntico."""
    payload = build_static_brcode(EVP, "Fulano de Tal", "Brasília")
    esperado_sem_crc = MANUAL_ESTATICO[:-4].replace("Fulano de Tal", "FULANO DE TAL")
    assert payload[:-4] == esperado_sem_crc
    assert payload[-4:] == crc16_ccitt(esperado_sem_crc)


def test_campos_com_valor_e_txid():
    payload = build_static_brcode("12345678909", "Casa de Oxala", "Sao Paulo", valor=Decimal("85"), txid="MENS202610ABCDEF0123")
    f = _tlv_fields(payload)
    assert f["00"] == "01"
    assert f["26"] == "0014br.gov.bcb.pix" + "0111" + "12345678909"
    assert f["52"] == "0000"
    assert f["53"] == "986"
    assert f["54"] == "85.00"
    assert f["58"] == "BR"
    assert f["59"] == "CASA DE OXALA"
    assert f["60"] == "SAO PAULO"
    assert f["62"] == "0520MENS202610ABCDEF0123"
    assert payload[-8:-4] == "6304"
    assert crc16_ccitt(payload[:-4]) == f["63"]
    # A ordem dos campos é a do manual (o CRC depende dela).
    assert list(f) == ["00", "26", "52", "53", "54", "58", "59", "60", "62", "63"]


@pytest.mark.parametrize("valor, esperado", [(10, "10.00"), (Decimal("99.999"), "100.00"), ("0.5", "0.50"), (1234.5, "1234.50")])
def test_valor_com_duas_casas(valor, esperado):
    assert _tlv_fields(build_static_brcode(EVP, "X", "Y", valor=valor))["54"] == esperado


@pytest.mark.parametrize("valor", [0, -1, Decimal("0.004")])
def test_valor_zero_ou_negativo_recusa(valor):
    with pytest.raises(ValueError):
        build_static_brcode(EVP, "X", "Y", valor=valor)


def test_valor_grande_demais_recusa():
    with pytest.raises(ValueError):
        build_static_brcode(EVP, "X", "Y", valor=Decimal("12345678901.00"))


def test_sem_valor_nao_tem_campo_54():
    assert "54" not in _tlv_fields(build_static_brcode(EVP, "X", "Y"))


def test_nome_e_cidade_sem_acento_e_cortados_no_limite():
    payload = build_static_brcode(
        EVP, "Tenda Espírita Caboclo Ubirajara e Pai João", "São José dos Campos"
    )
    f = _tlv_fields(payload)
    assert f["59"] == "TENDA ESPIRITA CABOCLO UB"
    assert len(f["59"]) == 25
    assert f["60"] == "SAO JOSE DOS CA"
    assert len(f["60"]) == 15
    payload.encode("ascii")  # nada fora do ASCII


def test_nome_ou_cidade_vazios_recusam():
    with pytest.raises(ValueError):
        build_static_brcode(EVP, "   ", "Rio")
    with pytest.raises(ValueError):
        build_static_brcode(EVP, "Casa", "  ")


@pytest.mark.parametrize("txid", ["", "MENS-2026", "a" * 26, "mês2026"])
def test_txid_invalido_recusa(txid):
    with pytest.raises(ValueError):
        build_static_brcode(EVP, "X", "Y", txid=txid)


def test_txid_de_25_caracteres_passa():
    assert _tlv_fields(build_static_brcode(EVP, "X", "Y", txid="A" * 25))["62"] == "0525" + "A" * 25


def test_descricao_cabe_no_template_26():
    payload = build_static_brcode("fulano@example.com", "X", "Y", descricao="Mensalidade de outubro – Médiuns da casa " * 3)
    conta = _tlv_fields(payload)["26"]
    assert len(conta) <= 99
    assert conta.startswith("0014br.gov.bcb.pix0118fulano@example.com02")
    conta.encode("ascii")


def test_chave_longa_demais_recusa():
    with pytest.raises(ValueError):
        build_static_brcode("a" * 78, "X", "Y")


def test_txid_mensalidade():
    medium_id = uuid.UUID("0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0")
    txid = txid_mensalidade(date(2026, 10, 1), medium_id)
    assert txid == "MENS2026100F1E2D3C4B"
    assert len(txid) == 20 and txid.isalnum()
