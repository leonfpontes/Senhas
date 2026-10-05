"""Operações em lote de senhas respeitam a gira da URL e contam as falhas."""
import uuid

from sqlalchemy import select

from src.models.consulentes import Consulente
from src.models.tickets import Ticket, TicketStatus
from src.models.users import UserRole

from .factories import create_gira, create_tenant, create_user


async def _senha(db, tenant, gira, numero):
    email = f"c{uuid.uuid4().hex[:8]}@example.com"
    c = Consulente(tenant_id=tenant.id, nome="Consulente", email=email, email_normalized=email)
    db.add(c)
    await db.flush()
    t = Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=c.id, numero=numero)
    db.add(t)
    await db.commit()
    return t.id


async def _status(ticket_id):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(select(Ticket.status).where(Ticket.id == ticket_id))).scalar_one()


async def _cenario(db):
    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    gira_a = await create_gira(db, tenant, nome="Gira A")
    gira_b = await create_gira(db, tenant, nome="Gira B")
    da_a = await _senha(db, tenant, gira_a, 1)
    da_b = await _senha(db, tenant, gira_b, 1)
    return admin, gira_a, da_a, da_b


async def test_bulk_cancel_nao_toca_senha_de_outra_gira(client, db):
    admin, gira_a, da_a, da_b = await _cenario(db)

    resp = await client.post(
        f"/api/v1/admin/giras/{gira_a.id}/tickets/bulk-cancel",
        headers=admin.headers,
        json={"ticket_ids": [str(da_a), str(da_b)]},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert (body["modified"], body["failed"]) == (1, 1)
    assert body["errors"] == ["1 senha(s) não encontrada(s) nesta gira"]
    assert await _status(da_a) == TicketStatus.CANCELLED
    assert await _status(da_b) == TicketStatus.EMITTED


async def test_bulk_mark_used_nao_toca_senha_de_outra_gira(client, db):
    admin, gira_a, da_a, da_b = await _cenario(db)

    resp = await client.post(
        f"/api/v1/admin/giras/{gira_a.id}/tickets/bulk-mark-used",
        headers=admin.headers,
        json={"ticket_ids": [str(da_a), str(da_b)]},
    )

    assert resp.status_code == 200, resp.text
    assert (resp.json()["modified"], resp.json()["failed"]) == (1, 1)
    assert await _status(da_a) == TicketStatus.COMPLETED
    assert await _status(da_b) == TicketStatus.EMITTED


async def test_ids_repetidos_contam_uma_vez(client, db):
    admin, gira_a, da_a, _ = await _cenario(db)

    resp = await client.post(
        f"/api/v1/admin/giras/{gira_a.id}/tickets/bulk-cancel",
        headers=admin.headers,
        json={"ticket_ids": [str(da_a), str(da_a)]},
    )

    assert resp.status_code == 200, resp.text
    assert (resp.json()["modified"], resp.json()["failed"], resp.json()["errors"]) == (1, 0, [])


async def test_validate_bulk_sem_gira_continua_aceitando_qualquer_gira_do_terreiro(client, db):
    admin, _, da_a, da_b = await _cenario(db)

    resp = await client.post(
        "/api/v1/admin/validate-bulk",
        headers=admin.headers,
        json={"ticket_ids": [str(da_a), str(da_b)], "operation": "cancel"},
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["valid"] is True and resp.json()["count"] == 2
    # dry-run: nada foi gravado
    assert await _status(da_a) == TicketStatus.EMITTED
    assert await _status(da_b) == TicketStatus.EMITTED
