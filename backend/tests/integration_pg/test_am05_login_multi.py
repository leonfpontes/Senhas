"""AM-05 — mesmo e-mail em mais de um terreiro, ponta a ponta com Postgres real.

- Senha que confere em duas contas → 200 `choose_account` com as duas, SEM cookies;
  `/auth/login/select` abre a sessão na escolhida (3 cookies, `areas` certas).
- Senha que confere numa conta só → entra direto nela.
- Token de escolha não vale como access nem como refresh; expirado ou com
  `user_id` fora da lista → 401 `SELECTION_INVALID`.
- Conta inativa, terreiro desativado e conta excluída nunca são oferecidos.
- Esqueci a senha com duas contas → um e-mail com dois links; cada link
  redefine só a sua conta.
- Custo de bcrypt: e-mail inexistente = senha errada numa conta = 1 verificação.
- Regra do #85 (conta ativa ganha de terreiro desativado; sem conta ativa, a
  reativação continua na conta mais antiga) segue valendo.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from sqlalchemy import select, update

from src.models import Medium
from src.models.tenants import Tenant
from src.models.users import User, UserRole
from src.security.jwt import create_account_select_token
from src.security.password import hash_password, verify_password

from .factories import create_tenant

SENHA = "Senha-forte-123"
OUTRA = "Outra-senha-456"
LOGIN = "/api/v1/auth/login"
SELECT = "/api/v1/auth/login/select"
ME = "/api/v1/auth/me"


def _captura_emails(monkeypatch) -> AsyncMock:
    """Troca o Resend (sem chave no teste — o construtor falharia) por um falso que
    guarda as mensagens; o Brevo nem é chamado quando o Resend "envia"."""
    enviado = AsyncMock(return_value=True)

    class _FakeResend:
        send_async = enviado

    monkeypatch.setattr("src.services.email.resend_fallback.ResendEmailService", _FakeResend)
    return enviado


def _set_cookies(resp) -> dict[str, str]:
    return {raw.split("=", 1)[0]: raw for raw in resp.headers.get_list("set-cookie")}


async def _conta(
    db,
    tenant,
    email,
    *,
    role=UserRole.ADMIN,
    password=SENHA,
    created_at=None,
    is_active=True,
    deleted=False,
) -> User:
    user = User(
        tenant_id=tenant.id,
        email=email,
        username=f"u-{uuid.uuid4().hex[:8]}",
        password_hash=hash_password(password),
        role=role,
        is_active=is_active,
        full_name="Pessoa de Teste",
    )
    if created_at is not None:
        user.created_at = created_at
    if deleted:
        user.deleted_at = datetime.now(timezone.utc)
    db.add(user)
    await db.commit()
    return user


async def _desativa_terreiro(db, tenant):
    agora = datetime.now(timezone.utc)
    await db.execute(
        update(Tenant).where(Tenant.id == tenant.id).values(is_active=False, deleted_at=agora, self_deactivated_at=agora)
    )
    await db.commit()


async def _fresh_user(user_id) -> User:
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(select(User).where(User.id == user_id))).scalar_one()


async def _admin_e_medium(db, email):
    """Admin da própria casa (mais antiga) e médium (papel medium, vínculo ativo) em outra."""
    agora = datetime.now(timezone.utc)
    casa = await create_tenant(db, name="Casa da Ana", area_medium_liberada=True)
    outra = await create_tenant(db, name="Tenda Vizinha", area_medium_liberada=True)
    admin = await _conta(db, casa, email, created_at=agora - timedelta(days=60))
    medium_user = await _conta(db, outra, email, role=UserRole.MEDIUM, created_at=agora)
    db.add(Medium(tenant_id=outra.id, nome="Ana de Oxum", user_id=medium_user.id))
    await db.commit()
    return casa, outra, admin, medium_user


async def test_duas_contas_mesma_senha_pede_escolha_sem_cookies_e_select_entra(client, db):
    casa, outra, admin, medium_user = await _admin_e_medium(db, "ana@example.com")

    resp = await client.post(LOGIN, json={"email": "Ana@Example.com", "password": SENHA, "remember_me": False})

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["choose_account"] is True
    assert "access_token" not in body and "user" not in body
    assert _set_cookies(resp) == {}  # nenhum cookie antes da escolha
    opcoes = {o["user_id"]: o for o in body["options"]}
    assert list(opcoes) == [str(admin.id), str(medium_user.id)]  # mais antiga primeiro
    assert opcoes[str(admin.id)]["terreiro_nome"] == "Casa da Ana"
    assert opcoes[str(admin.id)]["terreiro_slug"] == casa.slug
    assert opcoes[str(admin.id)]["areas"] == {"admin": True, "medium": False}
    assert opcoes[str(medium_user.id)]["terreiro_nome"] == "Tenda Vizinha"
    assert opcoes[str(medium_user.id)]["areas"] == {"admin": False, "medium": True}

    escolha = await client.post(SELECT, json={"selection_token": body["selection_token"], "user_id": str(medium_user.id)})

    assert escolha.status_code == 200, escolha.text
    dados = escolha.json()
    assert dados["user"]["id"] == str(medium_user.id)
    assert dados["user"]["tenant_id"] == str(outra.id)
    assert dados["areas"]["admin"] is False
    assert dados["areas"]["medium"]["nome"] == "Ana de Oxum"
    cookies = _set_cookies(escolha)
    assert set(cookies) >= {"access_token", "refresh_token", "auth_state"}
    # "Lembrar-me" desmarcado no login vale para a sessão aberta na escolha
    assert all("Max-Age" not in cookies[n] for n in ("access_token", "refresh_token", "auth_state"))

    me = await client.get(ME)  # só cookies
    assert me.status_code == 200, me.text
    assert me.json()["id"] == str(medium_user.id)

    # Não é de uso único: dentro dos 5 min, dá para escolher a outra conta.
    de_novo = await client.post(SELECT, json={"selection_token": body["selection_token"], "user_id": str(admin.id)})
    assert de_novo.status_code == 200, de_novo.text
    assert de_novo.json()["areas"] == {"admin": True, "medium": None}


async def test_senha_que_confere_so_numa_entra_direto(client, db):
    a, b = await create_tenant(db, name="Casa Um"), await create_tenant(db, name="Casa Dois")
    await _conta(db, a, "bia@example.com", password=OUTRA)
    certa = await _conta(db, b, "bia@example.com")

    resp = await client.post(LOGIN, json={"email": "bia@example.com", "password": SENHA})

    assert resp.status_code == 200, resp.text
    assert "choose_account" not in resp.json()
    assert resp.json()["user"]["id"] == str(certa.id)
    assert set(_set_cookies(resp)) >= {"access_token", "refresh_token", "auth_state"}

    errada = await client.post(LOGIN, json={"email": "bia@example.com", "password": "Nenhuma-das-duas-1"})
    assert errada.status_code == 401
    assert _set_cookies(errada) == {}


async def test_token_de_escolha_nao_vale_como_access_nem_refresh(client, db):
    await _admin_e_medium(db, "cris@example.com")
    resp = await client.post(LOGIN, json={"email": "cris@example.com", "password": SENHA})
    token = resp.json()["selection_token"]

    client.cookies.clear()
    try:
        como_access = await client.get(ME, headers={"Authorization": f"Bearer {token}"})
        assert como_access.status_code == 401

        client.cookies.set("access_token", token)
        como_cookie = await client.get(ME)
        assert como_cookie.status_code == 401

        client.cookies.clear()
        client.cookies.set("refresh_token", token)
        como_refresh = await client.post("/api/v1/auth/refresh")
        assert como_refresh.status_code == 401
    finally:
        client.cookies.clear()


async def test_escolha_expirada_ou_fora_da_lista_recusada(client, db):
    _, _, admin, medium_user = await _admin_e_medium(db, "dora@example.com")
    terceira = await _conta(db, await create_tenant(db, name="Casa Tres"), "dora@example.com", password=OUTRA)

    resp = await client.post(LOGIN, json={"email": "dora@example.com", "password": SENHA})
    body = resp.json()
    assert {o["user_id"] for o in body["options"]} == {str(admin.id), str(medium_user.id)}  # a terceira não aparece

    fora = await client.post(SELECT, json={"selection_token": body["selection_token"], "user_id": str(terceira.id)})
    assert fora.status_code == 401
    assert fora.json()["detail"]["error_code"] == "SELECTION_INVALID"
    assert _set_cookies(fora) == {}

    expirado = create_account_select_token([admin.id], True, expires_delta=timedelta(seconds=-1))
    velho = await client.post(SELECT, json={"selection_token": expirado, "user_id": str(admin.id)})
    assert velho.status_code == 401
    assert velho.json()["detail"]["error_code"] == "SELECTION_INVALID"

    lixo = await client.post(SELECT, json={"selection_token": "nao-e-um-jwt", "user_id": str(admin.id)})
    assert lixo.status_code == 401


async def test_conta_desativada_depois_do_login_nao_entra_pela_escolha(client, db):
    _, _, admin, medium_user = await _admin_e_medium(db, "eva@example.com")
    body = (await client.post(LOGIN, json={"email": "eva@example.com", "password": SENHA})).json()

    await db.execute(update(User).where(User.id == medium_user.id).values(is_active=False))
    await db.commit()

    resp = await client.post(SELECT, json={"selection_token": body["selection_token"], "user_id": str(medium_user.id)})
    assert resp.status_code == 401
    assert _set_cookies(resp) == {}


async def test_contas_inativas_desativadas_e_excluidas_nunca_sao_oferecidas(client, db):
    email = "fia@example.com"
    agora = datetime.now(timezone.utc)
    ativa_1 = await _conta(db, await create_tenant(db, name="Ativa Um"), email, created_at=agora - timedelta(days=5))
    await _conta(db, await create_tenant(db, name="Usuario Inativo"), email, is_active=False)
    desativado = await create_tenant(db, name="Terreiro Desativado")
    await _conta(db, desativado, email, is_active=False, created_at=agora - timedelta(days=90))
    await _desativa_terreiro(db, desativado)
    await _conta(db, await create_tenant(db, name="Conta Excluida"), email, deleted=True)
    ativa_2 = await _conta(db, await create_tenant(db, name="Ativa Dois"), email, created_at=agora)

    resp = await client.post(LOGIN, json={"email": email, "password": SENHA})

    assert resp.status_code == 200, resp.text
    nomes = [o["terreiro_nome"] for o in resp.json()["options"]]
    assert nomes == ["Ativa Um", "Ativa Dois"]
    assert [o["user_id"] for o in resp.json()["options"]] == [str(ativa_1.id), str(ativa_2.id)]


async def test_uma_conta_ativa_entre_inativas_entra_direto(client, db):
    email = "gil@example.com"
    await _conta(db, await create_tenant(db, name="Inativa"), email, is_active=False)
    await _conta(db, await create_tenant(db, name="Excluida"), email, deleted=True)
    ativa = await _conta(db, await create_tenant(db, name="Ativa"), email)

    resp = await client.post(LOGIN, json={"email": email, "password": SENHA})

    assert resp.status_code == 200, resp.text
    assert resp.json()["user"]["id"] == str(ativa.id)


async def test_esqueci_a_senha_com_duas_contas_um_email_dois_links(client, db, monkeypatch):
    enviado = _captura_emails(monkeypatch)
    _, _, admin, medium_user = await _admin_e_medium(db, "hel@example.com")
    inativa = await _conta(db, await create_tenant(db, name="Casa Inativa"), "hel@example.com", is_active=False)

    resp = await client.post("/api/v1/auth/forgot-password", json={"email": "HEL@example.com"})

    assert resp.status_code == 200, resp.text
    assert resp.json()["message"] == "Se o e-mail estiver cadastrado, você receberá as instruções em breve."
    assert enviado.await_count == 1  # um e-mail só
    msg = enviado.await_args.args[-1]
    assert msg.to_email == "hel@example.com"
    assert "Casa da Ana" in msg.html_body and "Tenda Vizinha" in msg.html_body
    assert "Casa Inativa" not in msg.html_body
    tokens = list(dict.fromkeys(re.findall(r"reset-password\?token=([A-Za-z0-9_\-]+)", msg.html_body)))
    assert len(tokens) == 2
    assert (await _fresh_user(inativa.id)).reset_token_hash is None

    # O 1º link (Casa da Ana, a conta mais antiga) muda só a senha dela.
    nova = "Senha-nova-789!"
    ok = await client.post("/api/v1/auth/reset-password", json={"token": tokens[0], "new_password": nova})
    assert ok.status_code == 200, ok.text
    admin_depois, medium_depois = await _fresh_user(admin.id), await _fresh_user(medium_user.id)
    assert verify_password(nova, admin_depois.password_hash)
    assert verify_password(SENHA, medium_depois.password_hash)
    assert medium_depois.reset_token_hash is not None  # o link da outra conta continua valendo

    # Agora as senhas diferem: cada uma entra direto na sua conta.
    entra_admin = await client.post(LOGIN, json={"email": "hel@example.com", "password": nova})
    assert entra_admin.json()["user"]["id"] == str(admin.id)

    ok2 = await client.post("/api/v1/auth/reset-password", json={"token": tokens[1], "new_password": "Outra-nova-321!"})
    assert ok2.status_code == 200, ok2.text
    assert verify_password("Outra-nova-321!", (await _fresh_user(medium_user.id)).password_hash)
    assert verify_password(nova, (await _fresh_user(admin.id)).password_hash)


async def test_esqueci_a_senha_com_uma_conta_continua_igual(client, db, monkeypatch):
    enviado = _captura_emails(monkeypatch)
    conta = await _conta(db, await create_tenant(db, name="Casa Unica"), "ivo@example.com")

    await client.post("/api/v1/auth/forgot-password", json={"email": "ivo@example.com"})

    msg = enviado.await_args.args[-1]
    assert "mais de um terreiro" not in msg.html_body
    assert len(set(re.findall(r"reset-password\?token=([A-Za-z0-9_\-]+)", msg.html_body))) == 1
    assert (await _fresh_user(conta.id)).reset_token_hash is not None


async def test_custo_de_bcrypt_igual_entre_email_inexistente_e_senha_errada(client, db):
    import src.api.v1.auth.login as login_module

    await _conta(db, await create_tenant(db, name="Casa Jo"), "jo@example.com")
    await _admin_e_medium(db, "duas@example.com")

    async def chamadas(email, senha):
        with patch.object(login_module, "verify_password", wraps=verify_password) as spy:
            resp = await client.post(LOGIN, json={"email": email, "password": senha})
        return resp.status_code, spy.call_count

    assert await chamadas("ninguem@example.com", SENHA) == (401, 1)
    assert await chamadas("jo@example.com", "Errada-123456") == (401, 1)
    # Uma verificação por conta ativa (máx. 5) — documentado em login.MAX_LOGIN_ACCOUNTS.
    assert await chamadas("duas@example.com", "Errada-123456") == (401, 2)


async def test_regra_do_85_sem_conta_ativa_reativa_a_mais_antiga(client, db, monkeypatch):
    monkeypatch.setattr("src.api.v1.auth.deactivation._send_account_reactivated_email", AsyncMock())
    agora = datetime.now(timezone.utc)
    velho, novo = await create_tenant(db, name="Desativado Velho"), await create_tenant(db, name="Desativado Novo")
    conta_velha = await _conta(db, velho, "ka@example.com", is_active=False, created_at=agora - timedelta(days=90))
    await _conta(db, novo, "ka@example.com", is_active=False, created_at=agora)
    await _desativa_terreiro(db, velho)
    await _desativa_terreiro(db, novo)

    resp = await client.post(LOGIN, json={"email": "ka@example.com", "password": SENHA})
    assert resp.status_code == 401
    assert resp.json()["detail"]["error_code"] == "TENANT_DEACTIVATED"

    reativa = await client.post("/api/v1/auth/reactivate-account", json={"email": "ka@example.com", "password": SENHA})
    assert reativa.status_code == 200, reativa.text
    assert reativa.json()["user"]["id"] == str(conta_velha.id)
    await db.refresh(novo)
    assert novo.self_deactivated_at is not None


async def test_regra_do_85_conta_ativa_ganha_de_terreiro_desativado(client, db):
    agora = datetime.now(timezone.utc)
    velho, atual = await create_tenant(db, name="Teste Antigo"), await create_tenant(db, name="Casa Atual")
    await _conta(db, velho, "lu@example.com", is_active=False, created_at=agora - timedelta(days=90))
    await _desativa_terreiro(db, velho)
    ativa = await _conta(db, atual, "lu@example.com", created_at=agora)

    resp = await client.post(LOGIN, json={"email": "lu@example.com", "password": SENHA})

    assert resp.status_code == 200, resp.text
    assert resp.json()["user"]["id"] == str(ativa.id)
    reativa = await client.post("/api/v1/auth/reactivate-account", json={"email": "lu@example.com", "password": SENHA})
    assert reativa.status_code == 409
