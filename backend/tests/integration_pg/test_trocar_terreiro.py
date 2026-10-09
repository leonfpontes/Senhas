"""Trocar de terreiro sem sair (pedido do dono, 2026-10-09), ponta a ponta com Postgres real.

- Contas cuja senha conferiu no login → troca direta, sem senha, e de volta.
- Conta com outra senha → `precisa_senha`; sem senha / senha errada → 400 (nunca 401) e a
  sessão continua a mesma; senha certa → entra e a conta passa a ser "conferida".
- Destino de outro e-mail, conta inativa/excluída, terreiro desativado → fora da lista e 404.
- Impersonação → lista vazia e troca 403.
- Sessão antiga encerrada (o refresh token velho não vale), cookies da conta nova, e as
  requisições seguintes usam o tenant novo.
- Senha trocada depois do login → aquela conta volta a pedir senha.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from src.models import Medium
from src.models.tenants import Tenant
from src.models.user_sessions import UserSession
from src.models.users import User, UserRole
from src.security.jwt import create_access_token
from src.security.password import hash_password

from .factories import create_gira, create_tenant

SENHA = "Senha-forte-123"
OUTRA = "Outra-senha-456"
LOGIN = "/api/v1/auth/login"
SELECT = "/api/v1/auth/login/select"
CONTAS = "/api/v1/auth/minhas-contas"
TROCAR = "/api/v1/auth/trocar-terreiro"
ME = "/api/v1/auth/me"


def _set_cookies(resp) -> dict[str, str]:
    return {raw.split("=", 1)[0]: raw for raw in resp.headers.get_list("set-cookie")}


async def _conta(db, tenant, email, *, role=UserRole.ADMIN, password=SENHA, created_at=None, is_active=True) -> User:
    user = User(
        tenant_id=tenant.id if tenant is not None else None,
        email=email,
        username=f"u-{uuid.uuid4().hex[:8]}",
        password_hash=hash_password(password),
        role=role,
        is_active=is_active,
        full_name="Pessoa de Teste",
    )
    if created_at is not None:
        user.created_at = created_at
    db.add(user)
    await db.commit()
    return user


async def _tres_contas(db, email):
    """A (admin, mais antiga) e B (médium) com a mesma senha; C (admin) com outra senha."""
    agora = datetime.now(timezone.utc)
    ta = await create_tenant(db, name="Casa A", area_medium_liberada=True)
    tb = await create_tenant(db, name="Casa B", area_medium_liberada=True)
    tc = await create_tenant(db, name="Casa C")
    a = await _conta(db, ta, email, created_at=agora - timedelta(days=30))
    b = await _conta(db, tb, email, role=UserRole.MEDIUM, created_at=agora - timedelta(days=20))
    db.add(Medium(tenant_id=tb.id, nome="Ana de Oxum", user_id=b.id))
    await db.commit()
    c = await _conta(db, tc, email, password=OUTRA, created_at=agora - timedelta(days=10))
    return (ta, a), (tb, b), (tc, c)


async def _entra(client, email, password, escolher=None) -> dict:
    resp = await client.post(LOGIN, json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    if body.get("choose_account"):
        resp = await client.post(SELECT, json={"selection_token": body["selection_token"], "user_id": str(escolher)})
        assert resp.status_code == 200, resp.text
        body = resp.json()
    return body


async def _sessoes(user_id) -> list[UserSession]:
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return list((await fresh.execute(select(UserSession).where(UserSession.user_id == user_id))).scalars().all())


async def test_lista_marca_quem_precisa_de_senha_e_troca_direta_vai_e_volta(client, db):
    (ta, a), (tb, b), (tc, c) = await _tres_contas(db, "ana@example.com")
    await _entra(client, "ana@example.com", SENHA, escolher=a.id)

    resp = await client.get(CONTAS)
    assert resp.status_code == 200, resp.text
    contas = {x["conta_id"]: x for x in resp.json()}
    assert list(contas) == [str(b.id), str(c.id)]  # sem a atual, mais antigas primeiro
    assert contas[str(b.id)] == {
        "conta_id": str(b.id), "terreiro": "Casa B", "logo_url": None, "area": "medium", "precisa_senha": False,
    }
    assert contas[str(c.id)]["terreiro"] == "Casa C"
    assert contas[str(c.id)]["area"] == "painel"
    assert contas[str(c.id)]["precisa_senha"] is True

    troca = await client.post(TROCAR, json={"conta_id": str(b.id)})
    assert troca.status_code == 200, troca.text
    dados = troca.json()
    assert dados["user"]["id"] == str(b.id)
    assert dados["user"]["tenant_id"] == str(tb.id)
    assert dados["areas"]["admin"] is False
    assert dados["areas"]["medium"]["nome"] == "Ana de Oxum"
    assert set(_set_cookies(troca)) >= {"access_token", "refresh_token", "auth_state"}
    me = await client.get(ME)
    assert me.json()["id"] == str(b.id)

    # Na sessão nova, A continua conferida: volta sem senha.
    de_volta = {x["conta_id"]: x for x in (await client.get(CONTAS)).json()}
    assert de_volta[str(a.id)]["precisa_senha"] is False
    assert de_volta[str(c.id)]["precisa_senha"] is True
    volta = await client.post(TROCAR, json={"conta_id": str(a.id)})
    assert volta.status_code == 200, volta.text
    assert (await client.get(ME)).json()["id"] == str(a.id)


async def test_conta_com_outra_senha_pede_senha_e_senha_errada_nao_mexe_na_sessao(client, db):
    (ta, a), _, (tc, c) = await _tres_contas(db, "bia@example.com")
    await _entra(client, "bia@example.com", SENHA, escolher=a.id)
    sessoes_antes = await _sessoes(a.id)
    assert len(sessoes_antes) == 1

    sem = await client.post(TROCAR, json={"conta_id": str(c.id)})
    assert sem.status_code == 400
    assert sem.json()["detail"]["error_code"] == "SENHA_OBRIGATORIA"

    errada = await client.post(TROCAR, json={"conta_id": str(c.id), "senha": SENHA})
    assert errada.status_code == 400
    assert errada.json()["detail"]["error_code"] == "SENHA_INCORRETA"
    assert _set_cookies(errada) == {}
    assert [s.id for s in await _sessoes(a.id)] == [sessoes_antes[0].id]
    assert (await client.get(ME)).json()["id"] == str(a.id)

    certa = await client.post(TROCAR, json={"conta_id": str(c.id), "senha": OUTRA})
    assert certa.status_code == 200, certa.text
    assert (await client.get(ME)).json()["id"] == str(c.id)
    assert await _sessoes(a.id) == []  # sessão de A encerrada

    # Agora C foi conferida nesta sessão, e A/B (conferidas no login) continuam sem senha.
    contas = {x["conta_id"]: x for x in (await client.get(CONTAS)).json()}
    assert all(not x["precisa_senha"] for x in contas.values())
    assert str(a.id) in contas


async def test_login_numa_conta_so_nao_confere_as_outras(client, db):
    email = "cris@example.com"
    t1, t2 = await create_tenant(db, name="Casa Um"), await create_tenant(db, name="Casa Dois")
    um = await _conta(db, t1, email)
    dois = await _conta(db, t2, email, password=OUTRA)
    await _entra(client, email, SENHA)  # confere só em "um"

    contas = (await client.get(CONTAS)).json()
    assert [(x["conta_id"], x["precisa_senha"]) for x in contas] == [(str(dois.id), True)]
    resp = await client.post(TROCAR, json={"conta_id": str(dois.id)})
    assert resp.status_code == 400
    assert (await client.get(ME)).json()["id"] == str(um.id)


async def test_sessao_antiga_encerrada_e_tenant_novo_nas_requisicoes(client, db):
    (ta, a), _, _ = await _tres_contas(db, "dora@example.com")
    td = await create_tenant(db, name="Casa D")
    d = await _conta(db, td, "dora@example.com")
    await create_gira(db, ta, nome="Gira da Casa A")
    await create_gira(db, td, nome="Gira da Casa D")
    await _entra(client, "dora@example.com", SENHA, escolher=a.id)

    giras_a = await client.get("/api/v1/admin/giras")
    assert giras_a.status_code == 200, giras_a.text
    assert "Gira da Casa A" in giras_a.text and "Gira da Casa D" not in giras_a.text
    refresh_antigo = client.cookies.get("refresh_token")

    troca = await client.post(TROCAR, json={"conta_id": str(d.id)})
    assert troca.status_code == 200, troca.text
    assert (await client.get(ME)).json()["tenant_id"] == str(td.id)
    giras_d = await client.get("/api/v1/admin/giras")
    assert "Gira da Casa D" in giras_d.text and "Gira da Casa A" not in giras_d.text

    # O refresh token da sessão de A não vale mais.
    refresh_novo = client.cookies.get("refresh_token")
    client.cookies.clear()
    try:
        client.cookies.set("refresh_token", refresh_antigo)
        velho = await client.post("/api/v1/auth/refresh")
        assert velho.status_code == 401
    finally:
        client.cookies.clear()
        client.cookies.set("refresh_token", refresh_novo)
    novo = await client.post("/api/v1/auth/refresh")
    assert novo.status_code == 200, novo.text


async def test_outro_email_inativa_excluida_e_terreiro_desativado_ficam_de_fora(client, db):
    email = "eva@example.com"
    agora = datetime.now(timezone.utc)
    atual = await _conta(db, await create_tenant(db, name="Atual"), email, created_at=agora - timedelta(days=9))
    outro_email = await _conta(db, await create_tenant(db, name="Outro Email"), "outra@example.com")
    inativa = await _conta(db, await create_tenant(db, name="Inativa"), email, is_active=False)
    excluida = await _conta(db, await create_tenant(db, name="Excluida"), email)
    await db.execute(update(User).where(User.id == excluida.id).values(deleted_at=agora))
    desativado = await create_tenant(db, name="Desativado")
    da_desativada = await _conta(db, desativado, email)
    await db.execute(
        update(Tenant).where(Tenant.id == desativado.id).values(is_active=False, deleted_at=agora, self_deactivated_at=agora)
    )
    await db.commit()
    plataforma = await _conta(db, None, email, role=UserRole.SUPER_ADMIN)
    await _entra(client, email, SENHA, escolher=atual.id)

    assert (await client.get(CONTAS)).json() == []
    for alvo in (outro_email, inativa, excluida, da_desativada, plataforma, atual):
        resp = await client.post(TROCAR, json={"conta_id": str(alvo.id), "senha": SENHA})
        assert resp.status_code == 404, (alvo.id, resp.text)
    assert (await client.get(ME)).json()["id"] == str(atual.id)


async def test_conta_desativada_depois_do_login_sai_da_lista(client, db):
    (ta, a), (tb, b), _ = await _tres_contas(db, "fia@example.com")
    await _entra(client, "fia@example.com", SENHA, escolher=a.id)
    await db.execute(update(User).where(User.id == b.id).values(is_active=False))
    await db.commit()

    assert str(b.id) not in {x["conta_id"] for x in (await client.get(CONTAS)).json()}
    assert (await client.post(TROCAR, json={"conta_id": str(b.id)})).status_code == 404


async def test_senha_trocada_depois_do_login_volta_a_pedir_senha(client, db):
    (ta, a), (tb, b), _ = await _tres_contas(db, "gil@example.com")
    await _entra(client, "gil@example.com", SENHA, escolher=a.id)
    await db.execute(
        update(User).where(User.id == b.id).values(sessions_revoked_at=datetime.now(timezone.utc) + timedelta(seconds=1))
    )
    await db.commit()

    contas = {x["conta_id"]: x for x in (await client.get(CONTAS)).json()}
    assert contas[str(b.id)]["precisa_senha"] is True
    assert (await client.post(TROCAR, json={"conta_id": str(b.id)})).status_code == 400


async def test_impersonacao_lista_vazia_e_troca_403(client, db):
    (ta, a), (tb, b), _ = await _tres_contas(db, "hel@example.com")
    token = create_access_token(a.id, ta.id, "admin", impersonated_by=uuid.uuid4())
    headers = {"Authorization": f"Bearer {token}"}

    lista = await client.get(CONTAS, headers=headers)
    assert lista.status_code == 200
    assert lista.json() == []
    troca = await client.post(TROCAR, json={"conta_id": str(b.id)}, headers=headers)
    assert troca.status_code == 403
    assert _set_cookies(troca) == {}


async def test_sem_sessao_rastreada_tudo_pede_senha(client, db):
    """Access token sem refresh (ou sessão de antes da migração 093): nada conferido."""
    (ta, a), (tb, b), _ = await _tres_contas(db, "ivo@example.com")
    token = create_access_token(a.id, ta.id, "admin")
    headers = {"Authorization": f"Bearer {token}"}

    contas = (await client.get(CONTAS, headers=headers)).json()
    assert all(x["precisa_senha"] for x in contas)
    ok = await client.post(TROCAR, json={"conta_id": str(b.id), "senha": SENHA}, headers=headers)
    assert ok.status_code == 200, ok.text
    assert ok.json()["user"]["id"] == str(b.id)


async def test_sem_login_401_e_rate_limit_registrado(client, db):
    client.cookies.clear()
    assert (await client.get(CONTAS)).status_code == 401
    assert (await client.post(TROCAR, json={"conta_id": str(uuid.uuid4())})).status_code == 401

    from src.core.limiter import limiter

    limites = [str(lim.limit) for lim in limiter._route_limits.get("src.api.v1.auth.trocar_terreiro.trocar_terreiro", [])]
    assert limites == ["10 per 1 minute"]
