"""AM-11/AM-12 — Mensalidade na Área do Médium, com Postgres real (migrações + app via HTTP).

- Meses do médium com status calculado (pendente, atrasada, em conferência, não confirmada, paga,
  isento), o corrente primeiro, sem campos internos;
- PIX copia e cola só para mês em aberto e com chave cadastrada (valor e txid do mês);
- comprovante → "em conferência" (sem marcar pago); a casa confirma (POST de registro → PAGO +
  espelho em contas a receber) ou não confirma com motivo (PATCH .../recusa) e o médium reenvia;
- isolamento por médium e por terreiro; PAGO/ISENTO recusam envio; > 2 MB e tipo errado
  recusados; impersonação não envia; módulo desligado, plano sem `mensalidade_mediun` e chave do
  piloto desligada → 403.

Chave PIX de teste: CPF de exemplo conhecido (123.456.789-09) — nenhuma chave real.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from src.api.v1.medium import inicio as inicio_mod
from src.api.v1.medium import mensalidades as mens_mod
from src.models import Medium, MensalidadeComprovante, MensalidadeConfig, MensalidadePagamento, MensalidadeStatus
from src.models.audit_logs import AuditLog
from src.models.contas_financeiras import ContaFinanceira
from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.tenant_config import TenantConfig
from src.models.users import UserRole
from src.security.jwt import create_access_token
from src.services.pix_brcode import crc16_ccitt, txid_mensalidade

from .factories import create_tenant, create_user, grant

LISTA = "/api/v1/medium/mensalidades"
ADMIN = "/api/v1/admin/financeiro"
FILA = f"{ADMIN}/mensalidades/comprovantes-para-conferir"
INICIO = "/api/v1/medium/inicio"

JPEG = b"\xff\xd8\xff\xe0" + b"comprovante-de-teste" * 20
PDF = b"%PDF-1.4\n" + b"0" * 200


def _pix(mes: str) -> str:
    return f"{LISTA}/{mes}/pix"


def _comp(mes: str) -> str:
    return f"{LISTA}/{mes}/comprovante"


def _arquivo(data=JPEG, nome="comprovante.jpg", tipo="image/jpeg"):
    return {"arquivo": (nome, data, tipo)}


@pytest.fixture
def hoje(monkeypatch):
    """Fixa o "hoje" de Brasília da Área (tela Mensalidade e Início)."""

    def _set(d: date):
        monkeypatch.setattr(mens_mod, "today_local", lambda: d)
        monkeypatch.setattr(inicio_mod, "today_local", lambda: d)

    _set(date(2026, 10, 8))
    return _set


async def _cenario(
    db,
    *,
    plan=PlanType.BASIC,
    liberada=True,
    com_pix=True,
    entrada=date(2026, 8, 5),
    nome="Terreiro AM11",
):
    tenant = await create_tenant(db, name=nome, plan=plan, area_medium_liberada=liberada)
    config = MensalidadeConfig(
        tenant_id=tenant.id,
        valor_mensal=Decimal("50.00"),
        dia_vencimento=10,
        ativo=True,
        created_at=datetime(2026, 1, 5, tzinfo=timezone.utc),
    )
    if com_pix:
        config.pix_tipo = "cpf"
        config.pix_chave = "12345678909"
        config.pix_nome_recebedor = "Casa de Oxala"
        config.pix_cidade = "Sao Paulo"
        config.pix_instrucoes = "Mande o comprovante pela Área."
    db.add(config)
    actor = await create_user(db, tenant, UserRole.MEDIUM, name="medium")
    medium = Medium(tenant_id=tenant.id, nome="Ana Paula Ribeiro", user_id=actor.user.id, data_entrada=entrada)
    db.add(medium)
    await db.commit()
    return tenant, actor, medium


async def _pagamento(db, tenant, medium, mes, status, **kw):
    db.add(
        MensalidadePagamento(
            tenant_id=tenant.id, mediun_id=medium.id, mes_referencia=mes, status=status, **kw
        )
    )
    await db.commit()


def _por_mes(body):
    return {m["mes"]: m for m in body["meses"]}


# ── AM-11: meses e status ─────────────────────────────────────────────────────


async def test_meses_do_medium_com_status_e_o_atual_primeiro(client, db, hoje):
    tenant, actor, medium = await _cenario(db)
    await _pagamento(
        db, tenant, medium, date(2026, 8, 1), MensalidadeStatus.PAGO,
        valor_vigente=Decimal("50.00"), valor_pago=Decimal("50.00"),
        data_pagamento=datetime(2026, 8, 9, 15, tzinfo=timezone.utc),
        observacao="anotação interna da secretaria",
    )

    resp = await client.get(LISTA, headers=actor.headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["hoje"] == "2026-10-08"
    assert body["isento"] is False
    assert body["valor_mensal"] == 50.0 and body["dia_vencimento"] == 10
    assert body["pix"]["chave"] == "12345678909"
    assert body["pix"]["nome_recebedor"] == "Casa de Oxala"
    assert [m["mes"] for m in body["meses"]] == ["2026-10", "2026-09", "2026-08"]
    meses = _por_mes(body)
    assert meses["2026-10"]["status"] == "pendente" and meses["2026-10"]["atual"] is True
    assert meses["2026-10"]["vencimento"] == "2026-10-10" and meses["2026-10"]["valor"] == 50.0
    assert meses["2026-09"]["status"] == "atrasada"
    assert meses["2026-08"]["status"] == "paga"
    assert meses["2026-08"]["data_pagamento"].startswith("2026-08-09")
    # Nada interno: observação, quem registrou, ids.
    texto = resp.text
    assert "anotação interna" not in texto and "registrado_por" not in texto and str(medium.id) not in texto

    hoje(date(2026, 10, 11))
    body = (await client.get(LISTA, headers=actor.headers)).json()
    assert body["meses"][0]["status"] == "atrasada"


async def test_isento_permanente_e_isento_no_mes(client, db, hoje):
    tenant, actor, medium = await _cenario(db)
    await _pagamento(db, tenant, medium, date(2026, 9, 1), MensalidadeStatus.ISENTO)
    meses = _por_mes((await client.get(LISTA, headers=actor.headers)).json())
    assert meses["2026-09"]["status"] == "isento" and meses["2026-09"]["valor"] is None

    medium.mensalidade_isento = True
    await db.commit()
    body = (await client.get(LISTA, headers=actor.headers)).json()
    assert body["isento"] is True
    assert [(m["mes"], m["status"]) for m in body["meses"]] == [("2026-10", "isento"), ("2026-09", "isento")]
    resp = await client.get(_pix("2026-10"), headers=actor.headers)
    assert resp.status_code == 409 and resp.json()["details"]["error_code"] == "MES_FECHADO"


async def test_casa_que_acabou_de_configurar_nao_cobra_meses_anteriores(client, db, hoje):
    tenant, actor, medium = await _cenario(db, entrada=date(2015, 3, 1))
    config = (await db.execute(select(MensalidadeConfig).where(MensalidadeConfig.tenant_id == tenant.id))).scalar_one()
    config.created_at = datetime(2026, 9, 20, tzinfo=timezone.utc)
    await db.commit()
    body = (await client.get(LISTA, headers=actor.headers)).json()
    assert [m["mes"] for m in body["meses"]] == ["2026-10", "2026-09"]


# ── AM-11: PIX do mês ─────────────────────────────────────────────────────────


async def test_pix_so_para_mes_em_aberto_com_valor_e_txid(client, db, hoje):
    tenant, actor, medium = await _cenario(db)
    await _pagamento(db, tenant, medium, date(2026, 8, 1), MensalidadeStatus.PAGO, valor_vigente=Decimal("50.00"))

    resp = await client.get(_pix("2026-10"), headers=actor.headers)
    assert resp.status_code == 200, resp.text
    pix = resp.json()
    txid = txid_mensalidade(date(2026, 10, 1), medium.id)
    assert pix["txid"] == txid and txid.startswith("MENS202610")
    code = pix["copia_e_cola"]
    assert "0014br.gov.bcb.pix" in code and "12345678909" in code
    assert "540550.00" in code and f"0520{txid}" in code
    assert code[-4:] == crc16_ccitt(code[:-4])
    assert pix["valor"] == 50.0 and pix["nome_recebedor"] == "Casa de Oxala"

    # Mês atrasado também paga; mês pago, mês fora da Área e mês mal escrito, não.
    assert (await client.get(_pix("2026-09"), headers=actor.headers)).status_code == 200
    pago = await client.get(_pix("2026-08"), headers=actor.headers)
    assert pago.status_code == 409 and pago.json()["details"]["error_code"] == "MES_FECHADO"
    fora = await client.get(_pix("2026-05"), headers=actor.headers)
    assert fora.status_code == 404 and fora.json()["details"]["error_code"] == "MES_SEM_MENSALIDADE"
    assert (await client.get(_pix("2026-11"), headers=actor.headers)).status_code == 404
    assert (await client.get(_pix("outubro"), headers=actor.headers)).status_code == 422


async def test_sem_chave_pix_responde_409_e_a_lista_avisa(client, db, hoje):
    _, actor, _ = await _cenario(db, com_pix=False)
    body = (await client.get(LISTA, headers=actor.headers)).json()
    assert body["pix"] is None
    resp = await client.get(_pix("2026-10"), headers=actor.headers)
    assert resp.status_code == 409
    assert resp.json()["details"]["error_code"] == "PIX_NAO_CONFIGURADO"


# ── AM-12: comprovante, confirmação e recusa ──────────────────────────────────


async def test_comprovante_fica_em_conferencia_e_a_casa_confirma(client, db, hoje):
    tenant, actor, medium = await _cenario(db)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="admin")

    resp = await client.post(_comp("2026-10"), files=_arquivo(), headers=actor.headers)
    assert resp.status_code == 200, resp.text
    item = resp.json()
    assert item["status"] == "em_conferencia" and item["comprovante_enviado_em"]

    # O registro continua PENDENTE (o médium nunca marca pago), sem `registrado_por`.
    pag = (
        await db.execute(select(MensalidadePagamento).where(MensalidadePagamento.mediun_id == medium.id))
    ).scalar_one()
    assert pag.status == MensalidadeStatus.PENDENTE and pag.registrado_por is None
    assert pag.valor_vigente == Decimal("50.00")
    # Desde a 092 o comprovante é uma linha própria (o slot antigo não recebe escrita).
    assert pag.comprovante_data is None
    comp = (
        await db.execute(select(MensalidadeComprovante).where(MensalidadeComprovante.pagamento_id == pag.id))
    ).scalar_one()
    assert comp.enviado_por == actor.user.id and comp.origem == "medium" and comp.status == "em_conferencia"
    assert comp.arquivo_mime == "image/jpeg" and comp.arquivo_tamanho == len(JPEG)

    # Auditoria sem o arquivo.
    logs = (
        await db.execute(select(AuditLog).where(AuditLog.resource_type == "mensalidade_comprovante_medium"))
    ).scalars().all()
    assert len(logs) == 1 and "comprovante-de-teste" not in str(logs[0].details)

    # Na Área: em conferência, sem PIX e fora das pendências do Início.
    assert _por_mes((await client.get(LISTA, headers=actor.headers)).json())["2026-10"]["status"] == "em_conferencia"
    assert (await client.get(_pix("2026-10"), headers=actor.headers)).status_code == 409
    inicio = (await client.get(INICIO, headers=actor.headers)).json()
    assert inicio["mensalidade"]["status"] == "em_conferencia" and inicio["pendencias"] == []

    # No painel: fila, selo na lista do mês e download pela rota que já existia.
    fila = (await client.get(FILA, headers=admin.headers)).json()
    assert [(f["mediun_nome"], f["mes"], f["valor"]) for f in fila] == [("Ana Paula Ribeiro", "2026-10", 50.0)]
    lista = (await client.get(f"{ADMIN}/mensalidades?mes=2026-10", headers=admin.headers)).json()
    linha = next(r for r in lista if r["mediun_id"] == str(medium.id))
    assert linha["comprovante_para_conferir"] is True and linha["status"] == "PENDENTE"
    down = await client.get(f"{ADMIN}/mensalidades/{medium.id}/2026-10/comprovante", headers=admin.headers)
    assert down.status_code == 200 and down.content == JPEG

    # Confirmar = POST de registro de sempre → PAGO + espelho em contas a receber.
    ok = await client.post(
        f"{ADMIN}/mensalidades/{medium.id}/2026-10",
        data={"status": "PAGO", "valor_pago": "50", "data_pagamento": "2026-10-08"},
        headers=admin.headers,
    )
    assert ok.status_code == 200, ok.text
    assert (await client.get(FILA, headers=admin.headers)).json() == []
    assert _por_mes((await client.get(LISTA, headers=actor.headers)).json())["2026-10"]["status"] == "paga"
    conta = (
        await db.execute(
            select(ContaFinanceira).where(
                ContaFinanceira.tenant_id == tenant.id,
                ContaFinanceira.external_ref == f"mensalidade:mediun:{medium.id}:2026-10",
            )
        )
    ).scalar_one()
    assert conta.status == "pago" and conta.valor_pago == Decimal("50.00")
    # O comprovante do médium continua lá depois de confirmar.
    down = await client.get(f"{ADMIN}/mensalidades/{medium.id}/2026-10/comprovante", headers=admin.headers)
    assert down.content == JPEG

    # Mês pago recusa novo envio.
    resp = await client.post(_comp("2026-10"), files=_arquivo(), headers=actor.headers)
    assert resp.status_code == 409 and resp.json()["details"]["error_code"] == "MES_FECHADO"


async def test_casa_nao_confirma_com_motivo_e_o_medium_reenvia(client, db, hoje):
    tenant, actor, medium = await _cenario(db)
    so_ve = await create_user(db, tenant, UserRole.OPERATOR, name="so-ve")
    await grant(db, so_ve, tenant, PermissionFeature.FINANCEIRO, "view")
    tesoureiro = await create_user(db, tenant, UserRole.OPERATOR, name="tesoureiro")
    await grant(db, tesoureiro, tenant, PermissionFeature.FINANCEIRO, "view", "insert", "edit")

    assert (await client.post(_comp("2026-09"), files=_arquivo(PDF, "extrato.pdf", "application/pdf"), headers=actor.headers)).status_code == 200
    recusa = f"{ADMIN}/mensalidades/{medium.id}/2026-09/recusa"
    motivo = {"motivo": "O comprovante mostra R$ 40,00 e a mensalidade é R$ 50,00."}

    # Só ver não basta para recusar.
    assert (await client.get(FILA, headers=so_ve.headers)).status_code == 200
    assert (await client.patch(recusa, json=motivo, headers=so_ve.headers)).status_code == 403
    assert (await client.patch(recusa, json={"motivo": "  "}, headers=tesoureiro.headers)).status_code == 422

    resp = await client.patch(recusa, json=motivo, headers=tesoureiro.headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["recusa_motivo"] == motivo["motivo"]
    # Recusar de novo o mesmo comprovante: nada esperando conferência.
    again = await client.patch(recusa, json=motivo, headers=tesoureiro.headers)
    assert again.status_code == 409 and again.json()["details"]["error_code"] == "COMPROVANTE_NAO_PENDENTE"
    assert (await client.get(FILA, headers=tesoureiro.headers)).json() == []

    # O médium vê o motivo, pode pagar de novo e o Início avisa.
    mes = _por_mes((await client.get(LISTA, headers=actor.headers)).json())["2026-09"]
    assert mes["status"] == "nao_confirmada" and mes["recusa_motivo"] == motivo["motivo"]
    assert (await client.get(_pix("2026-09"), headers=actor.headers)).status_code == 200

    # Reenvio limpa a recusa e volta para a fila.
    resp = await client.post(_comp("2026-09"), files=_arquivo(), headers=actor.headers)
    assert resp.status_code == 200 and resp.json()["status"] == "em_conferencia"
    assert resp.json()["recusa_motivo"] is None
    fila = (await client.get(FILA, headers=tesoureiro.headers)).json()
    assert [f["mes"] for f in fila] == ["2026-09"]

    # Recusa do mês corrente sobe como pendência no Início.
    assert (await client.post(_comp("2026-10"), files=_arquivo(), headers=actor.headers)).status_code == 200
    r = await client.patch(f"{ADMIN}/mensalidades/{medium.id}/2026-10/recusa", json=motivo, headers=tesoureiro.headers)
    assert r.status_code == 200
    inicio = (await client.get(INICIO, headers=actor.headers)).json()
    assert inicio["mensalidade"]["status"] == "nao_confirmada"
    assert inicio["pendencias"][0]["situacao"] == "nao_confirmada"


async def test_medium_nao_marca_pago_nem_mexe_no_mes_de_outro(client, db, hoje):
    tenant, actor, medium = await _cenario(db)
    colega_user = await create_user(db, tenant, UserRole.MEDIUM, name="colega")
    colega = Medium(tenant_id=tenant.id, nome="Colega", user_id=colega_user.user.id, data_entrada=date(2026, 8, 1))
    db.add(colega)
    await db.commit()
    await _pagamento(db, tenant, colega, date(2026, 10, 1), MensalidadeStatus.PAGO, valor_vigente=Decimal("80.00"), valor_pago=Decimal("80.00"))

    # medium_id na URL não muda nada: o envio é sempre no MEU mês.
    resp = await client.post(f"{_comp('2026-09')}?medium_id={colega.id}", files=_arquivo(), headers=actor.headers)
    assert resp.status_code == 200
    regs = (await db.execute(select(MensalidadePagamento).where(MensalidadePagamento.tenant_id == tenant.id))).scalars().all()
    por_medium = {(r.mediun_id, r.mes_referencia.isoformat()) for r in regs}
    assert por_medium == {(medium.id, "2026-09-01"), (colega.id, "2026-10-01")}
    assert all(r.comprovante_data is None for r in regs if r.mediun_id == colega.id)

    meu = (await client.get(f"{LISTA}?medium_id={colega.id}", headers=actor.headers)).json()
    assert _por_mes(meu)["2026-10"]["status"] == "pendente"
    assert "80" not in str([m["valor"] for m in meu["meses"]])

    # Marcar como pago só pelo painel — que o médium não abre.
    pagar = await client.post(f"{ADMIN}/mensalidades/{medium.id}/2026-10", data={"status": "PAGO"}, headers=actor.headers)
    assert pagar.status_code == 403
    assert (await client.patch(f"{ADMIN}/mensalidades/{medium.id}/2026-09/recusa", json={"motivo": "x" * 5}, headers=actor.headers)).status_code == 403
    assert (await client.get(FILA, headers=actor.headers)).status_code == 403


async def test_admin_de_outro_terreiro_nao_ve_nem_recusa(client, db, hoje):
    tenant, actor, medium = await _cenario(db)
    outro, _, _ = await _cenario(db, nome="Outra Casa")
    admin_outro = await create_user(db, outro, UserRole.ADMIN, name="admin-outro")
    assert (await client.post(_comp("2026-10"), files=_arquivo(), headers=actor.headers)).status_code == 200
    assert (await client.get(FILA, headers=admin_outro.headers)).json() == []
    resp = await client.patch(
        f"{ADMIN}/mensalidades/{medium.id}/2026-10/recusa", json={"motivo": "não é daqui"}, headers=admin_outro.headers
    )
    assert resp.status_code == 404


async def test_arquivo_grande_tipo_errado_isento_e_mes_fora(client, db, hoje):
    tenant, actor, medium = await _cenario(db)
    grande = JPEG + b"0" * (2 * 1024 * 1024)
    resp = await client.post(_comp("2026-10"), files=_arquivo(grande), headers=actor.headers)
    assert resp.status_code == 422 and resp.json()["details"]["error_code"] == "COMPROVANTE_GRANDE"
    resp = await client.post(_comp("2026-10"), files=_arquivo(b"GIF89a....", "x.gif", "image/gif"), headers=actor.headers)
    assert resp.status_code == 422 and resp.json()["details"]["error_code"] == "COMPROVANTE_TIPO"
    resp = await client.post(_comp("2026-10"), files=_arquivo(b"<html></html>", "x.jpg", "image/jpeg"), headers=actor.headers)
    assert resp.status_code == 422
    assert (await client.post(_comp("2026-05"), files=_arquivo(), headers=actor.headers)).status_code == 404
    assert (await client.post(_comp("2026-11"), files=_arquivo(), headers=actor.headers)).status_code == 404

    await _pagamento(db, tenant, medium, date(2026, 9, 1), MensalidadeStatus.ISENTO)
    resp = await client.post(_comp("2026-09"), files=_arquivo(), headers=actor.headers)
    assert resp.status_code == 409 and resp.json()["details"]["status"] == "isento"
    # Nada foi gravado pelos envios recusados.
    regs = (await db.execute(select(MensalidadePagamento).where(MensalidadePagamento.mediun_id == medium.id))).scalars().all()
    assert [(r.mes_referencia.isoformat(), r.comprovante_data) for r in regs] == [("2026-09-01", None)]


async def test_impersonacao_ve_mas_nao_envia(client, db, hoje):
    _, actor, _ = await _cenario(db)
    token = create_access_token(actor.user.id, actor.user.tenant_id, "medium", impersonated_by=uuid.uuid4())
    headers = {"Authorization": f"Bearer {token}"}
    assert (await client.get(LISTA, headers=headers)).status_code == 200
    assert (await client.get(_pix("2026-10"), headers=headers)).status_code == 200
    assert (await client.post(_comp("2026-10"), files=_arquivo(), headers=headers)).status_code == 403


# ── Gates ─────────────────────────────────────────────────────────────────────


async def _todas(client, headers):
    return [
        (await client.get(LISTA, headers=headers)).status_code,
        (await client.get(_pix("2026-10"), headers=headers)).status_code,
        (await client.post(_comp("2026-10"), files=_arquivo(), headers=headers)).status_code,
    ]


async def test_modulo_desligado_plano_sem_mensalidade_e_chave_do_piloto_dao_403(client, db, hoje, monkeypatch):
    tenant, actor, _ = await _cenario(db)
    tc = (await db.execute(select(TenantConfig).where(TenantConfig.tenant_id == tenant.id))).scalar_one()
    tc.area_medium_mensalidade = False
    await db.commit()
    resp = await client.get(LISTA, headers=actor.headers)
    assert resp.status_code == 403 and resp.json()["details"]["error_code"] == "MEDIUM_MODULO_INDISPONIVEL"
    assert await _todas(client, actor.headers) == [403, 403, 403]
    tc.area_medium_mensalidade = True
    await db.commit()
    assert (await client.get(LISTA, headers=actor.headers)).status_code == 200

    # Plano efetivo sem `mensalidade_mediun` (hoje todo plano com a Área tem; o gate segue o catálogo).
    from src.services import medium_area
    from src.services.plan_features import get_effective_plan_features

    def _sem_mensalidade(sub):
        return get_effective_plan_features(sub).model_copy(update={"mensalidade_mediun": False})

    monkeypatch.setattr(medium_area, "get_effective_plan_features", _sem_mensalidade)
    assert await _todas(client, actor.headers) == [403, 403, 403]
    monkeypatch.undo()
    hoje(date(2026, 10, 8))

    _, desligada, _ = await _cenario(db, liberada=False, nome="Casa sem piloto")
    assert await _todas(client, desligada.headers) == [403, 403, 403]
    _, gratuito, _ = await _cenario(db, plan=PlanType.FREE, nome="Casa gratuita")
    assert await _todas(client, gratuito.headers) == [403, 403, 403]
