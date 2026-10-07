"""AM-03 — convite da casa e ativação da Área do Médium, com Postgres real (migração 067).

App inteiro via HTTP: admin convida (MEDIUNS:edit + `area_medium`), o médium abre o link
público, cria a senha (ou usa a do painel), aceita o termo e já entra com os cookies da
sessão. Vínculo só no aceite, convite de uso único, reenviar revoga o anterior, revogar
corta na hora, isolamento entre terreiros e chave do piloto.
"""
import re
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, text, update

from src.models import Medium, MediumConvite, Tenant
from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.users import User, UserRole
from src.security import hash_password
from src.services.medium_convite import CONSENTIMENTO_AREA_VERSAO

from .factories import create_tenant, create_user, grant

SENHA = "Senha-forte-123"
MEDIUNS = "/api/v1/admin/mediuns"
MEDIUM_ME = "/api/v1/medium/me"
PUBLICO = "/api/v1/public/convite"


@pytest.fixture
def emails(monkeypatch):
    """Captura os e-mails enfileirados (a fila não roda nos testes)."""
    from src.services.email.email_queue import email_queue

    enviados = []
    monkeypatch.setattr(email_queue, "enqueue", lambda item: enviados.append(item.message))
    return enviados


async def _casa(db, plan=PlanType.BASIC, liberada=True, nome="Casa Luz"):
    tenant = await create_tenant(db, name=nome, plan=plan, area_medium_liberada=liberada)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    return tenant, admin


async def _medium(db, tenant, nome="Ana Paula Ribeiro", email="Ana.Paula@Exemplo.com", telefone="11987654321", **kw):
    m = Medium(tenant_id=tenant.id, nome=nome, email=email, telefone=telefone, **kw)
    db.add(m)
    await db.commit()
    return m


async def _fresh(model, obj_id):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(select(model).where(model.id == obj_id))).scalar_one()


async def _chave(db, tenant, ligada: bool) -> None:
    await db.execute(update(Tenant).where(Tenant.id == tenant.id).values(area_medium_liberada=ligada))
    await db.commit()


def _token(link: str) -> str:
    return link.rsplit("/convite/", 1)[1]


async def _convidar(client, admin, medium) -> dict:
    resp = await client.post(f"{MEDIUNS}/{medium.id}/convite", headers=admin.headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _acesso(client, admin, medium) -> dict:
    lista = await client.get(f"{MEDIUNS}?include_inactive=true", headers=admin.headers)
    assert lista.status_code == 200, lista.text
    return next(m for m in lista.json() if m["id"] == str(medium.id))["acesso_area"]


# ── Migração ────────────────────────────────────────────────────────────────


async def test_migracao_cria_tabela_e_um_convite_em_aberto_por_medium(migrated_db):
    from src.core.database import engine

    async with engine.connect() as conn:
        indexes = {
            r[0]: r[1]
            for r in await conn.execute(
                text("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'medium_convites'")
            )
        }
    assert "uq_medium_convites_aberto" in indexes
    assert "WHERE ((usado_em IS NULL) AND (revogado_em IS NULL))" in indexes["uq_medium_convites_aberto"]
    assert any("token_hash" in d and "UNIQUE" in d for d in indexes.values())


# ── Caminho feliz: médium sem conta ─────────────────────────────────────────


async def test_convite_e_aceite_criam_conta_medium_com_consentimento_e_sessao(client, db, emails):
    tenant, admin = await _casa(db)
    medium = await _medium(db, tenant)

    convite = await _convidar(client, admin, medium)
    assert "/convite/" in convite["link"]
    assert convite["whatsapp_url"].startswith("https://wa.me/5511987654321?text=")
    assert convite["email_mascarado"].startswith("an") and convite["email_mascarado"].endswith("@exemplo.com")
    assert "ana.paula" not in convite["email_mascarado"]
    assert convite["link"] in convite["mensagem_whatsapp"]
    assert convite["acesso_area"]["status"] == "convite_enviado"
    assert (await _acesso(client, admin, medium))["status"] == "convite_enviado"

    # E-mail discreto (§6.8): para o e-mail do cadastro, sem termo religioso no assunto/texto.
    assert len(emails) == 1
    msg = emails[0]
    assert msg.to_email == "ana.paula@exemplo.com"
    assert msg.subject == "Convite de Casa Luz para acessar sua área no GiraHub"
    for termo in ("médium", "medium", "gira", "giras", "terreiro", "orixá", "umbanda"):
        palavra = re.compile(rf"\b{termo}\b")
        assert not palavra.search(msg.subject.lower()) and not palavra.search(msg.text_body.lower()), termo
    assert convite["link"] in msg.text_body

    token = _token(convite["link"])
    # Só o hash fica no banco.
    salvo = (await db.execute(select(MediumConvite).where(MediumConvite.medium_id == medium.id))).scalar_one()
    assert salvo.token_hash != token and len(salvo.token_hash) == 64

    publico = await client.get(f"{PUBLICO}/{token}")
    assert publico.status_code == 200, publico.text
    dados = publico.json()
    assert dados["terreiro"]["nome"] == "Casa Luz"
    assert dados["medium_primeiro_nome"] == "Ana"
    assert dados["email_mascarado"] == convite["email_mascarado"]
    assert dados["conta_existente"] is False
    assert dados["consentimento_versao"] == CONSENTIMENTO_AREA_VERSAO

    # Sem aceite do termo não há conta; senha fora da política também não.
    sem_termo = await client.post(f"{PUBLICO}/{token}/aceitar", json={"senha": SENHA, "aceite_termo": False})
    assert sem_termo.status_code == 422
    assert sem_termo.json()["detail"]["error_code"] == "TERMO_OBRIGATORIO"
    fraca = await client.post(f"{PUBLICO}/{token}/aceitar", json={"senha": "123", "aceite_termo": True})
    assert fraca.status_code == 422
    assert (await db.execute(select(User).where(User.tenant_id == tenant.id, User.role == UserRole.MEDIUM))).first() is None

    aceite = await client.post(f"{PUBLICO}/{token}/aceitar", json={"senha": SENHA, "aceite_termo": True})
    assert aceite.status_code == 200, aceite.text
    corpo = aceite.json()
    assert corpo["redirect"] == "/medium"
    assert corpo["user"]["role"] == "medium"
    assert corpo["areas"] == {"admin": False, "medium": {"medium_id": str(medium.id), "nome": medium.nome}}
    assert {"access_token", "refresh_token", "auth_state"} <= set(aceite.cookies.keys())

    # Já entra logado na Área (cookies da sessão aberta no aceite).
    me = await client.get(MEDIUM_ME)
    assert me.status_code == 200, me.text
    assert me.json()["nome"] == medium.nome

    atualizado = await _fresh(Medium, medium.id)
    assert atualizado.user_id is not None
    assert atualizado.area_consentimento_versao == CONSENTIMENTO_AREA_VERSAO
    assert atualizado.area_consentimento_em is not None
    conta = await _fresh(User, atualizado.user_id)
    assert conta.role == UserRole.MEDIUM and conta.email == "ana.paula@exemplo.com" and conta.is_active
    assert (await _fresh(MediumConvite, salvo.id)).usado_em is not None

    acesso = await _acesso(client, admin, medium)
    assert acesso["status"] == "ativo" and acesso["desde"] is not None

    # Uso único: o mesmo link não serve de novo.
    de_novo = await client.post(f"{PUBLICO}/{token}/aceitar", json={"senha": SENHA, "aceite_termo": True})
    assert de_novo.status_code == 404
    assert de_novo.json()["detail"]["error_code"] == "CONVITE_INVALIDO"
    # E não dá para convidar quem já tem acesso.
    assert (await client.post(f"{MEDIUNS}/{medium.id}/convite", headers=admin.headers)).status_code == 409


# ── Operador que também é médium ────────────────────────────────────────────


async def test_operador_com_o_mesmo_email_liga_com_a_propria_senha(client, db, emails):
    tenant, admin = await _casa(db)
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="porteiro")
    operador.user.password_hash = hash_password(SENHA)
    await db.commit()
    medium = await _medium(db, tenant, nome="Bruno Santos", email=operador.user.email.upper(), telefone=None)

    convite = await _convidar(client, admin, medium)
    assert convite["whatsapp_url"].startswith("https://wa.me/?text=")  # sem telefone: o dirigente escolhe o contato
    token = _token(convite["link"])
    assert (await client.get(f"{PUBLICO}/{token}")).json()["conta_existente"] is True

    errada = await client.post(f"{PUBLICO}/{token}/aceitar", json={"senha": "Outra-senha-999", "aceite_termo": True})
    assert errada.status_code == 400
    assert errada.json()["detail"]["error_code"] == "SENHA_INCORRETA"

    ok = await client.post(f"{PUBLICO}/{token}/aceitar", json={"senha": SENHA, "aceite_termo": True})
    assert ok.status_code == 200, ok.text
    assert ok.json()["areas"]["admin"] is True
    assert ok.json()["areas"]["medium"]["medium_id"] == str(medium.id)

    conta = await _fresh(User, operador.user.id)
    assert conta.role == UserRole.OPERATOR  # mantém o papel; ganha a Área pelo vínculo
    assert (await _fresh(Medium, medium.id)).user_id == operador.user.id
    # Nenhuma conta nova foi criada.
    contas = (await db.execute(select(User).where(User.tenant_id == tenant.id))).scalars().all()
    assert len(contas) == 2


# ── Token inválido, vencido, usado ou revogado: resposta genérica ───────────


async def test_convite_vencido_revogado_ou_inexistente_tem_a_mesma_resposta(client, db, emails):
    tenant, admin = await _casa(db)
    medium = await _medium(db, tenant)

    primeiro = _token((await _convidar(client, admin, medium))["link"])
    segundo = _token((await _convidar(client, admin, medium))["link"])  # reenviar revoga o primeiro

    convites = (await db.execute(select(MediumConvite).where(MediumConvite.medium_id == medium.id))).scalars().all()
    assert len(convites) == 2
    assert sum(1 for c in convites if c.revogado_em is None and c.usado_em is None) == 1

    revogado = await client.get(f"{PUBLICO}/{primeiro}")
    inexistente = await client.get(f"{PUBLICO}/nao-existe-{'x' * 30}")
    assert (await client.get(f"{PUBLICO}/{segundo}")).status_code == 200

    await db.execute(
        update(MediumConvite)
        .where(MediumConvite.medium_id == medium.id, MediumConvite.revogado_em.is_(None))
        .values(expira_em=datetime.now(timezone.utc) - timedelta(minutes=1))
    )
    await db.commit()
    vencido = await client.get(f"{PUBLICO}/{segundo}")
    aceite_vencido = await client.post(f"{PUBLICO}/{segundo}/aceitar", json={"senha": SENHA, "aceite_termo": True})

    for resp in (revogado, inexistente, vencido, aceite_vencido):
        assert resp.status_code == 404, resp.text
        assert resp.json()["detail"] == {
            "message": "Este convite não vale mais. Peça um novo convite à casa.",
            "error_code": "CONVITE_INVALIDO",
        }
    # Vencido não conta como convite enviado: volta a "sem acesso".
    assert (await _acesso(client, admin, medium))["status"] == "sem_acesso"


async def test_trocar_o_email_do_cadastro_invalida_o_convite(client, db, emails):
    tenant, admin = await _casa(db)
    medium = await _medium(db, tenant)
    token = _token((await _convidar(client, admin, medium))["link"])

    resp = await client.patch(f"{MEDIUNS}/{medium.id}", headers=admin.headers, json={"email": "outra@exemplo.com"})
    assert resp.status_code == 200, resp.text
    assert (await client.get(f"{PUBLICO}/{token}")).status_code == 404
    assert (await _acesso(client, admin, medium))["status"] == "sem_acesso"


# ── Revogar ─────────────────────────────────────────────────────────────────


async def test_revogar_corta_o_acesso_na_hora_e_reconvite_reativa_a_conta(client, db, emails):
    tenant, admin = await _casa(db)
    medium = await _medium(db, tenant)
    token = _token((await _convidar(client, admin, medium))["link"])
    aceite = await client.post(f"{PUBLICO}/{token}/aceitar", json={"senha": SENHA, "aceite_termo": True})
    assert aceite.status_code == 200
    user_id = (await _fresh(Medium, medium.id)).user_id
    assert (await client.get(MEDIUM_ME)).status_code == 200

    tira = await client.delete(f"{MEDIUNS}/{medium.id}/acesso", headers=admin.headers)
    assert tira.status_code == 204, tira.text

    # Mesma sessão (cookie de antes) já não entra: conta `medium` pura desativada.
    assert (await client.get(MEDIUM_ME)).status_code == 401
    assert (await _fresh(Medium, medium.id)).user_id is None
    conta = await _fresh(User, user_id)
    assert conta.is_active is False
    assert (await _acesso(client, admin, medium))["status"] == "sem_acesso"

    # Convidar de novo: a pessoa cria uma senha nova e a MESMA conta volta.
    client.cookies.clear()
    token2 = _token((await _convidar(client, admin, medium))["link"])
    assert (await client.get(f"{PUBLICO}/{token2}")).json()["conta_existente"] is False
    volta = await client.post(f"{PUBLICO}/{token2}/aceitar", json={"senha": "Nova-senha-456", "aceite_termo": True})
    assert volta.status_code == 200, volta.text
    assert volta.json()["user"]["id"] == str(user_id)
    assert (await _fresh(User, user_id)).is_active is True
    assert (await client.get(MEDIUM_ME)).status_code == 200


async def test_revogar_operador_ligado_so_tira_a_area(client, db, emails):
    tenant, admin = await _casa(db)
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="porteiro")
    operador.user.password_hash = hash_password(SENHA)
    await db.commit()
    medium = await _medium(db, tenant, email=operador.user.email)
    token = _token((await _convidar(client, admin, medium))["link"])
    assert (await client.post(f"{PUBLICO}/{token}/aceitar", json={"senha": SENHA, "aceite_termo": True})).status_code == 200
    assert (await client.get(MEDIUM_ME, headers=operador.headers)).status_code == 200

    assert (await client.delete(f"{MEDIUNS}/{medium.id}/acesso", headers=admin.headers)).status_code == 204
    assert (await client.get(MEDIUM_ME, headers=operador.headers)).status_code == 403
    conta = await _fresh(User, operador.user.id)
    assert conta.is_active is True and conta.role == UserRole.OPERATOR


async def test_cancelar_convite_em_aberto(client, db, emails):
    tenant, admin = await _casa(db)
    medium = await _medium(db, tenant)
    token = _token((await _convidar(client, admin, medium))["link"])
    assert (await client.delete(f"{MEDIUNS}/{medium.id}/acesso", headers=admin.headers)).status_code == 204
    assert (await client.get(f"{PUBLICO}/{token}")).status_code == 404
    assert (await _acesso(client, admin, medium))["status"] == "sem_acesso"


# ── Isolamento, permissão e chave do piloto ─────────────────────────────────


async def test_medium_de_outro_terreiro_da_404(client, db, emails):
    _, admin_a = await _casa(db, nome="Casa A")
    tenant_b, _ = await _casa(db, nome="Casa B")
    medium_b = await _medium(db, tenant_b)

    assert (await client.post(f"{MEDIUNS}/{medium_b.id}/convite", headers=admin_a.headers)).status_code == 404
    assert (await client.delete(f"{MEDIUNS}/{medium_b.id}/acesso", headers=admin_a.headers)).status_code == 404
    lote = await client.post(f"{MEDIUNS}/convite/lote", headers=admin_a.headers)
    assert lote.json()["convidados"] == 0
    assert emails == []
    assert (await db.execute(select(MediumConvite))).first() is None


async def test_chave_desligada_ou_plano_sem_area_da_403(client, db, emails):
    tenant, admin = await _casa(db, liberada=False)
    medium = await _medium(db, tenant)
    for resp in (
        await client.post(f"{MEDIUNS}/{medium.id}/convite", headers=admin.headers),
        await client.post(f"{MEDIUNS}/convite/lote", headers=admin.headers),
        await client.delete(f"{MEDIUNS}/{medium.id}/acesso", headers=admin.headers),
    ):
        assert resp.status_code == 403, resp.text

    gratis, admin_gratis = await _casa(db, plan=PlanType.FREE, nome="Casa Gratis")
    m_gratis = await _medium(db, gratis)
    assert (await client.post(f"{MEDIUNS}/{m_gratis.id}/convite", headers=admin_gratis.headers)).status_code == 403

    # Convite criado com a Área ligada; a plataforma desliga → a tela pública avisa, sem conta.
    await _chave(db, tenant, True)
    token = _token((await _convidar(client, admin, medium))["link"])
    await _chave(db, tenant, False)
    resp = await client.get(f"{PUBLICO}/{token}")
    assert resp.status_code == 403
    assert resp.json()["detail"]["error_code"] == "AREA_INDISPONIVEL"
    aceite = await client.post(f"{PUBLICO}/{token}/aceitar", json={"senha": SENHA, "aceite_termo": True})
    assert aceite.status_code == 403
    assert (await _fresh(Medium, medium.id)).user_id is None


async def test_operador_precisa_de_mediuns_edit(client, db, emails):
    tenant, _ = await _casa(db)
    medium = await _medium(db, tenant)
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="secretaria")
    await grant(db, operador, tenant, PermissionFeature.MEDIUNS, "view", "insert", "delete")
    assert (await client.post(f"{MEDIUNS}/{medium.id}/convite", headers=operador.headers)).status_code == 403
    assert (await client.delete(f"{MEDIUNS}/{medium.id}/acesso", headers=operador.headers)).status_code == 403

    outro = await create_user(db, tenant, UserRole.OPERATOR, name="capitao")
    await grant(db, outro, tenant, PermissionFeature.MEDIUNS, "view", "edit")
    assert (await client.post(f"{MEDIUNS}/{medium.id}/convite", headers=outro.headers)).status_code == 200


async def test_medium_sem_email_ou_inativo_nao_recebe_convite(client, db, emails):
    tenant, admin = await _casa(db)
    sem_email = await _medium(db, tenant, nome="Diego", email=None)
    email_ruim = await _medium(db, tenant, nome="Elaine", email="elaine-sem-arroba")
    inativo = await _medium(db, tenant, nome="Fábio", email="fabio@exemplo.com", is_active=False)
    assert (await client.post(f"{MEDIUNS}/{sem_email.id}/convite", headers=admin.headers)).status_code == 422
    assert (await client.post(f"{MEDIUNS}/{email_ruim.id}/convite", headers=admin.headers)).status_code == 422
    assert (await client.post(f"{MEDIUNS}/{inativo.id}/convite", headers=admin.headers)).status_code == 422


async def test_inativar_o_medium_revoga_o_convite(client, db, emails):
    tenant, admin = await _casa(db)
    medium = await _medium(db, tenant)
    token = _token((await _convidar(client, admin, medium))["link"])
    resp = await client.patch(f"{MEDIUNS}/{medium.id}", headers=admin.headers, json={"is_active": False})
    assert resp.status_code == 200, resp.text
    assert (await client.get(f"{PUBLICO}/{token}")).status_code == 404


# ── Lote ────────────────────────────────────────────────────────────────────


async def test_convite_em_lote_so_para_ativos_com_email_e_sem_acesso(client, db, emails):
    tenant, admin = await _casa(db)
    novo = await _medium(db, tenant, nome="Carla Mendes", email="carla@exemplo.com")
    await _medium(db, tenant, nome="Diego Rocha", email=None)
    ja = await _medium(db, tenant, nome="Hélio Prado", email="helio@exemplo.com")
    await _medium(db, tenant, nome="Inativo", email="inativo@exemplo.com", is_active=False)
    await _convidar(client, admin, ja)
    emails.clear()

    resp = await client.post(f"{MEDIUNS}/convite/lote", headers=admin.headers)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"convidados": 1, "sem_email": 1, "ja_convidados": 1}
    assert [m.to_email for m in emails] == ["carla@exemplo.com"]
    assert (await _acesso(client, admin, novo))["status"] == "convite_enviado"

    # Rodar de novo não reenvia para quem já tem convite em aberto.
    resp = await client.post(f"{MEDIUNS}/convite/lote", headers=admin.headers)
    assert resp.json() == {"convidados": 0, "sem_email": 1, "ja_convidados": 2}
