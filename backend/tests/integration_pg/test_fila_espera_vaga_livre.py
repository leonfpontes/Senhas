"""Vaga livre chama a fila mesmo com o contador de números "lotado" (bug Tuccco, 19/11/2026).

Seis pessoas da fila foram chamadas para vagas que abriram e todas perderam o
prazo antes de a próxima (Rayra) entrar na fila. Sem ninguém para assumir, as
vagas ficaram livres, mas o teto da emissão é o contador de números, que a fila
também gasta: a Rayra caiu na fila com vaga sobrando e nada mais a chamou.
Agora a vaga é contada pelo que está ocupado de verdade (`fill_free_capacity`).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, update

from src.models.consulentes import Consulente
from src.models.giras import Gira
from src.models.tenant_config import TenantConfig
from src.models.tickets import Ticket, TicketStatus
from src.models.users import UserRole

from .factories import create_gira, create_tenant, create_user


@pytest.fixture
def enqueued(monkeypatch):
    from src.services.email.email_queue import email_queue

    items: list = []
    monkeypatch.setattr(email_queue, "enqueue", lambda item: items.append(item))
    return items


async def _emit(client, tenant, gira, email):
    return await client.post(
        "/api/v1/public/emit-ticket",
        params={"tenant_slug": tenant.slug, "gira_id": str(gira.id)},
        json={"name": email.split("@")[0].title(), "email": email},
    )


async def _tickets(db, gira, email) -> list[Ticket]:
    rows = await db.execute(
        select(Ticket)
        .join(Consulente, Consulente.id == Ticket.consulente_id)
        .where(Ticket.gira_id == gira.id, Consulente.email_normalized == email)
        .order_by(Ticket.created_at)
        .execution_options(populate_existing=True)
    )
    return list(rows.scalars().all())


def _avisos_de_vaga(enqueued) -> list[str]:
    return [i.message.to_email for i in enqueued if "Uma vaga abriu" in i.message.subject]


async def _gira_com_vagas_soltas(db, client):
    """Gira de 1 vaga: a dona cancela, 'antiga' (fila) é chamada e perde o prazo
    sem mais ninguém na fila — a vaga fica livre com o contador em 2."""
    tenant = await create_tenant(db)
    await db.execute(update(TenantConfig).where(TenantConfig.tenant_id == tenant.id).values(enable_waitlist=True))
    await db.commit()
    gira = await create_gira(db, tenant, max_tickets=1)
    assert (await _emit(client, tenant, gira, "dona@example.com")).status_code == 200
    assert (await _emit(client, tenant, gira, "antiga@example.com")).json()["waitlisted"] is True
    agora = datetime.now(timezone.utc)
    (dona,) = await _tickets(db, gira, "dona@example.com")
    (antiga,) = await _tickets(db, gira, "antiga@example.com")
    await db.execute(update(Ticket).where(Ticket.id == dona.id).values(status=TicketStatus.CANCELLED))
    await db.execute(
        update(Ticket)
        .where(Ticket.id == antiga.id)
        .values(status=TicketStatus.WAITLIST_EXPIRED, promoted_at=agora - timedelta(hours=3),
                confirmation_expires_at=agora - timedelta(hours=1))
    )
    await db.commit()
    return tenant, gira


async def test_quem_entra_na_fila_com_vaga_solta_e_chamado_na_hora(client, db, enqueued):
    tenant, gira = await _gira_com_vagas_soltas(db, client)
    enqueued.clear()

    resp = await _emit(client, tenant, gira, "rayra@example.com")

    assert resp.status_code == 200, resp.text
    assert "Abriu uma vaga" in resp.json()["message"]
    (rayra,) = await _tickets(db, gira, "rayra@example.com")
    assert rayra.status == TicketStatus.WAITLISTED and rayra.promoted_at is not None
    assert _avisos_de_vaga(enqueued) == ["rayra@example.com"]
    # Só o aviso de vaga: nada de "você está na fila".
    assert not [i for i in enqueued if "fila de espera" in i.message.subject]

    # A vaga foi para ela: o próximo entra na fila de verdade.
    enqueued.clear()
    seguinte = await _emit(client, tenant, gira, "seguinte@example.com")
    assert seguinte.json()["waitlist_position"] == 1
    assert _avisos_de_vaga(enqueued) == []


async def test_abrir_a_fila_no_painel_chama_quem_esta_parado_com_vaga_livre(client, db, enqueued):
    tenant, gira = await _gira_com_vagas_soltas(db, client)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    # Estado de produção: a Rayra entrou antes desta correção e ficou parada.
    from src.models.consulentes import Consulente as C

    c = C(tenant_id=tenant.id, nome="Rayra", email="rayra@example.com", email_normalized="rayra@example.com")
    db.add(c)
    await db.flush()
    db.add(Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=c.id, numero=3, status=TicketStatus.WAITLISTED))
    await db.commit()
    enqueued.clear()

    resp = await client.get(f"/api/v1/admin/giras/{gira.id}/waitlist", headers=admin.headers)

    assert resp.status_code == 200, resp.text
    rayra = next(i for i in resp.json() if i["consulente_nome"] == "Rayra")
    assert rayra["status"] == "aguardando_confirmacao"
    assert _avisos_de_vaga(enqueued) == ["rayra@example.com"]
    # Abrir de novo não chama mais ninguém nem repete o e-mail.
    enqueued.clear()
    await client.get(f"/api/v1/admin/giras/{gira.id}/waitlist", headers=admin.headers)
    assert _avisos_de_vaga(enqueued) == []


async def test_aumentar_o_limite_chama_a_fila(client, db, enqueued):
    tenant = await create_tenant(db)
    await db.execute(update(TenantConfig).where(TenantConfig.tenant_id == tenant.id).values(enable_waitlist=True))
    await db.commit()
    admin = await create_user(db, tenant, UserRole.ADMIN)
    gira = await create_gira(db, tenant, max_tickets=1)
    assert (await _emit(client, tenant, gira, "dona@example.com")).status_code == 200
    for email in ("um@example.com", "dois@example.com", "tres@example.com"):
        assert (await _emit(client, tenant, gira, email)).json()["waitlisted"] is True
    enqueued.clear()

    agora = datetime.now(timezone.utc)
    resp = await client.put(
        f"/api/v1/admin/giras/{gira.id}/senhas",
        headers=admin.headers,
        json={"max_tickets": 3, "release_start_at": (agora - timedelta(hours=1)).isoformat(),
              "release_end_at": (agora + timedelta(days=1)).isoformat()},
    )

    assert resp.status_code == 200, resp.text
    assert _avisos_de_vaga(enqueued) == ["um@example.com", "dois@example.com"]


async def test_gira_que_ja_acabou_nao_chama_a_fila(client, db, enqueued):
    tenant, gira = await _gira_com_vagas_soltas(db, client)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    c = Consulente(tenant_id=tenant.id, nome="Rayra", email="rayra@example.com", email_normalized="rayra@example.com")
    db.add(c)
    await db.flush()
    db.add(Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=c.id, numero=3, status=TicketStatus.WAITLISTED))
    await db.execute(
        update(Gira).where(Gira.id == gira.id).values(data_inicio=datetime.now(timezone.utc) - timedelta(days=3))
    )
    await db.commit()
    enqueued.clear()

    resp = await client.get(f"/api/v1/admin/giras/{gira.id}/waitlist", headers=admin.headers)

    assert resp.status_code == 200, resp.text
    assert _avisos_de_vaga(enqueued) == []


async def test_fila_traz_telefone_e_mensagem_pronta_para_o_whatsapp(client, db, enqueued):
    tenant, gira = await _gira_com_vagas_soltas(db, client)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    # Rayra é chamada na hora (vaga solta); "depois" fica esperando atrás dela.
    resp = await client.post(
        "/api/v1/public/emit-ticket",
        params={"tenant_slug": tenant.slug, "gira_id": str(gira.id)},
        json={"name": "Rayra Paula", "email": "rayra@example.com", "phone": "(35) 99876-8609"},
    )
    assert resp.status_code == 200, resp.text
    assert (await _emit(client, tenant, gira, "depois@example.com")).json()["waitlisted"] is True

    itens = (await client.get(f"/api/v1/admin/giras/{gira.id}/waitlist", headers=admin.headers)).json()

    por_status = {i["status"]: i for i in itens}
    chamada = por_status["aguardando_confirmacao"]
    assert chamada["consulente_telefone"] == "(35) 99876-8609"
    msg = chamada["mensagem_whatsapp"]
    assert msg.startswith(f"*{tenant.name}*") and "Olá, Rayra!" in msg
    assert f"/public/waitlist/{chamada['id']}/confirm" in msg
    assert "Abriu uma vaga" in msg
    assert "posição 1" in por_status["aguardando"]["mensagem_whatsapp"]
    expirada = por_status["expirado"]["mensagem_whatsapp"]
    assert f"/public/gira/{gira.id}" in expirada and "terminou" in expirada
