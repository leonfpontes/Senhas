"""Gate de plano único (P-05) via HTTP real, em todos os módulos gated.

Semântica: plano inclui a feature (senão 403) E status da assinatura em dia
(senão 402). Antes do P-05 cada módulo tinha seu gate: Contas Financeiras,
Estoque, e-mail e mensalidades ignoravam o status (tenant PRO suspenso ou
cancelado mantinha o módulo) e Site Builder devolvia 403 para suspenso.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import update

from src.models.subscriptions import PlanType, Subscription, SubscriptionStatus
from src.models.tenant_config import TenantConfig
from src.models.users import UserRole

from .factories import create_tenant, create_user

MES = datetime.now(timezone.utc).strftime("%Y-%m")

# (método, rota, plano ativo SEM a feature) — uma rota de leitura por módulo gated.
MODULOS = {
    "estoque": ("GET", "/api/v1/admin/estoque/grupos", PlanType.BASIC),
    "site_builder": ("GET", "/api/v1/admin/sites", PlanType.BASIC),
    "cursos_presenciais": ("GET", "/api/v1/admin/cursos-presenciais", PlanType.BASIC),
    "contas_financeiras": ("GET", "/api/v1/admin/financeiro/categorias", PlanType.BASIC),
    "email_transacional": ("GET", f"/api/v1/admin/tickets/{uuid.uuid4()}/email-status", PlanType.BASIC),
    "mensalidade_mediun": ("GET", f"/api/v1/admin/financeiro/mensalidades?mes={MES}", PlanType.BASIC),
    "mensalidade_associado": ("GET", f"/api/v1/admin/financeiro/associados?mes={MES}", PlanType.BASIC),
    "mensalidade_config": ("GET", "/api/v1/admin/financeiro/config", PlanType.BASIC),
    "mediuns": ("GET", "/api/v1/admin/mediuns/aniversariantes", PlanType.FREE),
    "analytics_basico": ("GET", "/api/v1/admin/analytics", PlanType.BASIC),
    "auditoria": ("GET", "/api/v1/admin/audit-logs", PlanType.BASIC),
}


async def _set_status(db, tenant, status: SubscriptionStatus, **extra):
    await db.execute(
        update(Subscription).where(Subscription.tenant_id == tenant.id).values(status=status, **extra)
    )
    await db.commit()


async def _admin(db, plan: PlanType, status: SubscriptionStatus = SubscriptionStatus.ACTIVE, **extra):
    tenant = await create_tenant(db, f"Terreiro {plan.value}", plan=plan)
    if status != SubscriptionStatus.ACTIVE or extra:
        await _set_status(db, tenant, status, **extra)
    return tenant, await create_user(db, tenant, UserRole.ADMIN)


@pytest.mark.parametrize("modulo", list(MODULOS))
@pytest.mark.parametrize("status", [SubscriptionStatus.SUSPENDED, SubscriptionStatus.CANCELLED])
async def test_assinatura_irregular_recebe_402(client, db, modulo, status):
    method, url, _ = MODULOS[modulo]
    _, admin = await _admin(db, PlanType.PREMIUM, status)
    resp = await client.request(method, url, headers=admin.headers)
    assert resp.status_code == 402, f"{modulo}: {resp.status_code} {resp.text}"


@pytest.mark.parametrize("modulo", list(MODULOS))
async def test_plano_sem_a_feature_recebe_403(client, db, modulo):
    method, url, plano = MODULOS[modulo]
    _, admin = await _admin(db, plano)
    resp = await client.request(method, url, headers=admin.headers)
    assert resp.status_code == 403, f"{modulo}: {resp.status_code} {resp.text}"


@pytest.mark.parametrize("modulo", list(MODULOS))
async def test_pro_ativo_passa_pelo_gate(client, db, modulo):
    """Controle positivo. PRO acessa mensalidade de médiuns (antes o endpoint exigia PREMIUM)."""
    method, url, _ = MODULOS[modulo]
    tenant, admin = await _admin(db, PlanType.PRO)
    if modulo == "mensalidade_associado":
        # além do plano, o módulo exige o toggle do tenant (_require_assoc_mensalidade_enabled)
        await db.execute(
            update(TenantConfig).where(TenantConfig.tenant_id == tenant.id).values(enable_mensalidade_associado=True)
        )
        await db.commit()
    resp = await client.request(method, url, headers=admin.headers)
    # email-status de ticket inexistente: passou do gate e caiu no 404 do endpoint
    assert resp.status_code in (200, 404), f"{modulo}: {resp.status_code} {resp.text}"
    assert resp.status_code == (404 if modulo == "email_transacional" else 200), resp.text


async def test_trial_local_vencido_recebe_402(client, db):
    _, admin = await _admin(
        db, PlanType.PREMIUM, SubscriptionStatus.ACTIVE,
        is_trial=True, trial_ends_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    resp = await client.get("/api/v1/admin/estoque/grupos", headers=admin.headers)
    assert resp.status_code == 402, resp.text


async def test_bonus_ativo_passa(client, db):
    _, admin = await _admin(db, PlanType.PRO, SubscriptionStatus.ACTIVE, is_bonus=True, monthly_price=0.0)
    resp = await client.get("/api/v1/admin/financeiro/categorias", headers=admin.headers)
    assert resp.status_code == 200, resp.text


async def test_suspenso_nao_cria_gira(client, db):
    _, admin = await _admin(db, PlanType.PRO, SubscriptionStatus.SUSPENDED)
    body = {"nome": "Gira", "data_inicio": (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()}
    resp = await client.post("/api/v1/admin/giras", headers=admin.headers, json=body)
    assert resp.status_code == 402, resp.text


async def test_pro_cancelado_volta_aos_limites_do_free(client, db):
    """CANCELLED com plano pago (estado ainda não normalizado) usa o limite do FREE: 1 usuário."""
    _, admin = await _admin(db, PlanType.PRO, SubscriptionStatus.CANCELLED)
    body = {"email": f"novo-{uuid.uuid4().hex[:6]}@example.com", "username": f"novo{uuid.uuid4().hex[:6]}",
            "password": "SenhaForte#2026", "full_name": "Novo", "role": "operator"}
    resp = await client.post("/api/v1/admin/users", headers=admin.headers, json=body)
    assert resp.status_code == 422, resp.text
    assert "Limite de usuários" in resp.text


async def test_free_cancelado_segue_usando_o_free(client, db):
    """reset_to_free() deixa CANCELLED + FREE: o tenant continua criando giras no limite do FREE."""
    _, admin = await _admin(db, PlanType.FREE, SubscriptionStatus.CANCELLED)
    body = {"nome": "Gira", "data_inicio": (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()}
    resp = await client.post("/api/v1/admin/giras", headers=admin.headers, json=body)
    assert resp.status_code == 201, resp.text


async def test_ligar_fila_de_espera_com_assinatura_suspensa_recebe_402(client, db):
    _, admin = await _admin(db, PlanType.PRO, SubscriptionStatus.SUSPENDED)
    resp = await client.put("/api/v1/admin/tenant/config", headers=admin.headers, json={"enable_waitlist": True})
    assert resp.status_code == 402, resp.text
