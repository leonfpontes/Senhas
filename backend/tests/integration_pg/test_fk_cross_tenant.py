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

from .conftest import SESSION_LOOP
from .factories import create_gira, create_tenant, create_user

MES = date.today().strftime("%Y-%m")


@SESSION_LOOP
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
    total de operador" com o plano de A (ramo que o Q-05 removeu). Hoje o único chamador passa o próprio usuário logado
    (não explorável), mas o método agora devolve tudo False nesse caso."""
    _admin_a, a, b = cenario
    service = PermissionService(db)
    # Controle: desde o Q-05 operador sem grupo não acessa nada, então o de B entra
    # no grupo padrão "Acesso total" do próprio tenant.
    from src.repositories.permission_group_repo import PermissionGroupRepository

    await PermissionGroupRepository(db).assign_default_group_if_groupless(b["user"])
    await db.commit()
    proprio = await service.get_user_effective_permissions(b["user"].id, b["user"].tenant_id)
    assert proprio["giras"]["view"] is True
    cruzado = await service.get_user_effective_permissions(b["user"].id, a["user"].tenant_id)
    assert not any(v for feature in cruzado.values() for v in feature.values())


async def test_grupos_da_corrente_cruzando_tenants_sao_recusados(client, db, cenario):
    """AM-23: grupo_id/medium_id de outro terreiro no corpo ou no caminho (checagem 4)."""
    from sqlalchemy import text

    from src.models.corrente_grupos import ComunicadoGrupo, CorrenteGrupo, CorrenteGrupoMembro

    admin_a, a, b = cenario
    await db.execute(
        text("UPDATE tenants SET area_medium_liberada = true WHERE id IN (:a, :b)"),
        {"a": a["medium"].tenant_id, "b": b["medium"].tenant_id},
    )
    grupo_b = CorrenteGrupo(tenant_id=b["medium"].tenant_id, nome="G1 de B")
    db.add(grupo_b)
    await db.commit()
    base = "/api/v1/admin/corrente-grupos"

    # médium de B num grupo novo de A
    resp = await client.post(base, headers=admin_a.headers, json={"nome": "G1", "medium_ids": [str(b["medium"].id)]})
    assert resp.status_code == 422, resp.text
    # médium de A no grupo de B
    resp = await client.post(
        f"{base}/{grupo_b.id}/membros", headers=admin_a.headers, json={"medium_ids": [str(a["medium"].id)]}
    )
    assert resp.status_code == 404, resp.text
    # grupos do médium de B / grupo de B para o médium de A
    resp = await client.put(f"{base}/mediuns/{b['medium'].id}", headers=admin_a.headers, json={"grupo_ids": []})
    assert resp.status_code == 404, resp.text
    resp = await client.put(
        f"{base}/mediuns/{a['medium'].id}", headers=admin_a.headers, json={"grupo_ids": [str(grupo_b.id)]}
    )
    assert resp.status_code == 422, resp.text
    # aviso de A para o grupo de B
    resp = await client.post(
        "/api/v1/admin/comunicados",
        headers=admin_a.headers,
        json={"titulo": "X", "corpo": "Y", "publico": "grupos", "grupo_ids": [str(grupo_b.id)]},
    )
    assert resp.status_code == 422, resp.text

    assert await _count(CorrenteGrupoMembro, CorrenteGrupoMembro.medium_id == b["medium"].id) == 0
    assert await _count(CorrenteGrupoMembro, CorrenteGrupoMembro.grupo_id == grupo_b.id) == 0
    assert await _count(ComunicadoGrupo, ComunicadoGrupo.grupo_id == grupo_b.id) == 0
    assert await _count(CorrenteGrupo, CorrenteGrupo.tenant_id == a["medium"].tenant_id) == 0


async def test_atividades_cruzando_tenants_sao_recusadas(client, db, cenario):
    """AM-08: tipo_id/grupo_id no corpo e tipo/função/gira/atividade no caminho de outro terreiro."""
    from sqlalchemy import text

    from src.models.atividades import Atividade, AtividadeTipo, AtividadeTipoGrupo, FuncaoCorrente
    from src.models.corrente_grupos import CorrenteGrupo
    from src.services.atividades import ensure_default_atividade_tipos

    admin_a, a, b = cenario
    tenant_a, tenant_b = a["medium"].tenant_id, b["medium"].tenant_id
    await db.execute(
        text("UPDATE tenants SET area_medium_liberada = true WHERE id IN (:a, :b)"), {"a": tenant_a, "b": tenant_b}
    )
    for tid in (tenant_a, tenant_b):
        await ensure_default_atividade_tipos(db, tid)
    grupo_b = CorrenteGrupo(tenant_id=tenant_b, nome="G1 de B")
    db.add(grupo_b)
    await db.commit()

    def _tipo(tid, nome):
        return select(AtividadeTipo).where(AtividadeTipo.tenant_id == tid, AtividadeTipo.nome == nome)

    reuniao_a = (await db.execute(_tipo(tenant_a, "Reunião"))).scalar_one()
    reuniao_b = (await db.execute(_tipo(tenant_b, "Reunião"))).scalar_one()
    funcao_b = (
        await db.execute(select(FuncaoCorrente).where(FuncaoCorrente.tenant_id == tenant_b).limit(1))
    ).scalar_one()
    atividade_b = Atividade(
        tenant_id=tenant_b, tipo_id=reuniao_b.id, titulo="Reunião de B", inicio=datetime.now(timezone.utc)
    )
    db.add(atividade_b)
    await db.commit()
    base = "/api/v1/admin/atividades"
    h = admin_a.headers
    inicio = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()

    # tipo_id de B no corpo (criar e editar atividade de A)
    resp = await client.post(base, headers=h, json={"tipo_id": str(reuniao_b.id), "titulo": "X", "inicio": inicio})
    assert resp.status_code == 422, resp.text
    propria = await client.post(base, headers=h, json={"tipo_id": str(reuniao_a.id), "titulo": "Minha", "inicio": inicio})
    assert propria.status_code == 201, propria.text
    resp = await client.put(f"{base}/{propria.json()['id']}", headers=h, json={"tipo_id": str(reuniao_b.id)})
    assert resp.status_code == 422, resp.text
    # grupo_id de B como grupo elegível (criar e editar tipo de A)
    resp = await client.post(
        f"{base}/tipos", headers=h, json={"nome": "Só G1", "elegiveis": "grupos", "grupo_ids": [str(grupo_b.id)]}
    )
    assert resp.status_code == 422, resp.text
    resp = await client.put(
        f"{base}/tipos/{reuniao_a.id}", headers=h, json={"elegiveis": "grupos", "grupo_ids": [str(grupo_b.id)]}
    )
    assert resp.status_code == 422, resp.text
    # tipo, função, atividade e gira de B no caminho
    assert (await client.put(f"{base}/tipos/{reuniao_b.id}", headers=h, json={"nome": "X"})).status_code == 404
    assert (await client.delete(f"{base}/tipos/{reuniao_b.id}", headers=h)).status_code == 404
    assert (await client.put(f"{base}/funcoes/{funcao_b.id}", headers=h, json={"nome": "X"})).status_code == 404
    assert (await client.delete(f"{base}/funcoes/{funcao_b.id}", headers=h)).status_code == 404
    assert (await client.put(f"{base}/{atividade_b.id}", headers=h, json={"titulo": "X"})).status_code == 404
    assert (await client.post(f"{base}/{atividade_b.id}/cancelar", headers=h, json={"motivo": "x"})).status_code == 404
    assert (await client.post(f"{base}/da-gira/{b['gira'].id}", headers=h)).status_code == 404

    assert await _count(Atividade, Atividade.tenant_id == tenant_a, Atividade.tipo_id == reuniao_b.id) == 0
    assert await _count(Atividade, Atividade.gira_id == b["gira"].id) == 0
    assert await _count(AtividadeTipoGrupo, AtividadeTipoGrupo.grupo_id == grupo_b.id) == 0
    assert await _count(AtividadeTipo, AtividadeTipo.tenant_id == tenant_a, AtividadeTipo.nome == "Só G1") == 0
    assert await _count(AtividadeTipo, AtividadeTipo.id == reuniao_b.id, AtividadeTipo.arquivado_em.is_(None)) == 1
