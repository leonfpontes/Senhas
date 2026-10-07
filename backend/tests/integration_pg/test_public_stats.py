"""V-02 — números públicos da landing com Postgres real.

Conta só o que vale: senha não cancelada, fora da fila de espera, sem acompanhante; gira que já
aconteceu; terreiro ativo. Ignora o tenant demo, tenants apagados/inativos/auto-desativados e
não devolve nenhum dado de terreiro.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import update

from src.api.v1.public import stats as stats_module
from src.models.consulentes import Consulente
from src.models.giras import Gira
from src.models.tenants import Tenant
from src.models.tickets import Ticket, TicketStatus

from .factories import create_gira, create_tenant


@pytest.fixture(autouse=True)
def _sem_cache():
    stats_module._cache.clear()
    yield
    stats_module._cache.clear()


async def _gira_passada(db, tenant) -> Gira:
    gira = await create_gira(db, tenant)
    await db.execute(
        update(Gira).where(Gira.id == gira.id).values(data_inicio=datetime.now(timezone.utc) - timedelta(days=3))
    )
    await db.commit()
    return gira


async def _senhas(db, tenant, gira, *status: TicketStatus, acompanhante: bool = False) -> None:
    for i, st in enumerate(status, start=1):
        c = Consulente(tenant_id=tenant.id, nome=f"Pessoa {i}")
        db.add(c)
        await db.flush()
        db.add(
            Ticket(
                tenant_id=tenant.id,
                gira_id=gira.id,
                consulente_id=c.id,
                numero=i + (100 if acompanhante else 0),
                status=st,
                is_acompanhante=acompanhante,
            )
        )
    await db.commit()


async def test_conta_so_o_que_vale_e_nao_expoe_terreiro(client, db):
    casa = await create_tenant(db, "Casa Real")
    gira = await _gira_passada(db, casa)
    await create_gira(db, casa)  # gira futura: não conta como realizada
    await _senhas(db, casa, gira, TicketStatus.EMITTED, TicketStatus.COMPLETED, TicketStatus.NO_SHOW,
                  TicketStatus.CANCELLED, TicketStatus.WAITLISTED)
    await _senhas(db, casa, gira, TicketStatus.EMITTED, acompanhante=True)

    demo = await create_tenant(db, "Demo")
    await db.execute(update(Tenant).where(Tenant.id == demo.id).values(slug=stats_module.DEMO_TENANT_SLUG))
    await db.commit()
    gira_demo = await _gira_passada(db, demo)
    await _senhas(db, demo, gira_demo, TicketStatus.COMPLETED, TicketStatus.COMPLETED)

    apagado = await create_tenant(db, "Apagado")
    gira_apagado = await _gira_passada(db, apagado)
    await _senhas(db, apagado, gira_apagado, TicketStatus.COMPLETED)
    await db.execute(update(Tenant).where(Tenant.id == apagado.id).values(deleted_at=datetime.now(timezone.utc)))

    inativo = await create_tenant(db, "Inativo")
    await db.execute(update(Tenant).where(Tenant.id == inativo.id).values(is_active=False))
    desativado = await create_tenant(db, "Desativado")
    await db.execute(
        update(Tenant).where(Tenant.id == desativado.id).values(self_deactivated_at=datetime.now(timezone.utc))
    )
    await db.commit()

    r = await client.get("/api/v1/public/stats")
    assert r.status_code == 200
    assert r.json() == {"senhas_emitidas": 3, "giras_realizadas": 1, "terreiros_ativos": 1}
    assert "max-age=3600" in r.headers["cache-control"]
    assert "Casa Real" not in r.text and str(casa.id) not in r.text


async def test_resultado_fica_em_cache(client, db):
    casa = await create_tenant(db)
    gira = await _gira_passada(db, casa)
    await _senhas(db, casa, gira, TicketStatus.EMITTED)
    assert (await client.get("/api/v1/public/stats")).json()["senhas_emitidas"] == 1

    await _senhas(db, casa, gira, TicketStatus.COMPLETED)
    assert (await client.get("/api/v1/public/stats")).json()["senhas_emitidas"] == 1  # ainda o cache

    stats_module._cache.clear()
    assert (await client.get("/api/v1/public/stats")).json()["senhas_emitidas"] == 2
