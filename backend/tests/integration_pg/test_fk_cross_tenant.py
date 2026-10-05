"""FKs de outro tenant recebidos na requisição — regressão da checagem "fk" do auditor
(scripts/audit_tenant_isolation.py, ampliação de 2026-10-05).

Para cada rota admin em que o auditor rastreou um id da requisição (body ou path) até uma
gravação, o admin do terreiro A manda um id do terreiro B: a rota tem que recusar (404/422) e
nada pode ser gravado apontando para o recurso de B. Complementa
tests/unit/test_admin_fk_tenant_validation.py (mocks) com o app inteiro contra Postgres real.
"""
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from src.models.associados import Associado
from src.models.contas_financeiras import CategoriaFinanceira, ContaBancaria, ContaFinanceira
from src.models.cursos_presenciais import CursoParticipante, CursoPresencial
from src.models.estoque import EstoqueGrupo, EstoqueItem, EstoqueMovimentacao
from src.models.gira_time_slots import GiraTimeSlot
from src.models.mediuns import Medium
from src.models.mensalidades import MensalidadePagamento
from src.models.permission_groups import PermissionGroup, UserGroupMembership
from src.models.tenant_config import TenantConfig
from src.models.tickets import Ticket
from src.models.users import UserRole
from src.services.permission_service import PermissionService

from .factories import create_gira, create_tenant, create_user

MES = date.today().strftime("%Y-%m")


@pytest.fixture
async def cenario(db):
    tenant_a = await create_tenant(db, "Terreiro A")
    tenant_b = await create_tenant(db, "Terreiro B")
    cfg_a = (await db.execute(select(TenantConfig).where(TenantConfig.tenant_id == tenant_a.id))).scalar_one()
    cfg_a.enable_walk_in = True
    cfg_a.enable_mensalidade_associado = True

    def _recursos(tenant, sufixo):
        return {
            "categoria": CategoriaFinanceira(tenant_id=tenant.id, nome=f"Doações {sufixo}"),
            "banco": ContaBancaria(tenant_id=tenant.id, nome=f"Caixa {sufixo}"),
            "grupo": EstoqueGrupo(tenant_id=tenant.id, nome=f"Velas {sufixo}"),
            "medium": Medium(tenant_id=tenant.id, nome=f"Médium {sufixo}"),
            "associado": Associado(
                tenant_id=tenant.id, nome=f"Associado {sufixo}",
                email=f"assoc-{sufixo}@x.com", email_normalized=f"assoc-{sufixo}@x.com",
            ),
            "curso": CursoPresencial(
                tenant_id=tenant.id, titulo=f"Curso {sufixo}", data_inicio=date.today() + timedelta(days=10)
            ),
            "permission_group": PermissionGroup(tenant_id=tenant.id, name=f"Grupo {sufixo}"),
        }

    a, b = _recursos(tenant_a, "A"), _recursos(tenant_b, "B")
    db.add_all([*a.values(), *b.values()])
    await db.flush()
    a["item"] = EstoqueItem(tenant_id=tenant_a.id, grupo_id=a["grupo"].id, nome="Vela A")
    b["item"] = EstoqueItem(tenant_id=tenant_b.id, grupo_id=b["grupo"].id, nome="Vela B")
    a["conta"] = ContaFinanceira(
        tenant_id=tenant_a.id, tipo="pagar", descricao="Aluguel A", valor=100, data_vencimento=date.today()
    )
    db.add_all([a["item"], b["item"], a["conta"]])
    await db.commit()
    a["gira"] = await create_gira(db, tenant_a)
    b["gira"] = await create_gira(db, tenant_b)
    admin_a = await create_user(db, tenant_a, UserRole.ADMIN, name="admin-a")
    a["user"] = (await create_user(db, tenant_a, UserRole.OPERATOR, name="operador-a")).user
    b["user"] = (await create_user(db, tenant_b, UserRole.OPERATOR, name="operador-b")).user
    return admin_a, a, b


async def _count(model, *where):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(select(func.count()).select_from(model).where(*where))).scalar_one()


@pytest.mark.parametrize("campo", ["categoria_id", "conta_bancaria_id"])
async def test_criar_conta_com_fk_de_outro_tenant_e_recusado(client, cenario, campo):
    admin_a, a, b = cenario
    alvo = b["categoria"] if campo == "categoria_id" else b["banco"]
    body = {"tipo": "pagar", "descricao": "Invasão", "valor": 10, "data_vencimento": str(date.today()), campo: str(alvo.id)}
    resp = await client.post("/api/v1/admin/financeiro/contas", headers=admin_a.headers, json=body)
    assert resp.status_code == 422, resp.text
    assert await _count(ContaFinanceira, getattr(ContaFinanceira, campo) == alvo.id) == 0


async def test_editar_e_baixar_conta_com_fk_de_outro_tenant_e_recusado(client, cenario):
    admin_a, a, b = cenario
    url = f"/api/v1/admin/financeiro/contas/{a['conta'].id}"
    resp = await client.put(url, headers=admin_a.headers, json={"categoria_id": str(b["categoria"].id)})
    assert resp.status_code == 422, resp.text
    resp = await client.post(
        f"{url}/baixa", headers=admin_a.headers,
        json={"data_pagamento": str(date.today()), "valor_pago": 100, "conta_bancaria_id": str(b["banco"].id)},
    )
    assert resp.status_code == 422, resp.text
    assert await _count(ContaFinanceira, ContaFinanceira.categoria_id == b["categoria"].id) == 0
    assert await _count(ContaFinanceira, ContaFinanceira.conta_bancaria_id == b["banco"].id) == 0


async def test_item_de_estoque_com_grupo_de_outro_tenant_e_recusado(client, cenario):
    admin_a, a, b = cenario
    resp = await client.post(
        "/api/v1/admin/estoque/itens", headers=admin_a.headers, json={"nome": "Invasão", "grupo_id": str(b["grupo"].id)}
    )
    assert resp.status_code == 422, resp.text
    resp = await client.put(
        f"/api/v1/admin/estoque/itens/{a['item'].id}", headers=admin_a.headers, json={"grupo_id": str(b["grupo"].id)}
    )
    assert resp.status_code == 422, resp.text
    assert await _count(EstoqueItem, EstoqueItem.grupo_id == b["grupo"].id) == 1  # só o item do próprio B


async def test_movimentacao_com_item_de_outro_tenant_e_recusada(client, cenario):
    admin_a, a, b = cenario
    body = {
        "item_id": str(b["item"].id), "tipo": "saida", "quantidade": 5,
        "data_movimentacao": datetime.now(timezone.utc).isoformat(),
    }
    resp = await client.post("/api/v1/admin/estoque/movimentacoes", headers=admin_a.headers, json=body)
    assert resp.status_code == 404, resp.text
    assert await _count(EstoqueMovimentacao, EstoqueMovimentacao.item_id == b["item"].id) == 0


async def test_membro_de_grupo_cruzando_tenants_e_recusado(client, cenario):
    admin_a, a, b = cenario
    # usuário de B no grupo de A
    resp = await client.post(
        f"/api/v1/admin/permission-groups/{a['permission_group'].id}/members",
        headers=admin_a.headers, json={"user_id": str(b["user"].id)},
    )
    assert resp.status_code == 404, resp.text
    # usuário de A no grupo de B
    resp = await client.post(
        f"/api/v1/admin/permission-groups/{b['permission_group'].id}/members",
        headers=admin_a.headers, json={"user_id": str(a["user"].id)},
    )
    assert resp.status_code == 404, resp.text
    assert await _count(UserGroupMembership, UserGroupMembership.user_id == b["user"].id) == 0
    assert await _count(UserGroupMembership, UserGroupMembership.group_id == b["permission_group"].id) == 0


async def test_participante_em_curso_de_outro_tenant_e_recusado(client, cenario):
    admin_a, a, b = cenario
    resp = await client.post(
        f"/api/v1/admin/cursos-presenciais/{b['curso'].id}/participantes",
        headers=admin_a.headers, json={"nome": "Invasor", "valor_mensalidade": "10"},
    )
    assert resp.status_code == 404, resp.text
    assert await _count(CursoParticipante, CursoParticipante.curso_id == b["curso"].id) == 0


async def test_mensalidade_de_medium_e_associado_de_outro_tenant_e_recusada(client, cenario):
    admin_a, a, b = cenario
    resp = await client.post(
        f"/api/v1/admin/financeiro/mensalidades/{b['medium'].id}/{MES}",
        headers=admin_a.headers, data={"status": "PAGO"},
    )
    assert resp.status_code == 404, resp.text
    resp = await client.post(
        f"/api/v1/admin/financeiro/associados/{b['associado'].id}/{MES}",
        headers=admin_a.headers, data={"status": "PAGO"},
    )
    assert resp.status_code == 404, resp.text
    assert await _count(MensalidadePagamento, MensalidadePagamento.mediun_id == b["medium"].id) == 0


async def test_horarios_e_walk_in_em_gira_de_outro_tenant_sao_recusados(client, cenario):
    admin_a, a, b = cenario
    resp = await client.put(
        f"/api/v1/admin/giras/{b['gira'].id}/time-slots",
        headers=admin_a.headers, json={"use_time_slots": False, "slots": [{"horario": "20:00", "capacidade_maxima": 5}]},
    )
    assert resp.status_code == 404, resp.text
    resp = await client.post(
        f"/api/v1/admin/giras/{b['gira'].id}/door/walk-in", headers=admin_a.headers, json={"nome": "Invasor"}
    )
    assert resp.status_code == 404, resp.text
    assert await _count(GiraTimeSlot, GiraTimeSlot.gira_id == b["gira"].id) == 0
    assert await _count(Ticket, Ticket.gira_id == b["gira"].id) == 0


async def test_permissoes_efetivas_ignoram_usuario_de_outro_tenant(db, cenario):
    """PermissionService.get_user_effective_permissions recebia tenant_id e não filtrava o
    usuário por ele (achado do auditor em services/). Com o id de um operador de B e o tenant
    de A, o usuário era encontrado, não tinha grupos *em A* e caía no ramo "sem grupos = acesso
    total de operador" com o plano de A. Hoje o único chamador passa o próprio usuário logado
    (não explorável), mas o método agora devolve tudo False nesse caso."""
    _admin_a, a, b = cenario
    service = PermissionService(db)
    proprio = await service.get_user_effective_permissions(b["user"].id, b["user"].tenant_id)
    assert proprio["giras"]["view"] is True  # controle: operador sem grupos no próprio tenant
    cruzado = await service.get_user_effective_permissions(b["user"].id, a["user"].tenant_id)
    assert not any(v for feature in cruzado.values() for v in feature.values())
