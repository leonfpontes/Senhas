"""AM-13 — Perfil do médium, com Postgres real (migrações + app via HTTP).

- Leitura: só a lista fechada (dados da casa travados + o que o médium edita + e-mail de login),
  sem `observacoes`, `data_saida` nem nada interno;
- edição de telefone, endereço e nascimento (formato do painel: só dígitos), campos da casa
  recusados (422) sem mudar nada, auditoria do terreiro com a frase e sem os valores;
- foto da conta (regras do perfil do painel);
- troca de e-mail: pedido (senha atual) → pendente (e-mail não muda) → confirmação pelo link →
  login com o novo; link reutilizado e vencido recusados; e-mail de outra conta do terreiro
  recusado (no pedido e na confirmação); outro terreiro pode usar o mesmo e-mail; aviso ao antigo;
- troca de senha derruba as sessões; impersonação vê mas não escreve; isolamento entre terreiros;
  chave do piloto desligada → 403.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select, update

from src.models import Medium
from src.models.audit_logs import AuditLog
from src.models.subscriptions import PlanType
from src.models.users import User, UserRole
from src.security.jwt import create_access_token
from src.security.password import hash_password

from .factories import Actor, create_tenant

SENHA = "Senha-forte-123"
NOVA_SENHA = "Outra-senha-456"
PERFIL = "/api/v1/medium/perfil"
FOTO = f"{PERFIL}/foto"
SENHA_URL = f"{PERFIL}/senha"
EMAIL_URL = f"{PERFIL}/email"
CONFIRMAR = "/api/v1/public/email/confirmar"
LOGIN = "/api/v1/auth/login"

JPEG = b"\xff\xd8\xff\xe0" + b"foto-de-teste" * 20

CAMPOS_DA_RESPOSTA = {
    "casa", "telefone", "data_nascimento", "cep", "logradouro", "numero", "bairro", "cidade",
    "foto_url", "email", "email_pendente", "email_pendente_expira_em", "mostrar_aniversario",
}


@pytest.fixture
def emails(monkeypatch):
    """Captura os e-mails enfileirados (a fila não roda nos testes)."""
    from src.services.email.email_queue import email_queue

    enviados = []
    monkeypatch.setattr(email_queue, "enqueue", lambda item: enviados.append(item.message))
    return enviados


@pytest.fixture(autouse=True)
def _sem_cookies(client):
    client.cookies.clear()
    yield
    client.cookies.clear()


async def _cenario(db, *, liberada=True, nome="Casa Perfil", email=None, role=UserRole.MEDIUM):
    tenant = await create_tenant(db, name=nome, plan=PlanType.BASIC, area_medium_liberada=liberada)
    email = email or f"ana-{uuid.uuid4().hex[:6]}@example.com"
    user = User(
        tenant_id=tenant.id,
        email=email,
        username=f"ana-{uuid.uuid4().hex[:6]}",
        password_hash=hash_password(SENHA),
        role=role,
        is_active=True,
        full_name="Ana Paula Ribeiro",
    )
    db.add(user)
    await db.flush()
    medium = Medium(
        tenant_id=tenant.id,
        nome="Ana Paula Ribeiro",
        user_id=user.id,
        email=email,
        telefone="11987654321",
        is_atendimento=False,
        mensalidade_isento=True,
        data_entrada=date(2019, 3, 10),
        data_saida=date(2030, 1, 1),
        observacoes="anotação interna da secretaria",
        cidade="São Paulo",
    )
    db.add(medium)
    await db.commit()
    token = create_access_token(user.id, tenant.id, user.role.value)
    return tenant, Actor(user=user, headers={"Authorization": f"Bearer {token}"}), medium


async def _fresh(model, obj_id):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(select(model).where(model.id == obj_id))).scalar_one()


async def _auditoria(tenant_id):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        rows = await fresh.execute(
            select(AuditLog)
            .where(AuditLog.tenant_id == tenant_id, AuditLog.resource_type == "medium_perfil")
            .order_by(AuditLog.created_at)
        )
        return list(rows.scalars())


def _token_do_link(msg) -> str:
    texto = msg.text_body
    return texto.split("/confirmar-email/", 1)[1].split()[0]


# ── Leitura ─────────────────────────────────────────────────────────────────


async def test_perfil_le_a_lista_fechada_sem_campos_internos(client, db):
    tenant, actor, medium = await _cenario(db)

    resp = await client.get(PERFIL, headers=actor.headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert set(body) == CAMPOS_DA_RESPOSTA
    assert body["casa"] == {
        "nome": "Ana Paula Ribeiro",
        "data_entrada": "2019-03-10",
        "tipo": "cambone",
        "isento_mensalidade": True,
    }
    assert body["telefone"] == "11987654321" and body["cidade"] == "São Paulo"
    assert body["email"] == actor.user.email and body["email_pendente"] is None
    assert "observacoes" not in resp.text and "anotação interna" not in resp.text
    assert "data_saida" not in resp.text and "2030-01-01" not in resp.text


# ── Edição ──────────────────────────────────────────────────────────────────


async def test_medium_edita_contato_endereco_e_nascimento_com_auditoria_sem_valores(client, db):
    tenant, actor, medium = await _cenario(db)

    resp = await client.patch(
        PERFIL,
        headers=actor.headers,
        json={
            "telefone": "(21) 99876-5432",
            "cep": "01310-100",
            "logradouro": "  Avenida   Paulista ",
            "numero": "1000",
            "bairro": "Bela Vista",
            "cidade": "São Paulo",
            "data_nascimento": "1985-04-20",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["telefone"] == "21998765432" and body["cep"] == "01310100"
    assert body["logradouro"] == "Avenida Paulista" and body["data_nascimento"] == "1985-04-20"

    salvo = await _fresh(Medium, medium.id)
    assert (salvo.telefone, salvo.cep, salvo.numero, salvo.bairro) == ("21998765432", "01310100", "1000", "Bela Vista")
    assert salvo.data_nascimento == date(1985, 4, 20)
    # Campos da casa intactos.
    assert (salvo.nome, salvo.is_atendimento, salvo.mensalidade_isento) == ("Ana Paula Ribeiro", False, True)

    logs = await _auditoria(tenant.id)
    assert len(logs) == 1
    novo = logs[0].details["new_state"]
    assert novo["acao"] == "médium atualizou o telefone, a data de nascimento e o endereço"
    assert novo["campos"] == ["telefone", "data_nascimento", "cep", "logradouro", "numero", "bairro"]
    assert logs[0].user_id == actor.user.id and logs[0].resource_id == medium.id
    texto = str(logs[0].details)
    for valor in ("21998765432", "01310100", "Paulista", "1985", "Bela Vista"):
        assert valor not in texto

    # Sem mudança → sem auditoria nova.
    resp = await client.patch(PERFIL, headers=actor.headers, json={"telefone": "21998765432"})
    assert resp.status_code == 200
    assert len(await _auditoria(tenant.id)) == 1

    # Limpar o telefone também vale.
    resp = await client.patch(PERFIL, headers=actor.headers, json={"telefone": ""})
    assert resp.status_code == 200 and resp.json()["telefone"] is None
    assert (await _auditoria(tenant.id))[-1].details["new_state"]["acao"] == "médium atualizou o telefone"


@pytest.mark.parametrize(
    "corpo",
    [
        {"nome": "Outro Nome"},
        {"data_entrada": "2000-01-01"},
        {"is_atendimento": True},
        {"mensalidade_isento": False},
        {"observacoes": "x"},
        {"telefone": "11911112222", "tipo": "atendimento"},
    ],
)
async def test_campos_da_casa_sao_recusados_sem_mudar_nada(client, db, corpo):
    tenant, actor, medium = await _cenario(db)
    resp = await client.patch(PERFIL, headers=actor.headers, json=corpo)
    assert resp.status_code == 422, resp.text
    salvo = await _fresh(Medium, medium.id)
    assert (salvo.nome, salvo.data_entrada, salvo.is_atendimento, salvo.mensalidade_isento, salvo.telefone) == (
        "Ana Paula Ribeiro", date(2019, 3, 10), False, True, "11987654321",
    )
    assert await _auditoria(tenant.id) == []


async def test_valor_invalido_volta_mensagem_clara(client, db):
    _, actor, _ = await _cenario(db)
    resp = await client.patch(PERFIL, headers=actor.headers, json={"cep": "123"})
    assert resp.status_code == 422
    assert resp.json()["message"] == "CEP deve ter 8 dígitos"
    futuro = (date.today() + timedelta(days=5)).isoformat()
    resp = await client.patch(PERFIL, headers=actor.headers, json={"data_nascimento": futuro})
    assert resp.status_code == 422 and "futuro" in resp.json()["message"]


async def test_foto_da_conta(client, db):
    tenant, actor, medium = await _cenario(db)
    resp = await client.post(FOTO, headers=actor.headers, files={"file": ("eu.jpg", JPEG, "image/jpeg")})
    assert resp.status_code == 200, resp.text
    assert resp.json()["foto_url"].endswith(f"/api/v1/public/user/{actor.user.id}/photo")
    assert (await _fresh(User, actor.user.id)).profile_photo_data == JPEG
    assert (await _auditoria(tenant.id))[-1].details["new_state"]["acao"] == "médium atualizou a foto"

    resp = await client.post(FOTO, headers=actor.headers, files={"file": ("x.gif", b"GIF89a", "image/gif")})
    assert resp.status_code == 422

    perfil = (await client.get(PERFIL, headers=actor.headers)).json()
    assert perfil["foto_url"].endswith("/photo")


# ── Impersonação ────────────────────────────────────────────────────────────


async def test_impersonacao_ve_mas_nao_escreve(client, db, emails):
    tenant, actor, medium = await _cenario(db)
    token = create_access_token(actor.user.id, tenant.id, "medium", impersonated_by=uuid.uuid4())
    h = {"Authorization": f"Bearer {token}"}

    assert (await client.get(PERFIL, headers=h)).status_code == 200
    assert (await client.patch(PERFIL, headers=h, json={"telefone": "11900001111"})).status_code == 403
    assert (await client.post(FOTO, headers=h, files={"file": ("eu.jpg", JPEG, "image/jpeg")})).status_code == 403
    assert (
        await client.post(SENHA_URL, headers=h, json={"senha_atual": SENHA, "nova_senha": NOVA_SENHA})
    ).status_code == 403
    assert (
        await client.post(EMAIL_URL, headers=h, json={"novo_email": "nova@example.com", "senha_atual": SENHA})
    ).status_code == 403
    assert (await client.delete(EMAIL_URL, headers=h)).status_code == 403

    salvo = await _fresh(Medium, medium.id)
    assert salvo.telefone == "11987654321"
    assert (await _fresh(User, actor.user.id)).email_pendente is None
    assert emails == []
    assert await _auditoria(tenant.id) == []


# ── Troca de e-mail ─────────────────────────────────────────────────────────


async def test_troca_de_email_pendente_confirmada_e_login_com_o_novo(client, db, emails):
    tenant, actor, medium = await _cenario(db, nome="Casa Luz")
    antigo = actor.user.email

    errada = await client.post(EMAIL_URL, headers=actor.headers, json={"novo_email": "nova@example.com", "senha_atual": "errada"})
    assert errada.status_code == 400 and errada.json()["error_code"] == "SENHA_INCORRETA"
    mesmo = await client.post(EMAIL_URL, headers=actor.headers, json={"novo_email": antigo.upper(), "senha_atual": SENHA})
    assert mesmo.status_code == 400 and mesmo.json()["error_code"] == "MESMO_EMAIL"
    assert emails == []

    resp = await client.post(EMAIL_URL, headers=actor.headers, json={"novo_email": "Nova.Ana@Example.com", "senha_atual": SENHA})
    assert resp.status_code == 200, resp.text
    assert resp.json()["message"] == "Enviamos um link para o novo e-mail. O e-mail só muda depois que você confirmar."
    assert resp.json()["email_pendente"] == "nova.ana@example.com"

    # Pendente: o e-mail de login ainda é o antigo.
    salvo = await _fresh(User, actor.user.id)
    assert salvo.email == antigo and salvo.email_pendente == "nova.ana@example.com"
    perfil = (await client.get(PERFIL, headers=actor.headers)).json()
    assert perfil["email"] == antigo and perfil["email_pendente"] == "nova.ana@example.com"

    assert len(emails) == 1
    msg = emails[0]
    assert msg.to_email == "nova.ana@example.com"
    assert msg.subject == "Confirme seu novo e-mail de acesso de Casa Luz"
    token = _token_do_link(msg)
    assert salvo.email_pendente_token_hash != token  # só o hash no banco

    # Antes de confirmar, o login com o novo não existe.
    assert (await client.post(LOGIN, json={"email": "nova.ana@example.com", "password": SENHA})).status_code == 401

    resp = await client.post(CONFIRMAR, json={"token": token})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"email": "nova.ana@example.com", "terreiro_nome": "Casa Luz"}

    salvo = await _fresh(User, actor.user.id)
    assert salvo.email == "nova.ana@example.com"
    assert (salvo.email_pendente, salvo.email_pendente_token_hash, salvo.email_pendente_expira_em) == (None, None, None)
    assert (await _fresh(Medium, medium.id)).email == "nova.ana@example.com"

    # O endereço antigo é avisado (com o novo mascarado).
    assert len(emails) == 2
    aviso = emails[1]
    assert aviso.to_email == antigo
    assert "nova.ana@example.com" not in aviso.text_body and "@example.com" in aviso.text_body

    # Login com o novo funciona; com o antigo, não.
    client.cookies.clear()
    novo_login = await client.post(LOGIN, json={"email": "nova.ana@example.com", "password": SENHA})
    assert novo_login.status_code == 200, novo_login.text
    client.cookies.clear()
    assert (await client.post(LOGIN, json={"email": antigo, "password": SENHA})).status_code == 401

    # O link é de uso único.
    reuso = await client.post(CONFIRMAR, json={"token": token})
    assert reuso.status_code == 404 and reuso.json()["detail"]["error_code"] == "LINK_INVALIDO"

    acoes = [log.details["new_state"]["acao"] for log in await _auditoria(tenant.id)]
    assert acoes == ["médium pediu a troca do e-mail de login", "médium confirmou o novo e-mail de login"]
    for log in await _auditoria(tenant.id):
        assert "example.com" not in str(log.details)


async def test_link_vencido_e_novo_pedido_invalidam_o_anterior(client, db, emails):
    _, actor, _ = await _cenario(db)
    r1 = await client.post(EMAIL_URL, headers=actor.headers, json={"novo_email": "um@example.com", "senha_atual": SENHA})
    assert r1.status_code == 200
    r2 = await client.post(EMAIL_URL, headers=actor.headers, json={"novo_email": "dois@example.com", "senha_atual": SENHA})
    assert r2.status_code == 200
    primeiro, segundo = _token_do_link(emails[0]), _token_do_link(emails[1])

    # O link do primeiro pedido não vale mais.
    assert (await client.post(CONFIRMAR, json={"token": primeiro})).status_code == 404

    # Vencido (24 h) → mesma resposta genérica; o e-mail não muda.
    await db.execute(
        update(User)
        .where(User.id == actor.user.id)
        .values(email_pendente_expira_em=datetime.now(timezone.utc) - timedelta(minutes=1))
    )
    await db.commit()
    resp = await client.post(CONFIRMAR, json={"token": segundo})
    assert resp.status_code == 404 and resp.json()["detail"]["error_code"] == "LINK_INVALIDO"
    assert (await _fresh(User, actor.user.id)).email == actor.user.email
    assert (await client.get(PERFIL, headers=actor.headers)).json()["email_pendente"] is None

    assert (await client.post(CONFIRMAR, json={"token": "token-que-nao-existe"})).status_code == 404


async def test_desistir_da_troca_invalida_o_link(client, db, emails):
    _, actor, _ = await _cenario(db)
    assert (
        await client.post(EMAIL_URL, headers=actor.headers, json={"novo_email": "um@example.com", "senha_atual": SENHA})
    ).status_code == 200
    assert (await client.delete(EMAIL_URL, headers=actor.headers)).status_code == 204
    assert (await client.post(CONFIRMAR, json={"token": _token_do_link(emails[0])})).status_code == 404


async def test_email_de_outra_conta_do_terreiro_e_recusado(client, db, emails):
    tenant, actor, _ = await _cenario(db)
    outra = User(
        tenant_id=tenant.id, email="ocupado@example.com", username=f"o-{uuid.uuid4().hex[:6]}",
        password_hash="x" * 60, role=UserRole.OPERATOR, is_active=True,
    )
    excluida = User(
        tenant_id=tenant.id, email="excluida@example.com", username=f"e-{uuid.uuid4().hex[:6]}",
        password_hash="x" * 60, role=UserRole.OPERATOR, is_active=False,
        deleted_at=datetime.now(timezone.utc),
    )
    db.add_all([outra, excluida])
    await db.commit()

    for email in ("Ocupado@Example.com", "excluida@example.com"):
        resp = await client.post(EMAIL_URL, headers=actor.headers, json={"novo_email": email, "senha_atual": SENHA})
        assert resp.status_code == 409 and resp.json()["error_code"] == "EMAIL_EM_USO", resp.text
    assert emails == []

    # Ficou livre no pedido mas outra conta pegou antes do clique → 409 na confirmação.
    resp = await client.post(EMAIL_URL, headers=actor.headers, json={"novo_email": "livre@example.com", "senha_atual": SENHA})
    assert resp.status_code == 200
    db.add(User(
        tenant_id=tenant.id, email="livre@example.com", username=f"l-{uuid.uuid4().hex[:6]}",
        password_hash="x" * 60, role=UserRole.OPERATOR, is_active=True,
    ))
    await db.commit()
    resp = await client.post(CONFIRMAR, json={"token": _token_do_link(emails[0])})
    assert resp.status_code == 409 and resp.json()["detail"]["error_code"] == "EMAIL_EM_USO"
    assert (await _fresh(User, actor.user.id)).email == actor.user.email


async def test_mesmo_email_em_outro_terreiro_pode(client, db, emails):
    outro_tenant, outro, _ = await _cenario(db, nome="Outra Casa", email="compartilhado@example.com")
    _, actor, _ = await _cenario(db, nome="Casa Perfil")
    resp = await client.post(
        EMAIL_URL, headers=actor.headers, json={"novo_email": "compartilhado@example.com", "senha_atual": SENHA}
    )
    assert resp.status_code == 200, resp.text
    assert (await client.post(CONFIRMAR, json={"token": _token_do_link(emails[0])})).status_code == 200
    assert (await _fresh(User, actor.user.id)).email == "compartilhado@example.com"
    assert (await _fresh(User, outro.user.id)).email == "compartilhado@example.com"


# ── Senha ───────────────────────────────────────────────────────────────────


async def test_troca_de_senha_derruba_as_sessoes(client, db):
    tenant, actor, _ = await _cenario(db)

    errada = await client.post(SENHA_URL, headers=actor.headers, json={"senha_atual": "errada", "nova_senha": NOVA_SENHA})
    assert errada.status_code == 400 and errada.json()["error_code"] == "SENHA_INCORRETA"
    fraca = await client.post(SENHA_URL, headers=actor.headers, json={"senha_atual": SENHA, "nova_senha": "123"})
    assert fraca.status_code == 422

    resp = await client.post(SENHA_URL, headers=actor.headers, json={"senha_atual": SENHA, "nova_senha": NOVA_SENHA})
    assert resp.status_code == 200, resp.text
    apagados = {raw.split("=", 1)[0] for raw in resp.headers.get_list("set-cookie")}
    assert apagados >= {"access_token", "refresh_token", "auth_state"}

    salvo = await _fresh(User, actor.user.id)
    assert salvo.sessions_revoked_at is not None
    # O token emitido antes da troca não vale mais (em nenhum aparelho).
    assert (await client.get(PERFIL, headers=actor.headers)).status_code == 401

    client.cookies.clear()
    assert (await client.post(LOGIN, json={"email": actor.user.email, "password": SENHA})).status_code == 401
    client.cookies.clear()
    assert (await client.post(LOGIN, json={"email": actor.user.email, "password": NOVA_SENHA})).status_code == 200
    acoes = [log.details["new_state"]["acao"] for log in await _auditoria(tenant.id)]
    assert acoes == ["médium trocou a senha"]


# ── Isolamento e gates ──────────────────────────────────────────────────────


async def test_isolamento_entre_terreiros(client, db):
    tenant_a, a, medium_a = await _cenario(db, nome="Casa A")
    tenant_b, b, medium_b = await _cenario(db, nome="Casa B")

    assert (await client.patch(PERFIL, headers=a.headers, json={"telefone": "11911112222"})).status_code == 200
    assert (await _fresh(Medium, medium_b.id)).telefone == "11987654321"
    perfil_b = (await client.get(PERFIL, headers=b.headers)).json()
    assert perfil_b["telefone"] == "11987654321" and perfil_b["email"] == b.user.email
    assert len(await _auditoria(tenant_a.id)) == 1
    assert await _auditoria(tenant_b.id) == []


async def test_sem_vinculo_ou_com_a_chave_desligada_e_403(client, db):
    _, desligada, _ = await _cenario(db, liberada=False, nome="Casa sem piloto")
    assert (await client.get(PERFIL, headers=desligada.headers)).status_code == 403
    assert (await client.patch(PERFIL, headers=desligada.headers, json={"telefone": "11911112222"})).status_code == 403

    tenant, _, medium = await _cenario(db, nome="Casa Solta")
    await db.execute(update(Medium).where(Medium.id == medium.id).values(user_id=None))
    await db.commit()
    admin = User(
        tenant_id=tenant.id, email=f"adm-{uuid.uuid4().hex[:6]}@example.com", username=f"adm-{uuid.uuid4().hex[:6]}",
        password_hash="x" * 60, role=UserRole.ADMIN, is_active=True,
    )
    db.add(admin)
    await db.commit()
    token = create_access_token(admin.id, tenant.id, "admin")
    assert (await client.get(PERFIL, headers={"Authorization": f"Bearer {token}"})).status_code == 403
