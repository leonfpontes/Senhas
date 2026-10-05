"""Grupo 1 do Q-01 — emissão pública concorrente, com Postgres real.

N requisições simultâneas ao endpoint público passam pelo mesmo caminho de
produção (SELECT ... FOR UPDATE no contador de senhas). Os testes conferem
que não há número duplicado, nem furo de capacidade, nem senha a mais.
"""
import asyncio

from sqlalchemy import func, select

from src.models.senha_controls import SenhaControl
from src.models.tickets import Ticket, TicketStatus

from .factories import create_gira, create_tenant


async def _emit(client, tenant, gira, i: int, email: str | None = None):
    return await client.post(
        "/api/v1/public/emit-ticket",
        params={"tenant_slug": tenant.slug, "gira_id": str(gira.id)},
        json={"name": f"Consulente {i}", "email": email or f"consulente{i}@example.com"},
    )


async def _tickets(db, gira):
    """Lê numa sessão nova: o que as requisições gravaram, sem cache da sessão do teste."""
    from src.core.database import AsyncSessionLocal

    gira_id = gira.id
    async with AsyncSessionLocal() as fresh:
        rows = await fresh.execute(select(Ticket).where(Ticket.gira_id == gira_id, Ticket.deleted_at.is_(None)))
        return list(rows.scalars())


async def _scalar(stmt):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(stmt)).scalar_one()


async def test_rajada_maior_que_a_capacidade_nao_fura_o_limite(client, db):
    tenant = await create_tenant(db)
    gira = await create_gira(db, tenant, max_tickets=10)

    responses = await asyncio.gather(*[_emit(client, tenant, gira, i) for i in range(25)])
    codes = [r.status_code for r in responses]

    assert codes.count(200) == 10, codes
    assert all(c in (200, 410) for c in codes), codes  # 410 = esgotado (sem fila de espera)
    tickets = await _tickets(db, gira)
    assert len(tickets) == 10
    numeros = sorted(int(t.numero) for t in tickets)
    assert numeros == list(range(1, 11)), numeros  # sem duplicata nem buraco


async def test_rajada_dentro_da_capacidade_emite_todas_com_numeros_unicos(client, db):
    tenant = await create_tenant(db)
    gira = await create_gira(db, tenant, max_tickets=50)

    responses = await asyncio.gather(*[_emit(client, tenant, gira, i) for i in range(30)])

    assert [r.status_code for r in responses].count(200) == 30
    tickets = await _tickets(db, gira)
    assert len({t.numero for t in tickets}) == 30
    total = await _scalar(
        select(SenhaControl.total_emitido).where(SenhaControl.gira_id == gira.id, SenhaControl.is_sponsor.is_(False))
    )
    assert total == 30


async def test_primeiras_emissoes_simultaneas_numa_gira_nova_criam_um_contador_so(client, db):
    """A primeira emissão cria o SenhaControl; várias ao mesmo tempo não podem
    criar dois contadores nem derrubar requisições com erro 500."""
    tenant = await create_tenant(db)
    gira = await create_gira(db, tenant, max_tickets=20)

    responses = await asyncio.gather(*[_emit(client, tenant, gira, i) for i in range(8)])

    assert all(r.status_code == 200 for r in responses), [(r.status_code, r.text[:120]) for r in responses]
    controls = await _scalar(select(func.count()).select_from(SenhaControl).where(SenhaControl.gira_id == gira.id))
    assert controls == 1
    assert len({t.numero for t in await _tickets(db, gira)}) == 8


async def test_mesmo_email_duas_vezes_em_sequencia_nao_gera_segunda_senha(client, db):
    tenant = await create_tenant(db)
    gira = await create_gira(db, tenant)

    first = await _emit(client, tenant, gira, 1, email="maria@example.com")
    second = await _emit(client, tenant, gira, 2, email="MARIA@example.com ")

    assert first.status_code == 200
    assert second.status_code in (200, 409), second.text
    tickets = [t for t in await _tickets(db, gira) if t.status != TicketStatus.CANCELLED]
    assert len(tickets) == 1


async def test_mesmo_email_em_rajada_gera_uma_senha_so(client, db):
    tenant = await create_tenant(db)
    gira = await create_gira(db, tenant)

    responses = await asyncio.gather(*[_emit(client, tenant, gira, i, email="joao@example.com") for i in range(6)])

    assert all(r.status_code in (200, 409) for r in responses), [r.status_code for r in responses]
    tickets = [t for t in await _tickets(db, gira) if t.status != TicketStatus.CANCELLED]
    assert len(tickets) == 1, f"{len(tickets)} senhas para o mesmo e-mail"


async def test_gira_fora_da_janela_de_liberacao_nao_emite(client, db):
    tenant = await create_tenant(db)
    gira = await create_gira(db, tenant, open_now=False)

    resp = await _emit(client, tenant, gira, 1)

    assert resp.status_code in (404, 410), resp.text
    assert await _tickets(db, gira) == []


async def test_nao_emite_senha_de_gira_de_outro_terreiro(client, db):
    """slug do terreiro A + gira do terreiro B não pode emitir na gira de B."""
    tenant_a = await create_tenant(db, "Terreiro A")
    tenant_b = await create_tenant(db, "Terreiro B")
    gira_b = await create_gira(db, tenant_b)

    resp = await _emit(client, tenant_a, gira_b, 1)

    assert resp.status_code in (400, 404), resp.text
    assert await _tickets(db, gira_b) == []
