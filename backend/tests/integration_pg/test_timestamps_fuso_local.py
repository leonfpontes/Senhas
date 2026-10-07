"""Timestamps certos mesmo com a máquina no fuso de Brasília.

Antes, ``created_at`` era gravado com ``datetime.utcnow()`` (sem fuso) e o asyncpg o interpretava
no fuso local do processo: com TZ=America/Sao_Paulo, o registro ficava 3 h no futuro e o
analytics de "hoje" zerava entre 21h e meia-noite. Estes testes forçam o fuso de Brasília no
processo (o CI e a produção rodam em UTC, por isso o bug passava despercebido).
"""
from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from src.models.consulentes import Consulente
from src.models.tickets import Ticket, TicketStatus

from .factories import create_gira, create_tenant, create_user


@pytest.fixture
def fuso_brasilia():
    antigo = os.environ.get("TZ")
    os.environ["TZ"] = "America/Sao_Paulo"
    time.tzset()
    yield
    if antigo is None:
        os.environ.pop("TZ", None)
    else:
        os.environ["TZ"] = antigo
    time.tzset()


async def test_created_at_grava_o_instante_real(db, fuso_brasilia):
    tenant = await create_tenant(db)
    antes = datetime.now(timezone.utc)
    c = Consulente(tenant_id=tenant.id, nome="Consulente")
    db.add(c)
    await db.commit()

    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        salvo = await fresh.get(Consulente, c.id)
        assert salvo.created_at.tzinfo is not None
        assert abs(salvo.created_at - antes) < timedelta(minutes=1)


async def test_analytics_de_hoje_conta_senha_emitida_agora(client, db, fuso_brasilia):
    from src.models.users import UserRole

    tenant = await create_tenant(db)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    gira = await create_gira(db, tenant)
    email = f"c{uuid.uuid4().hex[:8]}@example.com"
    c = Consulente(tenant_id=tenant.id, nome="Consulente", email=email, email_normalized=email)
    db.add(c)
    await db.flush()
    db.add(Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=c.id, numero=1, status=TicketStatus.EMITTED))
    await db.commit()

    resp = await client.get("/api/v1/admin/analytics", headers=admin.headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["total_emitted"] == 1
