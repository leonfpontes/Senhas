"""AM-07 — Agenda da casa para a corrente, com Postgres real (migrações + app inteiro via HTTP).

- `GET /medium/agenda`: período padrão (mês corrente + 2, dias de Brasília), ordem, formato
  unificado, só giras ativas do PRÓPRIO terreiro; período inválido → 400.
- `GET /medium/agenda/gira/{id}` e `/ics`: detalhe completo sem nenhum dado de consulente;
  gira de outro terreiro → 404.
- `giras.orientacoes_corrente` (migração 073): gravada pelo drawer da gira (GIRAS), aparece na
  Área (detalhe, .ics e Início) e NUNCA nas rotas públicas, no e-mail ou no bilhete.
- Módulo "agenda" desligado pela casa → 403 neutro; chave do piloto desligada → 403.
"""
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select, update

from src.api.v1.medium import agenda as agenda_mod
from src.core.tz import APP_TZ
from src.models import Gira, Medium, TenantConfig
from src.models.consulentes import Consulente
from src.models.senha_controls import SenhaControl
from src.models.subscriptions import PlanType
from src.models.tickets import Ticket
from src.models.users import UserRole

from .factories import create_gira, create_tenant, create_user

AGENDA = "/api/v1/medium/agenda"
ORIENTACOES = "Roupa branca, guias e uma vela branca. A corrente chega às 19h30."
ITEM_KEYS = {"origem", "id", "tipo", "titulo", "inicio", "fim", "local", "minha_participacao"}


@pytest.fixture
def hoje(monkeypatch):
    """Fixa o "hoje" de Brasília usado no período padrão da agenda."""

    def _set(d: date):
        monkeypatch.setattr(agenda_mod, "today_local", lambda: d)

    return _set


@pytest.fixture
def enqueued(monkeypatch):
    """Captura o que vai para a fila de e-mail (sem worker nos testes)."""
    from src.services.email.email_queue import email_queue

    items: list = []
    monkeypatch.setattr(email_queue, "enqueue", lambda item: items.append(item))
    return items


async def _cenario(db, *, plan=PlanType.BASIC, liberada=True, nome="Terreiro AM07"):
    tenant = await create_tenant(db, name=nome, plan=plan, area_medium_liberada=liberada)
    await db.execute(
        update(TenantConfig)
        .where(TenantConfig.tenant_id == tenant.id)
        .values(endereco="Rua das Palmeiras, 120 · Jardim Exemplo")
    )
    actor = await create_user(db, tenant, UserRole.MEDIUM, name="medium")
    db.add(Medium(tenant_id=tenant.id, nome="Ana Paula Ribeiro", user_id=actor.user.id))
    await db.commit()
    return tenant, actor


def _br(y, m, d, h=20, mi=0):
    """Horário de Brasília → datetime com fuso."""
    return datetime(y, m, d, h, mi, tzinfo=APP_TZ)


def _gira(tenant, nome, inicio, **kw):
    return Gira(tenant_id=tenant.id, nome=nome, data_inicio=inicio, is_active=kw.pop("is_active", True), **kw)


async def test_agenda_padrao_periodo_ordem_e_formato_unificado(client, db, hoje):
    tenant, actor = await _cenario(db)
    outro, _ = await _cenario(db, nome="Outra Casa")
    db.add_all(
        [
            # Dias de Brasília: 30/09 às 23h (= 01/10 em UTC) fica fora; 31/12 às 23h30 fica dentro.
            _gira(tenant, "Gira de 30 de setembro", _br(2026, 9, 30, 23)),
            _gira(tenant, "Gira passada do mês", _br(2026, 10, 2)),
            _gira(tenant, "Gira de Pretos-Velhos", _br(2026, 11, 13), local="Cachoeira do Parque"),
            _gira(tenant, "Gira de Caboclos", _br(2026, 10, 9, 20, 30), data_fim=_br(2026, 10, 9, 23, 30)),
            _gira(tenant, "Gira de fim de ano", _br(2026, 12, 31, 23, 30)),
            _gira(tenant, "Gira de janeiro", _br(2027, 1, 1, 10)),
            _gira(tenant, "Gira inativa", _br(2026, 10, 16), is_active=False),
            _gira(tenant, "Gira excluída", _br(2026, 10, 23), deleted_at=datetime.now(timezone.utc)),
            _gira(outro, "Gira de outra casa", _br(2026, 10, 10)),
        ]
    )
    await db.commit()
    hoje(date(2026, 10, 7))

    resp = await client.get(AGENDA, headers=actor.headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert (body["inicio"], body["fim"]) == ("2026-10-01", "2026-12-31")
    assert [i["titulo"] for i in body["itens"]] == [
        "Gira passada do mês",
        "Gira de Caboclos",
        "Gira de Pretos-Velhos",
        "Gira de fim de ano",
    ]
    for item in body["itens"]:
        assert set(item) == ITEM_KEYS
        assert item["origem"] == "gira"
        assert item["tipo"] == {"nome": "Gira", "icone": "gira", "cor": None}
        assert item["minha_participacao"] is None
    caboclos = body["itens"][1]
    assert caboclos["inicio"].startswith("2026-10-09T23:30")  # 20h30 de Brasília em UTC
    assert caboclos["fim"] is not None and caboclos["local"] is None
    assert body["itens"][2]["local"] == "Cachoeira do Parque"


async def test_agenda_com_periodo_informado_e_periodo_invalido(client, db, hoje):
    tenant, actor = await _cenario(db)
    db.add_all([_gira(tenant, "Gira de novembro", _br(2026, 11, 6)), _gira(tenant, "Gira de outubro", _br(2026, 10, 9))])
    await db.commit()
    hoje(date(2026, 10, 7))

    body = (await client.get(f"{AGENDA}?inicio=2026-11-01&fim=2026-11-30", headers=actor.headers)).json()
    assert [i["titulo"] for i in body["itens"]] == ["Gira de novembro"]

    longo = await client.get(f"{AGENDA}?inicio=2026-10-01&fim=2027-04-01", headers=actor.headers)
    assert longo.status_code == 400
    assert "6 meses" in longo.text
    assert (await client.get(f"{AGENDA}?inicio=amanha", headers=actor.headers)).status_code == 400
    assert (await client.get(f"{AGENDA}?inicio=2026-11-10&fim=2026-11-01", headers=actor.headers)).status_code == 400


async def test_detalhe_da_gira_completo_e_sem_dado_de_consulente(client, db):
    tenant, actor = await _cenario(db)
    gira = await create_gira(db, tenant, max_tickets=2)
    gira.descricao = "Gira aberta ao público."
    gira.recados = "Investimento sugerido: R$ 20"
    gira.orientacoes_corrente = f"  {ORIENTACOES}  "
    consulente = Consulente(
        tenant_id=tenant.id, nome="Maria Consulente", email="maria@example.com", email_normalized="maria@example.com"
    )
    db.add(consulente)
    await db.flush()
    db.add(Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=consulente.id, numero=1))
    db.add(SenhaControl(tenant_id=tenant.id, gira_id=gira.id, proximo_numero=2, total_emitido=1))
    await db.commit()

    resp = await client.get(f"{AGENDA}/gira/{gira.id}", headers=actor.headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["titulo"] == "Gira de Caboclos" and body["origem"] == "gira"
    assert body["descricao"] == "Gira aberta ao público."
    assert body["orientacoes_corrente"] == ORIENTACOES
    assert body["local"] is None
    assert body["endereco"] == "Rua das Palmeiras, 120 · Jardim Exemplo"
    assert body["mapa_url"].startswith("https://www.google.com/maps/search/?api=1&query=Rua%20das%20Palmeiras")
    assert body["senhas"] == {"situacao": "abertas", "abrem_em": None}
    assert body["link_publico"].endswith(f"/public/gira/{gira.id}")
    assert body["agenda_celular"]["ics_path"] == f"/api/v1/medium/agenda/gira/{gira.id}/ics"
    assert body["agenda_celular"]["google_url"].startswith("https://calendar.google.com/calendar/render?")
    # Nada de consulente, recados para o consulente, limites ou contagem de senhas.
    texto = resp.text
    for proibido in ("Maria Consulente", "maria@example.com", str(consulente.id), "Investimento", "max_tickets"):
        assert proibido not in texto
    assert "recados" not in body and "current_tickets" not in body

    # Lotou → "esgotadas".
    await db.execute(update(SenhaControl).where(SenhaControl.gira_id == gira.id).values(total_emitido=2))
    await db.commit()
    assert (await client.get(f"{AGENDA}/gira/{gira.id}", headers=actor.headers)).json()["senhas"]["situacao"] == (
        "esgotadas"
    )


async def test_gira_sem_senhas_aponta_para_a_agenda_publica_e_senhas_que_abrem_depois(client, db):
    tenant, actor = await _cenario(db)
    sem_senhas = _gira(tenant, "Gira interna", datetime.now(timezone.utc) + timedelta(days=3), local="Salão")
    db.add(sem_senhas)
    futura = await create_gira(db, tenant, open_now=False)
    await db.commit()

    body = (await client.get(f"{AGENDA}/gira/{sem_senhas.id}", headers=actor.headers)).json()
    assert body["senhas"]["situacao"] == "sem_senhas"
    assert body["link_publico"].endswith(f"/{tenant.slug}")
    assert body["local"] == "Salão"

    body = (await client.get(f"{AGENDA}/gira/{futura.id}", headers=actor.headers)).json()
    assert body["senhas"]["situacao"] == "abrem_em"
    assert body["senhas"]["abrem_em"] is not None


async def test_ics_da_gira(client, db):
    tenant, actor = await _cenario(db)
    gira = await create_gira(db, tenant)
    gira.orientacoes_corrente = ORIENTACOES
    await db.commit()

    resp = await client.get(f"{AGENDA}/gira/{gira.id}/ics", headers=actor.headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/calendar")
    assert resp.headers["content-disposition"].startswith('inline; filename="gira-de-caboclos-')
    assert resp.headers["cache-control"] == "private, no-store"
    ics = resp.text.replace("\r\n ", "")
    assert ics.startswith("BEGIN:VCALENDAR")
    assert f"UID:gira-{gira.id}@girahub" in ics
    assert "SUMMARY:Gira de Caboclos · Terreiro AM07" in ics
    assert "Roupa branca\\, guias e uma vela branca." in ics
    assert "Rua das Palmeiras\\, 120" in ics


async def test_gira_de_outro_terreiro_inativa_ou_inexistente_da_404(client, db):
    _, actor = await _cenario(db)
    outro, _ = await _cenario(db, nome="Outra Casa")
    alheia = await create_gira(db, outro)
    assert (await client.get(f"{AGENDA}/gira/{alheia.id}", headers=actor.headers)).status_code == 404
    assert (await client.get(f"{AGENDA}/gira/{alheia.id}/ics", headers=actor.headers)).status_code == 404

    tenant, actor2 = await _cenario(db, nome="Casa Três")
    inativa = await create_gira(db, tenant)
    inativa.is_active = False
    await db.commit()
    assert (await client.get(f"{AGENDA}/gira/{inativa.id}", headers=actor2.headers)).status_code == 404
    assert (await client.get(f"{AGENDA}/gira/{alheia.id}xx", headers=actor2.headers)).status_code == 422


async def test_modulo_agenda_desligado_pela_casa_da_403_neutro(client, db):
    tenant, actor = await _cenario(db)
    gira = await create_gira(db, tenant)
    await db.execute(update(TenantConfig).where(TenantConfig.tenant_id == tenant.id).values(area_medium_agenda=False))
    await db.commit()

    for url in (AGENDA, f"{AGENDA}/gira/{gira.id}", f"{AGENDA}/gira/{gira.id}/ics"):
        resp = await client.get(url, headers=actor.headers)
        assert resp.status_code == 403, url
        assert "agenda não está disponível" in resp.text
    # O resto da Área continua: /me sem o módulo, Início abre.
    me = (await client.get("/api/v1/medium/me", headers=actor.headers)).json()
    assert "agenda" not in me["modulos"]
    assert (await client.get("/api/v1/medium/inicio", headers=actor.headers)).status_code == 200


async def test_chave_do_piloto_desligada_plano_sem_area_ou_sem_sessao(client, db):
    tenant, desligada = await _cenario(db, liberada=False)
    gira = await create_gira(db, tenant)
    assert (await client.get(AGENDA, headers=desligada.headers)).status_code == 403
    assert (await client.get(f"{AGENDA}/gira/{gira.id}", headers=desligada.headers)).status_code == 403

    _, gratuito = await _cenario(db, plan=PlanType.FREE, nome="Casa Gratuita")
    assert (await client.get(AGENDA, headers=gratuito.headers)).status_code == 403

    admin = await create_user(db, tenant, UserRole.ADMIN, name="admin")
    assert (await client.get(AGENDA, headers=admin.headers)).status_code == 403
    assert (await client.get(AGENDA)).status_code == 401


async def test_orientacoes_no_drawer_da_gira_no_inicio_e_nunca_no_publico(client, db, enqueued):
    tenant, actor = await _cenario(db)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="admin")
    gira = await create_gira(db, tenant)
    gira.recados = "Traga 1 kg de alimento"
    await db.commit()

    # Painel: GIRAS edit grava (texto aparado; vazio apaga) e devolve no GET.
    put = await client.put(
        f"/api/v1/admin/giras/{gira.id}", headers=admin.headers, json={"orientacoes_corrente": f" {ORIENTACOES} "}
    )
    assert put.status_code == 200, put.text
    assert put.json()["orientacoes_corrente"] == ORIENTACOES
    got = (await client.get(f"/api/v1/admin/giras/{gira.id}", headers=admin.headers)).json()
    assert got["orientacoes_corrente"] == ORIENTACOES
    nova = await client.post(
        "/api/v1/admin/giras",
        headers=admin.headers,
        json={"nome": "Gira nova", "data_inicio": "2026-12-04T23:00:00Z", "orientacoes_corrente": "   "},
    )
    assert nova.status_code == 201, nova.text
    assert nova.json()["orientacoes_corrente"] is None

    # Área do Médium: Início mostra "o que levar".
    inicio = (await client.get("/api/v1/medium/inicio", headers=actor.headers)).json()
    assert inicio["proxima_gira"]["id"] == str(gira.id)
    assert inicio["proxima_gira"]["orientacoes"] == ORIENTACOES

    # Público: página da gira, próxima gira, agenda pública, emissão, e-mail e bilhete.
    marcador = "A corrente chega"
    publicas = [
        await client.get(f"/api/v1/public/gira/{gira.id}"),
        await client.get(f"/api/v1/public/next-gira?tenant_slug={tenant.slug}"),
        await client.get(f"/api/v1/public/agenda/{tenant.slug}"),
    ]
    for resp in publicas:
        assert resp.status_code == 200, resp.text
        assert marcador not in resp.text and "orientacoes" not in resp.text

    emit = await client.post(
        "/api/v1/public/emit-ticket",
        params={"tenant_slug": tenant.slug, "gira_id": str(gira.id)},
        json={"name": "Consulente Teste", "email": "consulente@example.com"},
    )
    assert emit.status_code == 200, emit.text
    assert marcador not in emit.text
    assert len(enqueued) == 1
    msg = enqueued[0].message
    assert "Traga 1 kg de alimento" in msg.html_body  # os recados vão; as orientações, não
    assert marcador not in msg.html_body and marcador not in (msg.text_body or "") and marcador not in msg.subject

    ticket_id = emit.json()["rescue_link"].rstrip("/").split("/")[-1]
    bilhete = await client.get(f"/api/v1/public/{tenant.slug}/ticket/{ticket_id}")
    assert bilhete.status_code == 200, bilhete.text
    assert marcador not in bilhete.text

    resend = await client.post(
        "/api/v1/public/resend-ticket-email",
        params={"tenant_slug": tenant.slug},
        json={"email": "consulente@example.com", "gira_id": str(gira.id)},
    )
    assert resend.status_code == 200, resend.text
    assert all(marcador not in item.message.html_body for item in enqueued)

    # A coluna existe e guarda o texto (migração 073).
    salvo = (await db.execute(select(Gira.orientacoes_corrente).where(Gira.id == gira.id))).scalar_one()
    assert salvo == ORIENTACOES
