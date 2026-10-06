"""Jornadas de Lançamentos / Fluxo de caixa / Analytics / Auditoria via HTTP real.

Regressões cobertas:
- auditoria de contas (criar/excluir/baixa) e de grupos de permissão era gravada DEPOIS do
  commit e descartada ao fechar a sessão;
- PUT de lançamento/categoria/conta bancária não conseguia limpar campo (exclude_none);
- "vencido" só existia como efeito colateral do GET da lista (filtro rodava antes);
- recorrência gravada mas nenhuma próxima ocorrência era gerada;
- fluxo de caixa arredondava o intervalo para meses inteiros e ignorava o saldo inicial;
- Analytics contava "cancelados" como emitidos − usados;
- operador com AUDITORIA:view barrado por um `is_admin` extra.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import select

from src.core.tz import today_local
from src.models.audit_logs import AuditLog
from src.models.consulentes import Consulente
from src.models.contas_financeiras import ContaBancaria, ContaFinanceira
from src.models.permission_groups import PermissionFeature
from src.models.tickets import Ticket, TicketStatus
from src.models.users import UserRole

from .factories import create_gira, create_tenant, create_user, grant

BASE = "/api/v1/admin/financeiro"


async def _audit_rows(tenant_id, resource_id=None, resource_type=None):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        stmt = select(AuditLog).where(AuditLog.tenant_id == tenant_id)
        if resource_id is not None:
            stmt = stmt.where(AuditLog.resource_id == resource_id)
        if resource_type is not None:
            stmt = stmt.where(AuditLog.resource_type == resource_type)
        return (await fresh.execute(stmt)).scalars().all()


async def _contas(tenant_id):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        stmt = select(ContaFinanceira).where(ContaFinanceira.tenant_id == tenant_id).order_by(
            ContaFinanceira.data_vencimento
        )
        return (await fresh.execute(stmt)).scalars().all()


async def _admin(db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    return tenant, admin


async def _criar(client, headers, **extra):
    body = {"tipo": "pagar", "descricao": "Aluguel", "valor": 100.0, "data_vencimento": str(today_local())}
    body.update(extra)
    resp = await client.post(f"{BASE}/contas", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── 1. Auditoria persistida ──────────────────────────────────────────────────


async def test_auditoria_de_contas_e_persistida(client, db):
    tenant, admin = await _admin(db)
    conta = await _criar(client, admin.headers)
    conta_id = uuid.UUID(conta["id"])

    resp = await client.post(
        f"{BASE}/contas/{conta_id}/baixa",
        json={"data_pagamento": str(today_local()), "valor_pago": 100.0},
        headers=admin.headers,
    )
    assert resp.status_code == 200, resp.text
    resp = await client.delete(f"{BASE}/contas/{conta_id}", headers=admin.headers)
    assert resp.status_code == 204, resp.text

    acoes = sorted(r.action.value for r in await _audit_rows(tenant.id, conta_id))
    assert acoes == ["create", "delete", "update"], acoes


async def test_auditoria_de_grupo_de_permissao_e_persistida(client, db):
    tenant, admin = await _admin(db)
    resp = await client.post(
        "/api/v1/admin/permission-groups",
        json={"name": "Tesouraria", "description": "Financeiro"},
        headers=admin.headers,
    )
    assert resp.status_code in (200, 201), resp.text
    rows = await _audit_rows(tenant.id, uuid.UUID(resp.json()["id"]), "PermissionGroup")
    assert len(rows) == 1


# ── 3. Auditoria sem is_admin extra ─────────────────────────────────────────


async def test_operador_com_grupo_de_auditoria_lista_logs(client, db):
    tenant = await create_tenant(db)
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="operador")
    resp = await client.get("/api/v1/admin/audit-logs", headers=operador.headers)
    assert resp.status_code == 403

    await grant(db, operador, tenant, PermissionFeature.AUDITORIA, "view")
    resp = await client.get("/api/v1/admin/audit-logs", headers=operador.headers)
    assert resp.status_code == 200, resp.text


# ── 4. Analytics: cancelados de verdade ─────────────────────────────────────


async def test_analytics_conta_cancelados_pelo_status(client, db):
    tenant, admin = await _admin(db)
    gira = await create_gira(db, tenant)
    statuses = [TicketStatus.EMITTED] * 3 + [TicketStatus.COMPLETED] * 2 + [TicketStatus.CANCELLED, TicketStatus.NO_SHOW]
    for numero, st in enumerate(statuses, start=1):
        email = f"c{uuid.uuid4().hex[:8]}@example.com"
        c = Consulente(tenant_id=tenant.id, nome="Consulente", email=email, email_normalized=email)
        db.add(c)
        await db.flush()
        db.add(Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=c.id, numero=numero, status=st))
    await db.commit()

    resp = await client.get("/api/v1/admin/analytics", headers=admin.headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total_emitted"] == 7
    assert data["total_used"] == 2
    assert data["total_cancelled"] == 1  # antes: 7 − 2 = 5
    assert data["total_no_show"] == 1


# ── 6. PUT limpa campos opcionais ───────────────────────────────────────────


async def test_editar_lancamento_limpa_categoria_e_observacoes(client, db):
    tenant, admin = await _admin(db)
    cat = await client.post(f"{BASE}/categorias", json={"nome": "Luz"}, headers=admin.headers)
    banco = await client.post(f"{BASE}/contas-bancarias", json={"nome": "Caixa", "banco": "CEF"}, headers=admin.headers)
    conta = await _criar(
        client, admin.headers, categoria_id=cat.json()["id"], conta_bancaria_id=banco.json()["id"], observacoes="x"
    )

    resp = await client.put(
        f"{BASE}/contas/{conta['id']}",
        json={"categoria_id": None, "conta_bancaria_id": None, "observacoes": None},
        headers=admin.headers,
    )
    assert resp.status_code == 200, resp.text
    out = resp.json()
    assert out["categoria_id"] is None and out["conta_bancaria_id"] is None and out["observacoes"] is None
    assert out["descricao"] == "Aluguel"  # campo não enviado fica como estava

    # null em campo obrigatório → 422 (antes: ignorado em silêncio)
    resp = await client.put(f"{BASE}/contas/{conta['id']}", json={"descricao": None}, headers=admin.headers)
    assert resp.status_code == 422

    # conta bancária: limpar banco
    resp = await client.put(f"{BASE}/contas-bancarias/{banco.json()['id']}", json={"banco": None}, headers=admin.headers)
    assert resp.status_code == 200 and resp.json()["banco"] is None


async def test_desativar_categoria_e_conta_bancaria(client, db):
    tenant, admin = await _admin(db)
    cat = (await client.post(f"{BASE}/categorias", json={"nome": "Velas"}, headers=admin.headers)).json()
    banco = (await client.post(f"{BASE}/contas-bancarias", json={"nome": "Caixa"}, headers=admin.headers)).json()

    assert (await client.put(f"{BASE}/categorias/{cat['id']}", json={"ativo": False}, headers=admin.headers)).json()["ativo"] is False
    assert (await client.put(f"{BASE}/contas-bancarias/{banco['id']}", json={"ativo": False}, headers=admin.headers)).json()["ativo"] is False

    assert (await client.get(f"{BASE}/categorias", headers=admin.headers)).json() == []
    todas = (await client.get(f"{BASE}/categorias?incluir_inativos=true", headers=admin.headers)).json()
    assert [c["id"] for c in todas] == [cat["id"]]
    assert (await client.get(f"{BASE}/contas-bancarias", headers=admin.headers)).json() == []
    assert len((await client.get(f"{BASE}/contas-bancarias?incluir_inativos=true", headers=admin.headers)).json()) == 1


# ── 7. Vencido derivado ─────────────────────────────────────────────────────


async def test_vencido_e_derivado_no_filtro_e_no_resumo(client, db):
    tenant, admin = await _admin(db)
    hoje = today_local()
    ontem = hoje - timedelta(days=1)
    vencida = await _criar(client, admin.headers, descricao="Atrasada", valor=40.0, data_vencimento=str(ontem))
    await _criar(client, admin.headers, descricao="Em dia", valor=60.0, data_vencimento=str(hoje + timedelta(days=3)))

    # Primeiro GET já filtra por vencido (antes o filtro rodava antes de marcar)
    resp = await client.get(f"{BASE}/contas?status=vencido", headers=admin.headers)
    assert [c["id"] for c in resp.json()] == [vencida["id"]]
    assert resp.json()[0]["status"] == "vencido"
    pendentes = (await client.get(f"{BASE}/contas?status=pendente", headers=admin.headers)).json()
    assert [c["descricao"] for c in pendentes] == ["Em dia"]

    resumo = (await client.get(f"{BASE}/contas/resumo", headers=admin.headers)).json()
    assert resumo["total_pagar_vencido"] == 40.0
    assert resumo["total_pagar_pendente"] == 60.0

    # GET não grava mais nada: o status no banco continua "pendente"
    gravado = {c.descricao: c.status for c in await _contas(tenant.id)}
    assert gravado["Atrasada"] == "pendente"


# ── 8. Recorrência ──────────────────────────────────────────────────────────


async def _baixa(client, headers, conta_id, valor=100.0):
    return await client.post(
        f"{BASE}/contas/{conta_id}/baixa",
        json={"data_pagamento": str(today_local()), "valor_pago": valor},
        headers=headers,
    )


async def test_baixa_de_recorrente_mensal_gera_proxima_uma_vez(client, db):
    tenant, admin = await _admin(db)
    conta = await _criar(client, admin.headers, recorrencia="mensal", data_vencimento="2027-01-31", observacoes="contrato")

    assert (await _baixa(client, admin.headers, conta["id"])).status_code == 200
    contas = await _contas(tenant.id)
    assert len(contas) == 2
    proxima = contas[1]
    assert proxima.data_vencimento == date(2027, 2, 28)  # dia ajustado ao fim do mês
    assert proxima.status == "pendente" and proxima.recorrencia == "mensal"
    assert proxima.observacoes == "contrato" and float(proxima.valor) == 100.0

    # Estornar e dar baixa de novo não duplica
    assert (await client.post(f"{BASE}/contas/{conta['id']}/reabrir", headers=admin.headers)).status_code == 200
    assert (await _baixa(client, admin.headers, conta["id"])).status_code == 200
    assert len(await _contas(tenant.id)) == 2

    # Baixa da ocorrência de fevereiro volta ao dia 31 em março (sem deriva)
    assert (await _baixa(client, admin.headers, proxima.id)).status_code == 200
    contas = await _contas(tenant.id)
    assert [c.data_vencimento for c in contas] == [date(2027, 1, 31), date(2027, 2, 28), date(2027, 3, 31)]


async def test_recorrente_anual_e_unica(client, db):
    tenant, admin = await _admin(db)
    anual = await _criar(client, admin.headers, recorrencia="anual", data_vencimento="2028-02-29")
    unica = await _criar(client, admin.headers, data_vencimento="2028-03-10")
    assert (await _baixa(client, admin.headers, anual["id"])).status_code == 200
    assert (await _baixa(client, admin.headers, unica["id"])).status_code == 200
    datas = sorted(c.data_vencimento for c in await _contas(tenant.id))
    assert datas == [date(2028, 2, 29), date(2028, 3, 10), date(2029, 2, 28)]


# ── Cancelar / reabrir ──────────────────────────────────────────────────────


async def test_cancelar_e_reabrir_lancamento(client, db):
    tenant, admin = await _admin(db)
    conta = await _criar(client, admin.headers)

    resp = await client.post(f"{BASE}/contas/{conta['id']}/cancelar", headers=admin.headers)
    assert resp.status_code == 200 and resp.json()["status"] == "cancelado"
    filtrado = (await client.get(f"{BASE}/contas?status=cancelado", headers=admin.headers)).json()
    assert [c["id"] for c in filtrado] == [conta["id"]]
    assert (await _baixa(client, admin.headers, conta["id"])).status_code == 409

    resp = await client.post(f"{BASE}/contas/{conta['id']}/reabrir", headers=admin.headers)
    assert resp.status_code == 200 and resp.json()["status"] == "pendente"

    assert (await _baixa(client, admin.headers, conta["id"])).status_code == 200
    assert (await client.post(f"{BASE}/contas/{conta['id']}/cancelar", headers=admin.headers)).status_code == 409
    resp = await client.post(f"{BASE}/contas/{conta['id']}/reabrir", headers=admin.headers)
    assert resp.json()["data_pagamento"] is None and resp.json()["valor_pago"] is None

    acoes = [r.details.get("new_state", {}).get("acao") for r in await _audit_rows(tenant.id, uuid.UUID(conta["id"]))]
    assert {"cancelar", "reabrir", "baixa", "estornar_baixa"} <= set(acoes)


async def test_espelho_de_mensalidade_nao_cancela(client, db):
    tenant, admin = await _admin(db)
    conta = ContaFinanceira(
        tenant_id=tenant.id, tipo="receber", descricao="Mensalidade", valor=50, data_vencimento=today_local(),
        external_ref=f"mensalidade:mediun:{uuid.uuid4()}:2027-01",
    )
    db.add(conta)
    await db.commit()
    resp = await client.post(f"{BASE}/contas/{conta.id}/cancelar", headers=admin.headers)
    assert resp.status_code == 409


# ── 9. Fluxo de caixa: intervalo exato + saldo inicial ──────────────────────


async def test_fluxo_recorta_intervalo_e_parte_do_saldo_inicial(client, db):
    tenant, admin = await _admin(db)
    db.add_all([
        ContaBancaria(tenant_id=tenant.id, nome="Banco", saldo_inicial=1000),
        ContaBancaria(tenant_id=tenant.id, nome="Inativa", saldo_inicial=999, ativo=False),
        # realizado antes da janela entra no saldo de abertura
        ContaFinanceira(tenant_id=tenant.id, tipo="receber", descricao="Doação antiga", valor=200,
                        data_vencimento=date(2027, 1, 20), status="pago", data_pagamento=date(2027, 1, 20), valor_pago=200),
        # mesmo mês da janela, mas antes de data_inicio: fica fora do mês e entra na abertura
        ContaFinanceira(tenant_id=tenant.id, tipo="pagar", descricao="Antes do dia 10", valor=50,
                        data_vencimento=date(2027, 3, 5), status="pago", data_pagamento=date(2027, 3, 5), valor_pago=50),
        ContaFinanceira(tenant_id=tenant.id, tipo="receber", descricao="Dentro", valor=300,
                        data_vencimento=date(2027, 3, 15), status="pago", data_pagamento=date(2027, 3, 15), valor_pago=300),
        # depois de data_fim: fora
        ContaFinanceira(tenant_id=tenant.id, tipo="pagar", descricao="Depois do dia 20", valor=80,
                        data_vencimento=date(2027, 4, 25), status="pendente"),
        ContaFinanceira(tenant_id=tenant.id, tipo="pagar", descricao="A pagar dentro", valor=70,
                        data_vencimento=date(2027, 4, 10), status="pendente"),
    ])
    await db.commit()

    resp = await client.get(
        f"{BASE}/fluxo-de-caixa?data_inicio=2027-03-10&data_fim=2027-04-20", headers=admin.headers
    )
    assert resp.status_code == 200, resp.text
    marco, abril = resp.json()
    assert (marco["mes"], abril["mes"]) == (3, 4)
    assert marco["receitas"] == 300.0 and marco["despesas"] == 0.0
    # abertura = 1000 (saldo inicial ativo) + 200 − 50 (realizado antes de 10/03)
    assert marco["saldo_acumulado"] == 1450.0
    assert abril["a_pagar"] == 70.0
    assert abril["saldo_acumulado"] == 1450.0
