"""F-02 — segredo em repouso (core/secret_box) e leitura dos objetos do Stripe Connect.

Sem rede: só funções puras e a cifra local. Chaves geradas no próprio teste (nenhuma chave real).
"""
from __future__ import annotations

from decimal import Decimal

import pytest
from cryptography.fernet import Fernet

from src.core import secret_box
from src.core.config import settings
from src.services import stripe_connect


@pytest.fixture
def chave(monkeypatch):
    k = Fernet.generate_key().decode()
    monkeypatch.setattr(settings, "SECRETS_ENCRYPTION_KEY", k)
    return k


def test_sem_chave_recusa_gravar_e_ler(monkeypatch):
    monkeypatch.setattr(settings, "SECRETS_ENCRYPTION_KEY", "")
    assert secret_box.disponivel() is False
    with pytest.raises(secret_box.SecretBoxIndisponivel):
        secret_box.encrypt("APP_USR-token-de-teste")
    with pytest.raises(secret_box.SecretBoxIndisponivel):
        secret_box.decrypt("qualquer")


def test_chave_invalida_vale_como_sem_chave(monkeypatch):
    monkeypatch.setattr(settings, "SECRETS_ENCRYPTION_KEY", "nao-e-uma-chave-fernet")
    assert secret_box.disponivel() is False
    with pytest.raises(secret_box.SecretBoxIndisponivel):
        secret_box.encrypt("x")


def test_cifra_e_decifra_sem_guardar_em_claro(chave):
    cifrado = secret_box.encrypt("APP_USR-token-de-teste")
    assert "APP_USR" not in cifrado
    assert secret_box.decrypt(cifrado) == "APP_USR-token-de-teste"
    # Fernet tem IV aleatório: o mesmo texto não gera o mesmo cifrado.
    assert secret_box.encrypt("APP_USR-token-de-teste") != cifrado
    with pytest.raises(ValueError):
        secret_box.encrypt("")


def test_adulterado_ou_outra_chave_nao_abre(chave, monkeypatch):
    cifrado = secret_box.encrypt("segredo")
    with pytest.raises(secret_box.SegredoInvalido):
        secret_box.decrypt(cifrado[:-4] + "AAAA")
    monkeypatch.setattr(settings, "SECRETS_ENCRYPTION_KEY", Fernet.generate_key().decode())
    with pytest.raises(secret_box.SegredoInvalido):
        secret_box.decrypt(cifrado)


def test_rotacao_nova_chave_na_frente_decifra_o_antigo(chave, monkeypatch):
    antigo = secret_box.encrypt("segredo")
    nova = Fernet.generate_key().decode()
    monkeypatch.setattr(settings, "SECRETS_ENCRYPTION_KEY", f"{nova},{chave}")
    assert secret_box.decrypt(antigo) == "segredo"
    recifrado = secret_box.rotate(antigo)
    monkeypatch.setattr(settings, "SECRETS_ENCRYPTION_KEY", nova)
    assert secret_box.decrypt(recifrado) == "segredo"


def test_estado_da_conta_conectada():
    conta = {
        "details_submitted": True,
        "charges_enabled": True,
        "capabilities": {"pix_payments": "active", "boleto_payments": "pending", "card_payments": "active"},
    }
    estado = stripe_connect.estado_da_conta(conta)
    assert estado == stripe_connect.EstadoConta(True, True, True, False)
    assert stripe_connect.estado_da_conta({}) == stripe_connect.EstadoConta(False, False, False, False)


def test_ler_cobranca_pix_e_boleto():
    pix = stripe_connect.ler_cobranca(
        {
            "id": "pi_1",
            "status": "requires_action",
            "next_action": {"pix_display_qr_code": {"data": "000201-PIX", "expires_at": 1893456000}},
        }
    )
    assert pix.copia_e_cola == "000201-PIX" and pix.expira_em.year == 2030 and pix.boleto_url is None
    boleto = stripe_connect.ler_cobranca(
        {
            "id": "pi_2",
            "status": "requires_action",
            "next_action": {
                "boleto_display_details": {
                    "number": "23790.00000 00000.000000 00000.000000 0 00000000005000",
                    "hosted_voucher_url": "https://payments.stripe.com/boleto/voucher/x",
                    "expires_at": 1893456000,
                }
            },
        }
    )
    assert boleto.boleto_linha_digitavel.startswith("23790") and boleto.copia_e_cola is None


def test_centavos_e_disponibilidade(monkeypatch):
    assert stripe_connect.centavos(Decimal("50.00")) == 5000
    assert stripe_connect.centavos(Decimal("0.505")) == 51
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_test_x")
    monkeypatch.setattr(settings, "STRIPE_CONNECT_WEBHOOK_SECRET", "")
    assert stripe_connect.disponivel() is False
    monkeypatch.setattr(settings, "STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_x")
    assert stripe_connect.disponivel() is True


def test_webhook_sem_segredo_sempre_recusa(monkeypatch):
    monkeypatch.setattr(settings, "STRIPE_CONNECT_WEBHOOK_SECRET", "")
    with pytest.raises(ValueError):
        stripe_connect.construir_evento(b"{}", "t=1,v1=abc")
