"""Checklist de primeiros passos por dor (dashboard-summary) com Postgres real.

A consulta única de `_get_onboarding_status` roda de verdade no Postgres (EXISTS por tabela,
enum de status, LIKE do espelho de mensalidades) e cada sinal fica preso ao tenant: dados de
um terreiro nunca completam o passo de outro.
"""
from __future__ import annotations

from datetime import date

from sqlalchemy import update

from src.models.contas_financeiras import ContaFinanceira
from src.models.estoque import EstoqueGrupo, EstoqueItem
from src.models.mediuns import Medium
from src.models.tenant_config import TenantConfig
from src.models.users import UserRole

from .factories import create_gira, create_tenant, create_user

URL = "/api/v1/admin/dashboard-summary"


async def _com_dor(db, tenant, dor: str) -> None:
    await db.execute(
        update(TenantConfig)
        .where(TenantConfig.tenant_id == tenant.id)
        .values(custom_settings={"principal_dor": dor, "como_conheceu": "google"})
    )
    await db.commit()


def _passos(resp) -> dict[str, bool]:
    assert resp.status_code == 200, resp.text
    return {s["key"]: s["done"] for s in resp.json()["onboarding"]["steps"]}


async def test_trilha_de_estoque_segue_os_dados_do_proprio_terreiro(client, db):
    casa_a = await create_tenant(db, name="Casa Estoque A")
    casa_b = await create_tenant(db, name="Casa Estoque B")
    admin_a = await create_user(db, casa_a, UserRole.ADMIN, name="admin-a")
    admin_b = await create_user(db, casa_b, UserRole.ADMIN, name="admin-b")
    await _com_dor(db, casa_a, "estoque")
    await _com_dor(db, casa_b, "estoque")

    grupo = EstoqueGrupo(tenant_id=casa_a.id, nome="Velas")
    db.add(grupo)
    await db.flush()
    db.add(EstoqueItem(tenant_id=casa_a.id, grupo_id=grupo.id, nome="Vela branca"))
    await db.commit()

    resp_a = await client.get(URL, headers=admin_a.headers)
    assert resp_a.json()["onboarding"]["trilha"] == "estoque"
    assert _passos(resp_a) == {"grupo": True, "item": True, "movimentacao": False, "gira": False}

    # O terreiro B não vê nada do A.
    resp_b = await client.get(URL, headers=admin_b.headers)
    assert _passos(resp_b) == {"grupo": False, "item": False, "movimentacao": False, "gira": False}
    assert resp_b.json()["onboarding"]["completed"] is False


async def test_trilhas_de_mediuns_e_financeiro(client, db):
    casa = await create_tenant(db, name="Casa Corrente")
    admin = await create_user(db, casa, UserRole.ADMIN, name="admin-corrente")
    outra = await create_tenant(db, name="Casa Vizinha")
    await _com_dor(db, casa, "mediuns")

    # Médium e gira de OUTRO terreiro não contam.
    db.add(Medium(tenant_id=outra.id, nome="De fora"))
    await db.commit()
    await create_gira(db, outra)
    assert _passos(await client.get(URL, headers=admin.headers)) == {
        "medium": False,
        "mensalidade": False,
        "gira": False,
    }

    db.add(Medium(tenant_id=casa.id, nome="Filha da casa"))
    await db.commit()
    resp = await client.put(
        "/api/v1/admin/financeiro/config",
        headers=admin.headers,
        json={"valor_mensal": 80, "dia_vencimento": 10},
    )
    assert resp.status_code == 200, resp.text
    await create_gira(db, casa)
    resp = await client.get(URL, headers=admin.headers)
    assert _passos(resp) == {"medium": True, "mensalidade": True, "gira": True}
    assert resp.json()["onboarding"]["completed"] is True

    # Financeiro: o espelho automático da mensalidade não conta como 1º lançamento.
    await _com_dor(db, casa, "financeiro")
    db.add(
        ContaFinanceira(
            tenant_id=casa.id,
            tipo="receber",
            descricao="Mensalidade (espelho)",
            valor=80,
            data_vencimento=date(2026, 11, 10),
            status="pendente",
            external_ref="mensalidade:mediun:x:2026-11",
        )
    )
    await db.commit()
    passos = _passos(await client.get(URL, headers=admin.headers))
    assert passos["mensalidade"] is True
    assert passos["lancamento"] is False

    db.add(
        ContaFinanceira(
            tenant_id=casa.id,
            tipo="pagar",
            descricao="Conta de luz",
            valor=120,
            data_vencimento=date(2026, 11, 5),
            status="pendente",
        )
    )
    await db.commit()
    assert _passos(await client.get(URL, headers=admin.headers))["lancamento"] is True


async def test_sem_dor_mantem_o_checklist_da_primeira_gira(client, db):
    casa = await create_tenant(db, name="Casa Antiga")
    admin = await create_user(db, casa, UserRole.ADMIN, name="admin-antiga")
    await create_gira(db, casa)
    resp = await client.get(URL, headers=admin.headers)
    onboarding = resp.json()["onboarding"]
    assert onboarding["trilha"] == "gira"
    assert _passos(resp) == {"gira": True, "share": False, "tickets": False, "porta": False}
