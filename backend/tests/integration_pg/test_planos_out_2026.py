"""Reestruturação de planos de out/2026 via HTTP real (Postgres).

- Limites: Gratuito 2 giras/mês; Basic 3 giras e 15 médiuns; Pro 4 giras e 30 médiuns.
- Associados (+ mensalidade de associados), estoque, fila de espera, horário marcado e
  contas financeiras ficam só no Premium. Mensalidade de médiuns segue no Pro (premissa).
- Tenant Pro que já tinha os toggles ligados: nada quebra (salvar config continua
  funcionando) e o toggle vale como desligado em runtime.
- Migração 059 atualiza os limites gravados nas assinaturas (e o downgrade restaura).
"""
import subprocess
import sys
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, update

from src.models.associados import Associado
from src.models.mediuns import Medium
from src.models.subscriptions import PlanType, Subscription
from src.models.tenant_config import TenantConfig
from src.models.users import UserRole

from .conftest import BACKEND_DIR
from .factories import create_gira, create_tenant, create_user

MES = datetime.now(timezone.utc).strftime("%Y-%m")


async def _admin(db, plan: PlanType):
    tenant = await create_tenant(db, f"Terreiro {plan.value}", plan=plan)
    return tenant, await create_user(db, tenant, UserRole.ADMIN)


async def _set_config(db, tenant, **values):
    await db.execute(update(TenantConfig).where(TenantConfig.tenant_id == tenant.id).values(**values))
    await db.commit()


def _gira_body(i: int) -> dict:
    return {"nome": f"Gira {i}", "data_inicio": (datetime.now(timezone.utc) + timedelta(days=3 + i)).isoformat()}


# ── Recursos que saíram do Pro ──────────────────────────────────────────────

PREMIUM_ONLY = [
    ("GET", "/api/v1/admin/estoque/grupos"),
    ("GET", "/api/v1/admin/estoque/itens"),
    ("GET", "/api/v1/admin/associados"),
    ("GET", "/api/v1/admin/financeiro/contas"),
    ("GET", "/api/v1/admin/financeiro/categorias"),
    ("GET", f"/api/v1/admin/financeiro/associados?mes={MES}"),
]


@pytest.mark.parametrize("method, url", PREMIUM_ONLY)
async def test_pro_recebe_403_nos_modulos_premium(client, db, method, url):
    _, admin = await _admin(db, PlanType.PRO)
    resp = await client.request(method, url, headers=admin.headers)
    assert resp.status_code == 403, f"{url}: {resp.status_code} {resp.text}"
    assert "Premium" in resp.json()["detail"]


@pytest.mark.parametrize("method, url", PREMIUM_ONLY)
async def test_premium_acessa_os_modulos(client, db, method, url):
    tenant, admin = await _admin(db, PlanType.PREMIUM)
    await _set_config(db, tenant, enable_mensalidade_associado=True)
    resp = await client.request(method, url, headers=admin.headers)
    assert resp.status_code == 200, f"{url}: {resp.status_code} {resp.text}"


async def test_pro_nao_cria_associado(client, db):
    _, admin = await _admin(db, PlanType.PRO)
    resp = await client.post(
        "/api/v1/admin/associados", headers=admin.headers, json={"nome": "Fulano", "email": "fulano@example.com"}
    )
    assert resp.status_code == 403, resp.text


@pytest.mark.parametrize(
    "toggle", ["enable_waitlist", "enable_time_slot_scheduling", "validate_associado_on_emit", "enable_mensalidade_associado"]
)
async def test_pro_nao_liga_toggles_premium(client, db, toggle):
    _, admin = await _admin(db, PlanType.PRO)
    resp = await client.put("/api/v1/admin/tenant/config", headers=admin.headers, json={toggle: True})
    assert resp.status_code == 403, resp.text


async def test_pro_com_toggles_ja_ligados_salva_config_e_runtime_trata_como_desligado(client, db):
    """Tenant Pro de antes da reestruturação: a tela reenvia todos os toggles ao salvar."""
    from src.core.database import AsyncSessionLocal
    from src.services import time_slot_service, waitlist_service

    tenant, admin = await _admin(db, PlanType.PRO)
    flags = dict(
        enable_waitlist=True,
        enable_time_slot_scheduling=True,
        validate_associado_on_emit=True,
        enable_mensalidade_associado=True,
    )
    await _set_config(db, tenant, **flags)

    resp = await client.put(
        "/api/v1/admin/tenant/config", headers=admin.headers, json={**flags, "endereco": "Rua Nova, 1"}
    )
    assert resp.status_code == 200, resp.text

    async with AsyncSessionLocal() as fresh:
        assert await waitlist_service.waitlist_enabled_for_tenant(fresh, tenant.id) is False
        assert await time_slot_service.time_slot_scheduling_enabled_for_tenant(fresh, tenant.id) is False

    # Desligar sempre pode, mesmo fora do plano.
    resp = await client.put("/api/v1/admin/tenant/config", headers=admin.headers, json={"enable_waitlist": False})
    assert resp.status_code == 200, resp.text


async def test_premium_liga_fila_e_horario(client, db):
    from src.core.database import AsyncSessionLocal
    from src.services import time_slot_service, waitlist_service

    tenant, admin = await _admin(db, PlanType.PREMIUM)
    resp = await client.put(
        "/api/v1/admin/tenant/config",
        headers=admin.headers,
        json={"enable_waitlist": True, "enable_time_slot_scheduling": True},
    )
    assert resp.status_code == 200, resp.text
    async with AsyncSessionLocal() as fresh:
        assert await waitlist_service.waitlist_enabled_for_tenant(fresh, tenant.id) is True
        assert await time_slot_service.time_slot_scheduling_enabled_for_tenant(fresh, tenant.id) is True


async def test_pro_mantem_mensalidade_de_mediuns_e_config_sem_associados(client, db):
    """Premissa: mensalidade de médiuns segue no Pro. Config/relatório não podem quebrar."""
    tenant, admin = await _admin(db, PlanType.PRO)
    await _set_config(db, tenant, enable_mensalidade_associado=True)

    resp = await client.get(f"/api/v1/admin/financeiro/mensalidades?mes={MES}", headers=admin.headers)
    assert resp.status_code == 200, resp.text

    resp = await client.put(
        "/api/v1/admin/financeiro/config",
        headers=admin.headers,
        json={"valor_mensal": 50, "dia_vencimento": 5, "valor_mensal_associado": 30, "enable_mensalidade_associado": True},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["valor_mensal"] == 50
    assert body["valor_mensal_associado"] == 0  # campo de associados ignorado fora do plano
    assert body["enable_mensalidade_associado"] is False  # toggle gravado vale como desligado

    resp = await client.get("/api/v1/admin/financeiro/config", headers=admin.headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["enable_mensalidade_associado"] is False

    resp = await client.get(f"/api/v1/admin/financeiro/relatorio/download?mes={MES}", headers=admin.headers)
    assert resp.status_code == 200, resp.text


async def test_pro_com_validacao_de_associado_ligada_nao_barra_emissao_de_associado(client, db):
    """Sem o módulo de associados o terreiro não mantém a lista: a validação não pode barrar."""
    tenant, _ = await _admin(db, PlanType.PRO)
    await _set_config(db, tenant, validate_associado_on_emit=True)
    gira = await create_gira(db, tenant, max_tickets=10)
    now = datetime.now(timezone.utc)
    from src.models.giras import Gira

    await db.execute(
        update(Gira)
        .where(Gira.id == gira.id)
        .values(sponsor_max_tickets=5, sponsor_release_start_at=now - timedelta(hours=1),
                sponsor_release_end_at=now + timedelta(days=1))
    )
    await db.commit()
    params = {"tenant_slug": tenant.slug, "gira_id": str(gira.id), "tipo": "associado"}
    resp = await client.post(
        "/api/v1/public/emit-ticket", params=params, json={"name": "Não Cadastrado", "email": "novo@example.com"}
    )
    assert resp.status_code == 200, resp.text


async def test_premium_com_validacao_de_associado_barra_quem_nao_e_associado(client, db):
    tenant, _ = await _admin(db, PlanType.PREMIUM)
    await _set_config(db, tenant, validate_associado_on_emit=True)
    db.add(Associado(tenant_id=tenant.id, nome="Sócio", email="socio@example.com", email_normalized="socio@example.com"))
    await db.commit()
    gira = await create_gira(db, tenant, max_tickets=10)
    now = datetime.now(timezone.utc)
    from src.models.giras import Gira

    await db.execute(
        update(Gira)
        .where(Gira.id == gira.id)
        .values(sponsor_max_tickets=5, sponsor_release_start_at=now - timedelta(hours=1),
                sponsor_release_end_at=now + timedelta(days=1))
    )
    await db.commit()
    params = {"tenant_slug": tenant.slug, "gira_id": str(gira.id), "tipo": "associado"}
    resp = await client.post(
        "/api/v1/public/emit-ticket", params=params, json={"name": "Não Cadastrado", "email": "novo@example.com"}
    )
    assert resp.status_code == 422, resp.text
    resp = await client.post(
        "/api/v1/public/emit-ticket", params=params, json={"name": "Sócio", "email": "socio@example.com"}
    )
    assert resp.status_code == 200, resp.text


# ── Limites ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("plan, limite", [(PlanType.FREE, 2), (PlanType.BASIC, 3), (PlanType.PRO, 4)])
async def test_limite_mensal_de_giras(client, db, plan, limite):
    _, admin = await _admin(db, plan)
    for i in range(limite):
        resp = await client.post("/api/v1/admin/giras", headers=admin.headers, json=_gira_body(i))
        assert resp.status_code == 201, f"gira {i + 1}: {resp.text}"
    resp = await client.post("/api/v1/admin/giras", headers=admin.headers, json=_gira_body(limite))
    assert resp.status_code == 422, resp.text
    assert f"Limite mensal de giras atingido ({limite})" in resp.json()["detail"]


async def test_premium_passa_das_quatro_giras(client, db):
    _, admin = await _admin(db, PlanType.PREMIUM)
    for i in range(6):
        resp = await client.post("/api/v1/admin/giras", headers=admin.headers, json=_gira_body(i))
        assert resp.status_code == 201, resp.text


@pytest.mark.parametrize("plan, limite", [(PlanType.BASIC, 15), (PlanType.PRO, 30)])
async def test_limite_de_mediuns(client, db, plan, limite):
    tenant, admin = await _admin(db, plan)
    db.add_all([Medium(tenant_id=tenant.id, nome=f"Médium {i}") for i in range(limite - 1)])
    await db.commit()

    resp = await client.post("/api/v1/admin/mediuns", headers=admin.headers, json={"nome": "Último que cabe"})
    assert resp.status_code == 201, resp.text
    resp = await client.post("/api/v1/admin/mediuns", headers=admin.headers, json={"nome": "Um a mais"})
    assert resp.status_code == 422, resp.text
    assert f"({limite})" in resp.json()["detail"]


async def test_free_nao_cadastra_medium(client, db):
    _, admin = await _admin(db, PlanType.FREE)
    resp = await client.post("/api/v1/admin/mediuns", headers=admin.headers, json={"nome": "X"})
    assert resp.status_code == 403, resp.text


async def test_assinatura_mostra_os_novos_limites(client, db):
    _, admin = await _admin(db, PlanType.PRO)
    resp = await client.get("/api/v1/admin/subscription", headers=admin.headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert (body["max_giras_per_month"], body["max_mediuns"]) == (4, 30)
    assert body["features"]["mensalidade_mediun"] is True
    for f in ("associados", "estoque_controle", "contas_financeiras", "fila_espera", "agendamento_por_horario"):
        assert body["features"][f] is False, f


# ── Migração de dados 059 ───────────────────────────────────────────────────

def _alembic(*args):
    subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR, check=True, capture_output=True)


async def _limites():
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        rows = await fresh.execute(select(Subscription.plan, Subscription.max_giras_per_month, Subscription.max_mediuns))
        return {plan: (giras, mediuns) for plan, giras, mediuns in rows}


async def test_migracao_059_atualiza_e_restaura_limites_das_assinaturas(db):
    for plan in (PlanType.FREE, PlanType.BASIC, PlanType.PRO, PlanType.PREMIUM):
        await create_tenant(db, f"Mig {plan.value}", plan=plan)

    _alembic("downgrade", "058_associados_email_unique_ativo")
    try:
        assert await _limites() == {
            PlanType.FREE: (4, 0),
            PlanType.BASIC: (10, 50),
            PlanType.PRO: (15, 150),
            PlanType.PREMIUM: (999999, 9999999),
        }
    finally:
        _alembic("upgrade", "head")
    assert await _limites() == {
        PlanType.FREE: (2, 0),
        PlanType.BASIC: (3, 15),
        PlanType.PRO: (4, 30),
        PlanType.PREMIUM: (999999, 9999999),
    }
