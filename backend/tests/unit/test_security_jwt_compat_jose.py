"""Compatibilidade de tokens emitidos no formato do python-jose (item Q-06, lote 1).

O backend trocou python-jose (CVE-2024-33663/33664) por PyJWT. Tokens emitidos
antes do deploy (access de 24h, refresh de 30 dias) precisam continuar
validando depois dele — senão todo mundo é deslogado de uma vez.

Os tokens "GOLDEN" abaixo foram gerados UMA vez com python-jose==3.3.0
(`jose.jwt.encode(payload, SEGREDO, algorithm="HS256")`) num venv descartável,
a partir dos payloads literais de `_PAYLOADS`, no mesmo formato que
`src/security/jwt.py` emitia na era jose. O segredo é fixo e só de teste.

Além disso, `_assinar_na_mao` monta um JWT HS256 só com a stdlib (base64url +
hmac/sha256), sem biblioteca JWT nenhuma — prova que o decode depende só do
formato padrão (RFC 7519), não de detalhe de implementação.

T-02: os access tokens da era jose não têm claim `type`. A janela de
compatibilidade que ainda os aceitava acabou em 2026-10-09 (corte 2026-10-08 +
24h de TTL) e foi removida: hoje `decode_token` é allowlist pura e os recusa.
O refresh da era jose já tinha `type: refresh` e segue valendo.
"""
import base64
import hashlib
import hmac
import json
from unittest.mock import patch

import jwt  # PyJWT
import pytest

from src.core.config import settings
from src.core.errors import InvalidTokenError
from src.security.jwt import decode_refresh_token, decode_token

SEGREDO_TESTE = "chave-de-teste-compat-jose-nao-e-segredo-0123456789"

USER = "11111111-1111-1111-1111-111111111111"
TENANT = "22222222-2222-2222-2222-222222222222"
SUPER = "33333333-3333-3333-3333-333333333333"
SESSION = "44444444-4444-4444-4444-444444444444"
JTI = "55555555-5555-5555-5555-555555555555"
IAT = 1790856000  # 2026-10-01T12:00:00Z
EXP = 4070908800  # 2099-01-01T00:00:00Z

# Payloads no formato antigo: exatamente as claims que create_access_token /
# create_refresh_token gravavam com o jose (exp/iat viram inteiros epoch).
_PAYLOADS = {
    "access": {"sub": USER, "tenant_id": TENANT, "role": "admin", "exp": EXP, "iat": IAT},
    "impersonation": {
        "sub": USER, "tenant_id": TENANT, "role": "admin", "exp": EXP, "iat": IAT,
        "impersonated_by": SUPER,
    },
    "super_admin": {"sub": SUPER, "tenant_id": None, "role": "super_admin", "exp": EXP, "iat": IAT},
    "refresh": {
        "sub": USER, "tenant_id": TENANT, "role": "admin", "exp": EXP, "iat": IAT,
        "type": "refresh", "session_id": SESSION, "jti": JTI,
    },
    "expired": {"sub": USER, "tenant_id": TENANT, "role": "admin", "exp": IAT + 3600, "iat": IAT},
}

# Saída literal de python-jose==3.3.0 para cada payload acima.
GOLDEN = {
    "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJ0ZW5hbnRfaWQiOiIyMjIyMjIyMi0yMjIyLTIyMjItMjIyMi0yMjIyMjIyMjIyMjIiLCJyb2xlIjoiYWRtaW4iLCJleHAiOjQwNzA5MDg4MDAsImlhdCI6MTc5MDg1NjAwMH0.jf_Etq4J_h8KhNiA0nfLfvi9TKYYn4YVWL4tFzQdGkQ",
    "impersonation": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJ0ZW5hbnRfaWQiOiIyMjIyMjIyMi0yMjIyLTIyMjItMjIyMi0yMjIyMjIyMjIyMjIiLCJyb2xlIjoiYWRtaW4iLCJleHAiOjQwNzA5MDg4MDAsImlhdCI6MTc5MDg1NjAwMCwiaW1wZXJzb25hdGVkX2J5IjoiMzMzMzMzMzMtMzMzMy0zMzMzLTMzMzMtMzMzMzMzMzMzMzMzIn0._OPhVwcvqasrArrNU1TI4gqODoI0PCD6KVds8W-LyH0",
    "super_admin": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzMzMzMzMzMy0zMzMzLTMzMzMtMzMzMy0zMzMzMzMzMzMzMzMiLCJ0ZW5hbnRfaWQiOm51bGwsInJvbGUiOiJzdXBlcl9hZG1pbiIsImV4cCI6NDA3MDkwODgwMCwiaWF0IjoxNzkwODU2MDAwfQ.zhjsZvscgFvzBcYIODHTXNhJsZAKo6s6s_PYY8SLGlo",
    "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJ0ZW5hbnRfaWQiOiIyMjIyMjIyMi0yMjIyLTIyMjItMjIyMi0yMjIyMjIyMjIyMjIiLCJyb2xlIjoiYWRtaW4iLCJleHAiOjQwNzA5MDg4MDAsImlhdCI6MTc5MDg1NjAwMCwidHlwZSI6InJlZnJlc2giLCJzZXNzaW9uX2lkIjoiNDQ0NDQ0NDQtNDQ0NC00NDQ0LTQ0NDQtNDQ0NDQ0NDQ0NDQ0IiwianRpIjoiNTU1NTU1NTUtNTU1NS01NTU1LTU1NTUtNTU1NTU1NTU1NTU1In0.pu1kUJBNEMz7f_Q7fx50ApiA91KLtzfLP-G8QOj-iok",
    "expired": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJ0ZW5hbnRfaWQiOiIyMjIyMjIyMi0yMjIyLTIyMjItMjIyMi0yMjIyMjIyMjIyMjIiLCJyb2xlIjoiYWRtaW4iLCJleHAiOjE3OTA4NTk2MDAsImlhdCI6MTc5MDg1NjAwMH0.3rmzzLJ1F8uZF_vIhxkC02AGhbone-WiLzwqJfMwbdk",
}


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _assinar_na_mao(payload: dict, segredo: str = SEGREDO_TESTE) -> str:
    """JWT HS256 montado sem biblioteca JWT (header igual ao do jose)."""
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    corpo = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    assinatura = hmac.new(segredo.encode(), f"{header}.{corpo}".encode(), hashlib.sha256).digest()
    return f"{header}.{corpo}.{_b64url(assinatura)}"


@pytest.fixture(autouse=True)
def segredo_fixo():
    with patch.object(settings, "SECRET_KEY", SEGREDO_TESTE), patch.object(settings, "ALGORITHM", "HS256"):
        yield


def test_pyjwt_emite_bytes_identicos_ao_jose():
    """Mesmo payload + mesmo segredo => mesma string que o jose gerava."""
    for nome, payload in _PAYLOADS.items():
        assert jwt.encode(payload, SEGREDO_TESTE, algorithm="HS256") == GOLDEN[nome], nome
        assert _assinar_na_mao(payload) == GOLDEN[nome], nome


@pytest.mark.parametrize("origem", ["jose", "stdlib"])
def test_access_token_antigo_sem_type_e_recusado(origem):
    """T-02: access da era jose (sem `type`) não autentica mais, mesmo com a
    assinatura certa e `exp` em 2099 — allowlist estrita."""
    token = GOLDEN["access"] if origem == "jose" else _assinar_na_mao(_PAYLOADS["access"])
    with pytest.raises(InvalidTokenError, match="tipo de token ausente"):
        decode_token(token)


@pytest.mark.parametrize("nome", ["impersonation", "super_admin"])
def test_impersonacao_e_super_admin_antigos_sem_type_sao_recusados(nome):
    with pytest.raises(InvalidTokenError, match="tipo de token ausente"):
        decode_token(GOLDEN[nome])


def test_refresh_token_antigo_continua_valido():
    p = decode_refresh_token(GOLDEN["refresh"])
    assert p.sub == USER
    assert p.tenant_id == TENANT
    assert p.session_id == SESSION
    assert p.jti == JTI


def test_refresh_antigo_rejeitado_como_access_e_vice_versa():
    with pytest.raises(InvalidTokenError, match="refresh token"):
        decode_token(GOLDEN["refresh"])
    with pytest.raises(InvalidTokenError, match="não é um refresh token"):
        decode_refresh_token(GOLDEN["access"])


def test_token_antigo_expirado_e_rejeitado():
    with pytest.raises(InvalidTokenError, match="Token inválido"):
        decode_token(GOLDEN["expired"])
    with pytest.raises(InvalidTokenError, match="Refresh token inválido"):
        decode_refresh_token(GOLDEN["expired"])


def test_token_antigo_com_outro_segredo_e_rejeitado():
    forjado = _assinar_na_mao(_PAYLOADS["access"], segredo="outro-segredo-qualquer-0123456789abcdef")
    with pytest.raises(InvalidTokenError, match="Token inválido"):
        decode_token(forjado)


def test_token_antigo_adulterado_e_rejeitado():
    header, _corpo, assinatura = GOLDEN["access"].split(".")
    corpo_adulterado = _b64url(json.dumps({**_PAYLOADS["access"], "role": "super_admin"}, separators=(",", ":")).encode())
    with pytest.raises(InvalidTokenError, match="Token inválido"):
        decode_token(f"{header}.{corpo_adulterado}.{assinatura}")
