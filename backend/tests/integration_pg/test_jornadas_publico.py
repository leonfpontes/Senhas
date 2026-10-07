"""Jornadas públicas e de conta, ponta a ponta com Postgres real.

- Fila de espera + agendamento por horário: com a gira lotada, entrar na fila
  sem horário funciona (antes: 400 "Selecione um horário" — beco sem saída).
- Recusas por horário trazem error_code próprio.
- Reenvio de e-mail só das senhas ativas da gira informada.
- Logo enviada (logo_data) aparece na página de emissão; agenda pública sem giras inativas.
- Login / esqueci a senha / cadastro sem diferença de maiúsculas no e-mail;
  e-mail repetido em dois terreiros não derruba o esqueci a senha.
- Cadastro e reativação abrem a sessão com os 3 cookies; "Lembrar-me"
  desmarcado gera cookies de sessão e o refresh mantém o modo.
- Inscrição em curso enfileira o e-mail de confirmação.
"""
from __future__ import annotations

import uuid
from datetime import datetime, time, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select, update

from src.models.consulentes import Consulente
from src.models.cursos_presenciais import CursoPresencial
from src.models.gira_time_slots import GiraTimeSlot
from src.models.tenant_config import TenantConfig
from src.models.tenants import Tenant
from src.models.tickets import Ticket, TicketStatus
from src.models.users import User, UserRole
from src.security.password import hash_password

from .factories import create_gira, create_tenant

SENHA = "Senha-forte-123"


@pytest.fixture
def enqueued(monkeypatch):
    """Captura o que vai para a fila de e-mail (sem worker nos testes)."""
    from src.services.email.email_queue import email_queue

    items: list = []
    monkeypatch.setattr(email_queue, "enqueue", lambda item: items.append(item))
    return items


def _set_cookies(resp) -> dict[str, str]:
    """{nome: header Set-Cookie inteiro} da resposta."""
    out = {}
    for raw in resp.headers.get_list("set-cookie"):
        out[raw.split("=", 1)[0]] = raw
    return out


async def _enable(db, tenant, **flags):
    await db.execute(update(TenantConfig).where(TenantConfig.tenant_id == tenant.id).values(**flags))
    await db.commit()


async def _slot(db, tenant, gira, capacidade=5, horario=time(19, 0)):
    slot = GiraTimeSlot(tenant_id=tenant.id, gira_id=gira.id, horario=horario, capacidade_maxima=capacidade)
    db.add(slot)
    await db.commit()
    return slot


async def _gira_com_horario(db, max_tickets=1, capacidade=5):
    tenant = await create_tenant(db)
    await _enable(db, tenant, enable_waitlist=True, enable_time_slot_scheduling=True)
    gira = await create_gira(db, tenant, max_tickets=max_tickets)
    await db.execute(update(type(gira)).where(type(gira).id == gira.id).values(use_time_slots=True))
    await db.commit()
    slot = await _slot(db, tenant, gira, capacidade=capacidade)
    return tenant, gira, slot


async def _emit(client, tenant, gira, email, time_slot_id=None):
    body = {"name": "Consulente Teste", "email": email}
    if time_slot_id is not None:
        body["time_slot_id"] = str(time_slot_id)
    return await client.post(
        "/api/v1/public/emit-ticket",
        params={"tenant_slug": tenant.slug, "gira_id": str(gira.id)},
        json=body,
    )


# ── Emissão: fila de espera + horário ────────────────────────────────────────


async def test_gira_lotada_com_horarios_entra_na_fila_sem_escolher_horario(client, db, enqueued):
    tenant, gira, slot = await _gira_com_horario(db, max_tickets=1)

    primeira = await _emit(client, tenant, gira, "primeira@example.com", time_slot_id=slot.id)
    assert primeira.status_code == 200, primeira.text

    # O formulário em modo fila não mostra horários e manda time_slot_id=null.
    fila = await _emit(client, tenant, gira, "fila@example.com")
    assert fila.status_code == 200, fila.text
    assert fila.json()["waitlisted"] is True
    assert "email_sent" not in fila.json()


async def test_horario_obrigatorio_quando_a_senha_tem_vaga(client, db, enqueued):
    tenant, gira, _slot_ = await _gira_com_horario(db, max_tickets=10)

    resp = await _emit(client, tenant, gira, "semhorario@example.com")
    assert resp.status_code == 400
    assert resp.json()["error_code"] == "TIME_SLOT_REQUIRED"


async def test_horario_lotado_e_removido_tem_error_code_proprio(client, db, enqueued):
    tenant, gira, slot = await _gira_com_horario(db, max_tickets=10, capacidade=1)

    assert (await _emit(client, tenant, gira, "a@example.com", time_slot_id=slot.id)).status_code == 200
    lotado = await _emit(client, tenant, gira, "b@example.com", time_slot_id=slot.id)
    assert lotado.status_code == 410
    assert lotado.json()["error_code"] == "TIME_SLOT_FULL"

    invalido = await _emit(client, tenant, gira, "c@example.com", time_slot_id=uuid.uuid4())
    assert invalido.status_code == 404
    assert invalido.json()["error_code"] == "TIME_SLOT_INVALID"


# ── Reenvio de e-mail ─────────────────────────────────────────────────────────


async def test_reenvio_so_da_senha_ativa_da_gira_informada(client, db, enqueued):
    tenant = await create_tenant(db)
    gira = await create_gira(db, tenant)
    outra = await create_gira(db, tenant, nome="Outra gira")
    c = Consulente(tenant_id=tenant.id, nome="Ana", email="ana@example.com", email_normalized="ana@example.com")
    db.add(c)
    await db.flush()
    db.add(Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=c.id, numero=3, is_sponsor=True))
    db.add(Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=c.id, numero=1, status=TicketStatus.CANCELLED))
    db.add(Ticket(tenant_id=tenant.id, gira_id=outra.id, consulente_id=c.id, numero=9))
    await db.commit()

    resp = await client.post(
        "/api/v1/public/resend-ticket-email",
        params={"tenant_slug": tenant.slug},
        json={"email": "ANA@example.com", "gira_id": str(gira.id)},
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["tickets_count"] == 1
    assert len(enqueued) == 1
    msg = enqueued[0].message
    assert "P003" in msg.subject  # prefixo do associado preservado
    assert "REENVIADO" not in msg.subject
    assert msg.to_email == "ana@example.com"


# ── Branding e agenda pública ─────────────────────────────────────────────────


async def test_pagina_de_emissao_mostra_logo_enviada(client, db):
    tenant = await create_tenant(db)
    await _enable(db, tenant, logo_data=b"\x89PNG fake", logo_content_type="image/png", logo_url=None)
    gira = await create_gira(db, tenant)

    resp = await client.get(f"/api/v1/public/gira/{gira.id}")

    assert resp.status_code == 200
    assert resp.json()["logo_url"].endswith(f"/api/v1/public/tenant/{tenant.id}/logo")


async def test_agenda_publica_lista_so_giras_ativas(client, db):
    tenant = await create_tenant(db)
    ativa = await create_gira(db, tenant, nome="Gira ativa")
    inativa = await create_gira(db, tenant, nome="Gira desativada")
    await db.execute(update(type(inativa)).where(type(inativa).id == inativa.id).values(is_active=False))
    await db.commit()

    resp = await client.get(f"/api/v1/public/agenda/{tenant.slug}")

    assert resp.status_code == 200
    ids = [g["id"] for g in resp.json()["upcoming_giras"]]
    assert str(ativa.id) in ids
    assert str(inativa.id) not in ids
    assert (await client.get("/api/v1/public/agenda/nao-existe")).status_code == 404


# ── Conta: e-mail sem maiúsculas, cookies, lembrar-me, reativação ───────────


async def _user(db, tenant, email, password=SENHA, created_at=None, is_active=True):
    user = User(
        tenant_id=tenant.id,
        email=email,
        username=f"u-{uuid.uuid4().hex[:8]}",
        password_hash=hash_password(password),
        role=UserRole.ADMIN,
        is_active=is_active,
        full_name="Responsável",
    )
    if created_at is not None:
        user.created_at = created_at
    db.add(user)
    await db.commit()
    return user


async def test_login_ignora_maiusculas_e_seta_3_cookies_persistentes(client, db):
    tenant = await create_tenant(db)
    await _user(db, tenant, "Maria.Silva@Example.com")

    resp = await client.post("/api/v1/auth/login", json={"email": "maria.silva@example.com", "password": SENHA})

    assert resp.status_code == 200, resp.text
    cookies = _set_cookies(resp)
    assert set(cookies) >= {"access_token", "refresh_token", "auth_state"}
    assert all("Max-Age" in cookies[n] for n in ("access_token", "refresh_token", "auth_state"))


async def test_lembrar_me_desmarcado_gera_cookies_de_sessao_e_refresh_mantem(client, db):
    tenant = await create_tenant(db)
    await _user(db, tenant, "sessao@example.com")

    resp = await client.post(
        "/api/v1/auth/login", json={"email": "sessao@example.com", "password": SENHA, "remember_me": False}
    )
    assert resp.status_code == 200, resp.text
    cookies = _set_cookies(resp)
    assert all("Max-Age" not in cookies[n] for n in ("access_token", "refresh_token", "auth_state"))

    refreshed = await client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200, refreshed.text
    cookies = _set_cookies(refreshed)
    assert set(cookies) >= {"access_token", "refresh_token", "auth_state"}
    assert all("Max-Age" not in cookies[n] for n in ("access_token", "refresh_token", "auth_state"))


async def test_esqueci_a_senha_com_email_em_dois_terreiros_nao_quebra(client, db, monkeypatch):
    # Provedores de e-mail sem chave no teste: o envio falha em silêncio (log),
    # a resposta continua genérica. O que se verifica é o token na conta certa.
    monkeypatch.setattr("src.services.email.resend_fallback.ResendEmailService.send_async", AsyncMock(return_value=True))
    monkeypatch.setattr("src.services.email.brevo_provider.BrevoEmailService.send_async", AsyncMock(return_value=True))

    antigo, novo = await create_tenant(db, name="Terreiro Antigo"), await create_tenant(db, name="Terreiro Novo")
    agora = datetime.now(timezone.utc)
    primeiro = await _user(db, antigo, "dono@example.com", created_at=agora - timedelta(days=30))
    await _user(db, novo, "Dono@example.com", created_at=agora)

    resp = await client.post("/api/v1/auth/forgot-password", json={"email": "DONO@example.com"})

    assert resp.status_code == 200, resp.text
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        rows = (await fresh.execute(select(User.id, User.reset_token_hash))).all()
    resets = {uid: token for uid, token in rows}
    assert resets[primeiro.id] is not None, resets  # a conta mais antiga — a mesma que o login autentica
    assert sum(1 for t in resets.values() if t) == 1


async def test_cadastro_seta_3_cookies_e_barra_email_com_maiusculas(client, db, monkeypatch):
    monkeypatch.setattr("src.api.v1.public.onboarding._send_welcome_email", AsyncMock())
    tenant = await create_tenant(db)
    await _user(db, tenant, "Existente@Example.com")

    base = {
        "terreiro_nome": "Casa Nova de Luz",
        "responsavel_nome": "Maria",
        "whatsapp": "11999998888",
        "documento": "52998224725",
        "password": SENHA,
        "como_conheceu": "indicacao",
        "principal_dor": "outro",
        "aceite_termos": True,
    }
    sem_respostas = await client.post(
        "/api/v1/public/onboarding",
        json={k: v for k, v in base.items() if k not in ("como_conheceu", "principal_dor")} | {"email": "nova@example.com"},
    )
    assert sem_respostas.status_code == 422
    campos = {e["loc"][-1] for e in sem_respostas.json()["details"]}
    assert campos == {"como_conheceu", "principal_dor"}
    dup = await client.post("/api/v1/public/onboarding", json={**base, "email": "existente@example.com"})
    assert dup.status_code == 409

    fraca = await client.post("/api/v1/public/onboarding", json={**base, "email": "nova@example.com", "password": "senhaforte123"})
    assert fraca.status_code == 422

    ok = await client.post("/api/v1/public/onboarding", json={**base, "email": "Nova@Example.com"})
    assert ok.status_code == 201, ok.text
    assert ok.json()["user"]["email"] == "nova@example.com"
    assert set(_set_cookies(ok)) >= {"access_token", "refresh_token", "auth_state"}
    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200, me.text


async def test_reativacao_abre_sessao_e_mostra_o_resultado_real(client, db, monkeypatch):
    monkeypatch.setattr("src.api.v1.auth.deactivation._send_account_reactivated_email", AsyncMock())
    tenant = await create_tenant(db)
    await db.execute(
        update(Tenant).where(Tenant.id == tenant.id).values(is_active=False, self_deactivated_at=datetime.now(timezone.utc))
    )
    await db.commit()
    await _user(db, tenant, "voltei@example.com", is_active=False)

    errada = await client.post("/api/v1/auth/reactivate-account", json={"email": "voltei@example.com", "password": "Outra-senha-999"})
    assert errada.status_code == 401

    ok = await client.post("/api/v1/auth/reactivate-account", json={"email": "VOLTEI@example.com", "password": SENHA})
    assert ok.status_code == 200, ok.text
    assert ok.json()["user"]["email"] == "voltei@example.com"
    assert set(_set_cookies(ok)) >= {"access_token", "refresh_token", "auth_state"}

    de_novo = await client.post("/api/v1/auth/reactivate-account", json={"email": "voltei@example.com", "password": SENHA})
    assert de_novo.status_code == 409
    assert de_novo.json()["error_code"] == "NOT_DEACTIVATED"


# ── Curso ─────────────────────────────────────────────────────────────────────


async def test_inscricao_em_curso_enfileira_email_de_confirmacao(client, db, enqueued):
    import json

    tenant = await create_tenant(db)
    curso = CursoPresencial(
        tenant_id=tenant.id,
        titulo="Curso de Desenvolvimento",
        data_inicio=datetime.now(timezone.utc) + timedelta(days=10),
        is_active=True,
        gerar_mensalidade=False,
        valor_mensalidade_padrao=50,
    )
    db.add(curso)
    await db.commit()

    data = {
        "nome": "Participante Teste",
        "email": "participante@example.com",
        "aceita_uso_dados": True,
        "aceita_uso_imagem": True,
        "cpf": "52998224725",
    }
    resp = await client.post(f"/api/v1/public/cursos/{curso.id}/inscricao", data={"data": json.dumps(data)})

    assert resp.status_code == 201, resp.text
    assert resp.json()["valor_mensalidade"] is None  # curso sem cobrança mensal
    assert len(enqueued) == 1
    msg = enqueued[0].message
    assert msg.to_email == "participante@example.com"
    assert "Curso de Desenvolvimento" in msg.subject
    assert "52998224725" not in msg.html_body  # CPF fora do e-mail (minimização)
