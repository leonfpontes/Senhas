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
    [chave] = body["chaves"]
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
    assert (await client.get(f"{CHAVES}", headers=admin.headers)).json()["chaves"][0]["total_mediuns"] == 1
    excluida = await client.delete(f"{CHAVES}/{chave['id']}", headers=admin.headers)
    assert excluida.status_code == 204, excluida.text
    assert (await client.get(AREA, headers=caio_actor.headers)).json()["pix"]["chave"] == CPF_TESTE


async def test_editar_grupos_conflito_e_permissoes(client, db, emails):
    tenant, admin, pj, inter, g1, g2 = await _cenario(db, nome="Terreiro Pix Conflito")
    _, ana = await _medium(db, tenant, "Ana Paula", g1, g2)

    a = (await client.post(CHAVES, headers=admin.headers, json=_chave_body(grupo_ids=[str(g2.id)]))).json()
    chave_a = a["chaves"][0]["id"]
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
    assert (await client.get(CHAVES, headers=admin_outro.headers)).json()["chaves"] == []
    r = await client.get(f"{ADMIN}/fluxo-de-caixa", params={"conta_bancaria_id": str(pj_outro.id)}, headers=admin.headers)
    assert r.status_code == 404
