"""AM-10 — Configuração da Área do Médium e chave PIX da mensalidade, com Postgres real.

- Config da Área: CONFIGURACOES view/edit + plano `area_medium` (com a chave do piloto);
  desligar a Área tira o acesso do médium na hora; módulos chegam em /medium/me.
- Chave PIX: FINANCEIRO edit + `mensalidade_mediun` + senha de quem altera; auditoria
  mascarada; e-mail a todos os admins ativos; impersonação recusada; isolamento por tenant.

Chaves de teste: CPF/CNPJ de exemplo conhecidos e e-mails em example.com — nenhuma chave real.
"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from src.models import Medium
from src.models.audit_logs import AuditLog
from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.users import UserRole
from src.security.jwt import create_access_token
from src.security.password import hash_password
from src.services.pix_brcode import crc16_ccitt

from .factories import create_tenant, create_user, grant

AREA = "/api/v1/admin/config/area-medium"
PIX = "/api/v1/admin/financeiro/config/pix"
MEDIUM_ME = "/api/v1/medium/me"
SENHA = "Senha-de-teste-AM10"  # só deste teste; nunca uma senha real

CPF_TESTE = "123.456.789-09"
CPF_TESTE_LIMPO = "12345678909"
EMAIL_TESTE = "tesouraria@example.com"


@pytest.fixture
def emails(monkeypatch):
    from src.services.email.email_queue import email_queue

    enviados: list = []
    monkeypatch.setattr(email_queue, "enqueue", lambda item: enviados.append(item))
    return enviados


async def _com_senha(db, actor):
    actor.user.password_hash = hash_password(SENHA)
    db.add(actor.user)
    await db.commit()
    return actor


def _pix_body(**kw):
    body = {
        "tipo": "cpf",
        "chave": CPF_TESTE,
        "nome_recebedor": "Casa de Oxalá",
        "cidade": "São Paulo",
        "instrucoes": "Mande o comprovante pela Área.",
        "senha": SENHA,
    }
    body.update(kw)
    return body


async def _audit(db, tenant_id, resource_type):
    rows = await db.execute(
        select(AuditLog).where(AuditLog.tenant_id == tenant_id, AuditLog.resource_type == resource_type)
    )
    return list(rows.scalars().all())


# ── Configuração da Área ────────────────────────────────────────────────────


async def test_config_da_area_crud_e_grupos(client, db):
    tenant = await create_tenant(db, plan=PlanType.BASIC, area_medium_liberada=True)
    admin = await create_user(db, tenant, UserRole.ADMIN)

    padrao = await client.get(AREA, headers=admin.headers)
    assert padrao.status_code == 200, padrao.text
    assert padrao.json() == {
        "ativa": True,
        "boas_vindas": None,
        "whatsapp": None,
        "modulos": {"agenda": True, "avisos": True, "mensalidade": True},
        "mensalidade_no_plano": True,
        # AM-17/AM-28: presença da casa.
        "presenca": {"modo_padrao": "confianca", "prazo_justificativa_dias": 7},
        "presenca_no_plano": True,
        # AM-15: lembretes da mensalidade por e-mail (padrão ligado).
        "lembretes": {"mensalidade": True},
    }

    salvo = await client.put(
        AREA,
        headers=admin.headers,
        json={"boas_vindas": "  Bem-vindo à corrente!  ", "whatsapp": "(11) 98765-4321", "modulos": {"avisos": False}},
    )
    assert salvo.status_code == 200, salvo.text
    body = salvo.json()
    assert body["boas_vindas"] == "Bem-vindo à corrente!"
    assert body["whatsapp"] == "5511987654321"
    assert body["modulos"] == {"agenda": True, "avisos": False, "mensalidade": True}
    assert body["ativa"] is True  # não enviado, não muda

    assert (await client.put(AREA, headers=admin.headers, json={"whatsapp": "123"})).status_code == 422
    assert (await client.put(AREA, headers=admin.headers, json={"boas_vindas": "x" * 501})).status_code == 422
    limpa = await client.put(AREA, headers=admin.headers, json={"whatsapp": "", "boas_vindas": ""})
    assert limpa.json()["whatsapp"] is None and limpa.json()["boas_vindas"] is None

    logs = await _audit(db, tenant.id, "TenantConfig")
    assert any(log.details.get("config_type") == "area_medium" for log in logs)

    # Operador: só view lê; sem edit leva 403 no PUT; sem grupo nenhum, 403 nos dois.
    leitor = await create_user(db, tenant, UserRole.OPERATOR, name="leitor")
    await grant(db, leitor, tenant, PermissionFeature.CONFIGURACOES, "view")
    assert (await client.get(AREA, headers=leitor.headers)).status_code == 200
    assert (await client.put(AREA, headers=leitor.headers, json={"ativa": False})).status_code == 403
    editor = await create_user(db, tenant, UserRole.OPERATOR, name="editor")
    await grant(db, editor, tenant, PermissionFeature.CONFIGURACOES, "view", "edit")
    assert (await client.put(AREA, headers=editor.headers, json={"ativa": False})).status_code == 200
    sem_grupo = await create_user(db, tenant, UserRole.OPERATOR, name="semgrupo")
    assert (await client.get(AREA, headers=sem_grupo.headers)).status_code == 403


@pytest.mark.parametrize(
    "plan, liberada",
    [(PlanType.BASIC, False), (PlanType.FREE, True)],
)
async def test_config_da_area_sem_a_chave_do_piloto_ou_sem_plano_da_403(client, db, plan, liberada):
    tenant = await create_tenant(db, plan=plan, area_medium_liberada=liberada)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    assert (await client.get(AREA, headers=admin.headers)).status_code == 403
    assert (await client.put(AREA, headers=admin.headers, json={"ativa": False})).status_code == 403


async def test_desligar_a_area_tira_o_acesso_do_medium(client, db):
    tenant = await create_tenant(db, plan=PlanType.BASIC, area_medium_liberada=True)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    medium = await create_user(db, tenant, UserRole.MEDIUM, name="medium")
    db.add(Medium(tenant_id=tenant.id, nome="Maria", user_id=medium.user.id))
    await db.commit()

    me = await client.get(MEDIUM_ME, headers=medium.headers)
    assert me.status_code == 200, me.text
    assert me.json()["modulos"] == ["agenda", "avisos", "mensalidade"]

    await client.put(
        AREA,
        headers=admin.headers,
        json={"boas_vindas": "Axé!", "whatsapp": "(21) 91234-5678", "modulos": {"agenda": False}},
    )
    me = (await client.get(MEDIUM_ME, headers=medium.headers)).json()
    assert me["modulos"] == ["avisos", "mensalidade"]
    assert me["boas_vindas"] == "Axé!"
    assert me["whatsapp_casa"] == "5521912345678"

    desliga = await client.put(AREA, headers=admin.headers, json={"ativa": False})
    assert desliga.status_code == 200, desliga.text
    assert (await client.get(MEDIUM_ME, headers=medium.headers)).status_code == 403
    perfil = await client.get("/api/v1/auth/me", headers=medium.headers)
    assert perfil.json()["areas"]["medium"] is None

    await client.put(AREA, headers=admin.headers, json={"ativa": True})
    assert (await client.get(MEDIUM_ME, headers=medium.headers)).status_code == 200


async def test_config_da_area_isolada_por_tenant(client, db):
    a = await create_tenant(db, name="Casa A", plan=PlanType.BASIC, area_medium_liberada=True)
    b = await create_tenant(db, name="Casa B", plan=PlanType.BASIC, area_medium_liberada=True)
    admin_a = await create_user(db, a, UserRole.ADMIN, name="admina")
    admin_b = await create_user(db, b, UserRole.ADMIN, name="adminb")

    await client.put(AREA, headers=admin_a.headers, json={"ativa": False, "boas_vindas": "Só da casa A"})
    b_cfg = (await client.get(AREA, headers=admin_b.headers)).json()
    assert b_cfg["ativa"] is True and b_cfg["boas_vindas"] is None


# ── Chave PIX ───────────────────────────────────────────────────────────────


async def test_pix_exige_a_senha_certa_e_nao_derruba_a_sessao(client, db, emails):
    tenant = await create_tenant(db, plan=PlanType.BASIC)
    admin = await _com_senha(db, await create_user(db, tenant, UserRole.ADMIN))

    vazio = await client.get(PIX, headers=admin.headers)
    assert vazio.status_code == 200, vazio.text
    assert vazio.json()["configurada"] is False

    errada = await client.put(PIX, headers=admin.headers, json=_pix_body(senha="senha-errada"))
    assert errada.status_code == 401, errada.text
    assert "Senha incorreta" in errada.text
    assert (await client.get(PIX, headers=admin.headers)).json()["configurada"] is False
    assert emails == []
    # Mesma sessão continua valendo depois da senha errada.
    assert (await client.get("/api/v1/auth/me", headers=admin.headers)).status_code == 200

    sem_senha = await client.put(PIX, headers=admin.headers, json={k: v for k, v in _pix_body().items() if k != "senha"})
    assert sem_senha.status_code == 422

    ok = await client.put(PIX, headers=admin.headers, json=_pix_body())
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["configurada"] is True
    assert body["tipo"] == "cpf"
    assert body["chave"] == CPF_TESTE_LIMPO
    assert body["chave_mascarada"] == "***.456.789-**"
    assert body["nome_recebedor"] == "Casa de Oxalá"
    assert body["alterado_em"] is not None
    assert "senha" not in ok.text and SENHA not in ok.text

    brcode = body["brcode_previa"]
    assert "0014br.gov.bcb.pix0111" + CPF_TESTE_LIMPO in brcode
    assert "5913CASA DE OXALA" in brcode and "6009SAO PAULO" in brcode
    assert "54041.00" in brcode and body["valor_previa"] == 1.0  # sem valor de mensalidade: R$ 1,00
    assert crc16_ccitt(brcode[:-4]) == brcode[-4:]


async def test_pix_auditoria_mascarada_e_email_para_todos_os_admins(client, db, emails):
    tenant = await create_tenant(db, plan=PlanType.BASIC, name="Casa Teste")
    admin1 = await create_user(db, tenant, UserRole.ADMIN, name="admin1")
    admin2 = await create_user(db, tenant, UserRole.ADMIN, name="admin2")
    inativo = await create_user(db, tenant, UserRole.ADMIN, name="inativo")
    inativo.user.is_active = False
    db.add(inativo.user)
    await db.commit()
    # Quem troca é um operador com FINANCEIRO:edit (sem is_admin empilhado, D-05).
    operador = await _com_senha(db, await create_user(db, tenant, UserRole.OPERATOR, name="tesoureiro"))
    await grant(db, operador, tenant, PermissionFeature.FINANCEIRO, "view", "edit")
    outro_tenant = await create_tenant(db, name="Outra Casa")
    admin_outro = await create_user(db, outro_tenant, UserRole.ADMIN, name="adminoutro")

    primeira = await client.put(PIX, headers=operador.headers, json=_pix_body())
    assert primeira.status_code == 200, primeira.text
    destinatarios = sorted(item.message.to_email for item in emails)
    assert destinatarios == sorted([admin1.user.email, admin2.user.email])
    assert admin_outro.user.email not in destinatarios
    msg = emails[0].message
    assert msg.subject == "Chave PIX da mensalidade alterada — Casa Teste"
    assert "***.456.789-**" in msg.html_body and CPF_TESTE_LIMPO not in msg.html_body

    emails.clear()
    troca = await client.put(PIX, headers=operador.headers, json=_pix_body(tipo="email", chave=EMAIL_TESTE))
    assert troca.status_code == 200, troca.text
    assert len(emails) == 2
    assert "t***@example.com" in emails[0].message.html_body
    assert "***.456.789-**" in emails[0].message.html_body  # chave anterior, mascarada

    # Mudou só o nome: grava e audita, sem novo alarme.
    emails.clear()
    nome = await client.put(PIX, headers=operador.headers, json=_pix_body(tipo="email", chave=EMAIL_TESTE, nome_recebedor="Tenda Nova"))
    assert nome.status_code == 200
    assert emails == []

    logs = await _audit(db, tenant.id, "mensalidade_pix")
    assert len(logs) == 3
    texto = " ".join(str(log.details) for log in logs)
    assert CPF_TESTE_LIMPO not in texto and EMAIL_TESTE not in texto and SENHA not in texto
    segunda = next(log for log in logs if log.details["new_state"].get("tipo") == "email" and log.details["new_state"]["chave_alterada"])
    assert segunda.details["previous_state"]["chave"] == "***.456.789-**"
    assert segunda.details["new_state"]["chave"] == "t***@example.com"
    assert all(log.user_id == operador.user.id for log in logs)


async def test_pix_quem_so_ve_recebe_a_chave_mascarada(client, db, emails):
    tenant = await create_tenant(db, plan=PlanType.BASIC)
    admin = await _com_senha(db, await create_user(db, tenant, UserRole.ADMIN))
    assert (await client.put(PIX, headers=admin.headers, json=_pix_body())).status_code == 200

    leitor = await _com_senha(db, await create_user(db, tenant, UserRole.OPERATOR, name="leitor"))
    await grant(db, leitor, tenant, PermissionFeature.FINANCEIRO, "view")
    visto = await client.get(PIX, headers=leitor.headers)
    assert visto.status_code == 200, visto.text
    body = visto.json()
    assert body["chave_mascarada"] == "***.456.789-**"
    assert body["chave"] is None and body["brcode_previa"] is None
    assert CPF_TESTE_LIMPO not in visto.text
    # E não troca (grupo sem edit), mesmo com a senha certa.
    assert (await client.put(PIX, headers=leitor.headers, json=_pix_body(chave="529.982.247-25"))).status_code == 403

    sem_grupo = await create_user(db, tenant, UserRole.OPERATOR, name="semgrupo")
    assert (await client.get(PIX, headers=sem_grupo.headers)).status_code == 403


async def test_pix_recusa_impersonacao(client, db, emails):
    tenant = await create_tenant(db, plan=PlanType.BASIC)
    admin = await _com_senha(db, await create_user(db, tenant, UserRole.ADMIN))
    root = await create_user(db, None, UserRole.SUPER_ADMIN, name="root")
    token = create_access_token(admin.user.id, tenant.id, "admin", impersonated_by=root.user.id)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.put(PIX, headers=headers, json=_pix_body())
    assert resp.status_code == 403, resp.text
    assert emails == []
    # Ler continua permitido (o suporte vê o que o terreiro vê).
    assert (await client.get(PIX, headers=headers)).status_code == 200


@pytest.mark.parametrize(
    "campos",
    [
        {"chave": "123.456.789-00"},
        {"tipo": "telefone", "chave": "(61) 3123-4567"},
        {"tipo": "aleatoria", "chave": "nao-e-uuid"},
        {"nome_recebedor": "N" * 26},
        {"cidade": "C" * 16},
        {"tipo": "pix"},
    ],
)
async def test_pix_valida_a_chave_e_os_limites(client, db, emails, campos):
    tenant = await create_tenant(db, plan=PlanType.BASIC)
    admin = await _com_senha(db, await create_user(db, tenant, UserRole.ADMIN))
    resp = await client.put(PIX, headers=admin.headers, json=_pix_body(**campos))
    assert resp.status_code == 422, resp.text
    assert emails == []


async def test_pix_isolado_por_tenant_e_fora_do_plano(client, db, emails):
    a = await create_tenant(db, name="Casa A", plan=PlanType.BASIC)
    b = await create_tenant(db, name="Casa B", plan=PlanType.BASIC)
    gratis = await create_tenant(db, name="Casa Gratis", plan=PlanType.FREE)
    admin_a = await _com_senha(db, await create_user(db, a, UserRole.ADMIN, name="admina"))
    admin_b = await create_user(db, b, UserRole.ADMIN, name="adminb")
    admin_gratis = await _com_senha(db, await create_user(db, gratis, UserRole.ADMIN, name="admingratis"))

    assert (await client.put(PIX, headers=admin_a.headers, json=_pix_body())).status_code == 200
    visto_b = await client.get(PIX, headers=admin_b.headers)
    assert visto_b.json()["configurada"] is False
    assert CPF_TESTE_LIMPO not in visto_b.text

    assert (await client.get(PIX, headers=admin_gratis.headers)).status_code == 403
    assert (await client.put(PIX, headers=admin_gratis.headers, json=_pix_body())).status_code == 403
