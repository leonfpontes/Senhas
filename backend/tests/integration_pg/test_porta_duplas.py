"""Duplas da noite na Porta com Postgres real (migrações + app inteiro via HTTP).

- O porteiro salva as duplas da gira (`PORTA:edit`); só `PORTA:view` lê e não salva.
- Um cambone auxilia um médium por vez; médium da noite não é cambone; só cambone não é médium.
- Salvar substitui a lista; "Copiar da última gira" vem em `anterior`; sugestão pelo histórico.
- Confirmações da Área (vou/não vou) e a função Cambone da escala vêm junto, sem justificativa.
- Outro terreiro: gira 404 e médium de fora recusado sem gravar.
- Modo TV: o médium da última chamada só aparece com `enable_tv_medium` ligado.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from src.models import AtividadeParticipacao, Gira, GiraDupla, Medium, Ticket, TicketStatus
from src.models.atividades import FuncaoCorrente
from src.models.consulentes import Consulente
from src.models.permission_groups import PermissionFeature
from src.models.users import UserRole
from src.services.atividades import atividade_da_gira, ensure_default_atividade_tipos

from .factories import create_tenant, create_user, grant


@pytest.fixture(autouse=True)
def _sem_cookies(client):
    client.cookies.clear()
    yield
    client.cookies.clear()


def _url(gira) -> str:
    return f"/api/v1/admin/giras/{gira.id}/door/duplas"


async def _gira(db, tenant, dias, nome="Gira de Caboclos") -> Gira:
    gira = Gira(
        tenant_id=tenant.id, nome=nome, data_inicio=datetime.now(timezone.utc) + timedelta(days=dias), is_active=True
    )
    db.add(gira)
    await db.commit()
    return gira


async def _pessoa(db, tenant, nome, atendimento=True) -> Medium:
    m = Medium(tenant_id=tenant.id, nome=nome, is_atendimento=atendimento)
    db.add(m)
    await db.commit()
    return m


async def _cenario(db):
    tenant = await create_tenant(db, name="Terreiro Duplas")
    admin = await create_user(db, tenant, UserRole.ADMIN, name="dirigente")
    porteiro = await create_user(db, tenant, UserRole.OPERATOR, name="porteiro")
    await grant(db, porteiro, tenant, PermissionFeature.PORTA, "view", "edit")
    rita = await _pessoa(db, tenant, "Mãe Rita")
    carlos = await _pessoa(db, tenant, "Pai Carlos")
    ana = await _pessoa(db, tenant, "Ana", atendimento=False)
    beto = await _pessoa(db, tenant, "Beto", atendimento=False)
    return tenant, admin, porteiro, rita, carlos, ana, beto


def _par(medium, cambone=None):
    return {"medium_id": str(medium.id), "cambone_id": str(cambone.id) if cambone else None}


async def test_porteiro_monta_as_duplas_e_salvar_substitui(client, db):
    tenant, _, porteiro, rita, carlos, ana, beto = await _cenario(db)
    gira = await _gira(db, tenant, 1)

    resp = await client.put(_url(gira), headers=porteiro.headers, json={"duplas": [_par(rita, ana), _par(carlos)]})
    assert resp.status_code == 200, resp.text
    assert [(d["medium_nome"], d["cambone_nome"]) for d in resp.json()] == [("Mãe Rita", "Ana"), ("Pai Carlos", None)]

    painel = (await client.get(_url(gira), headers=porteiro.headers)).json()
    assert [(d["medium_nome"], d["cambone_nome"]) for d in painel["duplas"]] == [("Mãe Rita", "Ana"), ("Pai Carlos", None)]
    assert {p["nome"] for p in painel["pessoas"]} == {"Mãe Rita", "Pai Carlos", "Ana", "Beto"}
    assert painel["tem_confirmacoes"] is False

    # Trocar o cambone no meio da noite: a lista inteira é substituída.
    resp = await client.put(_url(gira), headers=porteiro.headers, json={"duplas": [_par(carlos, ana), _par(rita, beto)]})
    assert resp.status_code == 200, resp.text
    linhas = (await db.execute(select(GiraDupla).where(GiraDupla.gira_id == gira.id).order_by(GiraDupla.ordem))).scalars().all()
    assert [(d.medium_id, d.cambone_id) for d in linhas] == [(carlos.id, ana.id), (rita.id, beto.id)]


async def test_regras_da_dupla(client, db):
    tenant, _, porteiro, rita, carlos, ana, _ = await _cenario(db)
    gira = await _gira(db, tenant, 1)

    casos = [
        ([_par(rita, ana), _par(carlos, ana)], "um médium por vez"),
        ([_par(rita, carlos), _par(carlos)], "trabalhando como médium"),
        ([_par(ana)], "só como cambone"),
    ]
    for duplas, trecho in casos:
        resp = await client.put(_url(gira), headers=porteiro.headers, json={"duplas": duplas})
        assert resp.status_code == 422, resp.text
        assert trecho in resp.text
    assert (await db.execute(select(GiraDupla).where(GiraDupla.gira_id == gira.id))).first() is None


async def test_so_view_le_mas_nao_salva(client, db):
    tenant, _, _, rita, _, ana, _ = await _cenario(db)
    gira = await _gira(db, tenant, 1)
    leitor = await create_user(db, tenant, UserRole.OPERATOR, name="leitor")
    await grant(db, leitor, tenant, PermissionFeature.PORTA, "view")
    sem_grupo = await create_user(db, tenant, UserRole.OPERATOR, name="semgrupo")

    assert (await client.get(_url(gira), headers=leitor.headers)).status_code == 200
    resp = await client.put(_url(gira), headers=leitor.headers, json={"duplas": [_par(rita, ana)]})
    assert resp.status_code == 403
    assert (await client.get(_url(gira), headers=sem_grupo.headers)).status_code == 403


async def test_outro_terreiro(client, db):
    tenant, _, porteiro, rita, _, _, _ = await _cenario(db)
    outro = await create_tenant(db, name="Outro Terreiro")
    gira_outra = await _gira(db, outro, 1)
    de_fora = await _pessoa(db, outro, "Médium de Fora")
    gira = await _gira(db, tenant, 1)

    assert (await client.get(_url(gira_outra), headers=porteiro.headers)).status_code == 404
    resp = await client.put(_url(gira_outra), headers=porteiro.headers, json={"duplas": [_par(rita)]})
    assert resp.status_code == 404
    resp = await client.put(_url(gira), headers=porteiro.headers, json={"duplas": [_par(de_fora)]})
    assert resp.status_code == 422
    resp = await client.put(_url(gira), headers=porteiro.headers, json={"duplas": [_par(rita, de_fora)]})
    assert resp.status_code == 422
    assert (await db.execute(select(GiraDupla).where(GiraDupla.tenant_id == tenant.id))).first() is None


async def _atendida(db, tenant, gira, numero, medium, cambone):
    consulente = Consulente(tenant_id=tenant.id, nome=f"Consulente {numero}", email=f"c{numero}-{uuid.uuid4().hex[:6]}@example.com")
    db.add(consulente)
    await db.flush()
    agora = datetime.now(timezone.utc)
    db.add(
        Ticket(
            tenant_id=tenant.id,
            gira_id=gira.id,
            consulente_id=consulente.id,
            numero=numero,
            status=TicketStatus.COMPLETED,
            chamado_em=agora,
            atendido_em=agora,
            finalizado_em=agora,
            medium_nome=medium,
            cambone_nome=cambone,
        )
    )
    await db.commit()


async def test_copiar_da_ultima_e_sugestao_pelo_historico(client, db):
    tenant, _, porteiro, rita, carlos, ana, beto = await _cenario(db)
    g1 = await _gira(db, tenant, -14, "Gira 1")
    g2 = await _gira(db, tenant, -7, "Gira 2")
    hoje = await _gira(db, tenant, 0, "Gira de hoje")
    await _atendida(db, tenant, g1, 1, "Mãe Rita", "Ana")
    await _atendida(db, tenant, g2, 1, "mãe rita", "ANA")
    await _atendida(db, tenant, g2, 2, "Pai Carlos", "Beto")

    resp = await client.put(_url(g2), headers=porteiro.headers, json={"duplas": [_par(rita, ana), _par(carlos, beto)]})
    assert resp.status_code == 200, resp.text

    painel = (await client.get(_url(hoje), headers=porteiro.headers)).json()
    assert painel["duplas"] == []
    assert painel["anterior"]["gira_nome"] == "Gira 2"
    assert painel["anterior"]["duplas"] == [_par(rita, ana), _par(carlos, beto)]
    assert painel["sugestoes"] == [
        {"medium_id": str(rita.id), "cambone_id": str(ana.id), "juntos": 2, "giras_do_medium": 2}
    ]


async def test_confirmacoes_da_area_e_funcao_cambone(client, db):
    tenant, _, porteiro, rita, carlos, ana, beto = await _cenario(db)
    gira = await _gira(db, tenant, 1)
    await ensure_default_atividade_tipos(db, tenant.id)
    ancora = await atividade_da_gira(db, tenant.id, gira.id)
    cambone_id = (
        await db.execute(
            select(FuncaoCorrente.id).where(FuncaoCorrente.tenant_id == tenant.id, FuncaoCorrente.nome.ilike("cambone%"))
        )
    ).scalar_one()
    db.add_all(
        [
            AtividadeParticipacao(tenant_id=tenant.id, atividade_id=ancora.id, medium_id=rita.id, resposta="vou", origem="elegivel"),
            AtividadeParticipacao(
                tenant_id=tenant.id, atividade_id=ancora.id, medium_id=carlos.id, resposta="nao_vou",
                justificativa="motivo pessoal", origem="elegivel",
            ),
            AtividadeParticipacao(
                tenant_id=tenant.id, atividade_id=ancora.id, medium_id=ana.id, funcao_id=cambone_id, origem="funcao",
            ),
        ]
    )
    await db.commit()

    resp = await client.get(_url(gira), headers=porteiro.headers)
    assert resp.status_code == 200, resp.text
    assert "motivo pessoal" not in resp.text
    painel = resp.json()
    assert painel["tem_confirmacoes"] is True
    pessoas = {p["nome"]: p for p in painel["pessoas"]}
    assert pessoas["Mãe Rita"]["situacao"] == "vou"
    assert pessoas["Pai Carlos"]["situacao"] == "nao_vou"
    assert pessoas["Ana"]["escalado_cambone"] is True
    assert pessoas["Beto"]["escalado_cambone"] is False


async def test_tv_mostra_medium_so_com_a_opcao(client, db):
    tenant, admin, porteiro, *_ = await _cenario(db)
    gira = await _gira(db, tenant, 0)
    await _atendida(db, tenant, gira, 7, "Mãe Rita", "Ana")
    tv = f"/api/v1/admin/giras/{gira.id}/door/tv"

    resp = await client.get(tv, headers=porteiro.headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["ultima_chamada"]["medium"] is None

    resp = await client.put("/api/v1/admin/tenant/config", headers=admin.headers, json={"enable_tv_medium": True})
    assert resp.status_code == 200, resp.text
    assert resp.json()["enable_tv_medium"] is True
    assert (await client.get(tv, headers=porteiro.headers)).json()["ultima_chamada"]["medium"] == "Mãe Rita"
