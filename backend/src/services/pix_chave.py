"""Chave PIX do terreiro: validação, normalização e máscara (AM-10).

Funções puras, sem banco. A chave é gravada já no formato do DICT, que é o mesmo
que vai no BR Code (Manual de Padrões para Iniciação do Pix, BCB, v2.10.0, §2.5.1):

- CPF: 11 dígitos, sem pontuação (``12345678909``), com dígito verificador;
- CNPJ: 14 caracteres sem pontuação, numérico ou alfanumérico (CNPJ com letras,
  Receita Federal a partir de jul/2026: ``12ABC34501DE35``), com dígito verificador;
- e-mail: minúsculo (a expressão do DICT só aceita minúsculas), até 77 caracteres;
- telefone celular: ``+55`` + DDD + 9 dígitos começando com 9 (``+5561912345678``);
- chave aleatória (EVP): UUID com hífens, minúsculo
  (``123e4567-e12b-12d1-a456-426655440000``).

`mascarar_chave` produz a versão para auditoria, e-mail e tela de quem só tem
FINANCEIRO:view — CPF é dado pessoal do titular da chave.
"""
from __future__ import annotations

import re
import unicodedata

PIX_TIPOS = ("cpf", "cnpj", "email", "telefone", "aleatoria")

PIX_TIPO_LABELS = {
    "cpf": "CPF",
    "cnpj": "CNPJ",
    "email": "E-mail",
    "telefone": "Telefone",
    "aleatoria": "Chave aleatória",
}

# Limites do BR Code (EMV 59 e 60) — a tela também avisa.
NOME_RECEBEDOR_MAX = 25
CIDADE_MAX = 15
CHAVE_MAX = 77

_EMAIL_RE = re.compile(
    r"^[a-z0-9.!#$&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$"
)
_EVP_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
_CELULAR_RE = re.compile(r"^\+55[1-9][1-9]9\d{8}$")
_CNPJ_RE = re.compile(r"^[0-9A-Z]{12}\d{2}$")


class ChavePixInvalida(ValueError):
    """Chave fora do formato do tipo escolhido (a mensagem vai para a tela)."""


def cpf_valido(cpf: str) -> bool:
    if not re.fullmatch(r"\d{11}", cpf) or cpf == cpf[0] * 11:
        return False
    nums = [int(c) for c in cpf]
    for pos in (9, 10):
        soma = sum(nums[i] * (pos + 1 - i) for i in range(pos))
        dv = (soma * 10) % 11 % 10
        if dv != nums[pos]:
            return False
    return True


def _cnpj_dv(base: str) -> int:
    # Valor de cada caractere = código ASCII − 48 (dígitos 0–9, letras A=17…Z=42);
    # pesos 2..9 da direita para a esquerda. Vale para o CNPJ numérico e o alfanumérico.
    soma = 0
    peso = 2
    for c in reversed(base):
        soma += (ord(c) - 48) * peso
        peso = 2 if peso == 9 else peso + 1
    resto = soma % 11
    return 0 if resto < 2 else 11 - resto


def cnpj_valido(cnpj: str) -> bool:
    if not _CNPJ_RE.fullmatch(cnpj) or cnpj == cnpj[0] * 14:
        return False
    dv1 = _cnpj_dv(cnpj[:12])
    dv2 = _cnpj_dv(cnpj[:12] + str(dv1))
    return cnpj[12:] == f"{dv1}{dv2}"


def normalizar_chave(tipo: str, valor: str) -> str:
    """Valida ``valor`` para ``tipo`` e devolve a chave no formato do DICT.

    Aceita a chave digitada com pontuação/máscara (``123.456.789-09``,
    ``(61) 91234-5678``). Levanta `ChavePixInvalida` com mensagem para a tela.
    """
    if tipo not in PIX_TIPOS:
        raise ChavePixInvalida("Tipo de chave PIX inválido.")
    bruto = (valor or "").strip()
    if not bruto:
        raise ChavePixInvalida("Informe a chave PIX.")

    if tipo == "cpf":
        chave = re.sub(r"[.\-\s]", "", bruto)
        if not cpf_valido(chave):
            raise ChavePixInvalida("CPF inválido. Confira os números.")
        return chave

    if tipo == "cnpj":
        chave = re.sub(r"[.\-/\s]", "", bruto).upper()
        if not cnpj_valido(chave):
            raise ChavePixInvalida("CNPJ inválido. Confira os números.")
        return chave

    if tipo == "email":
        chave = bruto.lower()
        if len(chave) > CHAVE_MAX or not _EMAIL_RE.fullmatch(chave):
            raise ChavePixInvalida("E-mail inválido.")
        return chave

    if tipo == "telefone":
        digitos = re.sub(r"\D", "", bruto)
        if len(digitos) == 11:  # digitado sem o +55
            digitos = "55" + digitos
        chave = "+" + digitos
        if not _CELULAR_RE.fullmatch(chave):
            raise ChavePixInvalida("Telefone inválido. Use o celular com DDD, ex.: (61) 91234-5678.")
        return chave

    # aleatoria (EVP)
    chave = bruto.lower()
    if not _EVP_RE.fullmatch(chave):
        raise ChavePixInvalida("Chave aleatória inválida. Copie a chave do app do banco, com os hífens.")
    return chave


def mascarar_chave(tipo: str | None, chave: str | None) -> str | None:
    """Versão da chave que pode ir para auditoria, e-mail e tela de quem só vê."""
    if not chave:
        return None
    if tipo == "cpf" and len(chave) == 11:
        return f"***.{chave[3:6]}.{chave[6:9]}-**"
    if tipo == "cnpj" and len(chave) == 14:
        return f"{chave[:2]}.***.***/{chave[8:12]}-**"
    if tipo == "email" and "@" in chave:
        usuario, dominio = chave.split("@", 1)
        return f"{usuario[:1]}***@{dominio}"
    if tipo == "telefone" and len(chave) >= 8:
        return f"{chave[:3]} ({chave[3:5]}) *****-{chave[-4:]}"
    if tipo == "aleatoria" and len(chave) >= 8:
        return f"{chave[:4]}…{chave[-4:]}"
    return "****"


def texto_ascii(texto: str | None) -> str:
    """Tira acentos e caracteres fora do ASCII imprimível; junta espaços."""
    if not texto:
        return ""
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    imprimivel = "".join(c for c in sem_acento if 32 <= ord(c) < 127)
    return " ".join(imprimivel.split())
