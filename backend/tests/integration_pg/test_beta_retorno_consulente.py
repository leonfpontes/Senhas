"""Beta "Retorno do consulente na porta" (pedido da Mãe Rai) com Postgres real.

- No "Chamar", quem atende anota que a pessoa precisa voltar; na gira seguinte, a senha dela na
  fila da Porta traz o retorno — achado pelo mesmo cadastro, pelo e-mail ou pelo telefone.
- Na própria gira em que foi anotado, o retorno não aparece como pendente (só como "marcado").
- "Resolvido" tira da fila; desfazer volta. Editar o atendimento troca o recado; desfazer o
  atendimento apaga o retorno aberto.
- Sem a beta: nada aparece e o campo é ignorado. Outra casa nunca vê. PORTA:view não resolve.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from src.models.consulente_retornos import ConsulenteRetorno
from src.models.consulentes import Consulente
from src.models.feature_flags import FeatureFlag
from src.models.giras import Gira
from src.models.permission_groups import PermissionFeature
from src.models.tickets import Ticket, TicketStatus
from src.models.users import UserRole

from .factories import create_tenant, create_user, grant

BETA = "beta_retorno_consulente"


async def _casa(db, com_beta=True):
    tenant = await create_tenant(db)
    tenant.beta_tester = True
    db.add(tenant)
    if com_beta:
        db.add(FeatureFlag(tenant_id=tenant.id, feature=BETA, enabled=True))
    await db.commit()
    return tenant


async def _gira(db, tenant, dias, nome="Gira de Pretos Velhos"):
    gira = Gira(tenant_id=tenant.id, nome=nome, data_inicio=datetime.now(timezone.utc) + timedelta(days=dias),
                is_active=True, max_tickets=20)
    db.add(gira)
    await db.commit()
    return gira


async def _senha(db, tenant, gira, numero, nome="Maria Teste", email=None, telefone=None):
    pessoa = Consulente(tenant_id=tenant.id, nome=nome, email=email, email_normalized=email,
                        telefone=telefone, phone_normalized=telefone)
    db.add(pessoa)
    await db.flush()
    t = Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=pessoa.id, numero=numero, status=TicketStatus.EMITTED)
    db.add(t)
    await db.commit()
    return t, pessoa


async def _senha_de(db, tenant, gira, numero, pessoa):
    t = Ticket(tenant_id=tenant.id, gira_id=gira.id, consulente_id=pessoa.id, numero=numero, status=TicketStatus.EMITTED)
    db.add(t)
    await db.commit()
    return t


def _fila(r):
    assert r.status_code == 200, r.text
    return {i["numero"]: i for i in r.json()["items"]}


async def test_retorno_aparece_na_gira_seguinte_e_resolve(client, db):
    casa = await _casa(db)
    admin = await create_user(db, casa, UserRole.ADMIN)
    gira1 = await _gira(db, casa, -7, "Gira de Caboclos")
    gira2 = await _gira(db, casa, 0)
    t1, maria = await _senha(db, casa, gira1, 5, email="maria.teste@example.com", telefone="11988887777")

    r = await client.patch(f"/api/v1/admin/door/tickets/{t1.id}/attend", headers=admin.headers, json={
        "medium_nome": "Ana", "retorno": {"medium_nome": "Ana", "entidade": "Pai Joaquim", "recado": "  Trazer vela branca "},
    })
    assert r.status_code == 200, r.text
    assert r.json()["retorno_marcado"]["entidade"] == "Pai Joaquim"
    assert r.json()["retornos"] == []  # na própria gira não é pendente

    # Na gira seguinte: mesmo cadastro, outro cadastro (sem senha) com o mesmo telefone, e uma pessoa qualquer.
    # (O e-mail já é único por terreiro entre cadastros ativos; o telefone não.)
    await _senha_de(db, casa, gira2, 1, maria)
    await _senha(db, casa, gira2, 2, nome="Maria sem senha", telefone="11988887777")
    await _senha(db, casa, gira2, 3, nome="Outra Pessoa", email="outra.teste@example.com")
    fila = _fila(await client.get(f"/api/v1/admin/giras/{gira2.id}/door/queue", headers=admin.headers))
    assert [x["entidade"] for x in fila[1]["retornos"]] == ["Pai Joaquim"]
    assert fila[1]["retornos"][0]["recado"] == "Trazer vela branca"
    assert fila[1]["retornos"][0]["gira_nome"] == "Gira de Caboclos"
    assert len(fila[2]["retornos"]) == 1
    assert fila[3]["retornos"] == []
    retorno_id = fila[1]["retornos"][0]["id"]

    r = await client.patch(f"/api/v1/admin/door/retornos/{retorno_id}/resolver", headers=admin.headers, json={"gira_id": str(gira2.id)})
    assert r.status_code == 200 and r.json()["resolvido"] is True
    fila = _fila(await client.get(f"/api/v1/admin/giras/{gira2.id}/door/queue", headers=admin.headers))
    assert fila[1]["retornos"] == [] and fila[2]["retornos"] == []
    salvo = await db.scalar(select(ConsulenteRetorno).where(ConsulenteRetorno.id == retorno_id))
    await db.refresh(salvo)
    assert salvo.resolvido_na_gira_id == gira2.id and salvo.resolvido_por_id == admin.user.id

    # Desfazer volta a mostrar.
    r = await client.delete(f"/api/v1/admin/door/retornos/{retorno_id}/resolver", headers=admin.headers)
    assert r.status_code == 200 and r.json()["resolvido"] is False
    fila = _fila(await client.get(f"/api/v1/admin/giras/{gira2.id}/door/queue", headers=admin.headers))
    assert len(fila[1]["retornos"]) == 1


async def test_telefone_tambem_liga_os_cadastros(client, db):
    casa = await _casa(db)
    admin = await create_user(db, casa, UserRole.ADMIN)
    gira1 = await _gira(db, casa, -7)
    gira2 = await _gira(db, casa, 0)
    t1, _ = await _senha(db, casa, gira1, 1, nome="João", telefone="11999990000")
    r = await client.patch(f"/api/v1/admin/door/tickets/{t1.id}/attend", headers=admin.headers,
                           json={"medium_nome": "Ana", "retorno": {"medium_nome": "Ana"}})
    assert r.status_code == 200, r.text
    await _senha(db, casa, gira2, 9, nome="João sem senha", telefone="11999990000")
    fila = _fila(await client.get(f"/api/v1/admin/giras/{gira2.id}/door/queue", headers=admin.headers))
    assert [x["medium_nome"] for x in fila[9]["retornos"]] == ["Ana"]


async def test_editar_troca_e_desfazer_apaga(client, db):
    casa = await _casa(db)
    admin = await create_user(db, casa, UserRole.ADMIN)
    gira = await _gira(db, casa, 0)
    t, _ = await _senha(db, casa, gira, 1)
    url = f"/api/v1/admin/door/tickets/{t.id}"
    assert (await client.patch(f"{url}/attend", headers=admin.headers,
                               json={"medium_nome": "Ana", "retorno": {"entidade": "Exu Tranca Ruas"}})).status_code == 200
    r = await client.patch(f"{url}/attend-info", headers=admin.headers,
                           json={"medium_nome": "Ana", "retorno": {"entidade": "Exu Tiriri"}})
    assert r.json()["retorno_marcado"]["entidade"] == "Exu Tiriri"
    # Editar sem mandar `retorno` não mexe.
    r = await client.patch(f"{url}/attend-info", headers=admin.headers, json={"medium_nome": "Bia"})
    assert r.json()["retorno_marcado"]["entidade"] == "Exu Tiriri"
    assert len((await db.execute(select(ConsulenteRetorno).where(ConsulenteRetorno.tenant_id == casa.id))).all()) == 1
    # `null` tira.
    r = await client.patch(f"{url}/attend-info", headers=admin.headers, json={"medium_nome": "Bia", "retorno": None})
    assert r.json()["retorno_marcado"] is None
    # Desfazer o atendimento apaga o retorno aberto.
    await client.patch(f"{url}/attend-info", headers=admin.headers, json={"medium_nome": "Bia", "retorno": {"recado": "voltar"}})
    assert (await client.patch(f"{url}/undo", headers=admin.headers)).status_code == 200
    assert (await db.execute(select(ConsulenteRetorno).where(ConsulenteRetorno.tenant_id == casa.id))).all() == []


async def test_sem_beta_nada_aparece_e_outra_casa_nao_ve(client, db):
    sem = await _casa(db, com_beta=False)
    admin = await create_user(db, sem, UserRole.ADMIN)
    gira = await _gira(db, sem, 0)
    t, _ = await _senha(db, sem, gira, 1)
    r = await client.patch(f"/api/v1/admin/door/tickets/{t.id}/attend", headers=admin.headers,
                           json={"medium_nome": "Ana", "retorno": {"medium_nome": "Ana"}})
    assert r.status_code == 200 and r.json()["retorno_marcado"] is None
    assert (await db.execute(select(ConsulenteRetorno))).all() == []

    # Casa A anota; casa B, com a mesma pessoa (mesmo e-mail), não vê; nem resolve.
    a = await _casa(db)
    b = await _casa(db)
    admin_a = await create_user(db, a, UserRole.ADMIN, name="a")
    admin_b = await create_user(db, b, UserRole.ADMIN, name="b")
    ga1, ga2 = await _gira(db, a, -7), await _gira(db, a, 0)
    gb = await _gira(db, b, 0)
    ta, _ = await _senha(db, a, ga1, 1, email="mesma.teste@example.com")
    await client.patch(f"/api/v1/admin/door/tickets/{ta.id}/attend", headers=admin_a.headers,
                       json={"medium_nome": "Ana", "retorno": {"medium_nome": "Ana"}})
    await _senha(db, b, gb, 1, email="mesma.teste@example.com")
    assert _fila(await client.get(f"/api/v1/admin/giras/{gb.id}/door/queue", headers=admin_b.headers))[1]["retornos"] == []
    retorno = await db.scalar(select(ConsulenteRetorno).where(ConsulenteRetorno.tenant_id == a.id))
    assert (await client.patch(f"/api/v1/admin/door/retornos/{retorno.id}/resolver", headers=admin_b.headers)).status_code in (403, 404)

    # Sem a beta, resolver dá 403.
    assert (await client.patch(f"/api/v1/admin/door/retornos/{retorno.id}/resolver", headers=admin.headers)).status_code == 403
    _ = ga2


async def test_porta_view_ve_mas_nao_resolve(client, db):
    casa = await _casa(db)
    admin = await create_user(db, casa, UserRole.ADMIN)
    leitor = await create_user(db, casa, UserRole.OPERATOR, name="leitor")
    await grant(db, leitor, casa, PermissionFeature.PORTA, "view")
    g1, g2 = await _gira(db, casa, -7), await _gira(db, casa, 0)
    t, pessoa = await _senha(db, casa, g1, 1)
    await client.patch(f"/api/v1/admin/door/tickets/{t.id}/attend", headers=admin.headers,
                       json={"medium_nome": "Ana", "retorno": {"medium_nome": "Ana"}})
    await _senha_de(db, casa, g2, 4, pessoa)
    fila = _fila(await client.get(f"/api/v1/admin/giras/{g2.id}/door/queue", headers=leitor.headers))
    rid = fila[4]["retornos"][0]["id"]
    assert (await client.patch(f"/api/v1/admin/door/retornos/{rid}/resolver", headers=leitor.headers)).status_code == 403
