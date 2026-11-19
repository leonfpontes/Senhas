"""Quem perde o prazo da fila de espera pode pedir a senha de novo (bug Tuccco, nov/2026).

O consulente entrou na fila, foi promovido ("uma vaga abriu"), não confirmou a
tempo e voltou a pedir a senha: o sistema respondia "Este e-mail já possui uma
senha emitida para esta gira". Duas causas: a checagem de duplicata (e o índice
único da 056) contavam a senha `waitlist_expired`, e o vencimento do prazo é
preguiçoso — sem ninguém mexer na fila, a reserva vencida seguia `waitlisted`.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select, update

from src.models.tenant_config import TenantConfig
from src.models.tickets import Ticket, TicketStatus

from .factories import create_gira, create_tenant


@pytest.fixture
def enqueued(monkeypatch):
    from src.services.email.email_queue import email_queue

    items: list = []
    monkeypatch.setattr(email_queue, "enqueue", lambda item: items.append(item))
    return items


async def _emit(client, tenant, gira, email, name="Consulente Teste"):
    return await client.post(
        "/api/v1/public/emit-ticket",
        params={"tenant_slug": tenant.slug, "gira_id": str(gira.id)},
        json={"name": name, "email": email},
    )


async def _gira_lotada_com_fila(db):
    tenant = await create_tenant(db)
    await db.execute(
        update(TenantConfig).where(TenantConfig.tenant_id == tenant.id).values(enable_waitlist=True)
    )
    await db.commit()
    gira = await create_gira(db, tenant, max_tickets=1)
    return tenant, gira


async def _ticket_de(db, gira, email) -> Ticket:
    from src.models.consulentes import Consulente

    rows = await db.execute(
        select(Ticket)
        .join(Consulente, Consulente.id == Ticket.consulente_id)
        .where(Ticket.gira_id == gira.id, Consulente.email_normalized == email)
        .order_by(Ticket.created_at)
        .execution_options(populate_existing=True)
    )
    return list(rows.scalars().all())


async def _vencer_reserva(db, ticket: Ticket):
    agora = datetime.now(timezone.utc)
    await db.execute(
        update(Ticket)
        .where(Ticket.id == ticket.id)
        .values(promoted_at=agora - timedelta(hours=25), confirmation_expires_at=agora - timedelta(hours=1))
    )
    await db.commit()


async def test_reserva_vencida_sem_ninguem_mexer_na_fila_libera_nova_senha(client, db, enqueued):
    tenant, gira = await _gira_lotada_com_fila(db)
    assert (await _emit(client, tenant, gira, "dona@example.com")).status_code == 200
    fila = await _emit(client, tenant, gira, "marcelo@example.com", name="Marcelo")
    assert fila.json()["waitlisted"] is True
    seguinte = await _emit(client, tenant, gira, "seguinte@example.com", name="Seguinte")
    assert seguinte.json()["waitlisted"] is True

    (marcelo,) = await _ticket_de(db, gira, "marcelo@example.com")
    await _vencer_reserva(db, marcelo)  # promovido e perdeu o prazo; ninguém mexeu na fila
    enqueued.clear()

    de_novo = await _emit(client, tenant, gira, "marcelo@example.com", name="Marcelo")

    assert de_novo.status_code == 200, de_novo.text
    assert de_novo.json()["waitlisted"] is True  # volta para o fim da fila
    antiga, nova = await _ticket_de(db, gira, "marcelo@example.com")
    assert antiga.status == TicketStatus.WAITLIST_EXPIRED
    assert nova.status == TicketStatus.WAITLISTED and nova.promoted_at is None
    # A vaga que ele perdeu foi para o próximo da fila, com o e-mail de aviso.
    (prox,) = await _ticket_de(db, gira, "seguinte@example.com")
    assert prox.promoted_at is not None
    assert any(
        "Uma vaga abriu" in i.message.subject and i.message.to_email == "seguinte@example.com"
        for i in enqueued
    )


async def test_senha_ja_expirada_nao_bloqueia_nova_emissao(client, db, enqueued):
    tenant, gira = await _gira_lotada_com_fila(db)
    assert (await _emit(client, tenant, gira, "dona@example.com")).status_code == 200
    assert (await _emit(client, tenant, gira, "marcelo@example.com")).json()["waitlisted"] is True
    (marcelo,) = await _ticket_de(db, gira, "marcelo@example.com")
    await db.execute(update(Ticket).where(Ticket.id == marcelo.id).values(status=TicketStatus.WAITLIST_EXPIRED))
    await db.commit()

    de_novo = await _emit(client, tenant, gira, "marcelo@example.com")

    assert de_novo.status_code == 200, de_novo.text
    assert de_novo.json()["waitlisted"] is True


async def test_quem_ainda_esta_na_fila_continua_barrado(client, db, enqueued):
    tenant, gira = await _gira_lotada_com_fila(db)
    assert (await _emit(client, tenant, gira, "dona@example.com")).status_code == 200
    assert (await _emit(client, tenant, gira, "marcelo@example.com")).json()["waitlisted"] is True

    de_novo = await _emit(client, tenant, gira, "marcelo@example.com")

    assert de_novo.status_code == 409


async def test_link_de_confirmacao_vencido_avisa_o_proximo_da_fila(client, db, enqueued):
    tenant, gira = await _gira_lotada_com_fila(db)
    assert (await _emit(client, tenant, gira, "dona@example.com")).status_code == 200
    assert (await _emit(client, tenant, gira, "marcelo@example.com")).json()["waitlisted"] is True
    assert (await _emit(client, tenant, gira, "seguinte@example.com")).json()["waitlisted"] is True
    (marcelo,) = await _ticket_de(db, gira, "marcelo@example.com")
    await _vencer_reserva(db, marcelo)
    enqueued.clear()

    resp = await client.post(f"/api/v1/public/waitlist/{marcelo.id}/confirm")

    assert resp.status_code == 410, resp.text
    assert [i.message.to_email for i in enqueued] == ["seguinte@example.com"]
