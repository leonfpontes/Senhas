"""Jornadas "Casa e pessoas" — médiuns, associados e mensalidades com Postgres real.

Cobre o espelho mensalidade → contas a receber (valor pago real, ISENTO
cancela, contas futuras canceladas ao inativar/excluir), o mês de referência
por data de entrada/saída, o recadastro de associado excluído (índice único
parcial da migração 058), o limite de médiuns na reativação, o modo somente
leitura de médiuns fora do plano e a trava dos espelhos nos Lançamentos.
"""
from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import text

from src.core.tz import today_local
from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.users import UserRole

from .conftest import SESSION_LOOP
from .factories import create_tenant, create_user, grant

FIN = "/api/v1/admin/financeiro"


@SESSION_LOOP
async def cenario(db, client):
    tenant = await create_tenant(db, name="Casa Jornadas")
    admin = await create_user(db, tenant, UserRole.ADMIN)
    resp = await client.put(
        f"{FIN}/config",
        headers=admin.headers,
        json={
            "valor_mensal": 100,
            "dia_vencimento": 10,
            "valor_mensal_associado": 50,
            "dia_vencimento_associado": 15,
            "enable_mensalidade_associado": True,
        },
    )
    assert resp.status_code == 200, resp.text
    return tenant, admin


async def _conta(db, tenant_id, ref: str):
    row = (
        await db.execute(
            text(
                "SELECT status, valor, valor_pago FROM contas_financeiras "
                "WHERE tenant_id = :t AND external_ref = :r AND deleted_at IS NULL"
            ),
            {"t": tenant_id, "r": ref},
        )
    ).first()
    return row


async def _criar_medium(client, admin, **body):
    resp = await client.post("/api/v1/admin/mediuns", headers=admin.headers, json={"nome": "Médium", **body})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _proximo_mes(d: date) -> str:
    return f"{d.year + 1}-01" if d.month == 12 else f"{d.year}-{d.month + 1:02d}"


# ── 1 + 8: valor pago real vai para a conta; valor vigente não é recapturado ──

async def test_valor_pago_real_vai_para_contas_a_receber(client, db, cenario):
    tenant, admin = cenario
    m = await _criar_medium(client, admin, nome="Pai Joaquim")
    mes = "2026-03"
    resp = await client.post(
        f"{FIN}/mensalidades/{m['id']}/{mes}",
        headers=admin.headers,
        data={"status": "PAGO", "valor_pago": "80", "data_pagamento": "2026-03-05"},
    )
    assert resp.status_code == 200, resp.text
    status, valor, valor_pago = await _conta(db, tenant.id, f"mensalidade:mediun:{m['id']}:{mes}")
    assert status == "pago"
    assert float(valor) == 100.0
    assert float(valor_pago) == 80.0

    # Config muda; editar o mesmo mês não recaptura o valor vigente (item 8).
    await client.put(f"{FIN}/config", headers=admin.headers, json={"valor_mensal": 150})
    resp = await client.post(
        f"{FIN}/mensalidades/{m['id']}/{mes}",
        headers=admin.headers,
        data={"status": "PAGO", "valor_pago": "90", "data_pagamento": "2026-03-06"},
    )
    assert resp.status_code == 200, resp.text
    lista = (await client.get(f"{FIN}/mensalidades?mes={mes}", headers=admin.headers)).json()
    item = next(i for i in lista if i["mediun_id"] == m["id"])
    assert item["valor_vigente"] == 100.0
    assert item["valor_pago"] == 90.0
    status, valor, valor_pago = await _conta(db, tenant.id, f"mensalidade:mediun:{m['id']}:{mes}")
    assert (status, float(valor), float(valor_pago)) == ("pago", 100.0, 90.0)


async def test_valor_pago_do_associado_vai_para_a_conta(client, db, cenario):
    tenant, admin = cenario
    a = (
        await client.post(
            "/api/v1/admin/associados", headers=admin.headers, json={"nome": "Ana", "email": "ana@example.com"}
        )
    ).json()
    mes = "2026-02"
    resp = await client.post(
        f"{FIN}/associados/{a['id']}/{mes}", headers=admin.headers, data={"status": "PAGO", "valor_pago": "40"}
    )
    assert resp.status_code == 200, resp.text
    status, valor, valor_pago = await _conta(db, tenant.id, f"mensalidade:associado:{a['id']}:{mes}")
    assert (status, float(valor), float(valor_pago)) == ("pago", 50.0, 40.0)


# ── 2: ISENTO cancela a conta espelho ─────────────────────────────────────────

async def test_isento_cancela_a_conta_do_mes(client, db, cenario):
    tenant, admin = cenario
    m = await _criar_medium(client, admin, nome="Mãe Maria")
    mes = "2026-04"
    url = f"{FIN}/mensalidades/{m['id']}/{mes}"
    ref = f"mensalidade:mediun:{m['id']}:{mes}"
    assert (await client.post(url, headers=admin.headers, data={"status": "PAGO"})).status_code == 200
    assert (await _conta(db, tenant.id, ref))[0] == "pago"

    assert (await client.post(url, headers=admin.headers, data={"status": "ISENTO"})).status_code == 200
    status, _, valor_pago = await _conta(db, tenant.id, ref)
    assert status == "cancelado"
    assert valor_pago is None

    # Voltar a registrar como pago reabre o espelho.
    assert (await client.post(url, headers=admin.headers, data={"status": "PAGO"})).status_code == 200
    assert (await _conta(db, tenant.id, ref))[0] == "pago"


# ── 7: lote não apaga observação; formulário com campo vazio limpa ────────────

async def test_observacao_so_muda_quando_enviada(client, db, cenario):
    tenant, admin = cenario
    m = await _criar_medium(client, admin, nome="Caboclo")
    url = f"{FIN}/mensalidades/{m['id']}/2026-05"
    await client.post(url, headers=admin.headers, data={"status": "PENDENTE", "observacao": "paga dia 20"})
    await client.post(url, headers=admin.headers, data={"status": "PAGO"})  # lote: sem observacao
    item = next(
        i for i in (await client.get(f"{FIN}/mensalidades?mes=2026-05", headers=admin.headers)).json()
        if i["mediun_id"] == m["id"]
    )
    assert item["observacao"] == "paga dia 20"
    await client.post(url, headers=admin.headers, data={"status": "PAGO", "observacao": ""})
    item = next(
        i for i in (await client.get(f"{FIN}/mensalidades?mes=2026-05", headers=admin.headers)).json()
        if i["mediun_id"] == m["id"]
    )
    assert item["observacao"] is None


# ── 4: recadastrar associado excluído com o mesmo e-mail ─────────────────────

async def test_recadastrar_associado_excluido_com_mesmo_email(client, db, cenario):
    _, admin = cenario
    body = {"nome": "Rita", "email": "Rita@Example.com"}
    first = await client.post("/api/v1/admin/associados", headers=admin.headers, json=body)
    assert first.status_code == 201, first.text
    dup = await client.post("/api/v1/admin/associados", headers=admin.headers, json=body)
    assert dup.status_code == 409

    assert (await client.delete(f"/api/v1/admin/associados/{first.json()['id']}", headers=admin.headers)).status_code == 204
    again = await client.post("/api/v1/admin/associados", headers=admin.headers, json=body)
    assert again.status_code == 201, again.text
    assert again.json()["id"] != first.json()["id"]


# ── 9: mês de referência respeita data de entrada/saída ───────────────────────

async def test_mes_de_referencia_respeita_entrada_e_saida(client, db, cenario):
    _, admin = cenario
    mes = "2025-03"
    entrou_depois = await _criar_medium(client, admin, nome="Entrou depois", data_entrada="2025-05-01")
    entrou_no_mes = await _criar_medium(client, admin, nome="Entrou no mês", data_entrada="2025-03-31")
    sem_data = await _criar_medium(client, admin, nome="Sem data")
    saiu_no_mes = await _criar_medium(client, admin, nome="Saiu no mês", data_entrada="2024-01-01")
    saiu_antes = await _criar_medium(client, admin, nome="Saiu antes", data_entrada="2024-01-01")
    for m, saida in ((saiu_no_mes, "2025-03-15"), (saiu_antes, "2025-02-10")):
        resp = await client.patch(
            f"/api/v1/admin/mediuns/{m['id']}", headers=admin.headers, json={"is_active": False, "data_saida": saida}
        )
        assert resp.status_code == 200, resp.text

    ids = {i["mediun_id"] for i in (await client.get(f"{FIN}/mensalidades?mes={mes}", headers=admin.headers)).json()}
    assert entrou_depois["id"] not in ids
    assert saiu_antes["id"] not in ids
    assert {entrou_no_mes["id"], sem_data["id"], saiu_no_mes["id"]} <= ids

    # Quem tem registro de pagamento no mês aparece mesmo fora do período.
    await client.post(f"{FIN}/mensalidades/{saiu_antes['id']}/{mes}", headers=admin.headers, data={"status": "PAGO"})
    ids = {i["mediun_id"] for i in (await client.get(f"{FIN}/mensalidades?mes={mes}", headers=admin.headers)).json()}
    assert saiu_antes["id"] in ids


# ── 14: inativar/excluir cancela as contas futuras pendentes ─────────────────

async def test_inativar_medium_cancela_conta_do_mes_seguinte(client, db, cenario):
    tenant, admin = cenario
    m = await _criar_medium(client, admin, nome="Vai sair")
    ref = f"mensalidade:mediun:{m['id']}:{_proximo_mes(today_local())}"
    assert (await _conta(db, tenant.id, ref))[0] == "pendente"  # criada no cadastro

    resp = await client.patch(
        f"/api/v1/admin/mediuns/{m['id']}",
        headers=admin.headers,
        json={"is_active": False, "data_saida": today_local().isoformat()},
    )
    assert resp.status_code == 200, resp.text
    assert (await _conta(db, tenant.id, ref))[0] == "cancelado"


async def test_excluir_associado_cancela_conta_do_mes_seguinte(client, db, cenario):
    tenant, admin = cenario
    a = (
        await client.post(
            "/api/v1/admin/associados", headers=admin.headers, json={"nome": "Saindo", "email": "saindo@example.com"}
        )
    ).json()
    ref = f"mensalidade:associado:{a['id']}:{_proximo_mes(today_local())}"
    assert (await _conta(db, tenant.id, ref))[0] == "pendente"
    assert (await client.delete(f"/api/v1/admin/associados/{a['id']}", headers=admin.headers)).status_code == 204
    assert (await _conta(db, tenant.id, ref))[0] == "cancelado"


async def test_isento_no_cadastro_nao_gera_conta(client, db, cenario):
    tenant, admin = cenario
    m = await _criar_medium(client, admin, nome="Isento", mensalidade_isento=True)
    assert m["mensalidade_isento"] is True
    ref = f"mensalidade:mediun:{m['id']}:{_proximo_mes(today_local())}"
    assert await _conta(db, tenant.id, ref) is None


# ── 12: reativar respeita max_mediuns ─────────────────────────────────────────

async def test_reativar_medium_respeita_limite_do_plano(client, db, cenario):
    tenant, admin = cenario
    antigo = await _criar_medium(client, admin, nome="Antigo")
    await client.patch(f"/api/v1/admin/mediuns/{antigo['id']}", headers=admin.headers, json={"is_active": False})
    await db.execute(text("UPDATE subscriptions SET max_mediuns = 1 WHERE tenant_id = :t"), {"t": tenant.id})
    await db.commit()
    await _criar_medium(client, admin, nome="Novo")

    resp = await client.patch(f"/api/v1/admin/mediuns/{antigo['id']}", headers=admin.headers, json={"is_active": True})
    assert resp.status_code == 422, resp.text
    assert "Limite" in resp.json()["detail"]


# ── 10: null limpa campos na edição ───────────────────────────────────────────

async def test_edicao_com_null_limpa_campos(client, db, cenario):
    _, admin = cenario
    m = await _criar_medium(client, admin, nome="Contato", telefone="(11) 98888-7777", email="c@example.com")
    assert m["telefone"] == "11988887777"
    resp = await client.patch(
        f"/api/v1/admin/mediuns/{m['id']}", headers=admin.headers, json={"telefone": None, "email": None}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["telefone"] is None and resp.json()["email"] is None

    a = (
        await client.post(
            "/api/v1/admin/associados",
            headers=admin.headers,
            json={"nome": "Tel", "email": "tel@example.com", "telefone": "(21) 3333-4444"},
        )
    ).json()
    assert a["telefone"] == "2133334444"
    resp = await client.put(f"/api/v1/admin/associados/{a['id']}", headers=admin.headers, json={"telefone": None})
    assert resp.status_code == 200, resp.text
    assert resp.json()["telefone"] is None


# ── Espelhos de mensalidade são somente leitura nos Lançamentos ──────────────

async def test_espelho_de_mensalidade_e_somente_leitura_nos_lancamentos(client, db, cenario):
    _, admin = cenario
    m = await _criar_medium(client, admin, nome="Espelho")
    contas = (await client.get(f"{FIN}/contas?tipo=receber", headers=admin.headers)).json()
    espelho = next(c for c in contas if "— Espelho —" in c["descricao"])
    assert espelho["origem_mensalidade"] is True
    cid = espelho["id"]
    put = await client.put(f"{FIN}/contas/{cid}", headers=admin.headers, json={"descricao": "x"})
    assert put.status_code == 409
    assert "Mensalidades" in put.json()["detail"]
    baixa = await client.post(
        f"{FIN}/contas/{cid}/baixa", headers=admin.headers, json={"data_pagamento": "2026-01-01", "valor_pago": 10}
    )
    assert baixa.status_code == 409
    assert (await client.delete(f"{FIN}/contas/{cid}", headers=admin.headers)).status_code == 409


# ── 5: operador com grupo FINANCEIRO registra pagamento e edita config ───────

async def test_operador_com_grupo_financeiro_registra_e_configura(client, db, cenario):
    tenant, admin = cenario
    m = await _criar_medium(client, admin, nome="Operado")
    op = await create_user(db, tenant, UserRole.OPERATOR, name="tesoureiro")
    await grant(db, op, tenant, PermissionFeature.FINANCEIRO, "view", "insert", "edit")
    resp = await client.post(f"{FIN}/mensalidades/{m['id']}/2026-06", headers=op.headers, data={"status": "PAGO"})
    assert resp.status_code == 200, resp.text
    resp = await client.put(f"{FIN}/config", headers=op.headers, json={"dia_vencimento": 12})
    assert resp.status_code == 200, resp.text


# ── 11 + 13: médiuns consultáveis fora do plano; associados exigem plano ─────

async def test_medium_fora_do_plano_operador_consulta_mas_nao_altera(client, db):
    tenant = await create_tenant(db, name="Casa Free", plan=PlanType.FREE)
    op = await create_user(db, tenant, UserRole.OPERATOR, name="operador")
    await grant(db, op, tenant, PermissionFeature.MEDIUNS, "view", "insert", "edit", "delete")

    assert (await client.get("/api/v1/admin/mediuns", headers=op.headers)).status_code == 200
    assert (await client.post("/api/v1/admin/mediuns", headers=op.headers, json={"nome": "X"})).status_code == 403
    perms = (await client.get("/api/v1/admin/permission-groups/me/permissions", headers=op.headers)).json()
    assert perms["mediuns"] == {"view": True, "insert": False, "edit": False, "delete": False}

    admin = await create_user(db, tenant, UserRole.ADMIN)
    assert (await client.get("/api/v1/admin/associados", headers=admin.headers)).status_code == 403


async def test_patch_e_delete_de_medium_exigem_plano(client, db):
    tenant = await create_tenant(db, name="Casa Rebaixada", plan=PlanType.PREMIUM)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    m = await _criar_medium(client, admin, nome="Antes do rebaixamento")
    await db.execute(text("UPDATE subscriptions SET plan = 'FREE' WHERE tenant_id = :t"), {"t": tenant.id})
    await db.commit()
    assert (await client.patch(f"/api/v1/admin/mediuns/{m['id']}", headers=admin.headers, json={"nome": "Y"})).status_code == 403
    assert (await client.delete(f"/api/v1/admin/mediuns/{m['id']}", headers=admin.headers)).status_code == 403
    assert UUID(m["id"])  # continua listável
    assert (await client.get("/api/v1/admin/mediuns", headers=admin.headers)).status_code == 200
