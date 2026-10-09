"""Pagamento parcial da mensalidade (migração 092), com Postgres real (migrações + app via HTTP).

- Médium pagou 30 de 50: a casa confere 30 → falta 20; o PIX da Área e a pendência do Início
  passam a ser de 20; o segundo comprovante conferido (20) fecha o mês PAGO (valor pago 50,
  espelho em contas a receber) com os dois comprovantes no histórico;
- "não confirmado" guarda o histórico e aceita um comprovante novo;
- pago a mais fecha PAGO e aparece para a direção (sem crédito automático);
- cobrança automática (Stripe mockado) do valor que FALTA: a pendente do valor antigo não é
  reaproveitada; paga, completa e fecha o mês;
- registro manual no painel continua valendo (PAGO com o valor informado é o total do mês);
- só FINANCEIRO:edit confere; outro terreiro não vê nem confere; o médium vê só os dele;
- migração 092 leva o comprovante do slot único para a tabela nova e volta no downgrade.

Chave PIX de teste: CPF de exemplo conhecido (123.456.789-09) — nenhuma chave real.
"""
from __future__ import annotations

import subprocess
import sys
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select, text

from src.api.v1.medium import inicio as inicio_mod
from src.api.v1.medium import mensalidades as mens_mod
from src.models import Medium, MensalidadeComprovante, MensalidadeConfig, MensalidadePagamento, MensalidadeStatus
from src.models.audit_logs import AuditLog
from src.models.contas_financeiras import ContaFinanceira
from src.models.mensalidade_gateway import MensalidadeCobranca, MensalidadeGateway
from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.users import UserRole

from .conftest import BACKEND_DIR
from .factories import create_tenant, create_user, grant
from .test_f02_am22_mensalidade_stripe import _evento, _post_evento, stripe_fake  # noqa: F401 (fixture)

LISTA = "/api/v1/medium/mensalidades"
INICIO = "/api/v1/medium/inicio"
ADMIN = "/api/v1/admin/financeiro"
FILA = f"{ADMIN}/mensalidades/comprovantes-para-conferir"

JPEG = b"\xff\xd8\xff\xe0" + b"comprovante-parcial" * 20
JPEG_2 = b"\xff\xd8\xff\xe0" + b"segundo-comprovante" * 20


def _comp(mes: str) -> str:
    return f"{LISTA}/{mes}/comprovante"


def _historico(mediun_id, mes: str) -> str:
    return f"{ADMIN}/mensalidades/{mediun_id}/{mes}/comprovantes"


def _conferir(cid) -> str:
    return f"{ADMIN}/mensalidades/comprovantes/{cid}/conferir"


def _nao_confirmar(cid) -> str:
    return f"{ADMIN}/mensalidades/comprovantes/{cid}/nao-confirmar"


def _arquivo(data=JPEG, valor: str | None = None):
    kw = {"files": {"arquivo": ("comprovante.jpg", data, "image/jpeg")}}
    if valor is not None:
        kw["data"] = {"valor_informado": valor}
    return kw


@pytest.fixture
def hoje(monkeypatch):
    monkeypatch.setattr(mens_mod, "today_local", lambda: date(2026, 10, 8))
    monkeypatch.setattr(inicio_mod, "today_local", lambda: date(2026, 10, 8))


async def _cenario(db, *, nome="Terreiro Parcial", plan=PlanType.BASIC, gateway: str | None = None):
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
                status="ativo",
                stripe_account_id=gateway,
                cadastro_completo=True,
                recebimentos_ativos=True,
                pix_disponivel=True,
                boleto_disponivel=False,
            )
        )
    admin = await create_user(db, tenant, UserRole.ADMIN, name="admin")
    await db.commit()
    return tenant, actor, medium, admin


def _mes(body, mes="2026-10"):
    return {m["mes"]: m for m in body["meses"]}[mes]


async def _conta(db, tenant_id, medium_id, mes="2026-10"):
    db.expire_all()
    return (
        await db.execute(
            select(ContaFinanceira).where(
                ContaFinanceira.tenant_id == tenant_id,
                ContaFinanceira.external_ref == f"mensalidade:mediun:{medium_id}:{mes}",
            )
        )
    ).scalar_one_or_none()


# ── Parcial: 30 de 50, depois 20 ──────────────────────────────────────────────


async def test_pagou_30_de_50_falta_20_e_o_segundo_comprovante_fecha_o_mes(client, db, hoje):
    tenant, actor, medium, admin = await _cenario(db)
    tenant_id, medium_id, admin_id = tenant.id, medium.id, admin.user.id

    enviado = await client.post(_comp("2026-10"), headers=actor.headers, **_arquivo(valor="30,00"))
    assert enviado.status_code == 200, enviado.text
    assert enviado.json()["status"] == "em_conferencia"
    assert enviado.json()["comprovantes"] == [
        {"enviado_em": enviado.json()["comprovantes"][0]["enviado_em"], "valor_informado": 30.0,
         "status": "em_conferencia", "valor_conferido": None, "motivo": None}
    ]

    fila = (await client.get(FILA, headers=admin.headers)).json()
    assert len(fila) == 1
    item = fila[0]
    assert item["valor"] == 50.0 and item["valor_informado"] == 30.0 and item["falta"] == 50.0
    assert item["mediun_nome"] == "Ana Paula Ribeiro" and item["mes"] == "2026-10"

    # "Recebi só uma parte": conferir 30.
    conf = await client.patch(_conferir(item["comprovante_id"]), json={"valor": 30}, headers=admin.headers)
    assert conf.status_code == 200, conf.text
    hist = conf.json()
    assert hist["status"] == "PENDENTE" and hist["valor_recebido"] == 30.0 and hist["falta"] == 20.0
    assert [c["status"] for c in hist["comprovantes"]] == ["conferido"]
    assert hist["comprovantes"][0]["valor_conferido"] == 30.0
    assert (await client.get(FILA, headers=admin.headers)).json() == []
    # Mês ainda em aberto: o espelho em contas a receber não virou pago.
    conta = await _conta(db, tenant_id, medium_id)
    assert conta is None or conta.status != "pago"

    # Na Área: "falta pagar 20" — o PIX estático, a lista e a pendência do Início usam 20.
    mes = _mes((await client.get(LISTA, headers=actor.headers)).json())
    assert mes["status"] == "pendente" and mes["valor"] == 20.0
    assert mes["valor_mensalidade"] == 50.0 and mes["valor_recebido"] == 30.0
    assert mes["comprovantes"][0]["status"] == "conferido" and mes["comprovantes"][0]["valor_conferido"] == 30.0
    pix = (await client.get(f"{LISTA}/2026-10/pix", headers=actor.headers)).json()
    assert pix["valor"] == 20.0 and "540520.00" in pix["copia_e_cola"]
    inicio = (await client.get(INICIO, headers=actor.headers)).json()
    assert inicio["mensalidade"]["valor"] == 20.0 and inicio["mensalidade"]["valor_recebido"] == 30.0
    [pend] = [p for p in inicio["pendencias"] if p["tipo"] == "mensalidade"]
    assert pend["valor"] == 20.0 and pend["valor_recebido"] == 30.0

    # Painel: a linha do mês mostra recebido e falta.
    linha = next(
        r for r in (await client.get(f"{ADMIN}/mensalidades?mes=2026-10", headers=admin.headers)).json()
        if r["mediun_id"] == str(medium_id)
    )
    assert linha["status"] == "PENDENTE" and linha["valor_recebido"] == 30.0 and linha["falta"] == 20.0

    # Segundo comprovante (não substitui o primeiro) → conferir 20 → PAGO.
    segundo = await client.post(_comp("2026-10"), headers=actor.headers, **_arquivo(JPEG_2))
    assert segundo.status_code == 200 and segundo.json()["status"] == "em_conferencia"
    assert len(segundo.json()["comprovantes"]) == 2
    [item2] = (await client.get(FILA, headers=admin.headers)).json()
    assert item2["falta"] == 20.0 and item2["valor_recebido"] == 30.0 and item2["valor_informado"] is None
    fechou = await client.patch(_conferir(item2["comprovante_id"]), json={"valor": "20.00"}, headers=admin.headers)
    assert fechou.status_code == 200, fechou.text
    hist = fechou.json()
    assert hist["status"] == "PAGO" and hist["valor_pago"] == 50.0 and hist["falta"] == 0.0
    assert hist["pago_a_mais"] == 0.0
    assert [(c["status"], c["valor_conferido"]) for c in hist["comprovantes"]] == [("conferido", 30.0), ("conferido", 20.0)]

    db.expire_all()
    pag = (await db.execute(select(MensalidadePagamento).where(MensalidadePagamento.mediun_id == medium_id))).scalar_one()
    assert pag.status == MensalidadeStatus.PAGO and pag.valor_pago == Decimal("50.00") and pag.origem == "direcao"
    assert pag.registrado_por == admin_id
    conta = await _conta(db, tenant_id, medium_id)
    assert conta.status == "pago" and conta.valor_pago == Decimal("50.00") and conta.valor == Decimal("50.00")

    # Cada arquivo continua lá; o download antigo traz o mais recente.
    arquivos = [
        (await client.get(f"{ADMIN}/mensalidades/comprovantes/{c['id']}/arquivo", headers=admin.headers)).content
        for c in hist["comprovantes"]
    ]
    assert arquivos == [JPEG, JPEG_2]
    antigo = await client.get(f"{ADMIN}/mensalidades/{medium_id}/2026-10/comprovante", headers=admin.headers)
    assert antigo.status_code == 200 and antigo.content == JPEG_2

    mes = _mes((await client.get(LISTA, headers=actor.headers)).json())
    assert mes["status"] == "paga" and mes["valor"] == 50.0
    # Mês pago recusa novo envio.
    assert (await client.post(_comp("2026-10"), headers=actor.headers, **_arquivo())).status_code == 409

    # Auditoria só com ids e valores (nada de arquivo).
    logs = (
        await db.execute(
            select(AuditLog).where(AuditLog.tenant_id == tenant_id, AuditLog.resource_type == "mensalidade_comprovante_medium")
        )
    ).scalars().all()
    assert len(logs) == 4 and all("comprovante-parcial" not in str(l.details) for l in logs)


async def test_nao_confirmado_guarda_o_historico_e_aceita_outro(client, db, hoje):
    _, actor, medium, admin = await _cenario(db)
    assert (await client.post(_comp("2026-10"), headers=actor.headers, **_arquivo())).status_code == 200
    [item] = (await client.get(FILA, headers=admin.headers)).json()

    curto = await client.patch(_nao_confirmar(item["comprovante_id"]), json={"motivo": " x "}, headers=admin.headers)
    assert curto.status_code == 422
    resp = await client.patch(
        _nao_confirmar(item["comprovante_id"]), json={"motivo": "Não dá para ler o comprovante."}, headers=admin.headers
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["comprovantes"][0]["status"] == "nao_confirmado"
    de_novo = await client.patch(_conferir(item["comprovante_id"]), json={"valor": 50}, headers=admin.headers)
    assert de_novo.status_code == 409 and de_novo.json()["details"]["error_code"] == "COMPROVANTE_NAO_PENDENTE"

    mes = _mes((await client.get(LISTA, headers=actor.headers)).json())
    assert mes["status"] == "nao_confirmada" and mes["recusa_motivo"] == "Não dá para ler o comprovante."
    assert mes["valor"] == 50.0 and mes["comprovantes"][0]["motivo"] == "Não dá para ler o comprovante."

    novo = await client.post(_comp("2026-10"), headers=actor.headers, **_arquivo(JPEG_2, valor="50"))
    assert novo.status_code == 200 and novo.json()["status"] == "em_conferencia"
    assert [c["status"] for c in novo.json()["comprovantes"]] == ["nao_confirmado", "em_conferencia"]
    hist = (await client.get(_historico(medium.id, "2026-10"), headers=admin.headers)).json()
    assert [c["status"] for c in hist["comprovantes"]] == ["nao_confirmado", "em_conferencia"]
    assert hist["comprovantes"][0]["motivo"] == "Não dá para ler o comprovante."


async def test_pago_a_mais_fecha_o_mes_e_aparece_para_a_direcao(client, db, hoje):
    tenant, actor, medium, admin = await _cenario(db)
    assert (await client.post(_comp("2026-10"), headers=actor.headers, **_arquivo(valor="60"))).status_code == 200
    [item] = (await client.get(FILA, headers=admin.headers)).json()
    resp = await client.patch(_conferir(item["comprovante_id"]), json={"valor": 60}, headers=admin.headers)
    assert resp.status_code == 200
    hist = resp.json()
    assert hist["status"] == "PAGO" and hist["valor_pago"] == 60.0 and hist["pago_a_mais"] == 10.0
    linha = next(
        r for r in (await client.get(f"{ADMIN}/mensalidades?mes=2026-10", headers=admin.headers)).json()
        if r["mediun_id"] == str(medium.id)
    )
    assert linha["status"] == "PAGO" and linha["pago_a_mais"] == 10.0 and linha["valor_pago"] == 60.0
    conta = await _conta(db, tenant.id, medium.id)
    assert conta.status == "pago" and conta.valor_pago == Decimal("60.00")


async def test_registro_manual_continua_valendo_e_da_por_conferidos(client, db, hoje):
    tenant, actor, medium, admin = await _cenario(db)
    tenant_id, medium_id = tenant.id, medium.id
    assert (await client.post(_comp("2026-10"), headers=actor.headers, **_arquivo(valor="30"))).status_code == 200
    [item] = (await client.get(FILA, headers=admin.headers)).json()
    assert (await client.patch(_conferir(item["comprovante_id"]), json={"valor": 30}, headers=admin.headers)).status_code == 200
    assert (await client.post(_comp("2026-10"), headers=actor.headers, **_arquivo(JPEG_2))).status_code == 200

    # A direção registra no painel: PAGO 50 (com um anexo) — a palavra final, como sempre.
    ok = await client.post(
        f"{ADMIN}/mensalidades/{medium_id}/2026-10",
        data={"status": "PAGO", "valor_pago": "50", "data_pagamento": "2026-10-08"},
        files={"comprovante": ("recibo.pdf", b"%PDF-1.4\n" + b"0" * 50, "application/pdf")},
        headers=admin.headers,
    )
    assert ok.status_code == 200, ok.text
    assert (await client.get(FILA, headers=admin.headers)).json() == []
    hist = (await client.get(_historico(medium_id, "2026-10"), headers=admin.headers)).json()
    assert hist["status"] == "PAGO" and hist["valor_pago"] == 50.0
    assert [(c["origem"], c["status"], c["valor_conferido"]) for c in hist["comprovantes"]] == [
        ("medium", "conferido", 30.0),
        ("medium", "conferido", None),
        ("painel", "conferido", None),
    ]
    conta = await _conta(db, tenant_id, medium_id)
    assert conta.status == "pago" and conta.valor_pago == Decimal("50.00")
    db.expire_all()
    pag = (await db.execute(select(MensalidadePagamento).where(MensalidadePagamento.mediun_id == medium_id))).scalar_one()
    assert pag.comprovante_data is None  # o slot antigo não recebe mais escrita

    # Remover o anexo do painel não apaga os comprovantes do médium.
    rem = await client.delete(f"{ADMIN}/mensalidades/{pag.id}/comprovante", headers=admin.headers)
    assert rem.status_code == 204
    hist = (await client.get(_historico(medium_id, "2026-10"), headers=admin.headers)).json()
    assert [c["origem"] for c in hist["comprovantes"]] == ["medium", "medium"]


async def test_valor_informado_invalido_e_permissao_de_conferir(client, db, hoje):
    tenant, actor, medium, admin = await _cenario(db)
    for ruim in ("abc", "0", "-5", "1e12"):
        resp = await client.post(_comp("2026-10"), headers=actor.headers, **_arquivo(valor=ruim))
        assert resp.status_code == 422 and resp.json()["details"]["error_code"] == "VALOR_INVALIDO", ruim
    assert (await client.post(_comp("2026-10"), headers=actor.headers, **_arquivo(valor=""))).status_code == 200
    [item] = (await client.get(FILA, headers=admin.headers)).json()

    so_ve = await create_user(db, tenant, UserRole.OPERATOR, name="so-ve")
    await grant(db, so_ve, tenant, PermissionFeature.FINANCEIRO, "view", "insert")
    tesoureiro = await create_user(db, tenant, UserRole.OPERATOR, name="tesoureiro")
    await grant(db, tesoureiro, tenant, PermissionFeature.FINANCEIRO, "view", "edit")
    assert (await client.get(FILA, headers=so_ve.headers)).status_code == 200
    assert (await client.get(_historico(medium.id, "2026-10"), headers=so_ve.headers)).status_code == 200
    assert (await client.patch(_conferir(item["comprovante_id"]), json={"valor": 50}, headers=so_ve.headers)).status_code == 403
    assert (
        await client.patch(_nao_confirmar(item["comprovante_id"]), json={"motivo": "não veio"}, headers=so_ve.headers)
    ).status_code == 403
    for ruim in (0, -1, "abc", 1.234):
        assert (
            await client.patch(_conferir(item["comprovante_id"]), json={"valor": ruim}, headers=tesoureiro.headers)
        ).status_code == 422, ruim
    ok = await client.patch(_conferir(item["comprovante_id"]), json={"valor": 50}, headers=tesoureiro.headers)
    assert ok.status_code == 200 and ok.json()["status"] == "PAGO"
    # O médium não abre nada disso.
    assert (await client.get(_historico(medium.id, "2026-10"), headers=actor.headers)).status_code == 403


async def test_outro_terreiro_nao_ve_nem_confere_e_o_medium_ve_so_os_dele(client, db, hoje):
    tenant, actor, medium, admin = await _cenario(db)
    _, actor_b, medium_b, admin_b = await _cenario(db, nome="Outra Casa")
    colega_user = await create_user(db, tenant, UserRole.MEDIUM, name="colega")
    colega = Medium(tenant_id=tenant.id, nome="Colega", user_id=colega_user.user.id, data_entrada=date(2026, 8, 1))
    db.add(colega)
    await db.commit()

    assert (await client.post(_comp("2026-10"), headers=actor.headers, **_arquivo(valor="30"))).status_code == 200
    assert (await client.post(_comp("2026-10"), headers=colega_user.headers, **_arquivo(JPEG_2, valor="45"))).status_code == 200
    fila = (await client.get(FILA, headers=admin.headers)).json()
    assert sorted(f["mediun_nome"] for f in fila) == ["Ana Paula Ribeiro", "Colega"]
    meu = next(f for f in fila if f["mediun_nome"] == "Ana Paula Ribeiro")

    # Outro terreiro: fila vazia, histórico/arquivo/conferir → 404.
    assert (await client.get(FILA, headers=admin_b.headers)).json() == []
    assert (await client.get(_historico(medium.id, "2026-10"), headers=admin_b.headers)).status_code == 404
    arq = await client.get(f"{ADMIN}/mensalidades/comprovantes/{meu['comprovante_id']}/arquivo", headers=admin_b.headers)
    assert arq.status_code == 404
    assert (await client.patch(_conferir(meu["comprovante_id"]), json={"valor": 30}, headers=admin_b.headers)).status_code == 404
    assert (
        await client.patch(_nao_confirmar(meu["comprovante_id"]), json={"motivo": "não é daqui"}, headers=admin_b.headers)
    ).status_code == 404
    db.expire_all()
    comp = (await db.execute(select(MensalidadeComprovante).where(MensalidadeComprovante.id == uuid.UUID(meu["comprovante_id"])))).scalar_one()
    assert comp.status == "em_conferencia"

    # O médium vê só os comprovantes dele (e nada da colega nem da outra casa).
    meus = (await client.get(LISTA, headers=actor.headers)).json()
    assert [c["valor_informado"] for c in _mes(meus)["comprovantes"]] == [30.0]
    assert all(c["valor_informado"] != 45.0 for c in _mes(meus)["comprovantes"])  # nada da colega
    assert _mes((await client.get(LISTA, headers=actor_b.headers)).json())["comprovantes"] == []


# ── Cobrança automática do valor que falta ────────────────────────────────────


async def test_cobranca_automatica_do_valor_que_falta_completa_e_fecha(client, db, stripe_fake, hoje):  # noqa: F811
    tenant, actor, medium, admin = await _cenario(db, plan=PlanType.PRO, gateway="acct_casa1")
    tenant_id, medium_id = tenant.id, medium.id

    # Cobrança do mês inteiro criada antes (o médium abriu o QR de 50 e não pagou).
    cheia = await client.post(f"{LISTA}/2026-10/cobranca", headers=actor.headers, json={"metodo": "pix"})
    assert cheia.status_code == 200 and cheia.json()["valor"] == 50.0

    # Pagou 30 por fora; a casa conferiu 30.
    assert (await client.post(_comp("2026-10"), headers=actor.headers, **_arquivo(valor="30"))).status_code == 200
    [item] = (await client.get(FILA, headers=admin.headers)).json()
    assert (await client.patch(_conferir(item["comprovante_id"]), json={"valor": 30}, headers=admin.headers)).status_code == 200

    # "Pagar com PIX" agora cria a cobrança de 20 (a de 50 não é reaproveitada).
    resto = await client.post(f"{LISTA}/2026-10/cobranca", headers=actor.headers, json={"metodo": "pix"})
    assert resto.status_code == 200, resto.text
    assert resto.json()["valor"] == 20.0 and resto.json()["copia_e_cola"] != cheia.json()["copia_e_cola"]
    assert [c["valor"] for c in stripe_fake["cobrancas"]] == [Decimal("50.00"), Decimal("20.00")]
    db.expire_all()
    cobrancas = (
        await db.execute(select(MensalidadeCobranca).where(MensalidadeCobranca.tenant_id == tenant_id).order_by(MensalidadeCobranca.created_at))
    ).scalars().all()
    assert [(c.valor, c.status) for c in cobrancas] == [(Decimal("50.00"), "cancelada"), (Decimal("20.00"), "pendente")]

    pi = {"id": cobrancas[1].external_id, "amount": 2000, "amount_received": 2000, "status": "succeeded"}
    pago = await _post_evento(client, _evento("payment_intent.succeeded", pi, "acct_casa1"))
    assert pago.status_code == 200 and pago.json()["result"] == "paga", pago.text

    db.expire_all()
    pag = (await db.execute(select(MensalidadePagamento).where(MensalidadePagamento.mediun_id == medium_id))).scalar_one()
    assert pag.status == MensalidadeStatus.PAGO and pag.valor_pago == Decimal("50.00") and pag.origem == "gateway"
    conta = await _conta(db, tenant_id, medium_id)
    assert conta.status == "pago" and conta.valor_pago == Decimal("50.00")
    hist = (await client.get(_historico(medium_id, "2026-10"), headers=admin.headers)).json()
    assert hist["recebido_automatico"] == 20.0 and hist["valor_recebido"] == 50.0 and hist["falta"] == 0.0
    mes = _mes((await client.get(LISTA, headers=actor.headers)).json())
    assert mes["status"] == "paga" and mes["pago_automatico"] is True


async def test_cobranca_paga_por_menos_que_o_mes_nao_fecha(client, db, stripe_fake, hoje):  # noqa: F811
    tenant, actor, medium, admin = await _cenario(db, plan=PlanType.PRO, gateway="acct_casa1")
    medium_id, tenant_id = medium.id, tenant.id
    assert (await client.post(f"{LISTA}/2026-10/cobranca", headers=actor.headers, json={})).status_code == 200
    db.expire_all()
    cob = (await db.execute(select(MensalidadeCobranca).where(MensalidadeCobranca.tenant_id == tenant_id))).scalar_one()
    # O provedor avisou 25 (ex.: cobrança antiga de outro valor): entra no recebido, o mês segue aberto.
    pi = {"id": cob.external_id, "amount": 2500, "amount_received": 2500, "status": "succeeded"}
    assert (await _post_evento(client, _evento("payment_intent.succeeded", pi, "acct_casa1"))).json()["result"] == "paga"
    db.expire_all()
    pag = (await db.execute(select(MensalidadePagamento).where(MensalidadePagamento.mediun_id == medium_id))).scalar_one()
    assert pag.status == MensalidadeStatus.PENDENTE
    mes = _mes((await client.get(LISTA, headers=actor.headers)).json())
    assert mes["valor"] == 25.0 and mes["valor_recebido"] == 25.0
    nova = await client.post(f"{LISTA}/2026-10/cobranca", headers=actor.headers, json={})
    assert nova.status_code == 200 and nova.json()["valor"] == 25.0


# ── Migração 092 ──────────────────────────────────────────────────────────────


def _alembic(*args):
    subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR, check=True, capture_output=True)


async def test_migracao_092_leva_o_slot_unico_para_a_tabela_e_volta(client, db):
    from src.core.database import engine

    tenant, actor, medium, admin = await _cenario(db, nome="Casa Migração")
    t_id, m_id, u_medium, u_admin = tenant.id, medium.id, actor.user.id, admin.user.id
    await db.commit()
    await db.close()

    _alembic("downgrade", "092_mensalidade_comprovantes-1")
    try:
        async with engine.begin() as conn:
            tabelas = set((await conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))).scalars())
            assert "mensalidade_comprovantes" not in tabelas
            base = (
                "INSERT INTO mensalidade_pagamentos (id, tenant_id, mediun_id, mes_referencia, status, valor_vigente, "
                "valor_pago, data_pagamento, comprovante_data, comprovante_filename, comprovante_mime, "
                "comprovante_enviado_em, comprovante_enviado_por, recusado_em, recusa_motivo, registrado_por, "
                "created_at, updated_at) VALUES (:id, :t, :m, :mes, :st, 50, :vp, :dp, :data, :fn, 'image/jpeg', "
                ":env, :envp, :rec, :mot, :reg, now(), now())"
            )
            casos = {
                "conferencia": dict(mes=date(2026, 10, 1), st="PENDENTE", vp=None, dp=None, env=datetime(2026, 10, 2, tzinfo=timezone.utc), envp=u_medium, rec=None, mot=None, reg=None),
                "recusado": dict(mes=date(2026, 9, 1), st="PENDENTE", vp=None, dp=None, env=datetime(2026, 9, 2, tzinfo=timezone.utc), envp=u_medium, rec=datetime(2026, 9, 3, tzinfo=timezone.utc), mot="Valor diferente", reg=None),
                "painel": dict(mes=date(2026, 8, 1), st="PAGO", vp=50, dp=datetime(2026, 8, 9, tzinfo=timezone.utc), env=None, envp=None, rec=None, mot=None, reg=u_admin),
            }
            ids = {}
            for nome, c in casos.items():
                ids[nome] = uuid.uuid4()
                await conn.execute(
                    text(base),
                    {"id": ids[nome], "t": t_id, "m": m_id, "data": JPEG + nome.encode(), "fn": f"{nome}.jpg", **c},
                )
            # Registro sem arquivo não gera comprovante.
            await conn.execute(
                text(
                    "INSERT INTO mensalidade_pagamentos (id, tenant_id, mediun_id, mes_referencia, status, created_at, updated_at) "
                    "VALUES (:id, :t, :m, '2026-07-01', 'ISENTO', now(), now())"
                ),
                {"id": uuid.uuid4(), "t": t_id, "m": m_id},
            )
    finally:
        _alembic("upgrade", "head")

    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text(
                    "SELECT pagamento_id, origem, status, enviado_por, motivo, arquivo_filename, arquivo_tamanho, "
                    "conferido_em, valor_conferido, tenant_id, mediun_id FROM mensalidade_comprovantes"
                )
            )
        ).mappings().all()
    por = {r["pagamento_id"]: r for r in rows}
    assert len(rows) == 3
    c = por[ids["conferencia"]]
    assert (c["origem"], c["status"], c["enviado_por"], c["motivo"]) == ("medium", "em_conferencia", u_medium, None)
    assert c["arquivo_tamanho"] == len(JPEG + b"conferencia") and c["tenant_id"] == t_id and c["mediun_id"] == m_id
    r = por[ids["recusado"]]
    assert (r["status"], r["motivo"]) == ("nao_confirmado", "Valor diferente") and r["conferido_em"] is not None
    p = por[ids["painel"]]
    assert (p["origem"], p["status"], p["enviado_por"], p["valor_conferido"]) == ("painel", "conferido", u_admin, None)

    # Na API: fila com o que estava em conferência; a Área vê "não confirmada" com o motivo.
    fila = (await client.get(FILA, headers=admin.headers)).json()
    assert [f["mes"] for f in fila] == ["2026-10"]

    # Downgrade devolve o mais recente ao slot único.
    _alembic("downgrade", "092_mensalidade_comprovantes-1")
    try:
        async with engine.connect() as conn:
            slot = (
                await conn.execute(
                    text("SELECT comprovante_filename, recusa_motivo FROM mensalidade_pagamentos WHERE id = :id"),
                    {"id": ids["recusado"]},
                )
            ).one()
        assert slot == ("recusado.jpg", "Valor diferente")
    finally:
        _alembic("upgrade", "head")
