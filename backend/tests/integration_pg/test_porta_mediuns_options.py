"""T-05 — porteiro sem acesso a Médiuns não cai mais no texto livre (RBAC via HTTP real).

O AttendModal da Porta buscava as sugestões em `/mediuns/options` (MEDIUNS:view):
operador só com PORTA levava 403 e digitava os nomes à mão. A Porta passa a usar
`/door/mediuns-options` (PORTA:view), que devolve só id + nome dos médiuns ativos
do tenant.
"""
from datetime import datetime, timezone

from src.models.mediuns import Medium
from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.users import UserRole

from .factories import create_tenant, create_user, grant

NOVO = "/api/v1/admin/door/mediuns-options"
ANTIGO = "/api/v1/admin/mediuns/options"


async def _mediuns(db, tenant):
    atendimento = Medium(tenant_id=tenant.id, nome="Pai João", is_atendimento=True, telefone="11999990000",
                         email="pai.joao@example.com")
    cambone = Medium(tenant_id=tenant.id, nome="Cambone Rita", is_atendimento=False)
    inativo = Medium(tenant_id=tenant.id, nome="Mãe Inativa", is_atendimento=True, is_active=False)
    excluido = Medium(tenant_id=tenant.id, nome="Pai Excluído", is_atendimento=True,
                      deleted_at=datetime.now(timezone.utc))
    db.add_all([atendimento, cambone, inativo, excluido])
    await db.commit()
    return atendimento, cambone


async def test_porteiro_so_com_porta_ve_sugestoes_e_nao_o_endpoint_de_mediuns(client, db):
    tenant = await create_tenant(db)
    atendimento, cambone = await _mediuns(db, tenant)
    porteiro = await create_user(db, tenant, UserRole.OPERATOR, name="porteiro")
    await grant(db, porteiro, tenant, PermissionFeature.PORTA, "view", "insert", "edit")

    resp = await client.get(f"{NOVO}?only_atendimento=true", headers=porteiro.headers)
    antigo = await client.get(f"{ANTIGO}?only_atendimento=true", headers=porteiro.headers)

    assert resp.status_code == 200, resp.text
    assert resp.json() == [{"id": str(atendimento.id), "nome": "Pai João"}]
    assert antigo.status_code == 403, antigo.text


async def test_padrao_e_atendimento_e_false_traz_todos_os_ativos_para_cambone(client, db):
    tenant = await create_tenant(db)
    atendimento, cambone = await _mediuns(db, tenant)
    porteiro = await create_user(db, tenant, UserRole.OPERATOR, name="porteiro")
    await grant(db, porteiro, tenant, PermissionFeature.PORTA, "view")

    padrao = await client.get(NOVO, headers=porteiro.headers)
    todos = await client.get(f"{NOVO}?only_atendimento=false", headers=porteiro.headers)

    assert [m["nome"] for m in padrao.json()] == ["Pai João"]
    assert [m["nome"] for m in todos.json()] == ["Cambone Rita", "Pai João"]
    # Só id + nome: nada de telefone, e-mail, nascimento ou flags do cadastro.
    assert all(set(m) == {"id", "nome"} for m in todos.json())
    assert "11999990000" not in todos.text and "pai.joao@example.com" not in todos.text


async def test_sem_porta_leva_403_mesmo_com_mediuns(client, db):
    tenant = await create_tenant(db)
    await _mediuns(db, tenant)
    so_mediuns = await create_user(db, tenant, UserRole.OPERATOR, name="so-mediuns")
    await grant(db, so_mediuns, tenant, PermissionFeature.MEDIUNS, "view")

    assert (await client.get(NOVO, headers=so_mediuns.headers)).status_code == 403
    assert (await client.get(ANTIGO, headers=so_mediuns.headers)).status_code == 200


async def test_nao_traz_medium_de_outro_terreiro_e_vale_no_plano_gratuito(client, db):
    tenant_a = await create_tenant(db, "Terreiro A", plan=PlanType.FREE)
    porteiro_a = await create_user(db, tenant_a, UserRole.OPERATOR, name="porteiro-a")
    await grant(db, porteiro_a, tenant_a, PermissionFeature.PORTA, "view")
    tenant_b = await create_tenant(db, "Terreiro B")
    await _mediuns(db, tenant_b)

    resp = await client.get(f"{NOVO}?only_atendimento=false", headers=porteiro_a.headers)

    assert resp.status_code == 200, resp.text
    assert resp.json() == []
