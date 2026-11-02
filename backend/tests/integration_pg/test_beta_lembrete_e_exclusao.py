"""Betas da J2 v2 com Postgres real: lembrete no dia da gira e aviso ao excluir a gira.

- Lembrete: só casa beta tester com a beta ligada; sai uma vez por senha (a segunda rodada não
  repete), só a partir das 8 h e até 2 h antes da gira; e vai para quem pediu a senha.
- Excluir com `avisar=true`: com a beta, cada senha ativa recebe o aviso; sem a beta, ninguém.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from src.core.tz import APP_TZ
from src.models.consulentes import Consulente
from src.models.feature_flags import FeatureFlag
from src.models.giras import Gira
from src.models.permission_groups import PermissionFeature
from src.models.tickets import Ticket, TicketStatus
from src.models.users import UserRole
from src.services.lembrete_dia_gira_scheduler import rodada

from .factories import create_tenant, create_user


async def _casa(db, *chaves):
    tenant = await create_tenant(db)
    tenant.beta_tester = True
    db.add(tenant)
    for chave in chaves:
        db.add(FeatureFlag(tenant_id=tenant.id, feature=chave, enabled=True))
    await db.commit()
    return tenant


async def _gira_com_senha(db, tenant, inicio, email="maria.teste@example.com"):
    gira = Gira(tenant_id=tenant.id, nome="Gira de Caboclos", data_inicio=inicio, is_active=True, max_tickets=10)
    db.add(gira)
    await db.flush()
    pessoa = Consulente(tenant_id=tenant.id, nome="Maria Teste", email=email, email_normalized=email)
    db.add(pessoa)
    await db.flush()
    db.add(Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=pessoa.id, numero=27, status=TicketStatus.EMITTED))
    await db.commit()
    return gira


def _hoje_as(h: int) -> datetime:
    agora = datetime.now(APP_TZ)
    return agora.replace(hour=h, minute=0, second=0, microsecond=0).astimezone(timezone.utc)


async def test_lembrete_sai_uma_vez_e_so_com_a_beta(db):
    com_beta = await _casa(db, "beta_lembrete_dia_gira")
    sem_beta = await _casa(db)
    await _gira_com_senha(db, com_beta, _hoje_as(19))
    await _gira_com_senha(db, sem_beta, _hoje_as(19), email="outra.teste@example.com")

    enviados: list = []

    async def enviar(msg):
        enviados.append(msg)

    assert await rodada(db, agora=_hoje_as(7), enviar=enviar) == 0  # antes das 8 h
    assert await rodada(db, agora=_hoje_as(9), enviar=enviar) == 1
    assert enviados[0].to_email == "maria.teste@example.com" and "0027" in enviados[0].subject
    assert await rodada(db, agora=_hoje_as(10), enviar=enviar) == 0  # não repete


async def test_lembrete_nao_sai_perto_da_hora(db):
    casa = await _casa(db, "beta_lembrete_dia_gira")
    await _gira_com_senha(db, casa, _hoje_as(19))

    async def enviar(msg):
        raise AssertionError("não devia enviar")

    assert await rodada(db, agora=_hoje_as(18), enviar=enviar) == 0


async def test_excluir_avisa_so_com_a_beta(client, db, monkeypatch):
    from src.services.email.email_queue import email_queue

    enviados: list = []
    monkeypatch.setattr(email_queue, "enqueue", lambda item: enviados.append(item))
    inicio = datetime.now(timezone.utc) + timedelta(days=3)

    sem_beta = await _casa(db)
    admin = await create_user(db, sem_beta, UserRole.ADMIN)
    gira = await _gira_com_senha(db, sem_beta, inicio)
    r = await client.delete(f"/api/v1/admin/giras/{gira.id}", params={"avisar": "true"}, headers=admin.headers)
    assert r.status_code == 204, r.text
    assert enviados == []

    com_beta = await _casa(db, "beta_avisar_exclusao_gira")
    admin2 = await create_user(db, com_beta, UserRole.ADMIN)
    gira2 = await _gira_com_senha(db, com_beta, inicio, email="joao.teste@example.com")
    r = await client.delete(f"/api/v1/admin/giras/{gira2.id}", params={"avisar": "true"}, headers=admin2.headers)
    assert r.status_code == 204, r.text
    assert [e.message.to_email for e in enviados] == ["joao.teste@example.com"]
