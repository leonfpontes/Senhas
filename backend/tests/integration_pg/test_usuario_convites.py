"""Convite por e-mail para entrar no painel (11/2026), com Postgres real (migração 113).

App inteiro via HTTP: o admin convida sem senha, a pessoa abre o link público, cria a senha
(ou usa a que já usa no GiraHub) e entra com a sessão aberta. A conta só nasce no aceite;
convite de uso único; reenviar troca o link; cancelar e recusar matam o link; convite de
administrador só por administrador; isolamento entre terreiros; e a "mesma senha" faz o
login mostrar a escolha de terreiro (AM-05) com as duas casas.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select, text

from src.models import AuditLog, LegalAcceptance, UsuarioConvite
from src.models.permission_groups import PermissionFeature, PermissionGroup, UserGroupMembership
from src.models.subscriptions import PlanType
from src.models.users import User, UserRole
from src.security import hash_password

from .factories import create_tenant, create_user, grant

CONVITES = "/api/v1/admin/users/convites"
PUBLICO = "/api/v1/public/convite-equipe"
SENHA = "Senha-forte-123"


@pytest.fixture
def emails(monkeypatch):
    """Captura os e-mails enfileirados (a fila não roda nos testes)."""
    from src.services.email.email_queue import email_queue

    enviados = []
    monkeypatch.setattr(email_queue, "enqueue", lambda item: enviados.append(item.message))
    return enviados


def _token(msg) -> str:
    return msg.text_body.split("/convite-equipe/", 1)[1].split()[0]


def _email() -> str:
    return f"pessoa-{uuid.uuid4().hex[:8]}@example.com"


async def _casa(db, nome="Casa Luz"):
    tenant = await create_tenant(db, name=nome, plan=PlanType.PREMIUM)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="dirigente")
    return tenant, admin


async def _convidar(client, actor, email, role="operator", **extra):
    return await client.post(CONVITES, headers=actor.headers, json={"email": email, "nome": "Maria das Dores", "role": role, **extra})


async def _aceitar(client, token, senha=SENHA, modo="senha_nova", termos=True):
    resp = await client.post(f"{PUBLICO}/{token}/aceitar", json={"modo": modo, "senha": senha, "aceite_termos": termos})
    return resp


async def _fresh_scalar(stmt):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(stmt)).scalars().all()


# ── Convidar ────────────────────────────────────────────────────────────────


async def test_convite_nao_cria_conta_e_manda_email_com_link(client, db, emails):
    tenant, admin = await _casa(db)
    email = _email()

    resp = await _convidar(client, admin, email.upper())
    assert resp.status_code == 201, resp.text
    corpo = resp.json()
    assert corpo["email"] == email and corpo["situacao"] == "enviado" and corpo["role"] == "operator"
    assert corpo["criado_por_nome"] == "Dirigente"

    # A conta só nasce no aceite.
    assert await _fresh_scalar(select(User).where(func.lower(User.email) == email)) == []

    assert len(emails) == 1
    msg = emails[0]
    assert msg.to_email == email
    assert "Casa Luz" in msg.subject
    assert "Aceitar convite" in msg.html_body and "#2E6A4E" in msg.html_body
    assert "senha" in msg.text_body.lower() and "7 dias" in msg.text_body

    lista = await client.get(CONVITES, headers=admin.headers)
    assert [c["email"] for c in lista.json()] == [email]
    # Só o hash fica no banco.
    convite = (await _fresh_scalar(select(UsuarioConvite).where(UsuarioConvite.email == email)))[0]
    assert _token(msg) not in convite.token_hash


async def test_aceite_cria_conta_aplica_perfil_grava_termos_e_abre_sessao(client, db, emails):
    tenant, admin = await _casa(db)
    grupo = PermissionGroup(tenant_id=tenant.id, name="Porta", is_default=False)
    db.add(grupo)
    await db.commit()
    email = _email()

    assert (await _convidar(client, admin, email, group_id=str(grupo.id))).status_code == 201
    token = _token(emails[-1])

    ver = await client.get(f"{PUBLICO}/{token}")
    assert ver.status_code == 200, ver.text
    info = ver.json()
    assert info["terreiro"]["nome"] == "Casa Luz" and info["primeiro_nome"] == "Maria"
    assert info["situacao"] == "nova" and info["convidou"] == "Dirigente" and "@example.com" in info["email_mascarado"]
    assert email not in str(info)

    sem_termos = await _aceitar(client, token, termos=False)
    assert sem_termos.status_code == 422

    fraca = await _aceitar(client, token, senha="curta")
    assert fraca.status_code == 422

    ok = await _aceitar(client, token)
    assert ok.status_code == 200, ok.text
    assert ok.json()["redirect"] == "/admin" and ok.json()["user"]["role"] == "operator"
    assert "access_token" in ok.cookies or "access_token" in client.cookies
    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200 and me.json()["email"] == email
    client.cookies.clear()

    user = (await _fresh_scalar(select(User).where(User.email == email)))[0]
    assert user.role == UserRole.OPERATOR and user.username == "Maria das Dores"
    grupos = await _fresh_scalar(select(UserGroupMembership.group_id).where(UserGroupMembership.user_id == user.id))
    assert grupos == [grupo.id]
    docs = await _fresh_scalar(select(LegalAcceptance.document).where(LegalAcceptance.user_id == user.id))
    assert sorted(docs) == ["privacidade", "termos"]
    acoes = await _fresh_scalar(select(AuditLog.resource_type).where(AuditLog.tenant_id == tenant.id))
    assert "UsuarioConvite" in acoes and "User" in acoes

    # Uso único, e o convite sai da lista.
    assert (await _aceitar(client, token)).status_code == 404
    assert (await client.get(f"{PUBLICO}/{token}")).status_code == 404
    assert (await client.get(CONVITES, headers=admin.headers)).json() == []

    # Login normal com a senha criada.
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": SENHA})
    assert login.status_code == 200 and login.json()["user"]["id"] == str(user.id)


async def test_quem_ja_tem_conta_em_outra_casa_usa_a_mesma_senha_e_o_login_junta_as_duas(client, db, emails):
    outra = await create_tenant(db, name="Outra Casa", plan=PlanType.PREMIUM)
    existente = await create_user(db, outra, UserRole.OPERATOR, name="maria")
    existente.user.password_hash = hash_password(SENHA)
    await db.commit()
    tenant, admin = await _casa(db)

    assert (await _convidar(client, admin, existente.user.email)).status_code == 201
    token = _token(emails[-1])
    info = (await client.get(f"{PUBLICO}/{token}")).json()
    assert info["situacao"] == "outra_casa"
    assert "Outra Casa" not in str(info)  # nunca diz em quais casas

    errada = await _aceitar(client, token, senha="Outra-coisa-999", modo="senha_existente")
    assert errada.status_code == 400 and errada.json()["detail"]["error_code"] == "SENHA_INCORRETA"

    ok = await _aceitar(client, token, modo="senha_existente")
    assert ok.status_code == 200, ok.text
    client.cookies.clear()
    nova = (await _fresh_scalar(select(User).where(User.tenant_id == tenant.id, User.email == existente.user.email)))[0]
    assert nova.password_hash == existente.user.password_hash

    login = await client.post("/api/v1/auth/login", json={"email": existente.user.email, "password": SENHA})
    assert login.status_code == 200, login.text
    assert login.json().get("choose_account") is True
    assert {o["terreiro_nome"] for o in login.json()["options"]} == {"Outra Casa", "Casa Luz"}


async def test_quem_tem_conta_em_outra_casa_pode_criar_senha_so_para_esta(client, db, emails):
    outra = await create_tenant(db, name="Outra Casa", plan=PlanType.PREMIUM)
    existente = await create_user(db, outra, UserRole.OPERATOR, name="maria")
    existente.user.password_hash = hash_password(SENHA)
    await db.commit()
    tenant, admin = await _casa(db)
    await _convidar(client, admin, existente.user.email)

    ok = await _aceitar(client, _token(emails[-1]), senha="Senha-so-daqui-42")
    assert ok.status_code == 200, ok.text
    client.cookies.clear()
    login = await client.post("/api/v1/auth/login", json={"email": existente.user.email, "password": "Senha-so-daqui-42"})
    assert login.status_code == 200 and login.json()["user"]["tenant_id"] == str(tenant.id)


async def test_conta_excluida_volta_pelo_convite(client, db, emails):
    tenant, admin = await _casa(db)
    antigo = await create_user(db, tenant, UserRole.OPERATOR, name="antigo")
    assert (await client.delete(f"/api/v1/admin/users/{antigo.user.id}", headers=admin.headers)).status_code == 204

    assert (await _convidar(client, admin, antigo.user.email, role="admin")).status_code == 201
    ok = await _aceitar(client, _token(emails[-1]))
    assert ok.status_code == 200, ok.text
    client.cookies.clear()
    user = (await _fresh_scalar(select(User).where(User.id == antigo.user.id)))[0]
    assert user.deleted_at is None and user.is_active and user.role == UserRole.ADMIN


# ── Barrados no envio ───────────────────────────────────────────────────────


async def test_barra_quem_ja_tem_acesso_desativado_e_convite_em_aberto(client, db, emails):
    tenant, admin = await _casa(db)
    ativo = await create_user(db, tenant, UserRole.OPERATOR, name="ativo")
    inativo = await create_user(db, tenant, UserRole.OPERATOR, name="inativo")
    inativo.user.is_active = False
    await db.commit()

    r = await _convidar(client, admin, ativo.user.email)
    assert r.status_code == 409 and r.json()["detail"]["error_code"] == "JA_TEM_ACESSO"
    r = await _convidar(client, admin, inativo.user.email)
    assert r.status_code == 409 and r.json()["detail"]["error_code"] == "CONTA_DESATIVADA"

    email = _email()
    primeiro = await _convidar(client, admin, email)
    r = await _convidar(client, admin, email)
    assert r.status_code == 409 and r.json()["detail"]["error_code"] == "CONVITE_EM_ABERTO"
    assert r.json()["detail"]["convite_id"] == primeiro.json()["id"]

    papel = await _convidar(client, admin, _email(), role="super_admin")
    assert papel.status_code == 422
    medium = await _convidar(client, admin, _email(), role="medium")
    assert medium.status_code == 422
    senha = await client.post(CONVITES, headers=admin.headers, json={"email": _email(), "nome": "X", "password": SENHA})
    assert senha.status_code == 422


async def test_criar_pessoa_com_senha_nao_existe_mais(client, db):
    tenant, admin = await _casa(db)
    criar = await client.post(
        "/api/v1/admin/users", headers=admin.headers,
        json={"email": _email(), "username": "x", "password": SENHA, "role": "operator"},
    )
    assert criar.status_code == 405
    op = await create_user(db, tenant, UserRole.OPERATOR, name="op")
    trocar = await client.put(f"/api/v1/admin/users/{op.user.id}", headers=admin.headers, json={"password": SENHA})
    assert trocar.status_code == 422


# ── Reenviar, vencer, cancelar, recusar ─────────────────────────────────────


async def test_reenviar_troca_o_link_e_respeita_o_intervalo(client, db, emails):
    tenant, admin = await _casa(db)
    convite = (await _convidar(client, admin, _email())).json()
    antigo = _token(emails[-1])

    cedo = await client.post(f"{CONVITES}/{convite['id']}/reenviar", headers=admin.headers)
    assert cedo.status_code == 429

    await db.execute(
        text("UPDATE usuario_convites SET enviado_em = now() - interval '2 minutes' WHERE id = :i"), {"i": convite["id"]}
    )
    await db.commit()
    ok = await client.post(f"{CONVITES}/{convite['id']}/reenviar", headers=admin.headers)
    assert ok.status_code == 200, ok.text
    novo = _token(emails[-1])
    assert novo != antigo
    assert (await client.get(f"{PUBLICO}/{antigo}")).status_code == 404
    assert (await client.get(f"{PUBLICO}/{novo}")).status_code == 200


async def test_convite_vencido_nao_vale_mas_pode_ser_reenviado_ou_refeito(client, db, emails):
    tenant, admin = await _casa(db)
    email = _email()
    convite = (await _convidar(client, admin, email)).json()
    token = _token(emails[-1])
    await db.execute(
        text("UPDATE usuario_convites SET expira_em = now() - interval '1 minute', enviado_em = now() - interval '8 days' WHERE id = :i"),
        {"i": convite["id"]},
    )
    await db.commit()

    assert (await client.get(f"{PUBLICO}/{token}")).status_code == 404
    lista = (await client.get(CONVITES, headers=admin.headers)).json()
    assert lista[0]["situacao"] == "vencido"

    de_novo = await _convidar(client, admin, email)
    assert de_novo.status_code == 201, de_novo.text
    assert (await client.get(f"{PUBLICO}/{_token(emails[-1])}")).status_code == 200


async def test_cancelar_mata_o_link_e_recusar_aparece_na_lista(client, db, emails):
    tenant, admin = await _casa(db)
    c1 = (await _convidar(client, admin, _email())).json()
    t1 = _token(emails[-1])
    assert (await client.delete(f"{CONVITES}/{c1['id']}", headers=admin.headers)).status_code == 204
    assert (await client.get(f"{PUBLICO}/{t1}")).status_code == 404

    c2 = (await _convidar(client, admin, _email())).json()
    t2 = _token(emails[-1])
    assert (await client.post(f"{PUBLICO}/{t2}/recusar")).status_code == 204
    assert (await _aceitar(client, t2)).status_code == 404
    lista = (await client.get(CONVITES, headers=admin.headers)).json()
    assert [(c["id"], c["situacao"]) for c in lista] == [(c2["id"], "recusado")]


# ── Permissões e isolamento ─────────────────────────────────────────────────


async def test_operador_com_grupo_convida_operador_mas_nao_mexe_com_administrador(client, db, emails):
    tenant, admin = await _casa(db)
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="operador")
    sem_grupo = await create_user(db, tenant, UserRole.OPERATOR, name="semgrupo")
    await grant(db, operador, tenant, PermissionFeature.USUARIOS, "view", "insert", "edit", "delete")

    assert (await _convidar(client, sem_grupo, _email())).status_code == 403
    assert (await client.get(CONVITES, headers=sem_grupo.headers)).status_code == 403

    assert (await _convidar(client, operador, _email())).status_code == 201
    assert (await _convidar(client, operador, _email(), role="admin")).status_code == 403

    do_admin = (await _convidar(client, admin, _email(), role="admin")).json()
    assert (await client.delete(f"{CONVITES}/{do_admin['id']}", headers=operador.headers)).status_code == 403
    assert (await client.put(f"{CONVITES}/{do_admin['id']}", headers=operador.headers, json={"nome": "Y"})).status_code == 403


async def test_convite_de_admin_cai_se_quem_convidou_deixa_de_ser_admin(client, db, emails):
    tenant, admin = await _casa(db)
    outro_admin = await create_user(db, tenant, UserRole.ADMIN, name="outro")
    await client.post(CONVITES, headers=outro_admin.headers, json={"email": _email(), "nome": "Z", "role": "admin"})
    token = _token(emails[-1])
    assert (await client.get(f"{PUBLICO}/{token}")).status_code == 200

    rebaixar = await client.put(f"/api/v1/admin/users/{outro_admin.user.id}", headers=admin.headers, json={"role": "operator"})
    assert rebaixar.status_code == 200, rebaixar.text
    assert (await client.get(f"{PUBLICO}/{token}")).status_code == 404


async def test_isolamento_entre_terreiros(client, db, emails):
    tenant_a, admin_a = await _casa(db, "Casa A")
    tenant_b, admin_b = await _casa(db, "Casa B")
    grupo_b = PermissionGroup(tenant_id=tenant_b.id, name="Só B", is_default=False)
    db.add(grupo_b)
    await db.commit()

    convite_a = (await _convidar(client, admin_a, _email())).json()
    assert (await client.get(CONVITES, headers=admin_b.headers)).json() == []
    assert (await client.delete(f"{CONVITES}/{convite_a['id']}", headers=admin_b.headers)).status_code == 404
    assert (await client.post(f"{CONVITES}/{convite_a['id']}/reenviar", headers=admin_b.headers)).status_code == 404
    assert (await client.put(f"{CONVITES}/{convite_a['id']}", headers=admin_b.headers, json={"nome": "X"})).status_code == 404

    # Perfil de outro terreiro no corpo.
    assert (await _convidar(client, admin_a, _email(), group_id=str(grupo_b.id))).status_code == 404
    assert (await client.put(f"{CONVITES}/{convite_a['id']}", headers=admin_a.headers, json={"group_id": str(grupo_b.id)})).status_code == 404

    # Aceite cria a conta no terreiro do convite.
    await _convidar(client, admin_b, "mesma@example.com")
    ok = await _aceitar(client, _token(emails[-1]))
    client.cookies.clear()
    assert ok.json()["user"]["tenant_id"] == str(tenant_b.id)


async def test_ajustar_convite_muda_tipo_e_perfil(client, db, emails):
    tenant, admin = await _casa(db)
    grupo = PermissionGroup(tenant_id=tenant.id, name="Financeiro", is_default=False)
    db.add(grupo)
    await db.commit()
    c = (await _convidar(client, admin, _email())).json()
    r = await client.put(f"{CONVITES}/{c['id']}", headers=admin.headers, json={"nome": "Maria Souza", "group_id": str(grupo.id)})
    assert r.status_code == 200 and r.json()["group_id"] == str(grupo.id) and r.json()["nome"] == "Maria Souza"
    r = await client.put(f"{CONVITES}/{c['id']}", headers=admin.headers, json={"role": "admin"})
    assert r.json()["role"] == "admin" and r.json()["group_id"] is None


# ── Link de nova senha (no lugar de o admin digitar a senha) ────────────────


async def test_link_nova_senha_manda_email_so_para_a_conta(client, db, monkeypatch):
    enviados = []

    async def _fake_send(msg, first_id, account_ids):
        enviados.append(msg)

    monkeypatch.setattr("src.api.v1.auth.login._send_forgot_password_email", _fake_send)
    tenant, admin = await _casa(db)
    op = await create_user(db, tenant, UserRole.OPERATOR, name="op")
    hash_antes = op.user.password_hash

    r = await client.post(f"/api/v1/admin/users/{op.user.id}/link-nova-senha", headers=admin.headers)
    assert r.status_code == 202, r.text
    assert len(enviados) == 1 and enviados[0].to_email == op.user.email and "/reset-password#token=" in enviados[0].text_body
    user = (await _fresh_scalar(select(User).where(User.id == op.user.id)))[0]
    assert user.reset_token_hash is not None and user.password_hash == hash_antes

    outro_tenant, outro_admin = await _casa(db, "Outra")
    assert (await client.post(f"/api/v1/admin/users/{op.user.id}/link-nova-senha", headers=outro_admin.headers)).status_code == 404
