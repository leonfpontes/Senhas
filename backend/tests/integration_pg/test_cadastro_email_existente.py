"""Casa nova com e-mail que já tem conta em outro terreiro (decisão do dono, 2026-10-08).

`POST /api/v1/public/onboarding`, ponta a ponta com Postgres real:
- E-mail com conta ATIVA (inclusive médium) + `conta_existente` + senha certa → terreiro novo,
  admin com o MESMO hash de senha; o login passa a perguntar o terreiro (AM-05).
- Sem `conta_existente` → 409 `EMAIL_JA_TEM_CONTA`; senha errada → 400 `SENHA_CONTA_INCORRETA`
  (nunca 401) e nada é criado; 5 contas ativas → 409 `LIMITE_CONTAS_EMAIL`, só depois da senha certa.
- E-mail novo segue igual; o mês grátis não se repete para o mesmo e-mail; maiúsculas não importam.
- Só conta inativa / terreiro desativado → 409 de sempre (o login oferece reativar); só conta
  excluída → cadastro comum.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import func, select, update

from src.models import LegalAcceptance, Medium, Subscription, TrialGrant
from src.models.tenants import Tenant
from src.models.users import User, UserRole
from src.security.password import hash_password

from .factories import create_tenant

URL = "/api/v1/public/onboarding"
LOGIN = "/api/v1/auth/login"
SENHA_NOVA = "Senha-forte-123"
# Senha anterior à regra atual (12+ caracteres, símbolo...): a conta existente pode ter uma assim.
SENHA_ANTIGA = "antiga123"


def _cpf(base9: str) -> str:
    """CPF válido a partir de 9 dígitos (calcula os dois verificadores)."""
    digitos = [int(d) for d in base9]
    for i in (9, 10):
        soma = sum(d * ((i + 1) - n) for n, d in enumerate(digitos[:i]))
        digitos.append(((soma * 10) % 11) % 10)
    return "".join(map(str, digitos))


def _body(email: str, documento: str | None = None, **extra) -> dict:
    return {
        "terreiro_nome": f"Casa Nova {uuid.uuid4().hex[:6]}",
        "responsavel_nome": "Ana de Oxum",
        "email": email,
        "whatsapp": "11999998888",
        "documento": documento or _cpf(str(uuid.uuid4().int)[:9]),
        "password": SENHA_NOVA,
        "como_conheceu": "indicacao",
        "principal_dor": "mediuns",
        "aceite_termos": True,
        **extra,
    }


@pytest.fixture(autouse=True)
def _sem_email(monkeypatch):
    enviado = AsyncMock()
    monkeypatch.setattr("src.api.v1.public.onboarding._send_welcome_email", enviado)
    return enviado


async def _conta(db, tenant, email, *, role=UserRole.ADMIN, password=SENHA_ANTIGA, is_active=True, deleted=False) -> User:
    user = User(
        tenant_id=tenant.id,
        email=email,
        username=f"u-{uuid.uuid4().hex[:8]}",
        password_hash=hash_password(password),
        role=role,
        is_active=is_active,
        full_name="Pessoa de Teste",
        deleted_at=datetime.now(timezone.utc) if deleted else None,
    )
    db.add(user)
    await db.commit()
    return user


async def _medium_em(db, email: str) -> tuple[Tenant, User]:
    casa = await create_tenant(db, name="Tenda da Mata", area_medium_liberada=True)
    user = await _conta(db, casa, email, role=UserRole.MEDIUM)
    db.add(Medium(tenant_id=casa.id, nome="Ana de Oxum", user_id=user.id))
    await db.commit()
    return casa, user


async def _qtd_tenants(db) -> int:
    return (await db.execute(select(func.count()).select_from(Tenant))).scalar_one()


async def _fresh(model, *where):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as s:
        return (await s.execute(select(model).where(*where))).scalars().all()


async def test_medium_abre_a_propria_casa_com_a_senha_da_conta_e_o_login_pergunta_o_terreiro(client, db, _sem_email):
    casa, medium_user = await _medium_em(db, "ana@example.com")

    resp = await client.post(URL, json=_body("Ana@Example.COM", conta_existente=True, password=SENHA_ANTIGA))

    assert resp.status_code == 201, resp.text
    dados = resp.json()
    assert dados["user"]["email"] == "ana@example.com"
    assert dados["user"]["role"] == "admin"
    assert dados["user"]["tenant_id"] != str(casa.id)
    novo = (await _fresh(User, User.id == uuid.UUID(dados["user"]["id"])))[0]
    # Uma senha só para a pessoa: o admin novo nasce com o hash da conta conferida.
    assert novo.password_hash == medium_user.password_hash
    assert novo.role == UserRole.ADMIN
    # Aceite dos termos e e-mail de boas-vindas, como em qualquer cadastro.
    aceites = await _fresh(LegalAcceptance, LegalAcceptance.user_id == novo.id)
    assert {a.document for a in aceites} == {"termos", "privacidade"}
    _sem_email.assert_awaited_once()
    # A conta da outra casa não muda.
    antiga = (await _fresh(User, User.id == medium_user.id))[0]
    assert (antiga.role, antiga.tenant_id, antiga.password_hash) == (UserRole.MEDIUM, casa.id, medium_user.password_hash)

    client.cookies.clear()
    login = await client.post(LOGIN, json={"email": "ana@example.com", "password": SENHA_ANTIGA})
    assert login.status_code == 200, login.text
    corpo = login.json()
    assert corpo["choose_account"] is True
    assert [o["user_id"] for o in corpo["options"]] == [str(medium_user.id), str(novo.id)]
    assert corpo["options"][1]["terreiro_nome"] == dados["tenant"]["name"]


async def test_sem_a_senha_da_conta_existente_responde_409_com_codigo_proprio(client, db):
    await _medium_em(db, "ana@example.com")
    antes = await _qtd_tenants(db)

    resp = await client.post(URL, json=_body("ana@example.com"))

    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert detail["error_code"] == "EMAIL_JA_TEM_CONTA"
    assert "Digite a senha dessa conta" in detail["message"]
    assert await _qtd_tenants(db) == antes


async def test_senha_errada_recusa_sem_401_e_nada_e_criado(client, db):
    await _medium_em(db, "ana@example.com")
    antes = await _qtd_tenants(db)

    resp = await client.post(URL, json=_body("ana@example.com", conta_existente=True, password="Outra-senha-456"))

    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"]["error_code"] == "SENHA_CONTA_INCORRETA"
    assert await _qtd_tenants(db) == antes
    assert len(await _fresh(User, func.lower(User.email) == "ana@example.com")) == 1
    assert "access_token" not in resp.headers.get("set-cookie", "")


async def test_senha_que_confere_em_qualquer_uma_das_contas_basta(client, db):
    casa_a = await create_tenant(db, name="Casa A")
    casa_b = await create_tenant(db, name="Casa B")
    await _conta(db, casa_a, "ana@example.com", password="Senha-da-casa-A1")
    conta_b = await _conta(db, casa_b, "ana@example.com", role=UserRole.OPERATOR, password=SENHA_ANTIGA)

    resp = await client.post(URL, json=_body("ana@example.com", conta_existente=True, password=SENHA_ANTIGA))

    assert resp.status_code == 201, resp.text
    novo = (await _fresh(User, User.id == uuid.UUID(resp.json()["user"]["id"])))[0]
    assert novo.password_hash == conta_b.password_hash


async def test_cinco_contas_ativas_e_o_limite_mas_so_depois_da_senha_certa(client, db):
    for i in range(5):
        casa = await create_tenant(db, name=f"Casa {i}")
        await _conta(db, casa, "ana@example.com")
    antes = await _qtd_tenants(db)

    errada = await client.post(URL, json=_body("ana@example.com", conta_existente=True, password="Outra-senha-456"))
    assert errada.status_code == 400, errada.text
    assert errada.json()["detail"]["error_code"] == "SENHA_CONTA_INCORRETA"

    certa = await client.post(URL, json=_body("ana@example.com", conta_existente=True, password=SENHA_ANTIGA))
    assert certa.status_code == 409, certa.text
    assert certa.json()["detail"]["error_code"] == "LIMITE_CONTAS_EMAIL"
    assert "5 terreiros" in certa.json()["detail"]["message"]
    assert await _qtd_tenants(db) == antes


async def test_conta_inativa_ou_terreiro_desativado_nao_conta_para_o_limite(client, db):
    for i in range(4):
        casa = await create_tenant(db, name=f"Casa {i}")
        await _conta(db, casa, "ana@example.com")
    inativa = await create_tenant(db, name="Casa Inativa")
    await _conta(db, inativa, "ana@example.com", is_active=False)

    resp = await client.post(URL, json=_body("ana@example.com", conta_existente=True, password=SENHA_ANTIGA))

    assert resp.status_code == 201, resp.text  # 4 ativas + 1 inativa: a 5ª ativa ainda cabe


async def test_email_novo_segue_igual_com_ou_sem_a_marca(client, db):
    comum = await client.post(URL, json=_body("Nova@Example.com"))
    assert comum.status_code == 201, comum.text
    assert comum.json()["user"]["email"] == "nova@example.com"

    # Marca ligada (ex.: trocou o e-mail depois do aviso) com e-mail sem conta: cadastro comum,
    # com a regra de senha nova — 422 no campo da senha, como o validador.
    fraca = await client.post(URL, json=_body("outra@example.com", conta_existente=True, password=SENHA_ANTIGA))
    assert fraca.status_code == 422, fraca.text
    assert fraca.json()["details"][0]["loc"] == ["body", "password"]
    assert "política de segurança" in fraca.json()["details"][0]["msg"]

    forte = await client.post(URL, json=_body("outra@example.com", conta_existente=True))
    assert forte.status_code == 201, forte.text


async def test_mes_gratis_nao_se_repete_para_o_mesmo_email(client, db):
    await _medium_em(db, "ana@example.com")

    primeira = await client.post(
        URL, json=_body("ana@example.com", _cpf("123456789"), conta_existente=True, password=SENHA_ANTIGA)
    )
    assert primeira.status_code == 201, primeira.text
    segunda = await client.post(
        URL, json=_body("ANA@example.com", _cpf("987654321"), conta_existente=True, password=SENHA_ANTIGA)
    )
    assert segunda.status_code == 201, segunda.text

    async def _sub(resp) -> Subscription:
        tid = uuid.UUID(resp.json()["tenant"]["id"])
        return (await _fresh(Subscription, Subscription.tenant_id == tid))[0]

    assert (await _sub(primeira)).is_trial is True  # o médium nunca tinha ganhado o mês grátis
    assert (await _sub(segunda)).is_trial is False  # mesmo e-mail, documento diferente: não ganha de novo
    assert len(await _fresh(TrialGrant, TrialGrant.email == "ana@example.com")) == 1


async def test_so_conta_inativa_ou_terreiro_desativado_mantem_o_409_de_sempre(client, db):
    desativado = await create_tenant(db, name="Casa Fechada")
    await _conta(db, desativado, "fechada@example.com")
    agora = datetime.now(timezone.utc)
    await db.execute(
        update(Tenant)
        .where(Tenant.id == desativado.id)
        .values(is_active=False, deleted_at=agora, self_deactivated_at=agora)
    )
    await db.commit()
    suspensa = await create_tenant(db, name="Casa Suspensa")
    await _conta(db, suspensa, "suspensa@example.com", is_active=False)

    for email in ("fechada@example.com", "suspensa@example.com"):
        for extra in ({}, {"conta_existente": True, "password": SENHA_ANTIGA}):
            resp = await client.post(URL, json=_body(email, **extra))
            assert resp.status_code == 409, (email, extra, resp.text)
            assert resp.json()["detail"] == "Este email já está cadastrado"

    # O login continua oferecendo reativar o terreiro desativado pelo dono.
    login = await client.post(LOGIN, json={"email": "fechada@example.com", "password": SENHA_ANTIGA})
    assert login.status_code == 401
    assert login.json()["detail"]["error_code"] == "TENANT_DEACTIVATED"


async def test_so_conta_excluida_nao_barra_o_cadastro(client, db):
    casa = await create_tenant(db, name="Casa Antiga")
    await _conta(db, casa, "excluida@example.com", deleted=True)

    resp = await client.post(URL, json=_body("excluida@example.com"))

    assert resp.status_code == 201, resp.text
