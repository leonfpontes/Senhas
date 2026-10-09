"""F-02 — Mercado Pago: assinatura do webhook, `state` do OAuth e leitura das respostas (sem rede)."""
from __future__ import annotations

import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.fernet import Fernet

from src.core.config import settings
from src.services import mercadopago

SEGREDO = "segredo-de-teste"


def _v1(manifesto: str, segredo: str = SEGREDO) -> str:
    return hmac.new(segredo.encode(), manifesto.encode(), hashlib.sha256).hexdigest()


def test_assinatura_do_webhook_confere_o_manifesto_do_mercado_pago():
    manifesto = "id:123456;request-id:abc-123;ts:1704908010;"
    header = f"ts=1704908010,v1={_v1(manifesto)}"
    assert mercadopago.assinatura_valida(header, "abc-123", "123456", SEGREDO) is True
    # Outro id, outro request-id, outro segredo ou v1 adulterado → recusa.
    assert mercadopago.assinatura_valida(header, "abc-123", "999", SEGREDO) is False
    assert mercadopago.assinatura_valida(header, "outro", "123456", SEGREDO) is False
    assert mercadopago.assinatura_valida(header, "abc-123", "123456", "outro-segredo") is False
    assert mercadopago.assinatura_valida(header[:-2] + "00", "abc-123", "123456", SEGREDO) is False
    # Sem cabeçalho, sem ts/v1 ou sem segredo configurado → recusa.
    assert mercadopago.assinatura_valida(None, "abc-123", "123456", SEGREDO) is False
    assert mercadopago.assinatura_valida("v1=abc", "abc-123", "123456", SEGREDO) is False
    assert mercadopago.assinatura_valida(header, "abc-123", "123456", "") is False


def test_assinatura_id_alfanumerico_em_minusculas_e_partes_ausentes():
    manifesto = "id:ord01jq4s4ky8hwq6na5pxb65b3d3;ts:1742505638683;"
    header = f"ts=1742505638683, v1={_v1(manifesto)}"
    assert mercadopago.assinatura_valida(header, None, "ORD01JQ4S4KY8HWQ6NA5PXB65B3D3", SEGREDO) is True


def test_state_do_oauth_vale_so_para_o_tenant_e_usuario_e_vence(monkeypatch):
    tid, uid = uuid.uuid4(), uuid.uuid4()
    state = mercadopago.criar_state(tid, uid)
    assert mercadopago.ler_state(state) == mercadopago.EstadoOAuth(tid, uid)
    assert mercadopago.ler_state(state + "x") is None
    # Token de acesso comum (outro `type`) não serve como state.
    outro = jwt.encode({"type": "access", "tid": str(tid), "uid": str(uid)}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    assert mercadopago.ler_state(outro) is None
    vencido = jwt.encode(
        {
            "type": mercadopago.STATE_TYPE,
            "tid": str(tid),
            "uid": str(uid),
            "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    assert mercadopago.ler_state(vencido) is None


def test_url_de_autorizacao_e_disponibilidade(monkeypatch):
    monkeypatch.setattr(settings, "MERCADOPAGO_CLIENT_ID", "123")
    monkeypatch.setattr(settings, "MERCADOPAGO_CLIENT_SECRET", "s")
    monkeypatch.setattr(settings, "MERCADOPAGO_REDIRECT_URI", "https://girahub.example/admin/financeiro/mercadopago-retorno")
    monkeypatch.setattr(settings, "MERCADOPAGO_WEBHOOK_SECRET", "w")
    url = mercadopago.url_autorizacao("ST")
    assert url.startswith("https://auth.mercadopago.com/authorization?client_id=123&response_type=code&platform_id=mp&state=ST")
    assert "redirect_uri=https%3A%2F%2Fgirahub.example%2Fadmin%2Ffinanceiro%2Fmercadopago-retorno" in url
    monkeypatch.setattr(settings, "SECRETS_ENCRYPTION_KEY", "")
    assert mercadopago.disponivel() is False  # sem cifra, não guarda token → opção some
    monkeypatch.setattr(settings, "SECRETS_ENCRYPTION_KEY", Fernet.generate_key().decode())
    assert mercadopago.disponivel() is True
    monkeypatch.setattr(settings, "MERCADOPAGO_WEBHOOK_SECRET", "")
    assert mercadopago.disponivel() is False


def test_leitura_do_pagamento_e_dos_tokens():
    pix = mercadopago.ler_pagamento(
        {
            "id": 5466310457,
            "status": "pending",
            "date_of_expiration": "2026-10-09T12:00:00.000-03:00",
            "point_of_interaction": {"transaction_data": {"qr_code": "000201-MP", "qr_code_base64": "iVBOR..."}},
        }
    )
    assert pix.external_id == "5466310457" and pix.copia_e_cola == "000201-MP"
    assert pix.expira_em == datetime(2026, 10, 9, 15, 0, tzinfo=timezone.utc)
    tokens = mercadopago._tokens({"access_token": "A", "refresh_token": "R", "user_id": 42, "expires_in": 15552000})
    assert tokens.user_id == "42" and tokens.expira_em > datetime.now(timezone.utc) + timedelta(days=170)
    with pytest.raises(mercadopago.MercadoPagoErro):
        mercadopago._tokens({"token": "x"})
