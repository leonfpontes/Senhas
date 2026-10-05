"""Grupo 2 do Q-01 — isolamento de tenant via HTTP real.

Autenticado como admin do terreiro A, tentar ler/editar/apagar recursos do
terreiro B em cada módulo deve dar 403/404 — e o recurso de B deve continuar
intacto no banco. Admin faz bypass dos grupos de permissão, então aqui só o
filtro por tenant_id protege.
"""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from src.models.associados import Associado
from src.models.consulentes import Consulente
from src.models.contas_financeiras import CategoriaFinanceira, ContaBancaria, ContaFinanceira
from src.models.cursos_presenciais import CursoPresencial
from src.models.estoque import EstoqueGrupo, EstoqueItem
from src.models.mediuns import Medium
from src.models.permission_groups import PermissionGroup
from src.models.tickets import Ticket
from src.models.users import User, UserRole

from .factories import create_gira, create_tenant, create_user

NOW = datetime.now(timezone.utc)


async def _seed_tenant_b(db):
    tenant = await create_tenant(db, "Terreiro B")
    gira = await create_gira(db, tenant, max_tickets=10)
    medium = Medium(tenant_id=tenant.id, nome="Médium de B")
    associado = Associado(tenant_id=tenant.id, nome="Associado de B", email="assoc@b.com", email_normalized="assoc@b.com")
    grupo = EstoqueGrupo(tenant_id=tenant.id, nome="Velas de B")
    curso = CursoPresencial(tenant_id=tenant.id, titulo="Curso de B", data_inicio=date.today() + timedelta(days=10))
    consulente = Consulente(tenant_id=tenant.id, nome="Consulente de B", email="c@b.com", email_normalized="c@b.com")
    categoria = CategoriaFinanceira(tenant_id=tenant.id, nome="Doações de B")
    banco = ContaBancaria(tenant_id=tenant.id, nome="Caixa de B")
    permission_group = PermissionGroup(tenant_id=tenant.id, name="Grupo de B")
    db.add_all([medium, associado, grupo, curso, consulente, categoria, banco, permission_group])
    await db.flush()
    item = EstoqueItem(tenant_id=tenant.id, grupo_id=grupo.id, nome="Vela branca de B")
    ticket = Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=consulente.id, numero=1)
    conta = ContaFinanceira(
        tenant_id=tenant.id, tipo="pagar", descricao="Aluguel de B", valor=500, data_vencimento=date.today()
    )
    db.add_all([item, ticket, conta])
    await db.commit()
    user_b = await create_user(db, tenant, UserRole.OPERATOR, name="operador-b")
    admin_b = await create_user(db, tenant, UserRole.ADMIN, name="admin-b")
    return {
        "admin_headers": admin_b.headers,
        "tenant": tenant, "gira": gira, "medium": medium, "associado": associado, "grupo": grupo, "item": item,
        "curso": curso, "ticket": ticket, "conta": conta, "categoria": categoria, "banco": banco,
        "permission_group": permission_group, "user": user_b.user,
    }


@pytest.fixture
async def cenario(db):
    tenant_a = await create_tenant(db, "Terreiro A")
    admin_a = await create_user(db, tenant_a, UserRole.ADMIN, name="admin-a")
    b = await _seed_tenant_b(db)
    return admin_a, b


def _iso(dt):
    return dt.isoformat()


# (método, caminho, corpo) — {gira}, {medium}... são substituídos pelos ids de B.
CASOS = [
    ("GET", "/api/v1/admin/giras/{gira}", None),
    ("PUT", "/api/v1/admin/giras/{gira}", {"nome": "Invadida", "data_inicio": _iso(NOW + timedelta(days=3))}),
    ("DELETE", "/api/v1/admin/giras/{gira}", None),
    ("GET", "/api/v1/admin/giras/{gira}/senhas", None),
    ("PUT", "/api/v1/admin/giras/{gira}/senhas",
     {"max_tickets": 999, "release_start_at": _iso(NOW), "release_end_at": _iso(NOW + timedelta(days=1))}),
    ("GET", "/api/v1/admin/tickets/{ticket}", None),
    ("PATCH", "/api/v1/admin/door/tickets/{ticket}/checkin", None),
    ("PATCH", "/api/v1/admin/door/tickets/{ticket}/complete", None),
    ("PATCH", "/api/v1/admin/door/tickets/{ticket}/no-show", None),
    ("PATCH", "/api/v1/admin/mediuns/{medium}", {"nome": "Invadido"}),
    ("DELETE", "/api/v1/admin/mediuns/{medium}", None),
    ("GET", "/api/v1/admin/associados/{associado}", None),
    ("PUT", "/api/v1/admin/associados/{associado}", {"nome": "Invadido", "email": "invasor@a.com"}),
    ("DELETE", "/api/v1/admin/associados/{associado}", None),
    ("GET", "/api/v1/admin/users/{user}", None),
    ("PUT", "/api/v1/admin/users/{user}", {"full_name": "Invadido"}),
    ("DELETE", "/api/v1/admin/users/{user}", None),
    ("GET", "/api/v1/admin/estoque/grupos/{grupo}", None),
    ("PUT", "/api/v1/admin/estoque/grupos/{grupo}", {"nome": "Invadido"}),
    ("DELETE", "/api/v1/admin/estoque/grupos/{grupo}", None),
    ("GET", "/api/v1/admin/estoque/itens/{item}", None),
    ("GET", "/api/v1/admin/cursos-presenciais/{curso}", None),
    ("PUT", "/api/v1/admin/cursos-presenciais/{curso}",
     {"titulo": "Invadido", "data_inicio": _iso(NOW + timedelta(days=11))}),
    ("DELETE", "/api/v1/admin/cursos-presenciais/{curso}", None),
    ("GET", "/api/v1/admin/financeiro/contas/{conta}", None),
    ("PUT", "/api/v1/admin/financeiro/contas/{conta}", {"descricao": "Invadida"}),
    ("DELETE", "/api/v1/admin/financeiro/contas/{conta}", None),
    ("PUT", "/api/v1/admin/financeiro/categorias/{categoria}", {"nome": "Invadida"}),
    ("DELETE", "/api/v1/admin/financeiro/categorias/{categoria}", None),
    ("PUT", "/api/v1/admin/financeiro/contas-bancarias/{banco}", {"nome": "Invadida"}),
    ("DELETE", "/api/v1/admin/financeiro/contas-bancarias/{banco}", None),
    ("GET", "/api/v1/admin/permission-groups/{permission_group}", None),
    ("PUT", "/api/v1/admin/permission-groups/{permission_group}", {"name": "Invadido", "version": 1}),
    ("DELETE", "/api/v1/admin/permission-groups/{permission_group}", None),
]


@pytest.mark.parametrize("method,path,body", CASOS, ids=[f"{m} {p}" for m, p, _ in CASOS])
async def test_admin_de_um_terreiro_nao_acessa_recurso_de_outro(client, cenario, method, path, body):
    admin_a, b = cenario
    url = path.format(**{k: v.id for k, v in b.items() if hasattr(v, "id") and k != "admin_headers"})
    resp = await client.request(method, url, headers=admin_a.headers, json=body)
    assert resp.status_code in (403, 404), f"{method} {url} → {resp.status_code}: {resp.text[:200]}"


async def test_recursos_de_outro_terreiro_seguem_intactos_apos_tentativas(client, cenario):
    admin_a, b = cenario
    ids = {k: v.id for k, v in b.items() if hasattr(v, "id") and k != "admin_headers"}
    for method, path, body in CASOS:
        if method != "GET":
            await client.request(method, path.format(**ids), headers=admin_a.headers, json=body)

    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        gira = (await fresh.execute(select(type(b["gira"])).where(type(b["gira"]).id == ids["gira"]))).scalar_one()
        assert gira.nome == "Gira de Caboclos" and gira.deleted_at is None and gira.max_tickets == 10
        medium = (await fresh.execute(select(Medium).where(Medium.id == ids["medium"]))).scalar_one()
        assert medium.nome == "Médium de B" and medium.deleted_at is None
        user = (await fresh.execute(select(User).where(User.id == ids["user"]))).scalar_one()
        assert user.deleted_at is None and user.is_active
        conta = (await fresh.execute(select(ContaFinanceira).where(ContaFinanceira.id == ids["conta"]))).scalar_one()
        assert conta.descricao == "Aluguel de B" and conta.deleted_at is None
        ticket = (await fresh.execute(select(Ticket).where(Ticket.id == ids["ticket"]))).scalar_one()
        assert ticket.checkin_em is None and ticket.finalizado_em is None


@pytest.mark.parametrize(
    "path,campo,valor_de_b",
    [
        ("/api/v1/admin/giras", "nome", "Gira de Caboclos"),
        ("/api/v1/admin/mediuns", "nome", "Médium de B"),
        ("/api/v1/admin/associados", "nome", "Associado de B"),
        ("/api/v1/admin/users", "email", None),
    ],
)
async def test_listagens_nao_trazem_dados_de_outro_terreiro(client, db, cenario, path, campo, valor_de_b):
    admin_a, b = cenario
    resp = await client.get(path, headers=admin_a.headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    items = data.get("items", data) if isinstance(data, dict) else data
    texto = str(items)
    assert str(b["tenant"].id) not in texto
    if valor_de_b:
        assert valor_de_b not in texto
    else:
        assert b["user"].email not in texto


@pytest.mark.parametrize(
    "path",
    ["/api/v1/admin/giras/{gira}/tickets", "/api/v1/admin/giras/{gira}/door/queue", "/api/v1/admin/giras/{gira}/door/stats"],
)
async def test_listagens_da_gira_de_outro_terreiro_nao_mostram_os_dados_dela(client, cenario, path):
    """Estas rotas respondem 200 vazio (filtram por tenant) em vez de 404 para
    gira alheia — aceitável desde que nada de B apareça. O controle positivo
    (admin de B vê o próprio ticket) prova que o vazio vem do filtro."""
    admin_a, b = cenario
    url = path.format(gira=b["gira"].id)

    resp_a = await client.get(url, headers=admin_a.headers)
    resp_b = await client.get(url, headers=b["admin_headers"])

    assert resp_b.status_code == 200, resp_b.text
    assert resp_a.status_code in (200, 403, 404), resp_a.text
    if resp_a.status_code == 200:
        assert str(b["ticket"].id) not in resp_a.text
        assert resp_a.json().get("total", 0) == 0
    assert str(b["ticket"].id) in resp_b.text or resp_b.json().get("total", 0) >= 1
