"""Jornadas de operação da gira (Porta, Senhas, Giras) — Postgres real via HTTP.

Cobre os bugs de jornada corrigidos em fix/jornadas-operacao: lista de giras
para quem só tem PORTA/TICKETS, gira em andamento no "Gira de hoje", cascata
de acompanhantes no cancelamento em lote, filtro de data no fuso do terreiro,
busca de senhas no servidor, "atendidas hoje", release-now completo, tirar
prioridade de quem chegou sem senha, exportar CSV e o recorte de config de
Giras para quem não tem CONFIGURACOES.
"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from src.core.tz import APP_TZ
from src.models.consulentes import Consulente
from src.models.giras import Gira
from src.models.permission_groups import PermissionFeature
from src.models.senha_controls import SenhaControl
from src.models.subscriptions import PlanType
from src.models.tickets import Ticket, TicketStatus
from src.models.users import UserRole

from .factories import create_gira, create_tenant, create_user, grant


async def _senha(db, tenant, gira, numero, *, nome="Consulente", status=TicketStatus.EMITTED, **extra):
    email = f"c{uuid.uuid4().hex[:8]}@example.com"
    c = Consulente(tenant_id=tenant.id, nome=nome, email=email, email_normalized=email)
    db.add(c)
    await db.flush()
    t = Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=c.id, numero=numero, status=status, **extra)
    db.add(t)
    await db.commit()
    return t


async def _fresh(model, obj_id):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(select(model).where(model.id == obj_id))).scalar_one()


# ── 1. Lista de giras para Porta / Senhas ────────────────────────────────────

async def test_operador_so_com_porta_ou_tickets_lista_giras_mas_nao_altera(client, db):
    tenant = await create_tenant(db)
    gira = await create_gira(db, tenant)
    porteiro = await create_user(db, tenant, UserRole.OPERATOR, name="porteiro")
    await grant(db, porteiro, tenant, PermissionFeature.PORTA, "view", "insert", "edit")
    senhas = await create_user(db, tenant, UserRole.OPERATOR, name="senhas")
    await grant(db, senhas, tenant, PermissionFeature.TICKETS, "view", "edit", "delete")

    for actor in (porteiro, senhas):
        resp = await client.get("/api/v1/admin/giras", headers=actor.headers)
        assert resp.status_code == 200, resp.text
        assert [g["id"] for g in resp.json()] == [str(gira.id)]
        # Só a lista: detalhe, criar, editar e excluir continuam exigindo GIRAS.
        assert (await client.get(f"/api/v1/admin/giras/{gira.id}", headers=actor.headers)).status_code == 403
        body = {"nome": "Nova", "data_inicio": datetime.now(timezone.utc).isoformat()}
        assert (await client.post("/api/v1/admin/giras", headers=actor.headers, json=body)).status_code == 403
        assert (await client.put(f"/api/v1/admin/giras/{gira.id}", headers=actor.headers, json=body)).status_code == 403
        assert (await client.delete(f"/api/v1/admin/giras/{gira.id}", headers=actor.headers)).status_code == 403


# ── 2. Gira de hoje continua no dashboard depois que começa ──────────────────

async def test_proximas_giras_incluem_gira_que_comecou_ha_ate_12h(db):
    from src.repositories.gira_repo import GiraRepository

    tenant = await create_tenant(db)
    now = datetime.now(timezone.utc)
    for nome, delta in (("Em andamento", -2), ("Antiga", -13), ("Futura", 30)):
        db.add(Gira(tenant_id=tenant.id, nome=nome, data_inicio=now + timedelta(hours=delta), is_active=True))
    await db.commit()

    giras = await GiraRepository(db).get_upcoming_giras(tenant.id, limit=5)

    assert [g.nome for g in giras] == ["Em andamento", "Futura"]


# ── 7. Cancelamento em lote leva os acompanhantes junto ──────────────────────

async def test_bulk_cancel_cancela_acompanhantes_e_devolve_as_vagas(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    gira = await create_gira(db, tenant)
    db.add(SenhaControl(tenant_id=tenant.id, gira_id=gira.id, is_sponsor=False, proximo_numero=4, total_emitido=3))
    await db.commit()
    titular = await _senha(db, tenant, gira, 1, nome="Titular")
    acomp = await _senha(db, tenant, gira, 2, nome="Acompanhante", is_acompanhante=True, parent_ticket_id=titular.id)
    outro = await _senha(db, tenant, gira, 3, nome="Outro")

    resp = await client.post(
        f"/api/v1/admin/giras/{gira.id}/tickets/bulk-cancel",
        headers=admin.headers,
        json={"ticket_ids": [str(titular.id)]},
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["modified"] == 2
    assert (await _fresh(Ticket, titular.id)).status == TicketStatus.CANCELLED
    assert (await _fresh(Ticket, acomp.id)).status == TicketStatus.CANCELLED
    assert (await _fresh(Ticket, outro.id)).status == TicketStatus.EMITTED

    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        sc = (await fresh.execute(select(SenhaControl).where(SenhaControl.gira_id == gira.id))).scalar_one()
    assert sc.slots_returned == 2


async def test_validate_bulk_cancel_com_acompanhante_nao_grava_nada(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    gira = await create_gira(db, tenant)
    titular = await _senha(db, tenant, gira, 1, nome="Titular")
    acomp = await _senha(db, tenant, gira, 2, nome="Acomp", is_acompanhante=True, parent_ticket_id=titular.id)

    resp = await client.post(
        "/api/v1/admin/validate-bulk",
        headers=admin.headers,
        json={"ticket_ids": [str(titular.id)], "operation": "cancel"},
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["count"] == 2
    assert (await _fresh(Ticket, titular.id)).status == TicketStatus.EMITTED
    assert (await _fresh(Ticket, acomp.id)).status == TicketStatus.EMITTED


# ── 8. Filtro de data no fuso do terreiro ────────────────────────────────────

async def test_filtro_de_data_usa_o_dia_de_brasilia(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    # 22h do dia 9 em Brasília = 01h do dia 10 em UTC.
    inicio = datetime(2026, 3, 9, 22, 0, tzinfo=APP_TZ)
    gira = Gira(tenant_id=tenant.id, nome="Gira das 22h", data_inicio=inicio, is_active=True)
    db.add(gira)
    await db.commit()

    def ids(resp):
        assert resp.status_code == 200, resp.text
        return [g["id"] for g in resp.json()]

    url = "/api/v1/admin/giras"
    assert ids(await client.get(f"{url}?date_from=2026-03-09&date_to=2026-03-09", headers=admin.headers)) == [str(gira.id)]
    assert ids(await client.get(f"{url}?date_from=2026-03-10", headers=admin.headers)) == []
    assert ids(await client.get(f"{url}?date_to=2026-03-08", headers=admin.headers)) == []
    assert (await client.get(f"{url}?date_from=09-03-2026", headers=admin.headers)).status_code == 400


# ── 13. Busca de senhas no servidor (gira inteira) ───────────────────────────

async def test_busca_de_senhas_procura_na_gira_inteira(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    gira = await create_gira(db, tenant, max_tickets=100)
    for n in range(1, 61):
        await _senha(db, tenant, gira, n, nome=f"Pessoa {n}")
    await _senha(db, tenant, gira, 61, nome="Joana Darc")
    assoc = await _senha(db, tenant, gira, 1, nome="Associada", is_sponsor=True)

    base = f"/api/v1/admin/giras/{gira.id}/tickets?skip=0&limit=50"

    resp = await client.get(f"{base}&search=joana", headers=admin.headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["numero"] == 61

    resp = await client.get(f"{base}&search=%230061", headers=admin.headers)
    assert [t["numero"] for t in resp.json()["items"]] == [61]

    resp = await client.get(f"{base}&search=P001", headers=admin.headers)
    items = resp.json()["items"]
    assert [t["id"] for t in items] == [str(assoc.id)]
    assert items[0]["numero_formatado"] == "P001"

    resp = await client.get(base, headers=admin.headers)
    assert resp.json()["total"] == 62 and len(resp.json()["items"]) == 50


# ── 10. Atendidas hoje = finalizadas hoje ────────────────────────────────────

async def test_atendidas_hoje_conta_finalizacao_de_hoje(db):
    from src.repositories.ticket_analytics_repo import TicketAnalyticsRepository

    tenant = await create_tenant(db)
    gira = await create_gira(db, tenant)
    now = datetime.now(timezone.utc)
    # Emitida há 3 dias, atendida agora: conta.
    await _senha(db, tenant, gira, 1, status=TicketStatus.COMPLETED, finalizado_em=now, created_at=now - timedelta(days=3))
    # Atendida há 2 dias: não conta.
    await _senha(db, tenant, gira, 2, status=TicketStatus.COMPLETED, finalizado_em=now - timedelta(days=2))

    stats = await TicketAnalyticsRepository(db).get_today_stats(tenant.id)

    assert stats["used_today"] == 1


# ── 17. Liberar agora devolve a config completa ──────────────────────────────

async def test_release_now_devolve_prazo_da_fila_de_espera(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    gira = await create_gira(db, tenant, open_now=False)
    gira.waitlist_confirmation_hours = 6
    await db.commit()

    resp = await client.post(f"/api/v1/admin/giras/{gira.id}/release-now", headers=admin.headers)

    assert resp.status_code == 200, resp.text
    assert resp.json()["waitlist_confirmation_hours"] == 6


# ── 18. Tirar a prioridade de quem chegou sem senha ──────────────────────────

async def test_editar_sem_senha_com_prioridade_null_tira_a_prioridade(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    gira = await create_gira(db, tenant)
    t = await _senha(db, tenant, gira, 1, nome="Seu Zé", is_walk_in=True, priority_category="ELDERLY")
    url = f"/api/v1/admin/door/tickets/{t.id}/walk-in"

    # Sem o campo: mantém.
    resp = await client.patch(url, headers=admin.headers, json={"nome": "Seu Zé"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["priority_category"] == "ELDERLY"

    # null explícito: tira.
    resp = await client.patch(url, headers=admin.headers, json={"nome": "Seu Zé", "priority_category": None})
    assert resp.status_code == 200, resp.text
    assert resp.json()["priority_category"] is None
    assert resp.json()["preferencial"] is False


# ── 3. "Chamar" = atender; CALLED legado ainda é atendível ───────────────────

async def test_chamar_atende_em_um_passo_inclusive_called_legado(client, db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    gira = await create_gira(db, tenant)
    legado = await _senha(db, tenant, gira, 1, status=TicketStatus.CALLED)

    stats = await client.get(f"/api/v1/admin/giras/{gira.id}/door/stats", headers=admin.headers)
    assert stats.json()["awaiting"] == 1

    resp = await client.patch(
        f"/api/v1/admin/door/tickets/{legado.id}/attend", headers=admin.headers, json={"medium_nome": "Mãe Ana"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "completed"


# ── 24. Exportar listagem (PDF) ──────────────────────────────────────────────

async def test_exportar_listagem_das_senhas(client, db):
    tenant = await create_tenant(db)
    gira = await create_gira(db, tenant)
    await _senha(db, tenant, gira, 7, nome="Maria Conga", status=TicketStatus.COMPLETED, medium_nome="Pai João")
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="senhas")
    await grant(db, operador, tenant, PermissionFeature.TICKETS, "view")
    sem_grupo = await create_user(db, tenant, UserRole.OPERATOR, name="mediuns")
    await grant(db, sem_grupo, tenant, PermissionFeature.MEDIUNS, "view")

    url = f"/api/v1/admin/giras/{gira.id}/export-listagem"
    resp = await client.get(url, headers=operador.headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["gira"]["nome"] == gira.nome
    [item] = body["items"]
    assert item["senha"] == "0007" and item["nome"] == "Maria Conga"
    assert item["status_label"] == "Atendida" and item["medium"] == "Pai João"

    assert (await client.get(url, headers=sem_grupo.headers)).status_code == 403


async def test_exportar_listagem_de_gira_de_outro_terreiro_404(client, db):
    tenant = await create_tenant(db)
    outro = await create_tenant(db, "Outro Terreiro")
    gira_alheia = await create_gira(db, outro)
    await _senha(db, outro, gira_alheia, 1, nome="Fulana")
    admin = await create_user(db, tenant, UserRole.ADMIN)

    resp = await client.get(f"/api/v1/admin/giras/{gira_alheia.id}/export-listagem", headers=admin.headers)

    assert resp.status_code == 404, resp.text


async def test_exportar_listagem_exige_plano_pro(client, db):
    tenant = await create_tenant(db, "Terreiro Basic", plan=PlanType.BASIC)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    gira = await create_gira(db, tenant)
    await _senha(db, tenant, gira, 1)

    resp = await client.get(f"/api/v1/admin/giras/{gira.id}/export-listagem", headers=admin.headers)

    assert resp.status_code == 403, resp.text


# ── 11. Config de Giras para quem tem GIRAS mas não CONFIGURACOES ────────────

async def test_quem_edita_giras_le_horarios_e_endereco_sem_configuracoes(client, db):
    tenant = await create_tenant(db)
    from src.models.tenant_config import TenantConfig

    cfg = (await db.execute(select(TenantConfig).where(TenantConfig.tenant_id == tenant.id))).scalar_one()
    cfg.enable_time_slot_scheduling = True
    cfg.endereco = "Rua das Flores, 123"
    await db.commit()
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="giras")
    await grant(db, operador, tenant, PermissionFeature.GIRAS, "view", "insert", "edit")

    resp = await client.get("/api/v1/admin/giras/settings", headers=operador.headers)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"enable_time_slot_scheduling": True, "endereco": "Rua das Flores, 123"}

    assert (await client.get("/api/v1/admin/config/time-slot-templates", headers=operador.headers)).status_code == 200
    # Editar a config do terreiro continua fechado.
    assert (await client.get("/api/v1/admin/tenant/config", headers=operador.headers)).status_code == 403
    put = await client.put("/api/v1/admin/config/time-slot-templates", headers=operador.headers, json={"slots": []})
    assert put.status_code == 403
