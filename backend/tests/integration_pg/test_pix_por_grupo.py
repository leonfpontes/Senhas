"""Chave PIX por grupo da corrente, ligada a uma conta bancária (migração 100), com Postgres real.

- A chave do terreiro ganha a conta bancária onde cai; uma chave "alternativa" vale para os
  grupos escolhidos e cai em outra conta.
- A Área do Médium mostra a chave do grupo do médium (lista, PIX do mês, Início); quem não está
  em grupo com chave fica com a do terreiro; excluir a chave volta todo mundo para a do terreiro.
- A mensalidade paga vira conta a receber NA CONTA da chave, e o Fluxo de caixa por conta mostra
  cada uma com o próprio saldo.
- FINANCEIRO view vê mascarado; insert/edit pedem senha; FK de outro terreiro recusada; médium em
  dois grupos com chaves diferentes aparece como conflito.

Chaves de teste: CPF de exemplo conhecido e e-mails em example.com — nenhuma chave real.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import delete, select

from src.api.v1.medium import inicio as inicio_mod
from src.api.v1.medium import mensalidades as mens_mod
from src.models import Medium, MensalidadeConfig
from src.models.contas_financeiras import ContaBancaria, ContaFinanceira
from src.models.corrente_grupos import CorrenteGrupo, CorrenteGrupoMembro
from src.models.mensalidade_chaves_pix import MensalidadeChavePix
from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.users import UserRole
from src.security.password import hash_password

from .factories import create_tenant, create_user, grant

ADMIN = "/api/v1/admin/financeiro"
PIX = f"{ADMIN}/config/pix"
CHAVES = f"{ADMIN}/config/pix/chaves"
AREA = "/api/v1/medium/mensalidades"
INICIO = "/api/v1/medium/inicio"
SENHA = "Senha-de-teste-pix-grupo"  # só deste teste; nunca uma senha real

CPF_TESTE = "12345678909"
EMAIL_INTER = "alternativa@example.com"


@pytest.fixture
def emails(monkeypatch):
    from src.services.email.email_queue import email_queue

    enviados: list = []
    monkeypatch.setattr(email_queue, "enqueue", lambda item: enviados.append(item))
    return enviados


@pytest.fixture(autouse=True)
def hoje(monkeypatch):
    d = date(2026, 10, 8)
    monkeypatch.setattr(mens_mod, "today_local", lambda: d)
    monkeypatch.setattr(inicio_mod, "today_local", lambda: d)


async def _medium(db, tenant, nome, *grupos):
    actor = await create_user(db, tenant, UserRole.MEDIUM, name=nome.split()[0].lower())
    medium = Medium(tenant_id=tenant.id, nome=nome, user_id=actor.user.id, data_entrada=date(2026, 9, 1))
    db.add(medium)
    await db.flush()
    for g in grupos:
        db.add(CorrenteGrupoMembro(grupo_id=g.id, medium_id=medium.id, tenant_id=tenant.id))
    await db.commit()
    return actor, medium


async def _cenario(db, nome="Terreiro Pix Grupo"):
    tenant = await create_tenant(db, name=nome, plan=PlanType.PREMIUM, area_medium_liberada=True)
    db.add(
        MensalidadeConfig(
            tenant_id=tenant.id,
            valor_mensal=Decimal("50.00"),
            dia_vencimento=10,
            ativo=True,
            created_at=datetime(2026, 1, 5, tzinfo=timezone.utc),
            pix_tipo="cpf",
            pix_chave=CPF_TESTE,
            pix_nome_recebedor="Casa de Oxala",
            pix_cidade="Sao Paulo",
        )
    )
    pj = ContaBancaria(tenant_id=tenant.id, nome="PJ Sicredi", banco="Sicredi", data_saldo_inicial=date(2026, 1, 1))
    inter = ContaBancaria(
        tenant_id=tenant.id, nome="Alternativa Inter", banco="Inter", data_saldo_inicial=date(2026, 1, 1)
    )
    # Cadastro único (migração 112): a principal também está na lista, como a migração deixa.
    db.add(
        MensalidadeChavePix(
            tenant_id=tenant.id,
            apelido="Chave principal",
            pix_tipo="cpf",
            pix_chave=CPF_TESTE,
            pix_nome_recebedor="Casa de Oxala",
            pix_cidade="Sao Paulo",
            principal=True,
        )
    )
    g1 = CorrenteGrupo(tenant_id=tenant.id, nome="G1")
    g2 = CorrenteGrupo(tenant_id=tenant.id, nome="G2")
    db.add_all([pj, inter, g1, g2])
    admin = await create_user(db, tenant, UserRole.ADMIN, name="tesoureiro")
    admin.user.password_hash = hash_password(SENHA)
    await db.commit()
    return tenant, admin, pj, inter, g1, g2


def _chave_body(**kw):
    body = {
        "apelido": "Conta Inter",
        "tipo": "email",
        "chave": EMAIL_INTER,
        "nome_recebedor": "Casa de Oxala",
        "cidade": "Sao Paulo",
        "instrucoes": "Esta é a conta alternativa.",
        "conta_bancaria_id": None,
        "grupo_ids": [],
        "senha": SENHA,
    }
    body.update(kw)
    return body


async def _fluxo_outubro(client, admin, conta_id):
    resp = await client.get(
        f"{ADMIN}/fluxo-de-caixa",
        params={"data_inicio": "2026-10-01", "data_fim": "2026-10-31", "conta_bancaria_id": str(conta_id)},
        headers=admin.headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()[0]


async def test_chave_por_grupo_ponta_a_ponta(client, db, emails):
    tenant, admin, pj, inter, g1, g2 = await _cenario(db)
    ana_actor, ana = await _medium(db, tenant, "Ana Paula", g2)
    bia_actor, bia = await _medium(db, tenant, "Bia Souza", g1)

    # Chave do terreiro passa a cair na conta PJ.
    resp = await client.put(
        PIX,
        headers=admin.headers,
        json={
            "tipo": "cpf",
            "chave": CPF_TESTE,
            "nome_recebedor": "Casa de Oxala",
            "cidade": "Sao Paulo",
            "conta_bancaria_id": str(pj.id),
            "senha": SENHA,
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["conta_bancaria_id"] == str(pj.id)
    assert resp.json()["conta_bancaria_nome"] == "PJ Sicredi"

    # Chave alternativa para o G2, na conta Inter.
    emails.clear()
    criada = await client.post(
        CHAVES, headers=admin.headers, json=_chave_body(conta_bancaria_id=str(inter.id), grupo_ids=[str(g2.id)])
    )
    assert criada.status_code == 201, criada.text
    body = criada.json()
    principal, chave = body["chaves"]
    assert principal["principal"] is True and chave["principal"] is False
    assert chave["apelido"] == "Conta Inter" and chave["chave"] == EMAIL_INTER
    assert chave["conta_bancaria_nome"] == "Alternativa Inter"
    assert [g["nome"] for g in chave["grupos"]] == ["G2"] and chave["total_mediuns"] == 1
    assert chave["brcode_previa"] and EMAIL_INTER in chave["brcode_previa"]
    assert {g["nome"]: g["chave_id"] for g in body["grupos"]} == {"G1": None, "G2": chave["id"]}
    assert {c["nome"] for c in body["contas_bancarias"]} == {"PJ Sicredi", "Alternativa Inter"}
    assert body["conflitos"] == []
    assert len(emails) == 1  # o único admin ativo

    # Área: Ana (G2) paga na chave do grupo; Bia (G1) na do terreiro.
    lista_ana = (await client.get(AREA, headers=ana_actor.headers)).json()
    assert lista_ana["pix"]["chave"] == EMAIL_INTER and lista_ana["pix"]["chave_alterada_em"] is not None
    pix_ana = (await client.get(f"{AREA}/2026-10/pix", headers=ana_actor.headers)).json()
    assert pix_ana["chave"] == EMAIL_INTER and EMAIL_INTER in pix_ana["copia_e_cola"]
    assert pix_ana["instrucoes"] == "Esta é a conta alternativa."
    assert (await client.get(AREA, headers=bia_actor.headers)).json()["pix"]["chave"] == CPF_TESTE
    pix_bia = (await client.get(f"{AREA}/2026-10/pix", headers=bia_actor.headers)).json()
    assert CPF_TESTE in pix_bia["copia_e_cola"]
    assert (await client.get(INICIO, headers=ana_actor.headers)).json()["mensalidade"]["pix_disponivel"] is True

    # Baixa pelo painel: cada mensalidade cai na conta da chave do médium.
    for medium in (ana, bia):
        r = await client.post(
            f"{ADMIN}/mensalidades/{medium.id}/2026-10",
            data={"status": "PAGO", "valor_pago": "50", "data_pagamento": "2026-10-05T12:00:00"},
            headers=admin.headers,
        )
        assert r.status_code == 200, r.text
    espelhos = {
        c.external_ref.split(":")[2]: c.conta_bancaria_id
        for c in (
            await db.execute(select(ContaFinanceira).where(ContaFinanceira.tenant_id == tenant.id))
        ).scalars()
        if c.external_ref and c.external_ref.endswith("2026-10")
    }
    assert espelhos == {str(ana.id): inter.id, str(bia.id): pj.id}

    # Fluxo de caixa: cada conta com o próprio saldo.
    assert (await _fluxo_outubro(client, admin, inter.id))["receitas"] == 50.0
    assert (await _fluxo_outubro(client, admin, pj.id))["receitas"] == 50.0

    ana_id, inter_id = ana.id, inter.id
    # Ana sai do G2 depois de pagar: o mês pago continua na conta em que caiu.
    await db.execute(delete(CorrenteGrupoMembro).where(CorrenteGrupoMembro.medium_id == ana_id))
    await db.commit()
    await client.post(
        f"{ADMIN}/mensalidades/{ana.id}/2026-10",
        data={"status": "PAGO", "valor_pago": "60", "data_pagamento": "2026-10-05T12:00:00"},
        headers=admin.headers,
    )
    ref_ana = f"mensalidade:mediun:{ana_id}:2026-10"
    espelho = (
        await db.execute(
            select(ContaFinanceira)
            .where(ContaFinanceira.external_ref == ref_ana)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    assert espelho.conta_bancaria_id == inter_id and espelho.valor_pago == Decimal("60.00")

    # Excluir a chave: quem estava no G2 volta para a chave do terreiro.
    caio_actor, _ = await _medium(db, tenant, "Caio Lima", g2)
    assert (await client.get(AREA, headers=caio_actor.headers)).json()["pix"]["chave"] == EMAIL_INTER
    assert (await client.get(f"{CHAVES}", headers=admin.headers)).json()["chaves"][1]["total_mediuns"] == 1
    excluida = await client.delete(f"{CHAVES}/{chave['id']}", headers=admin.headers)
    assert excluida.status_code == 204, excluida.text
    assert (await client.get(AREA, headers=caio_actor.headers)).json()["pix"]["chave"] == CPF_TESTE


async def test_editar_grupos_conflito_e_permissoes(client, db, emails):
    tenant, admin, pj, inter, g1, g2 = await _cenario(db, nome="Terreiro Pix Conflito")
    _, ana = await _medium(db, tenant, "Ana Paula", g1, g2)

    a = (await client.post(CHAVES, headers=admin.headers, json=_chave_body(grupo_ids=[str(g2.id)]))).json()
    chave_a = a["chaves"][1]["id"]
    b = await client.post(
        CHAVES,
        headers=admin.headers,
        json=_chave_body(apelido="Conta PJ 2", tipo="cpf", chave="123.456.789-09", grupo_ids=[str(g1.id)]),
    )
    assert b.status_code == 201, b.text
    [conflito] = b.json()["conflitos"]
    assert conflito["medium_nome"] == "Ana Paula"
    assert conflito["chave_valida"] == "Conta Inter" and conflito["outras"] == ["Conta PJ 2"]

    # Apelido repetido (sem diferenciar maiúsculas) → 409.
    dup = await client.post(CHAVES, headers=admin.headers, json=_chave_body(apelido="conta inter"))
    assert dup.status_code == 409

    # Mover o G1 para a chave A tira o conflito; a chave B fica sem grupo.
    movida = await client.put(
        f"{CHAVES}/{chave_a}", headers=admin.headers, json=_chave_body(grupo_ids=[str(g1.id), str(g2.id)])
    )
    assert movida.status_code == 200, movida.text
    chaves = {c["apelido"]: c for c in movida.json()["chaves"]}
    assert {g["nome"] for g in chaves["Conta Inter"]["grupos"]} == {"G1", "G2"}
    assert chaves["Conta PJ 2"]["grupos"] == [] and movida.json()["conflitos"] == []

    # Senha errada → 401 (sem derrubar a sessão); nada muda.
    errada = await client.put(f"{CHAVES}/{chave_a}", headers=admin.headers, json=_chave_body(senha="errada"))
    assert errada.status_code == 401

    # Só view: vê mascarado, sem chave inteira nem prévia; não cria.
    leitor = await create_user(db, tenant, UserRole.OPERATOR, name="leitor")
    await grant(db, leitor, tenant, PermissionFeature.FINANCEIRO, "view")
    visto = await client.get(CHAVES, headers=leitor.headers)
    assert visto.status_code == 200
    for c in visto.json()["chaves"]:
        assert c["chave"] is None and c["brcode_previa"] is None and c["chave_mascarada"]
    assert EMAIL_INTER not in visto.text
    assert (await client.post(CHAVES, headers=leitor.headers, json=_chave_body(apelido="X"))).status_code == 403
    assert (await client.delete(f"{CHAVES}/{chave_a}", headers=leitor.headers)).status_code == 403

    # Conta bancária e grupo de outro terreiro → 422; chave de outro terreiro → 404.
    outro, admin_outro, pj_outro, _, g_outro, _ = await _cenario(db, nome="Outro Terreiro")
    r = await client.post(CHAVES, headers=admin.headers, json=_chave_body(apelido="Y", conta_bancaria_id=str(pj_outro.id)))
    assert r.status_code == 422
    r = await client.post(CHAVES, headers=admin.headers, json=_chave_body(apelido="Z", grupo_ids=[str(g_outro.id)]))
    assert r.status_code == 422
    r = await client.put(f"{CHAVES}/{chave_a}", headers=admin_outro.headers, json=_chave_body())
    assert r.status_code == 404
    assert [c["apelido"] for c in (await client.get(CHAVES, headers=admin_outro.headers)).json()["chaves"]] == [
        "Chave principal"
    ]
    r = await client.get(f"{ADMIN}/fluxo-de-caixa", params={"conta_bancaria_id": str(pj_outro.id)}, headers=admin.headers)
    assert r.status_code == 404


GRUPOS = f"{ADMIN}/config/pix/grupos"


async def test_varias_chaves_e_grupo_escolhe_entre_elas(client, db, emails):
    """11/2026: cadastrar várias chaves sem grupo e escolher, grupo a grupo, qual cada um usa."""
    tenant, admin, pj, inter, g1, g2 = await _cenario(db, nome="Terreiro Varias Chaves")
    ana_actor, _ = await _medium(db, tenant, "Ana Paula", g1)
    bia_actor, _ = await _medium(db, tenant, "Bia Souza", g2)

    a = await client.post(CHAVES, headers=admin.headers, json=_chave_body(conta_bancaria_id=str(inter.id)))
    assert a.status_code == 201, a.text
    b = await client.post(
        CHAVES,
        headers=admin.headers,
        json=_chave_body(apelido="Conta PJ 2", chave="pj2@example.com", conta_bancaria_id=str(pj.id)),
    )
    assert b.status_code == 201, b.text
    ids = {c["apelido"]: c["id"] for c in b.json()["chaves"]}
    assert all(c["grupos"] == [] for c in b.json()["chaves"]) and len(ids) == 3
    # Sem grupo ligado, todo mundo ainda paga na principal.
    assert (await client.get(AREA, headers=ana_actor.headers)).json()["pix"]["chave"] == CPF_TESTE

    # Senha errada → 401; grupo/chave de outro terreiro → 422.
    escolha = {"grupos": [{"grupo_id": str(g1.id), "chave_id": ids["Conta Inter"]}], "senha": "errada"}
    assert (await client.put(GRUPOS, headers=admin.headers, json=escolha)).status_code == 401
    _, admin_outro, _, _, g_outro, _ = await _cenario(db, nome="Outro Terreiro Chaves")
    r = await client.put(
        GRUPOS, headers=admin.headers, json={"grupos": [{"grupo_id": str(g_outro.id), "chave_id": None}], "senha": SENHA}
    )
    assert r.status_code == 422
    r = await client.put(
        GRUPOS,
        headers=admin_outro.headers,
        json={"grupos": [{"grupo_id": str(g_outro.id), "chave_id": ids["Conta Inter"]}], "senha": SENHA},
    )
    assert r.status_code in (401, 422)

    ok = await client.put(
        GRUPOS,
        headers=admin.headers,
        json={
            "grupos": [
                {"grupo_id": str(g1.id), "chave_id": ids["Conta Inter"]},
                {"grupo_id": str(g2.id), "chave_id": ids["Conta PJ 2"]},
            ],
            "senha": SENHA,
        },
    )
    assert ok.status_code == 200, ok.text
    assert {g["nome"]: g["chave_id"] for g in ok.json()["grupos"]} == {"G1": ids["Conta Inter"], "G2": ids["Conta PJ 2"]}
    assert (await client.get(AREA, headers=ana_actor.headers)).json()["pix"]["chave"] == EMAIL_INTER
    pix_bia = (await client.get(f"{AREA}/2026-10/pix", headers=bia_actor.headers)).json()
    assert pix_bia["chave"] == "pj2@example.com" and "pj2@example.com" in pix_bia["copia_e_cola"]

    # Editar a chave sem mandar grupo_ids mantém os grupos dela.
    body = _chave_body(conta_bancaria_id=str(inter.id), instrucoes="Nova instrução")
    body.pop("grupo_ids")
    ed = await client.put(f"{CHAVES}/{ids['Conta Inter']}", headers=admin.headers, json=body)
    assert ed.status_code == 200, ed.text
    assert [g["nome"] for g in {c["apelido"]: c for c in ed.json()["chaves"]}["Conta Inter"]["grupos"]] == ["G1"]

    # G1 volta para a chave principal.
    volta = await client.put(
        GRUPOS, headers=admin.headers, json={"grupos": [{"grupo_id": str(g1.id), "chave_id": None}], "senha": SENHA}
    )
    assert volta.status_code == 200, volta.text
    assert (await client.get(AREA, headers=ana_actor.headers)).json()["pix"]["chave"] == CPF_TESTE

    # Só view não escolhe.
    leitor = await create_user(db, tenant, UserRole.OPERATOR, name="leitor2")
    await grant(db, leitor, tenant, PermissionFeature.FINANCEIRO, "view")
    r = await client.put(
        GRUPOS, headers=leitor.headers, json={"grupos": [{"grupo_id": str(g1.id), "chave_id": None}], "senha": SENHA}
    )
    assert r.status_code == 403


async def test_medium_de_grupo_com_chave_propria_nao_usa_a_cobranca_automatica(client, db, emails, monkeypatch):
    """Bug 11/2026: com a cobrança automática ligada, o médium do grupo "alternativo" via o QR da
    conta principal (gateway) em vez da chave do grupo."""
    from src.models.mensalidade_gateway import MensalidadeGateway
    from src.services import mensalidade_gateway as gateway_service

    monkeypatch.setattr(gateway_service, "provedor_configurado", lambda provedor: True)

    tenant, admin, pj, inter, g1, g2 = await _cenario(db, nome="Terreiro Pix Gateway")
    db.add(
        MensalidadeGateway(
            tenant_id=tenant.id,
            provedor="stripe",
            status="ativo",
            cadastro_completo=True,
            recebimentos_ativos=True,
            pix_disponivel=True,
        )
    )
    await db.commit()
    ana_actor, _ = await _medium(db, tenant, "Ana Paula", g2)
    bia_actor, _ = await _medium(db, tenant, "Bia Souza", g1)
    criada = await client.post(CHAVES, headers=admin.headers, json=_chave_body(grupo_ids=[str(g2.id)]))
    assert criada.status_code == 201, criada.text

    lista_ana = (await client.get(AREA, headers=ana_actor.headers)).json()
    assert lista_ana["cobranca_automatica"] is None and lista_ana["pix"]["chave"] == EMAIL_INTER
    r = await client.post(f"{AREA}/2026-10/cobranca", headers=ana_actor.headers, json={"metodo": "pix"})
    assert r.status_code == 409 and r.json()["details"]["error_code"] == "COBRANCA_AUTOMATICA_INDISPONIVEL"
    # Quem paga na chave principal continua com a cobrança automática da casa.
    lista_bia = (await client.get(AREA, headers=bia_actor.headers)).json()
    assert lista_bia["cobranca_automatica"] is not None


async def test_cadastro_unico_principal_e_troca_de_principal(client, db, emails):
    """Migração 112: todas as chaves numa lista só; a direção marca a principal."""
    tenant = await create_tenant(db, name="Terreiro Cadastro Unico", plan=PlanType.PREMIUM, area_medium_liberada=True)
    db.add(
        MensalidadeConfig(
            tenant_id=tenant.id,
            valor_mensal=Decimal("50.00"),
            dia_vencimento=10,
            ativo=True,
            created_at=datetime(2026, 1, 5, tzinfo=timezone.utc),
        )
    )
    g1 = CorrenteGrupo(tenant_id=tenant.id, nome="G1")
    db.add(g1)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="tesoureira")
    admin.user.password_hash = hash_password(SENHA)
    await db.commit()
    ana_actor, _ = await _medium(db, tenant, "Ana Paula", g1)
    bia_actor, _ = await _medium(db, tenant, "Bia Souza")
    assert (await client.get(AREA, headers=bia_actor.headers)).json()["pix"] is None

    # A primeira chave cadastrada vira a principal e aparece para todo mundo (espelho na config).
    r = await client.post(
        CHAVES,
        headers=admin.headers,
        json=_chave_body(apelido="Sicredi PJ", tipo="cpf", chave=CPF_TESTE, grupo_ids=[str(g1.id)]),
    )
    assert r.status_code == 201, r.text
    [sicredi] = r.json()["chaves"]
    assert sicredi["principal"] is True and sicredi["grupos"] == []
    assert sicredi["brcode_previa"] and CPF_TESTE in sicredi["brcode_previa"]
    assert (await client.get(PIX, headers=admin.headers)).json()["chave"] == CPF_TESTE
    assert (await client.get(AREA, headers=bia_actor.headers)).json()["pix"]["chave"] == CPF_TESTE

    # Segunda chave: não é principal; toda chave tem copia e cola (prévia).
    r = await client.post(CHAVES, headers=admin.headers, json=_chave_body())
    assert r.status_code == 201, r.text
    sicredi, inter = r.json()["chaves"]
    assert inter["principal"] is False and EMAIL_INTER in inter["brcode_previa"]

    # Escolher a principal para um grupo = sem ligação.
    r = await client.put(
        GRUPOS, headers=admin.headers, json={"grupos": [{"grupo_id": str(g1.id), "chave_id": sicredi["id"]}], "senha": SENHA}
    )
    assert r.status_code == 200 and {g["nome"]: g["chave_id"] for g in r.json()["grupos"]} == {"G1": None}
    # G1 na Inter.
    r = await client.put(
        GRUPOS, headers=admin.headers, json={"grupos": [{"grupo_id": str(g1.id), "chave_id": inter["id"]}], "senha": SENHA}
    )
    assert (await client.get(AREA, headers=ana_actor.headers)).json()["pix"]["chave"] == EMAIL_INTER

    # Excluir a principal com outras chaves → 409.
    r = await client.delete(f"{CHAVES}/{sicredi['id']}", headers=admin.headers)
    assert r.status_code == 409 and r.json()["details"]["error_code"] == "CHAVE_PRINCIPAL"

    # Definir a Inter como principal: senha errada 401; depois todo mundo paga nela; G1 sem ligação.
    url = f"{CHAVES}/{inter['id']}/principal"
    assert (await client.post(url, headers=admin.headers, json={"senha": "errada"})).status_code == 401
    emails.clear()
    r = await client.post(url, headers=admin.headers, json={"senha": SENHA})
    assert r.status_code == 200, r.text
    chaves = {c["apelido"]: c for c in r.json()["chaves"]}
    assert chaves["Conta Inter"]["principal"] is True and chaves["Sicredi PJ"]["principal"] is False
    assert [c["apelido"] for c in r.json()["chaves"]][0] == "Conta Inter"
    assert {g["nome"]: g["chave_id"] for g in r.json()["grupos"]} == {"G1": None}
    assert len(emails) == 1
    lista_bia = (await client.get(AREA, headers=bia_actor.headers)).json()
    assert lista_bia["pix"]["chave"] == EMAIL_INTER and lista_bia["pix"]["chave_alterada_em"] is not None
    assert (await client.get(PIX, headers=admin.headers)).json()["chave"] == EMAIL_INTER

    # Editar a principal reflete na Área.
    body = _chave_body(chave="nova@example.com")
    body.pop("grupo_ids")
    r = await client.put(f"{CHAVES}/{inter['id']}", headers=admin.headers, json=body)
    assert r.status_code == 200, r.text
    assert (await client.get(f"{AREA}/2026-10/pix", headers=bia_actor.headers)).json()["chave"] == "nova@example.com"

    # Rota antiga PUT /config/pix também grava a principal na lista.
    r = await client.put(
        PIX,
        headers=admin.headers,
        json={"tipo": "cpf", "chave": CPF_TESTE, "nome_recebedor": "Casa de Oxala", "cidade": "Sao Paulo", "senha": SENHA},
    )
    assert r.status_code == 200, r.text
    chaves = {c["apelido"]: c for c in (await client.get(CHAVES, headers=admin.headers)).json()["chaves"]}
    assert chaves["Conta Inter"]["principal"] is True and chaves["Conta Inter"]["chave"] == CPF_TESTE

    # Excluir a outra e depois a principal (única): a casa fica sem chave.
    assert (await client.delete(f"{CHAVES}/{sicredi['id']}", headers=admin.headers)).status_code == 204
    assert (await client.delete(f"{CHAVES}/{inter['id']}", headers=admin.headers)).status_code == 204
    assert (await client.get(PIX, headers=admin.headers)).json()["configurada"] is False
    assert (await client.get(AREA, headers=bia_actor.headers)).json()["pix"] is None
