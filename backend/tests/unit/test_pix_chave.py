"""Chave PIX do terreiro (AM-10): validação por tipo, formato do DICT e máscara.

Exemplos de formato do Manual de Padrões para Iniciação do Pix (BCB v2.10.0, §2.5.1).
Nenhuma chave real: CPFs/CNPJs de teste conhecidos e domínios example.com.
"""
import pytest

from src.services.pix_chave import (
    ChavePixInvalida,
    cnpj_valido,
    cpf_valido,
    mascarar_chave,
    normalizar_chave,
    texto_ascii,
)


@pytest.mark.parametrize("cpf", ["12345678909", "52998224725"])
def test_cpf_valido(cpf):
    assert cpf_valido(cpf)


@pytest.mark.parametrize("cpf", ["12345678900", "11111111111", "1234567890", "abcdefghijk"])
def test_cpf_invalido(cpf):
    assert not cpf_valido(cpf)


@pytest.mark.parametrize("cnpj", ["11222333000181", "00038166000105", "12ABC34501DE35"])
def test_cnpj_valido_numerico_e_alfanumerico(cnpj):
    # 00038166000105 e 12ABC34501DE35 são os exemplos do manual (o 2º é o CNPJ com letras).
    assert cnpj_valido(cnpj)


@pytest.mark.parametrize("cnpj", ["11222333000182", "00000000000000", "12ABC34501DE36", "1122233300018"])
def test_cnpj_invalido(cnpj):
    assert not cnpj_valido(cnpj)


@pytest.mark.parametrize(
    "tipo, digitado, chave",
    [
        ("cpf", "123.456.789-09", "12345678909"),
        ("cnpj", "11.222.333/0001-81", "11222333000181"),
        ("cnpj", "12.abc.345/01de-35", "12ABC34501DE35"),
        ("email", "  Fulano_da_Silva.Recebedor@Example.com ", "fulano_da_silva.recebedor@example.com"),
        ("telefone", "(61) 91234-5678", "+5561912345678"),
        ("telefone", "+55 61 91234-5678", "+5561912345678"),
        ("aleatoria", "123E4567-E12B-12D1-A456-426655440000", "123e4567-e12b-12d1-a456-426655440000"),
    ],
)
def test_normaliza_no_formato_do_dict(tipo, digitado, chave):
    assert normalizar_chave(tipo, digitado) == chave


@pytest.mark.parametrize(
    "tipo, digitado",
    [
        ("cpf", "123.456.789-00"),
        ("cpf", "fulano@example.com"),
        ("cnpj", "11.222.333/0001-82"),
        ("email", "sem-arroba.example.com"),
        ("email", "fulano@localhost"),
        ("email", "a" * 70 + "@example.com"),
        ("telefone", "(61) 3123-4567"),  # fixo não é chave
        ("telefone", "+1 202 555 0100"),
        ("telefone", "(01) 91234-5678"),
        ("aleatoria", "123e4567e12b12d1a456426655440000"),  # sem hífens
        ("aleatoria", "não-é-uuid"),
        ("pix", "qualquer"),
        ("cpf", "   "),
    ],
)
def test_chave_invalida_recusa(tipo, digitado):
    with pytest.raises(ChavePixInvalida):
        normalizar_chave(tipo, digitado)


@pytest.mark.parametrize(
    "tipo, chave, mascara",
    [
        ("cpf", "12345678909", "***.456.789-**"),
        ("cnpj", "11222333000181", "11.***.***/0001-**"),
        ("email", "fulano@example.com", "f***@example.com"),
        ("telefone", "+5561912345678", "+55 (61) *****-5678"),
        ("aleatoria", "123e4567-e12b-12d1-a456-426655440000", "123e…0000"),
    ],
)
def test_mascara_nao_expoe_a_chave_inteira(tipo, chave, mascara):
    assert mascarar_chave(tipo, chave) == mascara
    assert chave not in mascara


def test_mascara_sem_chave():
    assert mascarar_chave(None, None) is None
    assert mascarar_chave("cpf", "") is None


def test_texto_ascii():
    assert texto_ascii("  São   João  d'Ávila  ") == "Sao Joao d'Avila"
    assert texto_ascii("Ação 🙏") == "Acao"
    assert texto_ascii(None) == ""
