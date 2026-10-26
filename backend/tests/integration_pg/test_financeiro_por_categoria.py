"""Financeiro agrupado por categoria (`GET /api/v1/admin/financeiro/por-categoria`).

Cobre: realizado pela data de pagamento e em aberto pelo vencimento (as mesmas regras do Fluxo
de caixa), linha "Sem categoria", categoria desativada/excluída ainda aparece pelo nome,
quebra por mês, isolamento entre terreiros e o gate de grupo (CONTAS_FINANCEIRAS:view).
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from src.models.contas_financeiras import CategoriaFinanceira, ContaFinanceira
from src.models.permission_groups import PermissionFeature
from src.models.users import UserRole

from .factories import create_tenant, create_user, grant

URL = "/api/v1/admin/financeiro/por-categoria"


def _conta(tenant, tipo, valor, venc, *, pago_em=None, valor_pago=None, status=None, categoria=None, **extra):
    return ContaFinanceira(
        tenant_id=tenant.id,
        tipo=tipo,
        descricao=extra.pop("descricao", "Lançamento"),
        valor=valor,
        data_vencimento=venc,
        status=status or ("pago" if pago_em else "pendente"),
        data_pagamento=pago_em,
        valor_pago=valor_pago if valor_pago is not None else (valor if pago_em else None),
        categoria_id=categoria.id if categoria else None,
        **extra,
    )


async def test_agrupa_receitas_e_despesas_por_categoria(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    mensalidade = CategoriaFinanceira(tenant_id=tenant.id, nome="Mensalidades", tipo="receber", cor="#1D9E75")
    doacao = CategoriaFinanceira(tenant_id=tenant.id, nome="Doações", tipo="receber")
    velas = CategoriaFinanceira(tenant_id=tenant.id, nome="Velas", tipo="pagar", ativo=False)
    luz = CategoriaFinanceira(tenant_id=tenant.id, nome="Luz", tipo="pagar",
                              deleted_at=datetime(2026, 4, 1, tzinfo=timezone.utc))
    db.add_all([mensalidade, doacao, velas, luz])
    await db.flush()
    db.add_all([
        # receitas pagas em março e abril
        _conta(tenant, "receber", 100, date(2026, 3, 10), pago_em=date(2026, 3, 10), categoria=mensalidade),
        _conta(tenant, "receber", 100, date(2026, 4, 10), pago_em=date(2026, 4, 12), valor_pago=90, categoria=mensalidade),
        _conta(tenant, "receber", 50, date(2026, 3, 20), pago_em=date(2026, 3, 20), categoria=doacao),
        _conta(tenant, "receber", 30, date(2026, 4, 2), pago_em=date(2026, 4, 2)),  # sem categoria
        # em aberto no período (pelo vencimento)
        _conta(tenant, "receber", 100, date(2026, 4, 25), categoria=mensalidade),
        _conta(tenant, "receber", 100, date(2026, 3, 1), status="vencido", categoria=mensalidade),
        # despesas
        _conta(tenant, "pagar", 40, date(2026, 3, 5), pago_em=date(2026, 3, 5), categoria=velas),
        _conta(tenant, "pagar", 120, date(2026, 4, 5), pago_em=date(2026, 4, 6), categoria=luz),
        _conta(tenant, "pagar", 70, date(2026, 4, 28), categoria=velas),
        # fora: cancelado, pago fora do período, excluído
        _conta(tenant, "pagar", 999, date(2026, 3, 5), status="cancelado", categoria=velas),
        _conta(tenant, "receber", 999, date(2026, 2, 28), pago_em=date(2026, 2, 28), categoria=doacao),
        _conta(tenant, "receber", 999, date(2026, 3, 9), pago_em=date(2026, 3, 9), categoria=doacao,
               deleted_at=datetime(2026, 3, 10, tzinfo=timezone.utc)),
    ])
    await db.commit()

    resp = await client.get(f"{URL}?data_inicio=2026-03-01&data_fim=2026-04-30", headers=admin.headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert [m["mes_label"] for m in body["meses"]] == ["Mar/26", "Abr/26"]
    assert body["total_receitas"] == 270.0
    assert body["total_despesas"] == 160.0
    assert body["total_a_receber"] == 200.0
    assert body["total_a_pagar"] == 70.0

    rec = {r["nome"]: r for r in body["receitas"]}
    assert [r["nome"] for r in body["receitas"]] == ["Mensalidades", "Doações", "Sem categoria"]
    assert rec["Mensalidades"]["realizado"] == 190.0
    assert rec["Mensalidades"]["qtd_realizado"] == 2
    assert rec["Mensalidades"]["por_mes"] == [100.0, 90.0]
    assert rec["Mensalidades"]["em_aberto"] == 200.0
    assert rec["Mensalidades"]["qtd_em_aberto"] == 2
    assert rec["Mensalidades"]["cor"] == "#1D9E75"
    assert rec["Mensalidades"]["percentual"] == 70.4
    assert rec["Doações"]["realizado"] == 50.0
    assert rec["Sem categoria"]["categoria_id"] is None
    assert rec["Sem categoria"]["realizado"] == 30.0

    desp = {d["nome"]: d for d in body["despesas"]}
    assert [d["nome"] for d in body["despesas"]] == ["Luz", "Velas"]
    assert desp["Luz"]["realizado"] == 120.0  # categoria excluída continua aparecendo
    assert desp["Velas"]["realizado"] == 40.0 and desp["Velas"]["em_aberto"] == 70.0  # desativada idem
    assert desp["Velas"]["por_mes"] == [40.0, 0.0]


async def test_bate_com_o_fluxo_de_caixa(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    cat = CategoriaFinanceira(tenant_id=tenant.id, nome="Mensalidades", tipo="receber")
    db.add(cat)
    await db.flush()
    db.add_all([
        _conta(tenant, "receber", 100, date(2026, 5, 3), pago_em=date(2026, 5, 3), categoria=cat),
        _conta(tenant, "receber", 80, date(2026, 5, 9), pago_em=date(2026, 5, 9)),
        _conta(tenant, "pagar", 45.5, date(2026, 5, 15), pago_em=date(2026, 5, 16)),
        _conta(tenant, "pagar", 20, date(2026, 5, 30)),
    ])
    await db.commit()

    q = "data_inicio=2026-05-01&data_fim=2026-05-31"
    por_cat = (await client.get(f"{URL}?{q}", headers=admin.headers)).json()
    (fluxo,) = (await client.get(f"/api/v1/admin/financeiro/fluxo-de-caixa?{q}", headers=admin.headers)).json()
    assert por_cat["total_receitas"] == fluxo["receitas"] == 180.0
    assert por_cat["total_despesas"] == fluxo["despesas"] == 45.5
    assert por_cat["total_a_pagar"] == fluxo["a_pagar"] == 20.0


async def test_isola_terreiro_e_valida_intervalo(client, db):
    tenant = await create_tenant(db)
    outro = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    cat_outro = CategoriaFinanceira(tenant_id=outro.id, nome="Do outro", tipo="receber")
    db.add(cat_outro)
    await db.flush()
    db.add(_conta(outro, "receber", 500, date(2026, 6, 1), pago_em=date(2026, 6, 1), categoria=cat_outro))
    await db.commit()

    body = (await client.get(f"{URL}?data_inicio=2026-06-01&data_fim=2026-06-30", headers=admin.headers)).json()
    assert body["receitas"] == [] and body["total_receitas"] == 0.0

    invertido = await client.get(f"{URL}?data_inicio=2026-06-30&data_fim=2026-06-01", headers=admin.headers)
    assert invertido.status_code == 422


async def test_exige_grupo_contas_financeiras_view(client, db):
    tenant = await create_tenant(db)
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="operador")
    await db.commit()
    assert (await client.get(URL, headers=operador.headers)).status_code == 403

    await grant(db, operador, tenant, PermissionFeature.CONTAS_FINANCEIRAS, "view")
    await db.commit()
    resp = await client.get(URL, headers=operador.headers)
    assert resp.status_code == 200, resp.text
