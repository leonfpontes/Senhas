"""T-04 — Modo TV sem dados pessoais no navegador (Postgres real via HTTP).

A TV da sala de espera (/admin/porta/kiosk) lia `/door/queue`, que traz e-mail e
telefone da fila inteira. `GET /giras/{id}/door/tv` devolve só o que a tela
mostra: número formatado, nome reduzido no servidor ("Maria S."), próximas
senhas e a última chamada.
"""
import uuid
from datetime import datetime, timedelta, timezone

from src.models.consulentes import Consulente
from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.tickets import Ticket, TicketStatus
from src.models.users import UserRole

from .factories import create_gira, create_tenant, create_user, grant

NOW = datetime.now(timezone.utc)


async def _senha(db, tenant, gira, numero, nome, *, telefone="11987654321", **extra):
    email = f"pessoa{uuid.uuid4().hex[:8]}@example.com"
    c = Consulente(tenant_id=tenant.id, nome=nome, email=email, email_normalized=email, telefone=telefone)
    db.add(c)
    await db.flush()
    t = Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=c.id, numero=numero, **extra)
    db.add(t)
    await db.commit()
    return t, c


def _url(gira):
    return f"/api/v1/admin/giras/{gira.id}/door/tv"


async def test_tv_mostra_so_numero_nome_reduzido_proximas_e_ultima_chamada(client, db):
    tenant = await create_tenant(db)
    gira = await create_gira(db, tenant)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    chamada_em = NOW - timedelta(minutes=5)
    atendida, c_atendida = await _senha(
        db, tenant, gira, 1, "Joana Prado", status=TicketStatus.COMPLETED,
        checkin_em=NOW - timedelta(minutes=30), chamado_em=chamada_em, finalizado_em=chamada_em,
    )
    sem_chegar, c_sem_chegar = await _senha(db, tenant, gira, 2, "Carlos Eduardo Ramos")
    chegou, c_chegou = await _senha(db, tenant, gira, 3, "Maria da Silva", checkin_em=NOW - timedelta(minutes=2))
    outras = [await _senha(db, tenant, gira, n, f"Pessoa {n} Fulano") for n in (4, 5, 6)]
    await _senha(db, tenant, gira, 7, "Cancelada Nunca", status=TicketStatus.CANCELLED)

    resp = await client.get(_url(gira), headers=admin.headers)

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["gira_nome"] == gira.nome
    assert data["atual"] == {"numero_formatado": "0003", "nome": "Maria S.", "chamado_em": None}
    # Quem ainda não chegou continua nas próximas; a cancelada e a atendida não.
    assert data["proximas"] == ["0002", "0004", "0005"]
    assert data["ultima_chamada"]["numero_formatado"] == "0001"
    assert data["ultima_chamada"]["nome"] is None
    assert data["ultima_chamada"]["chamado_em"] is not None
    assert set(data) == {"gira_nome", "atual", "proximas", "ultima_chamada"}

    # Nada de PII nem ids no payload: e-mail, telefone, nome completo, ids de consulente/ticket.
    texto = resp.text
    for c in [c_atendida, c_sem_chegar, c_chegou] + [c for _, c in outras]:
        assert c.email not in texto
        assert str(c.id) not in texto
    assert "11987654321" not in texto
    assert "Maria da Silva" not in texto and "Silva" not in texto
    for t in [atendida, sem_chegar, chegou] + [t for t, _ in outras]:
        assert str(t.id) not in texto
    for chave in ("email", "telefone", "consulente", "id"):
        assert chave not in data["atual"]


async def test_tv_respeita_a_ordem_da_fila_preferenciais_primeiro(client, db):
    tenant = await create_tenant(db)
    gira = await create_gira(db, tenant)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    await _senha(db, tenant, gira, 1, "Ana Lima", checkin_em=NOW)
    await _senha(db, tenant, gira, 2, "Bento", checkin_em=NOW, priority_category="ELDERLY")

    data = (await client.get(_url(gira), headers=admin.headers)).json()

    assert data["atual"] == {"numero_formatado": "0002", "nome": "Bento", "chamado_em": None}
    assert data["proximas"] == ["0001"]


async def test_tv_sem_ninguem_que_chegou(client, db):
    tenant = await create_tenant(db)
    gira = await create_gira(db, tenant)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    await _senha(db, tenant, gira, 1, "Ana Lima")

    data = (await client.get(_url(gira), headers=admin.headers)).json()

    assert data["atual"] is None
    assert data["proximas"] == ["0001"]
    assert data["ultima_chamada"] is None


async def test_tv_exige_porta_view_e_nao_tem_gate_de_plano(client, db):
    tenant = await create_tenant(db, plan=PlanType.FREE)
    gira = await create_gira(db, tenant)
    porteiro = await create_user(db, tenant, UserRole.OPERATOR, name="porteiro")
    await grant(db, porteiro, tenant, PermissionFeature.PORTA, "view")
    sem_porta = await create_user(db, tenant, UserRole.OPERATOR, name="sem-porta")
    await grant(db, sem_porta, tenant, PermissionFeature.GIRAS, "view", "insert", "edit", "delete")

    assert (await client.get(_url(gira), headers=porteiro.headers)).status_code == 200
    assert (await client.get(_url(gira), headers=sem_porta.headers)).status_code == 403
    assert (await client.get(_url(gira))).status_code == 401


async def test_tv_nao_mostra_gira_de_outro_terreiro(client, db):
    tenant_a = await create_tenant(db, "Terreiro A")
    admin_a = await create_user(db, tenant_a, UserRole.ADMIN, name="admin-a")
    tenant_b = await create_tenant(db, "Terreiro B")
    admin_b = await create_user(db, tenant_b, UserRole.ADMIN, name="admin-b")
    gira_b = await create_gira(db, tenant_b)
    await _senha(db, tenant_b, gira_b, 1, "Pessoa de B", checkin_em=NOW)

    resp_a = await client.get(_url(gira_b), headers=admin_a.headers)
    resp_b = await client.get(_url(gira_b), headers=admin_b.headers)

    assert resp_a.status_code == 404, resp_a.text
    assert "0001" not in resp_a.text and "Pessoa" not in resp_a.text
    assert resp_b.status_code == 200 and resp_b.json()["atual"]["numero_formatado"] == "0001"
