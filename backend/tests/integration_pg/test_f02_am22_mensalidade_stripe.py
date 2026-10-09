"""F-02/AM-22 — Mensalidade com baixa automática pelo Stripe Connect, com Postgres real.

- Conectar (painel): plano `mensalidade_automatica` (Pro) + FINANCEIRO:edit + senha (errada → 400,
  nunca 401) + sem impersonação; cria a conta conectada (Stripe mockado) e devolve o link do
  cadastro; e-mail a todos os admins; auditoria. Sem `STRIPE_CONNECT_WEBHOOK_SECRET` a opção some.
- Atualizar / `account.updated`: status e capacidades (PIX/boleto) vindos do Stripe.
- Desconectar: senha + e-mail; a Área volta para a chave PIX + comprovante.
- Área: "Pagar com PIX" cria (ou reaproveita) a cobrança na conta da casa só para o mês em aberto
  do próprio médium; impersonação não cria; sem gateway o fluxo antigo segue igual.
- Webhook do Connect com assinatura real (HMAC do Stripe): baixa idempotente (mesmo evento e
  evento repetido com outro id), mês PAGO com origem `gateway`, espelho em contas a receber;
  evento de outra conta conectada ou cobrança desconhecida é ignorado (isolamento).
- Migração 091 sobe e desce.

Nenhuma chamada real ao Stripe: as funções de `services/stripe_connect.py` que falam com a API
são substituídas; só a verificação de assinatura do webhook roda de verdade.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import subprocess
import sys
import time
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select, text

from src.api.v1.medium import mensalidades as mens_mod
from src.core.config import settings
from src.models import Medium, MensalidadeConfig, MensalidadePagamento, MensalidadeStatus
from src.models.audit_logs import AuditLog
from src.models.contas_financeiras import ContaFinanceira
from src.models.mensalidade_gateway import MensalidadeCobranca, MensalidadeGateway
from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.users import UserRole
from src.security.jwt import create_access_token
from src.security.password import hash_password
from src.services import stripe_connect

from .conftest import BACKEND_DIR
from .factories import create_tenant, create_user, grant

GATEWAY = "/api/v1/admin/financeiro/gateway"
CONECTAR = f"{GATEWAY}/stripe/conectar"
ATUALIZAR = f"{GATEWAY}/stripe/atualizar"
DESCONECTAR = f"{GATEWAY}/desconectar"
COBRANCAS_ADMIN = "/api/v1/admin/financeiro/mensalidades/cobrancas"
LISTA_ADMIN = "/api/v1/admin/financeiro/mensalidades"
LISTA = "/api/v1/medium/mensalidades"
WEBHOOK = "/api/v1/webhooks/stripe-connect"
SENHA = "Senha-de-teste-F02"  # só deste teste
WHSEC = "whsec_connect_integration"  # segredo de teste do webhook (não é real)


def _cobranca(mes: str) -> str:
    return f"{LISTA}/{mes}/cobranca"


@pytest.fixture
def stripe_fake(monkeypatch):
    """Stripe ligado na plataforma + funções da API substituídas (registro das chamadas)."""
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_test_integracao")
    monkeypatch.setattr(settings, "STRIPE_CONNECT_WEBHOOK_SECRET", WHSEC)
    estado = {
        "contas": 0,
        "links": 0,
        "cobrancas": [],
        "conta": {"id": "acct_casa1", "details_submitted": False, "charges_enabled": False, "capabilities": {}},
        "erro_cobranca": None,
    }

    async def criar_conta(**kw):
        estado["contas"] += 1
        return estado["conta"]["id"]

    async def solicitar_capacidades(account_id):
        return None

    async def link_cadastro(account_id, *, refresh_url, return_url):
        estado["links"] += 1
        assert "stripe=renovar" in refresh_url and "stripe=retorno" in return_url
        return f"https://connect.stripe.com/setup/e/{account_id}/fake"

    async def buscar_conta(account_id):
        return dict(estado["conta"])

    async def criar_cobranca(**kw):
        if estado["erro_cobranca"]:
            raise estado["erro_cobranca"]
        estado["cobrancas"].append(kw)
        n = len(estado["cobrancas"])
        return stripe_connect.CobrancaCriada(
            external_id=f"pi_teste_{n}",
            status_externo="requires_action",
            copia_e_cola=f"00020101021226-PIX-TESTE-{n}",
            expira_em=datetime(2099, 1, 1, tzinfo=timezone.utc),
        )

    for nome, fn in {
        "criar_conta": criar_conta,
        "solicitar_capacidades": solicitar_capacidades,
        "link_cadastro": link_cadastro,
        "buscar_conta": buscar_conta,
        "criar_cobranca": criar_cobranca,
    }.items():
        monkeypatch.setattr(stripe_connect, nome, fn)
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


def _assinar(evento: dict, segredo: str = WHSEC) -> tuple[bytes, dict]:
    payload = json.dumps(evento).encode()
    ts = int(time.time())
    assinatura = hmac.new(segredo.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    return payload, {"stripe-signature": f"t={ts},v1={assinatura}", "content-type": "application/json"}


def _evento(tipo: str, obj: dict, conta: str, event_id: str | None = None) -> dict:
    return {
        "id": event_id or f"evt_{uuid.uuid4().hex[:16]}",
        "object": "event",
        "type": tipo,
        "account": conta,
        "created": int(time.time()),
        "data": {"object": obj},
    }


async def _post_evento(client, evento: dict, segredo: str = WHSEC):
    payload, headers = _assinar(evento, segredo)
    return await client.post(WEBHOOK, content=payload, headers=headers)


async def _cenario(db, *, plan=PlanType.PRO, nome="Terreiro F02", gateway="ativo", conta="acct_casa1"):
    tenant = await create_tenant(db, name=nome, plan=plan, area_medium_liberada=True)
    db.add(
        MensalidadeConfig(
            tenant_id=tenant.id,
            valor_mensal=Decimal("50.00"),
            dia_vencimento=10,
            ativo=True,
            created_at=datetime(2026, 1, 5, tzinfo=timezone.utc),
            pix_tipo="cpf",
            pix_chave="12345678909",
            pix_nome_recebedor="Casa de Oxala",
            pix_cidade="Sao Paulo",
        )
    )
    actor = await create_user(db, tenant, UserRole.MEDIUM, name="medium")
    medium = Medium(tenant_id=tenant.id, nome="Ana Paula Ribeiro", user_id=actor.user.id, data_entrada=date(2026, 8, 5))
    db.add(medium)
    if gateway:
        db.add(
            MensalidadeGateway(
                tenant_id=tenant.id,
                provedor="stripe",
                status=gateway,
                stripe_account_id=conta,
                cadastro_completo=True,
                recebimentos_ativos=True,
                pix_disponivel=True,
                boleto_disponivel=False,
            )
        )
    await db.commit()
    return tenant, actor, medium


# ── Painel: conectar, atualizar, desconectar ─────────────────────────────────


async def test_conectar_exige_plano_pro_grupo_edit_e_senha(client, db, stripe_fake, emails):
    basic = await create_tenant(db, name="Casa Basic", plan=PlanType.BASIC)
    admin_basic = await _com_senha(db, await create_user(db, basic, UserRole.ADMIN))
    status_basic = await client.get(GATEWAY, headers=admin_basic.headers)
    assert status_basic.status_code == 200, status_basic.text
    assert status_basic.json() == {"provedores_disponiveis": ["stripe"], "plano_inclui": False, "gateway": None}
    assert (await client.post(CONECTAR, headers=admin_basic.headers, json={"senha": SENHA})).status_code == 403

    tenant = await create_tenant(db, name="Casa Pro", plan=PlanType.PRO)
    admin = await _com_senha(db, await create_user(db, tenant, UserRole.ADMIN, name="admin"))
    outro_admin = await create_user(db, tenant, UserRole.ADMIN, name="outroadmin")
    leitor = await _com_senha(db, await create_user(db, tenant, UserRole.OPERATOR, name="leitor"))
    await grant(db, leitor, tenant, PermissionFeature.FINANCEIRO, "view")
    editor = await _com_senha(db, await create_user(db, tenant, UserRole.OPERATOR, name="editor"))
    await grant(db, editor, tenant, PermissionFeature.FINANCEIRO, "view", "edit")

    assert (await client.get(GATEWAY, headers=leitor.headers)).status_code == 200
    assert (await client.post(CONECTAR, headers=leitor.headers, json={"senha": SENHA})).status_code == 403

    errada = await client.post(CONECTAR, headers=admin.headers, json={"senha": "nao-e-essa"})
    assert errada.status_code == 400, errada.text  # nunca 401: o front derrubaria a sessão
    assert errada.json()["error_code"] == "SENHA_INCORRETA"
    assert stripe_fake["contas"] == 0 and emails == []

    imp = create_access_token(editor.user.id, tenant.id, "operator", impersonated_by=uuid.uuid4())
    assert (await client.post(CONECTAR, headers={"Authorization": f"Bearer {imp}"}, json={"senha": SENHA})).status_code == 403

    ok = await client.post(CONECTAR, headers=editor.headers, json={"senha": SENHA})
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["url"].startswith("https://connect.stripe.com/")
    assert body["gateway"]["provedor"] == "stripe" and body["gateway"]["status"] == "pendente"
    assert body["gateway"]["cobrando"] is False
    assert stripe_fake["contas"] == 1
    destinos = {item.message.to_email for item in emails}
    assert destinos == {admin.user.email, outro_admin.user.email}
    assert "acct_" not in emails[0].message.html_body  # nenhum id de conta por e-mail

    # Continuar o cadastro reaproveita a conta (não cria outra).
    de_novo = await client.post(CONECTAR, headers=editor.headers, json={"senha": SENHA})
    assert de_novo.status_code == 200 and stripe_fake["contas"] == 1 and stripe_fake["links"] == 2

    logs = (
        await db.execute(
            select(AuditLog).where(AuditLog.tenant_id == tenant.id, AuditLog.resource_type == "mensalidade_gateway")
        )
    ).scalars().all()
    assert len(logs) == 2


async def test_sem_segredo_do_webhook_o_stripe_nao_aparece(client, db, stripe_fake, monkeypatch):
    monkeypatch.setattr(settings, "STRIPE_CONNECT_WEBHOOK_SECRET", "")
    tenant = await create_tenant(db, name="Casa sem Connect", plan=PlanType.PRO)
    admin = await _com_senha(db, await create_user(db, tenant, UserRole.ADMIN))
    assert (await client.get(GATEWAY, headers=admin.headers)).json()["provedores_disponiveis"] == []
    resp = await client.post(CONECTAR, headers=admin.headers, json={"senha": SENHA})
    assert resp.status_code == 409 and resp.json()["details"]["error_code"] == "PROVEDOR_INDISPONIVEL"


async def test_atualizar_e_account_updated_ligam_e_desligam_o_pix(client, db, stripe_fake, emails):
    tenant = await create_tenant(db, name="Casa Cadastro", plan=PlanType.PRO)
    admin = await _com_senha(db, await create_user(db, tenant, UserRole.ADMIN))
    assert (await client.post(CONECTAR, headers=admin.headers, json={"senha": SENHA})).status_code == 200

    stripe_fake["conta"] = {
        "id": "acct_casa1",
        "details_submitted": True,
        "charges_enabled": True,
        "capabilities": {"pix_payments": "active", "boleto_payments": "pending"},
    }
    info = await client.post(ATUALIZAR, headers=admin.headers)
    assert info.status_code == 200, info.text
    assert info.json()["status"] == "ativo"
    assert info.json()["pix_disponivel"] is True and info.json()["boleto_disponivel"] is False
    assert info.json()["cobrando"] is True

    conta = {**stripe_fake["conta"], "capabilities": {"pix_payments": "inactive", "boleto_payments": "active"}}
    resp = await _post_evento(client, _evento("account.updated", conta, "acct_casa1"))
    assert resp.status_code == 200 and resp.json()["result"] == "conta_atualizada"
    gw = (await client.get(GATEWAY, headers=admin.headers)).json()["gateway"]
    assert gw["pix_disponivel"] is False and gw["boleto_disponivel"] is True

    # Evento de conta que não é de nenhuma casa: ignorado.
    estranha = await _post_evento(client, _evento("account.updated", {"id": "acct_x"}, "acct_x"))
    assert estranha.json()["result"] == "conta_desconhecida"


async def test_desconectar_pede_senha_avisa_e_a_area_volta_para_a_chave(client, db, stripe_fake, emails, hoje):
    tenant, medium_actor, _ = await _cenario(db, nome="Casa Desconecta")
    admin = await _com_senha(db, await create_user(db, tenant, UserRole.ADMIN))
    assert (await client.get(LISTA, headers=medium_actor.headers)).json()["cobranca_automatica"]["pix"] is True

    errada = await client.post(DESCONECTAR, headers=admin.headers, json={"senha": "errada"})
    assert errada.status_code == 400 and errada.json()["error_code"] == "SENHA_INCORRETA"
    ok = await client.post(DESCONECTAR, headers=admin.headers, json={"senha": SENHA})
    assert ok.status_code == 200, ok.text
    assert ok.json()["gateway"]["status"] == "desconectado"
    assert len(emails) == 1 and "desligada" in emails[0].message.html_body

    lista = (await client.get(LISTA, headers=medium_actor.headers)).json()
    assert lista["cobranca_automatica"] is None and lista["pix"]["chave"] == "12345678909"
    nega = await client.post(_cobranca("2026-10"), headers=medium_actor.headers, json={"metodo": "pix"})
    assert nega.status_code == 409 and nega.json()["details"]["error_code"] == "COBRANCA_AUTOMATICA_INDISPONIVEL"
    assert (await client.post(DESCONECTAR, headers=admin.headers, json={"senha": SENHA})).status_code == 409


# ── Área: cobrança e baixa ───────────────────────────────────────────────────


async def test_medium_paga_pelo_pix_e_o_webhook_da_baixa_uma_vez_so(client, db, stripe_fake, hoje):
    tenant, actor, medium = await _cenario(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    medium_id, tenant_id = medium.id, tenant.id

    lista = (await client.get(LISTA, headers=actor.headers)).json()
    assert lista["cobranca_automatica"] == {"provedor": "stripe", "provedor_label": "Stripe", "pix": True, "boleto": False}

    criada = await client.post(_cobranca("2026-10"), headers=actor.headers, json={"metodo": "pix"})
    assert criada.status_code == 200, criada.text
    body = criada.json()
    assert body["status"] == "pendente" and body["valor"] == 50.0 and body["copia_e_cola"].startswith("00020101")
    chamada = stripe_fake["cobrancas"][0]
    assert chamada["account_id"] == "acct_casa1" and chamada["valor"] == Decimal("50.00")
    assert chamada["metodo"] == "pix" and chamada["metadata"]["mes"] == "2026-10"

    # Segundo toque reaproveita a mesma cobrança (sem nova chamada ao Stripe).
    de_novo = await client.post(_cobranca("2026-10"), headers=actor.headers, json={"metodo": "pix"})
    assert de_novo.json()["copia_e_cola"] == body["copia_e_cola"] and len(stripe_fake["cobrancas"]) == 1
    # Boleto não liberado para a casa.
    boleto = await client.post(
        _cobranca("2026-10"),
        headers=actor.headers,
        json={"metodo": "boleto", "cpf": "123.456.789-09", "endereco": {"logradouro": "Rua A, 10", "cidade": "Sao Paulo", "uf": "SP", "cep": "01310-000"}},
    )
    assert boleto.status_code == 409 and boleto.json()["details"]["error_code"] == "BOLETO_INDISPONIVEL"
    # Mês já pago / fora da Área.
    assert (await client.post(_cobranca("2026-01"), headers=actor.headers, json={})).status_code == 404

    pi = {"id": "pi_teste_1", "object": "payment_intent", "amount": 5000, "amount_received": 5000, "status": "succeeded",
          "metadata": {"tenant_id": str(uuid.uuid4())}}  # metadata adulterada não importa
    evento = _evento("payment_intent.succeeded", pi, "acct_casa1")
    pago = await _post_evento(client, evento)
    assert pago.status_code == 200 and pago.json()["result"] == "paga", pago.text
    repetido = await _post_evento(client, evento)
    assert repetido.json().get("duplicate") is True
    outro_id = await _post_evento(client, _evento("payment_intent.succeeded", pi, "acct_casa1"))
    assert outro_id.json()["result"] == "ja_paga"

    db.expire_all()
    pag = (
        await db.execute(select(MensalidadePagamento).where(MensalidadePagamento.mediun_id == medium_id))
    ).scalar_one()
    assert pag.status == MensalidadeStatus.PAGO and pag.origem == "gateway" and pag.valor_pago == Decimal("50.00")
    contas = (
        await db.execute(select(ContaFinanceira).where(ContaFinanceira.tenant_id == tenant_id))
    ).scalars().all()
    assert len(contas) == 1 and contas[0].status == "pago"

    mes = {m["mes"]: m for m in (await client.get(LISTA, headers=actor.headers)).json()["meses"]}["2026-10"]
    assert mes["status"] == "paga" and mes["pago_automatico"] is True
    situacao = (await client.get(_cobranca("2026-10"), headers=actor.headers)).json()
    assert situacao["status"] == "paga" and situacao["mes_status"] == "paga" and situacao["copia_e_cola"] is None

    painel = {r["mediun_id"]: r for r in (await client.get(LISTA_ADMIN, params={"mes": "2026-10"}, headers=admin.headers)).json()}
    assert painel[str(medium_id)]["origem"] == "gateway"
    cobrancas = (await client.get(COBRANCAS_ADMIN, params={"mes": "2026-10"}, headers=admin.headers)).json()
    assert [c["status"] for c in cobrancas] == ["paga"] and cobrancas[0]["mediun_nome"] == "Ana Paula Ribeiro"

    baixas = (
        await db.execute(
            select(AuditLog).where(AuditLog.tenant_id == tenant_id, AuditLog.resource_type == "mensalidade_gateway_baixa")
        )
    ).scalars().all()
    assert len(baixas) == 1


async def test_webhook_de_outra_conta_ou_assinatura_errada_nao_da_baixa(client, db, stripe_fake, hoje):
    tenant, actor, medium = await _cenario(db, nome="Casa A")
    medium_id = medium.id
    tenant_b, actor_b, _ = await _cenario(db, nome="Casa B", conta="acct_casa_b")
    admin_b = await create_user(db, tenant_b, UserRole.ADMIN)
    assert (await client.post(_cobranca("2026-10"), headers=actor.headers, json={})).status_code == 200

    pi = {"id": "pi_teste_1", "amount": 5000, "status": "succeeded"}
    # Assinatura com outro segredo → 400, nada processado.
    assert (await _post_evento(client, _evento("payment_intent.succeeded", pi, "acct_casa1"), segredo="whsec_outro")).status_code == 400
    # Evento assinado, mas de outra conta conectada (a Casa B) para a cobrança da Casa A.
    divergente = await _post_evento(client, _evento("payment_intent.succeeded", pi, "acct_casa_b"))
    assert divergente.json()["result"] == "conta_divergente"
    # PaymentIntent que não é nosso.
    estranho = await _post_evento(client, _evento("payment_intent.succeeded", {"id": "pi_desconhecido"}, "acct_casa1"))
    assert estranho.json()["result"] == "cobranca_desconhecida"

    db.expire_all()
    assert (
        await db.execute(select(MensalidadePagamento).where(MensalidadePagamento.mediun_id == medium_id))
    ).scalar_one_or_none() is None
    # A médium da Casa B não vê a cobrança da Casa A.
    assert (await client.get(_cobranca("2026-10"), headers=actor_b.headers)).status_code == 404
    # Admin da Casa B não lista a cobrança da Casa A.
    assert (await client.get(COBRANCAS_ADMIN, params={"mes": "2026-10"}, headers=admin_b.headers)).json() == []

    # Expirou → cobrança expirada; a próxima tentativa cria outra.
    expirou = await _post_evento(client, _evento("payment_intent.payment_failed", pi, "acct_casa1"))
    assert expirou.json()["result"] == "expirada"
    nova = await client.post(_cobranca("2026-10"), headers=actor.headers, json={})
    assert nova.status_code == 200 and len(stripe_fake["cobrancas"]) == 2


async def test_sem_gateway_ou_sem_plano_segue_a_chave_e_o_comprovante(client, db, stripe_fake, hoje):
    _, sem_gw, _ = await _cenario(db, nome="Casa sem gateway", gateway=None)
    lista = (await client.get(LISTA, headers=sem_gw.headers)).json()
    assert lista["cobranca_automatica"] is None and lista["pix"] is not None
    assert (await client.get(f"{LISTA}/2026-10/pix", headers=sem_gw.headers)).status_code == 200
    resp = await client.post(_cobranca("2026-10"), headers=sem_gw.headers, json={})
    assert resp.status_code == 409

    # Gateway ativo, mas o plano (Basic) não tem a baixa automática.
    _, basic, _ = await _cenario(db, nome="Casa Basic com conta", plan=PlanType.BASIC, conta="acct_basic")
    assert (await client.get(LISTA, headers=basic.headers)).json()["cobranca_automatica"] is None
    assert (await client.post(_cobranca("2026-10"), headers=basic.headers, json={})).status_code == 409
    assert stripe_fake["cobrancas"] == []


async def test_impersonacao_nao_cria_cobranca_e_cpf_quando_o_stripe_pede(client, db, stripe_fake, hoje):
    _, actor, _ = await _cenario(db, nome="Casa Imp")
    imp = create_access_token(actor.user.id, actor.user.tenant_id, "medium", impersonated_by=uuid.uuid4())
    headers = {"Authorization": f"Bearer {imp}"}
    assert (await client.get(LISTA, headers=headers)).status_code == 200
    assert (await client.post(_cobranca("2026-10"), headers=headers, json={})).status_code == 403

    stripe_fake["erro_cobranca"] = stripe_connect.StripeConnectErro(
        "x", param="payment_method_data[billing_details][tax_id]"
    )
    pede = await client.post(_cobranca("2026-10"), headers=actor.headers, json={})
    assert pede.status_code == 409 and pede.json()["details"]["error_code"] == "CPF_NECESSARIO"
    invalido = await client.post(_cobranca("2026-10"), headers=actor.headers, json={"cpf": "111.111.111-11"})
    assert invalido.status_code == 422
    stripe_fake["erro_cobranca"] = None
    com_cpf = await client.post(_cobranca("2026-10"), headers=actor.headers, json={"cpf": "123.456.789-09"})
    assert com_cpf.status_code == 200 and stripe_fake["cobrancas"][-1]["cpf"] == "12345678909"

    db.expire_all()
    cob = (await db.execute(select(MensalidadeCobranca))).scalars().all()
    # Nenhum CPF gravado na cobrança.
    assert all("12345678909" not in json.dumps(c.raw or {}) for c in cob)


# ── Migração ─────────────────────────────────────────────────────────────────


def _alembic(*args):
    subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR, check=True, capture_output=True)


async def test_migracao_091_sobe_e_desce(client, db):
    from src.core.database import engine

    async def _tabelas():
        async with engine.connect() as conn:
            return set((await conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))).scalars())

    novas = {"mensalidade_gateways", "mensalidade_cobrancas"}
    assert novas <= await _tabelas()
    # Relativo à 091 (e não "089"): continua certo quando a cadeia for re-encadeada no merge.
    _alembic("downgrade", "091_mensalidade_gateway-1")
    try:
        assert not (novas & await _tabelas())
        async with engine.connect() as conn:
            colunas = set(
                (
                    await conn.execute(
                        text("SELECT column_name FROM information_schema.columns WHERE table_name = 'mensalidade_pagamentos'")
                    )
                ).scalars()
            )
        assert "origem" not in colunas
    finally:
        _alembic("upgrade", "head")
    assert novas <= await _tabelas()
