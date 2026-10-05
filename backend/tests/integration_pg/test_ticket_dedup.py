"""Q-03 — uma senha ativa por consulente/gira/tipo, garantida pelo banco
(índice único parcial da migração 056) e tratada como 409 na API."""
import asyncio
import subprocess
import sys

import pytest
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError

from src.models.consulentes import Consulente
from src.models.tenant_config import TenantConfig
from src.models.tickets import Ticket, TicketStatus
from src.models.users import UserRole

from .conftest import BACKEND_DIR
from .factories import create_gira, create_tenant, create_user


async def _consulente(db, tenant, email="ana@example.com"):
    c = Consulente(tenant_id=tenant.id, nome="Ana", email=email, email_normalized=email)
    db.add(c)
    await db.commit()
    return c


async def _count(gira_id, **filtros):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        stmt = select(func.count()).select_from(Ticket).where(Ticket.gira_id == gira_id)
        for campo, valor in filtros.items():
            stmt = stmt.where(getattr(Ticket, campo) == valor)
        return (await fresh.execute(stmt)).scalar_one()


async def test_banco_barra_segunda_senha_ativa(db):
    tenant = await create_tenant(db)
    gira = await create_gira(db, tenant)
    c = await _consulente(db, tenant)
    db.add(Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=c.id, numero=1))
    await db.commit()

    db.add(Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=c.id, numero=2))
    with pytest.raises(IntegrityError, match="uq_tickets_gira_consulente_ativo"):
        await db.commit()
    await db.rollback()


async def test_cancelada_libera_reemissao_e_acompanhante_e_associado_nao_contam(db):
    tenant = await create_tenant(db)
    gira = await create_gira(db, tenant)
    c = await _consulente(db, tenant)
    db.add(Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=c.id, numero=1, status=TicketStatus.CANCELLED))
    db.add(Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=c.id, numero=2))
    db.add(Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=c.id, numero=3, is_acompanhante=True))
    db.add(Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=c.id, numero=1, is_sponsor=True))
    await db.commit()  # nenhuma colide com a senha comum ativa

    assert await _count(gira.id) == 4


async def _porta_com_walk_in(db):
    tenant = await create_tenant(db)
    await db.execute(update(TenantConfig).where(TenantConfig.tenant_id == tenant.id).values(enable_walk_in=True))
    await db.commit()
    admin = await create_user(db, tenant, UserRole.ADMIN)
    gira = await create_gira(db, tenant)
    return admin, gira


async def _walk_in(client, admin, gira, email="joao@example.com"):
    return await client.post(
        f"/api/v1/admin/giras/{gira.id}/door/walk-in",
        headers=admin.headers,
        json={"nome": "João", "email": email},
    )


async def test_walk_in_repetido_nao_cria_segunda_senha(client, db):
    admin, gira = await _porta_com_walk_in(db)

    first = await _walk_in(client, admin, gira)
    second = await _walk_in(client, admin, gira)

    assert first.status_code == 201, first.text
    assert second.status_code == 409, second.text
    assert "já tem uma senha ativa" in second.json().get("detail", second.text)
    assert await _count(gira.id, status=TicketStatus.EMITTED) == 1


async def test_walk_in_em_rajada_cria_uma_senha_so(client, db):
    """Clique duplo na Porta: produção tinha um par assim antes da migração 056."""
    admin, gira = await _porta_com_walk_in(db)

    responses = await asyncio.gather(*[_walk_in(client, admin, gira) for _ in range(5)])

    codes = sorted(r.status_code for r in responses)
    assert codes.count(201) == 1 and all(c in (201, 409) for c in codes), codes
    assert await _count(gira.id) == 1


async def test_walk_in_sem_email_sao_pessoas_diferentes(client, db):
    admin, gira = await _porta_com_walk_in(db)

    for _ in range(2):
        resp = await client.post(
            f"/api/v1/admin/giras/{gira.id}/door/walk-in", headers=admin.headers, json={"nome": "Sem E-mail"}
        )
        assert resp.status_code == 201, resp.text

    assert await _count(gira.id) == 2


def _alembic(*args):
    subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR, check=True, capture_output=True)


async def test_migracao_cancela_duplicatas_existentes_mantendo_a_mais_antiga(db):
    from src.core.database import engine

    tenant = await create_tenant(db)
    gira = await create_gira(db, tenant)
    c = await _consulente(db, tenant)

    _alembic("downgrade", "055_gira_acompanhantes")  # remove o índice
    try:
        async with engine.begin() as conn:
            for numero, atraso in ((1, "0 seconds"), (2, "92 seconds"), (3, "200 seconds")):
                await conn.execute(
                    text(
                        "INSERT INTO tickets (id, tenant_id, gira_id, consulente_id, numero, status, is_sponsor, "
                        "is_walk_in, is_acompanhante, created_at, updated_at) VALUES (gen_random_uuid(), :t, :g, :c, "
                        f":n, 'emitted', false, true, false, now() + interval '{atraso}', now())"
                    ),
                    {"t": tenant.id, "g": gira.id, "c": c.id, "n": numero},
                )
    finally:
        _alembic("upgrade", "head")

    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        rows = (
            await fresh.execute(select(Ticket.numero, Ticket.status).where(Ticket.gira_id == gira.id).order_by(Ticket.numero))
        ).all()
    assert [(n, s) for n, s in rows] == [
        (1, TicketStatus.EMITTED),
        (2, TicketStatus.CANCELLED),
        (3, TicketStatus.CANCELLED),
    ]
