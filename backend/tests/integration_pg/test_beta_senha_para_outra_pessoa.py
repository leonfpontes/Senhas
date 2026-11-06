"""Beta "Senha para outra pessoa" (Laboratório) — com Postgres real.

- Sem a beta ligada (ou sem beta tester), `para_outra_pessoa` é recusado com 400.
- Ligada: a senha sai em nome de quem vai (consulente sem e-mail) e o e-mail vai para quem
  preencheu, que ainda pode pegar a própria senha na mesma gira; uma por e-mail e gira.
- O reenvio público por e-mail encontra a senha pedida para outra pessoa.
"""
from __future__ import annotations

from sqlalchemy import select

from src.models.feature_flags import FeatureFlag
from src.models.tickets import Ticket

from .factories import create_gira, create_tenant

CHAVE = "beta_senha_para_outra_pessoa"
QUEM_PEDE = "joao.teste@example.com"


async def _emitir(client, tenant, gira, **body):
    return await client.post(
        "/api/v1/public/emit-ticket",
        params={"tenant_slug": tenant.slug, "gira_id": str(gira.id)},
        json={"name": "Maria Aparecida", "email": QUEM_PEDE, **body},
    )


async def _ligar_beta(db, tenant):
    tenant.beta_tester = True
    db.add(tenant)
    db.add(FeatureFlag(tenant_id=tenant.id, feature=CHAVE, enabled=True))
    await db.commit()


async def test_sem_a_beta_recusa(client, db, monkeypatch):
    from src.services.email.email_queue import email_queue

    monkeypatch.setattr(email_queue, "enqueue", lambda item: None)
    tenant = await create_tenant(db)
    gira = await create_gira(db, tenant)
    r = await _emitir(client, tenant, gira, para_outra_pessoa=True)
    assert r.status_code == 400, r.text


async def test_com_a_beta_emite_em_nome_de_quem_vai(client, db, monkeypatch):
    from src.services.email.email_queue import email_queue

    enviados: list = []
    monkeypatch.setattr(email_queue, "enqueue", lambda item: enviados.append(item))
    tenant = await create_tenant(db)
    await _ligar_beta(db, tenant)
    gira = await create_gira(db, tenant)

    r = await _emitir(client, tenant, gira, para_outra_pessoa=True)
    assert r.status_code in (200, 201), r.text
    assert enviados[-1].message.to_email == QUEM_PEDE

    ticket = (await db.execute(select(Ticket).where(Ticket.gira_id == gira.id))).scalars().one()
    await db.refresh(ticket, ["consulente"])
    assert ticket.email_de_quem_pediu == QUEM_PEDE
    assert ticket.consulente.nome == "Maria Aparecida" and ticket.consulente.email is None

    # Uma por e-mail e gira; a própria senha de quem pediu continua liberada.
    assert (await _emitir(client, tenant, gira, name="Ana Souza", para_outra_pessoa=True)).status_code == 409
    propria = await _emitir(client, tenant, gira, name="João Silva")
    assert propria.status_code in (200, 201), propria.text

    reenvio = await client.post(
        "/api/v1/public/resend-ticket-email",
        params={"tenant_slug": tenant.slug},
        json={"email": QUEM_PEDE, "gira_id": str(gira.id)},
    )
    assert reenvio.status_code == 200 and reenvio.json()["tickets_count"] == 2
