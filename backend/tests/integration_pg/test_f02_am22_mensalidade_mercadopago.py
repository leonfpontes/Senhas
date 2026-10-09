"""F-02/AM-22 — Mensalidade com baixa automática pelo Mercado Pago (OAuth), com Postgres real.

- Conectar: plano Pro + FINANCEIRO:edit + senha (errada → 400) + sem impersonação; devolve a URL de
  autorização com `state` assinado. Sem as credenciais da aplicação ou sem `SECRETS_ENCRYPTION_KEY`, a
  opção some.
- Callback (logado): `state` de outro tenant/usuário ou vencido → 400; o código vira tokens gravados SÓ
  cifrados; gateway ativo (PIX), auditado, e-mail aos admins. Outro provedor ativo → 409.
- Área: PIX criado no Mercado Pago com o token DA CASA (decifrado), `external_reference` = nossa
  cobrança e `notification_url` única; token perto de vencer é renovado antes.
- Webhook: `x-signature` conferido (HMAC real); o corpo nunca é usado — o pagamento é buscado no
  Mercado Pago com o token da casa; `external_reference`/`collector_id` divergentes não dão baixa;
  baixa idempotente; falha ao consultar → 503.
- Desconectar apaga os tokens.

Nenhuma chamada real ao Mercado Pago: as funções HTTP de `services/mercadopago.py` são substituídas.
"""
from __future__ import annotations

import hashlib
import hmac
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from urllib.parse import parse_qs, urlparse

import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select

from src.api.v1.medium import mensalidades as mens_mod
from src.core import secret_box
from src.core.config import settings
from src.models import Medium, MensalidadeConfig, MensalidadePagamento, MensalidadeStatus
from src.models.audit_logs import AuditLog
from src.models.mensalidade_gateway import MensalidadeCobranca, MensalidadeGateway
from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.users import UserRole
from src.security.jwt import create_access_token
from src.security.password import hash_password
from src.services import mercadopago, stripe_connect

from .factories import create_tenant, create_user, grant

GATEWAY = "/api/v1/admin/financeiro/gateway"
CONECTAR = f"{GATEWAY}/mercadopago/conectar"
CALLBACK = f"{GATEWAY}/mercadopago/callback"
DESCONECTAR = f"{GATEWAY}/desconectar"
LISTA = "/api/v1/medium/mensalidades"
WEBHOOK = "/api/v1/webhooks/mercadopago"
SENHA = "Senha-de-teste-F02-MP"  # só deste teste
WEBHOOK_SECRET = "segredo-webhook-de-teste"  # não é real
TOKEN_CASA = "APP_USR-token-de-teste-da-casa"  # não é real
REFRESH_CASA = "TG-refresh-de-teste-da-casa"
MP_USER = "123456789"


@pytest.fixture
def mp_fake(monkeypatch):
    monkeypatch.setattr(settings, "MERCADOPAGO_CLIENT_ID", "1234567890123456")
    monkeypatch.setattr(settings, "MERCADOPAGO_CLIENT_SECRET", "segredo-app-de-teste")
    monkeypatch.setattr(settings, "MERCADOPAGO_REDIRECT_URI", "https://girahub.example/admin/financeiro/mercadopago-retorno")
    monkeypatch.setattr(settings, "MERCADOPAGO_WEBHOOK_SECRET", WEBHOOK_SECRET)
    monkeypatch.setattr(settings, "SECRETS_ENCRYPTION_KEY", Fernet.generate_key().decode())
    # Sem Stripe nesta suíte.
    monkeypatch.setattr(settings, "STRIPE_CONNECT_WEBHOOK_SECRET", "")
    estado = {"trocas": [], "renovacoes": 0, "pix": [], "pagamentos": {}, "erro_busca": False}

    async def trocar_codigo(code):
        estado["trocas"].append(code)
        return mercadopago.TokensMP(TOKEN_CASA, REFRESH_CASA, MP_USER, datetime.now(timezone.utc) + timedelta(days=180))

    async def renovar(refresh_token):
        assert refresh_token == REFRESH_CASA
        estado["renovacoes"] += 1
        return mercadopago.TokensMP(
            "APP_USR-token-renovado", "TG-refresh-renovado", MP_USER, datetime.now(timezone.utc) + timedelta(days=180)
        )

    async def criar_pix(**kw):
        estado["pix"].append(kw)
        pid = str(9000 + len(estado["pix"]))
        estado["pagamentos"][pid] = {
            "id": int(pid),
            "status": "pending",
            "external_reference": kw["external_reference"],
            "collector_id": int(MP_USER),
            "transaction_amount": float(kw["valor"]),
        }
        return stripe_connect.CobrancaCriada(
            external_id=pid,
            status_externo="pending",
            copia_e_cola=f"00020101021226-MP-{pid}",
            expira_em=datetime(2099, 1, 1, tzinfo=timezone.utc),
        )

    async def buscar_pagamento(access_token, payment_id):
        if estado["erro_busca"]:
            raise mercadopago.MercadoPagoErro("fora do ar")
        estado.setdefault("tokens_usados", []).append(access_token)
        return estado["pagamentos"][payment_id]

    for nome, fn in {
        "trocar_codigo": trocar_codigo,
        "renovar": renovar,
        "criar_pix": criar_pix,
        "buscar_pagamento": buscar_pagamento,
    }.items():
        monkeypatch.setattr(mercadopago, nome, fn)
    return estado


@pytest.fixture
def emails(monkeypatch):
    from src.services.email.email_queue import email_queue

    enviados: list = []
    monkeypatch.setattr(email_queue, "enqueue", lambda item: enviados.append(item))
    return enviados


@pytest.fixture
def hoje(monkeypatch):
    monkeypatch.setattr(mens_mod, "today_local", lambda: date(2026, 10, 8))


async def _com_senha(db, actor):
    actor.user.password_hash = hash_password(SENHA)
    db.add(actor.user)
    await db.commit()
    return actor


def _assinado(data_id: str, segredo: str = WEBHOOK_SECRET) -> dict:
    ts = str(int(time.time()))
    req = uuid.uuid4().hex
    manifesto = f"id:{data_id.lower()};request-id:{req};ts:{ts};"
    v1 = hmac.new(segredo.encode(), manifesto.encode(), hashlib.sha256).hexdigest()
    return {"x-signature": f"ts={ts},v1={v1}", "x-request-id": req}


async def _notificar(client, payment_id: str, segredo: str = WEBHOOK_SECRET, corpo: dict | None = None):
    body = corpo or {"action": "payment.updated", "type": "payment", "data": {"id": payment_id}}
    return await client.post(
        f"{WEBHOOK}?data.id={payment_id}&type=payment", json=body, headers=_assinado(payment_id, segredo)
    )


async def _cenario(db, *, nome="Terreiro MP", conectar=True, vence_em=timedelta(days=150)):
    tenant = await create_tenant(db, name=nome, plan=PlanType.PRO, area_medium_liberada=True)
    db.add(
        MensalidadeConfig(
            tenant_id=tenant.id,
            valor_mensal=Decimal("40.00"),
            dia_vencimento=10,
            ativo=True,
            created_at=datetime(2026, 1, 5, tzinfo=timezone.utc),
        )
    )
    actor = await create_user(db, tenant, UserRole.MEDIUM, name="medium")
    medium = Medium(tenant_id=tenant.id, nome="Bruno Costa", user_id=actor.user.id, data_entrada=date(2026, 8, 5))
    db.add(medium)
    if conectar:
        db.add(
            MensalidadeGateway(
                tenant_id=tenant.id,
                provedor="mercadopago",
                status="ativo",
                cadastro_completo=True,
                recebimentos_ativos=True,
                pix_disponivel=True,
                mp_user_id=MP_USER,
                mp_access_token_enc=secret_box.encrypt(TOKEN_CASA),
                mp_refresh_token_enc=secret_box.encrypt(REFRESH_CASA),
                mp_token_expira_em=datetime.now(timezone.utc) + vence_em,
            )
        )
    await db.commit()
    return tenant, actor, medium


# ── Painel ───────────────────────────────────────────────────────────────────


async def test_conectar_devolve_a_autorizacao_e_o_callback_grava_tokens_cifrados(client, db, mp_fake, emails):
    tenant = await create_tenant(db, name="Casa MP", plan=PlanType.PRO)
    admin = await _com_senha(db, await create_user(db, tenant, UserRole.ADMIN, name="admin"))
    leitor = await _com_senha(db, await create_user(db, tenant, UserRole.OPERATOR, name="leitor"))
    await grant(db, leitor, tenant, PermissionFeature.FINANCEIRO, "view")
    tenant_id, admin_email = tenant.id, admin.user.email

    assert (await client.get(GATEWAY, headers=admin.headers)).json()["provedores_disponiveis"] == ["mercadopago"]
    assert (await client.post(CONECTAR, headers=leitor.headers, json={"senha": SENHA})).status_code == 403
    errada = await client.post(CONECTAR, headers=admin.headers, json={"senha": "errada"})
    assert errada.status_code == 400 and errada.json()["error_code"] == "SENHA_INCORRETA"
    imp = create_access_token(admin.user.id, tenant_id, "admin", impersonated_by=uuid.uuid4())
    assert (await client.post(CONECTAR, headers={"Authorization": f"Bearer {imp}"}, json={"senha": SENHA})).status_code == 403

    ok = await client.post(CONECTAR, headers=admin.headers, json={"senha": SENHA})
    assert ok.status_code == 200, ok.text
    url = urlparse(ok.json()["url"])
    q = parse_qs(url.query)
    assert url.netloc == "auth.mercadopago.com" and q["client_id"] == ["1234567890123456"]
    assert q["response_type"] == ["code"] and q["redirect_uri"] == [settings.MERCADOPAGO_REDIRECT_URI]
    state = q["state"][0]

    # State de outro usuário (mesmo terreiro) não serve; state adulterado também não.
    outro_admin = await create_user(db, tenant, UserRole.ADMIN, name="outro")
    assert (await client.post(CALLBACK, headers=outro_admin.headers, json={"code": "c", "state": state})).status_code == 400
    assert (await client.post(CALLBACK, headers=admin.headers, json={"code": "c", "state": state + "x"})).status_code == 400
    assert mp_fake["trocas"] == []

    cb = await client.post(CALLBACK, headers=admin.headers, json={"code": "TG-codigo", "state": state})
    assert cb.status_code == 200, cb.text
    assert cb.json()["provedor"] == "mercadopago" and cb.json()["status"] == "ativo" and cb.json()["cobrando"] is True
    assert mp_fake["trocas"] == ["TG-codigo"]
    db.expire_all()
    gw = (await db.execute(select(MensalidadeGateway).where(MensalidadeGateway.tenant_id == tenant_id))).scalar_one()
    assert TOKEN_CASA not in gw.mp_access_token_enc and REFRESH_CASA not in gw.mp_refresh_token_enc
    assert secret_box.decrypt(gw.mp_access_token_enc) == TOKEN_CASA and gw.mp_user_id == MP_USER
    assert {e.message.to_email for e in emails} >= {admin_email}
    assert all(TOKEN_CASA not in e.message.html_body for e in emails)
    logs = (
        await db.execute(
            select(AuditLog).where(AuditLog.tenant_id == tenant_id, AuditLog.resource_type == "mensalidade_gateway")
        )
    ).scalars().all()
    assert len(logs) == 1 and TOKEN_CASA not in str(logs[0].details)

    # Desconectar apaga os tokens.
    assert (await client.post(DESCONECTAR, headers=admin.headers, json={"senha": SENHA})).status_code == 200
    db.expire_all()
    gw = (await db.execute(select(MensalidadeGateway).where(MensalidadeGateway.tenant_id == tenant_id))).scalar_one()
    assert gw.status == "desconectado" and gw.mp_access_token_enc is None and gw.mp_refresh_token_enc is None


async def test_state_de_outro_terreiro_e_outro_provedor_ativo(client, db, mp_fake, emails):
    a = await create_tenant(db, name="Casa A", plan=PlanType.PRO)
    b = await create_tenant(db, name="Casa B", plan=PlanType.PRO)
    admin_a = await _com_senha(db, await create_user(db, a, UserRole.ADMIN))
    admin_b = await _com_senha(db, await create_user(db, b, UserRole.ADMIN))
    state_a = mercadopago.criar_state(a.id, admin_a.user.id)
    assert (await client.post(CALLBACK, headers=admin_b.headers, json={"code": "c", "state": state_a})).status_code == 400

    db.add(MensalidadeGateway(tenant_id=b.id, provedor="stripe", status="ativo", stripe_account_id="acct_b"))
    await db.commit()
    resp = await client.post(CONECTAR, headers=admin_b.headers, json={"senha": SENHA})
    assert resp.status_code == 409 and resp.json()["details"]["error_code"] == "OUTRO_PROVEDOR_CONECTADO"


async def test_sem_chave_de_cifra_o_mercado_pago_nao_aparece(client, db, mp_fake, monkeypatch):
    monkeypatch.setattr(settings, "SECRETS_ENCRYPTION_KEY", "")
    tenant = await create_tenant(db, name="Casa sem cifra", plan=PlanType.PRO)
    admin = await _com_senha(db, await create_user(db, tenant, UserRole.ADMIN))
    assert (await client.get(GATEWAY, headers=admin.headers)).json()["provedores_disponiveis"] == []
    resp = await client.post(CONECTAR, headers=admin.headers, json={"senha": SENHA})
    assert resp.status_code == 409 and resp.json()["details"]["error_code"] == "PROVEDOR_INDISPONIVEL"


# ── Área + webhook ───────────────────────────────────────────────────────────


async def test_pix_na_conta_da_casa_e_baixa_pelo_webhook_conferido_no_mercado_pago(client, db, mp_fake, hoje):
    tenant, actor, medium = await _cenario(db)
    medium_id = medium.id
    lista = (await client.get(LISTA, headers=actor.headers)).json()
    assert lista["cobranca_automatica"] == {
        "provedor": "mercadopago",
        "provedor_label": "Mercado Pago",
        "pix": True,
        "boleto": False,
    }
    resp = await client.post(f"{LISTA}/2026-10/cobranca", headers=actor.headers, json={"metodo": "pix"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["copia_e_cola"] == "00020101021226-MP-9001" and resp.json()["provedor"] == "mercadopago"
    chamada = mp_fake["pix"][0]
    assert chamada["access_token"] == TOKEN_CASA and chamada["valor"] == Decimal("40.00")
    db.expire_all()
    cob = (await db.execute(select(MensalidadeCobranca).where(MensalidadeCobranca.mediun_id == medium_id))).scalar_one()
    assert chamada["external_reference"] == str(cob.id) and cob.conta_externa == MP_USER
    assert mercadopago.notification_url().endswith("/api/v1/webhooks/mercadopago")
    assert mp_fake["renovacoes"] == 0

    # Assinatura errada → 400. Corpo mentindo "approved" não importa: vale o que o MP responde.
    assert (await _notificar(client, "9001", segredo="outro")).status_code == 400
    pendente = await _notificar(client, "9001", corpo={"type": "payment", "data": {"id": "9001"}, "status": "approved"})
    assert pendente.json()["result"] == "pendente"

    mp_fake["pagamentos"]["9001"].update(status="approved", date_approved="2026-10-08T15:00:00.000-03:00")
    pago = await _notificar(client, "9001")
    assert pago.status_code == 200 and pago.json()["result"] == "paga", pago.text
    assert (await _notificar(client, "9001")).json()["result"] == "ja_paga"
    assert set(mp_fake["tokens_usados"]) == {TOKEN_CASA}

    db.expire_all()
    pag = (await db.execute(select(MensalidadePagamento).where(MensalidadePagamento.mediun_id == medium_id))).scalar_one()
    assert pag.status == MensalidadeStatus.PAGO and pag.origem == "gateway" and pag.valor_pago == Decimal("40.00")
    mes = {m["mes"]: m for m in (await client.get(LISTA, headers=actor.headers)).json()["meses"]}["2026-10"]
    assert mes["status"] == "paga" and mes["pago_automatico"] is True


async def test_webhook_nao_da_baixa_com_referencia_ou_conta_divergente(client, db, mp_fake, hoje):
    _, actor, medium = await _cenario(db, nome="Casa Divergente")
    medium_id = medium.id
    assert (await client.post(f"{LISTA}/2026-10/cobranca", headers=actor.headers, json={})).status_code == 200

    mp_fake["pagamentos"]["9001"].update(status="approved", external_reference=str(uuid.uuid4()))
    assert (await _notificar(client, "9001")).json()["result"] == "referencia_divergente"
    db.expire_all()
    cob = (await db.execute(select(MensalidadeCobranca).where(MensalidadeCobranca.mediun_id == medium_id))).scalar_one()
    mp_fake["pagamentos"]["9001"].update(external_reference=str(cob.id), collector_id=999)
    assert (await _notificar(client, "9001")).json()["result"] == "conta_divergente"
    # Pagamento que não é nosso: ignorado.
    assert (await _notificar(client, "123")).json()["result"] == "cobranca_desconhecida"
    # MP fora do ar: 503 para ele reenviar.
    mp_fake["erro_busca"] = True
    assert (await _notificar(client, "9001")).status_code == 503
    db.expire_all()
    assert (
        await db.execute(select(MensalidadePagamento).where(MensalidadePagamento.mediun_id == medium_id))
    ).scalar_one_or_none() is None


async def test_token_perto_de_vencer_e_renovado_antes_de_cobrar(client, db, mp_fake, hoje):
    tenant, actor, _ = await _cenario(db, nome="Casa Renova", vence_em=timedelta(days=2))
    tenant_id = tenant.id
    resp = await client.post(f"{LISTA}/2026-10/cobranca", headers=actor.headers, json={})
    assert resp.status_code == 200, resp.text
    assert mp_fake["renovacoes"] == 1 and mp_fake["pix"][0]["access_token"] == "APP_USR-token-renovado"
    db.expire_all()
    gw = (await db.execute(select(MensalidadeGateway).where(MensalidadeGateway.tenant_id == tenant_id))).scalar_one()
    assert secret_box.decrypt(gw.mp_refresh_token_enc) == "TG-refresh-renovado"
    assert gw.mp_token_expira_em > datetime.now(timezone.utc) + timedelta(days=100)


async def test_boleto_no_mercado_pago_ainda_nao(client, db, mp_fake, hoje):
    _, actor, _ = await _cenario(db, nome="Casa Boleto")
    resp = await client.post(
        f"{LISTA}/2026-10/cobranca",
        headers=actor.headers,
        json={
            "metodo": "boleto",
            "cpf": "123.456.789-09",
            "endereco": {"logradouro": "Rua A, 10", "cidade": "São Paulo", "uf": "SP", "cep": "01310-000"},
        },
    )
    assert resp.status_code == 409 and resp.json()["details"]["error_code"] == "BOLETO_INDISPONIVEL"
