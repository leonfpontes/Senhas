"""AM-14 (Meus dados e privacidade) e AM-20 (Aniversariantes da corrente), com Postgres real.

AM-14:
- exportar traz só os dados do PRÓPRIO médium (outro médium da casa e outro terreiro ficam de fora),
  sem campos internos da casa e sem os bytes do comprovante; impersonação → 403;
- encerrar o acesso com a senha: conta `medium` desativada, sessões e cookies derrubados, vínculo
  desfeito, consentimento revogado (data + versão), opt-in do aniversário desligado, administradores
  ativos avisados por e-mail, auditoria sem nome; a casa convida de novo e a conta volta;
- operador que também é médium: só perde a Área e segue no painel;
- senha errada → 400 (nunca 401: o front não derruba a sessão) e nada muda.
AM-20:
- opt-in no Perfil (sem data de nascimento → 422; impersonação → 403);
- Início lista só quem aceitou, ativo, com a Área, da mesma casa, com aniversário de segunda a
  domingo — primeiro nome, dia e mês, nunca o ano;
- mensagem da casa no dia do próprio aniversário (padrão ou a da configuração, com `{nome}`).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select, text

from src.api.v1.medium import inicio as inicio_mod
from src.models import (
    Atividade,
    AtividadeParticipacao,
    AtividadeTipo,
    Comunicado,
    ComunicadoLeitura,
    CorrenteGrupo,
    CorrenteGrupoMembro,
    Medium,
    MensalidadeComprovante,
    MensalidadePagamento,
    MensalidadeStatus,
)
from src.models.audit_logs import AuditLog
from src.models.subscriptions import PlanType
from src.models.users import User, UserRole
from src.security.jwt import create_access_token
from src.security.password import hash_password
from src.services.atividades import ensure_default_atividade_tipos
from src.services.medium_convite import CONSENTIMENTO_AREA_VERSAO

from .factories import create_tenant, create_user

SENHA = "Senha-forte-123"
MEDIUNS = "/api/v1/admin/mediuns"
PUBLICO = "/api/v1/public/convite"
MEDIUM_ME = "/api/v1/medium/me"
EXPORTAR = "/api/v1/medium/meus-dados/exportar"
ENCERRAR = "/api/v1/medium/meus-dados/encerrar"
INICIO = "/api/v1/medium/inicio"
PERFIL = "/api/v1/medium/perfil"
ANIVERSARIO = "/api/v1/medium/perfil/aniversario"
CONFIG = "/api/v1/admin/config/area-medium"


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


@pytest.fixture
def hoje(monkeypatch):
    def _set(d: date):
        monkeypatch.setattr(inicio_mod, "today_local", lambda: d)

    return _set


async def _fresh(model, obj_id):
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (await fresh.execute(select(model).where(model.id == obj_id))).scalar_one()


async def _casa(db, nome="Casa Luz", plan=PlanType.BASIC):
    tenant = await create_tenant(db, name=nome, plan=plan, area_medium_liberada=True)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="dirigente")
    return tenant, admin


async def _medium_ligado(db, tenant, nome, *, role=UserRole.MEDIUM, nascimento=None, visivel=False, **kw):
    """Médium com conta ligada (como depois do aceite do convite) e token Bearer."""
    email = f"{nome.split()[0].lower()}-{uuid.uuid4().hex[:6]}@example.com"
    user = User(
        tenant_id=tenant.id,
        email=email,
        username=f"u-{uuid.uuid4().hex[:8]}",
        password_hash=hash_password(SENHA),
        role=role,
        is_active=True,
        full_name=nome,
    )
    db.add(user)
    await db.flush()
    medium = Medium(
        tenant_id=tenant.id,
        nome=nome,
        email=email,
        user_id=user.id,
        data_nascimento=nascimento,
        aniversario_visivel=visivel,
        area_consentimento_em=datetime.now(timezone.utc) - timedelta(days=30),
        area_consentimento_versao=CONSENTIMENTO_AREA_VERSAO,
        **kw,
    )
    db.add(medium)
    await db.commit()
    token = create_access_token(user.id, tenant.id, user.role.value)
    return user, medium, {"Authorization": f"Bearer {token}"}


def _token(link: str) -> str:
    return link.rsplit("/convite/", 1)[1]


async def _entrar_pelo_convite(client, admin, medium) -> None:
    """Convite do admin + aceite: abre a sessão por cookie (como no navegador)."""
    resp = await client.post(f"{MEDIUNS}/{medium.id}/convite", headers=admin.headers)
    assert resp.status_code == 200, resp.text
    aceite = await client.post(
        f"{PUBLICO}/{_token(resp.json()['link'])}/aceitar", json={"senha": SENHA, "aceite_termo": True}
    )
    assert aceite.status_code == 200, aceite.text


# ── Migração ────────────────────────────────────────────────────────────────


async def test_migracao_cria_as_colunas(migrated_db):
    from src.core.database import engine

    async with engine.connect() as conn:
        cols = {
            (r[0], r[1]): (r[2], r[3])
            for r in await conn.execute(
                text(
                    "SELECT table_name, column_name, is_nullable, column_default FROM information_schema.columns "
                    "WHERE table_name IN ('mediuns', 'tenant_configs')"
                )
            )
        }
    assert cols[("mediuns", "aniversario_visivel")][0] == "NO"
    assert "false" in cols[("mediuns", "aniversario_visivel")][1]
    assert cols[("mediuns", "area_consentimento_revogado_em")][0] == "YES"
    assert cols[("mediuns", "area_consentimento_revogado_versao")][0] == "YES"
    assert cols[("tenant_configs", "area_medium_aniversario_mensagem")][0] == "YES"


# ── AM-14: exportar ─────────────────────────────────────────────────────────


async def _semear_dados(db, tenant, medium, marca: str):
    """Mensalidade com comprovante, aviso lido, grupo e participação com motivo — com `marca` no texto."""
    await ensure_default_atividade_tipos(db, tenant.id)
    tipo = (await db.execute(select(AtividadeTipo).where(AtividadeTipo.tenant_id == tenant.id).limit(1))).scalar_one()
    agora = datetime.now(timezone.utc)
    pagamento = MensalidadePagamento(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        mediun_id=medium.id,
        mes_referencia=date(2026, 9, 1),
        status=MensalidadeStatus.PAGO,
        valor_vigente=Decimal("50.00"),
        valor_pago=Decimal("50.00"),
        data_pagamento=agora - timedelta(days=20),
        observacao=f"nota interna da tesouraria {marca}",
    )
    db.add(pagamento)
    await db.flush()
    # Comprovante enviado pela Área (desde a 092, uma linha por comprovante).
    db.add(
        MensalidadeComprovante(
            tenant_id=tenant.id,
            pagamento_id=pagamento.id,
            mediun_id=medium.id,
            origem="medium",
            enviado_em=agora - timedelta(days=21),
            arquivo_data=b"BYTES-DO-COMPROVANTE-" + marca.encode(),
            arquivo_filename=f"comprovante-{marca}.jpg",
            arquivo_mime="image/jpeg",
            status="conferido",
            valor_conferido=Decimal("50.00"),
        )
    )
    aviso = Comunicado(tenant_id=tenant.id, titulo=f"Aviso {marca}", corpo="corpo", publicar_em=agora - timedelta(days=3))
    grupo = CorrenteGrupo(tenant_id=tenant.id, nome=f"Grupo {marca}", cor="vinho")
    atividade = Atividade(
        tenant_id=tenant.id,
        tipo_id=tipo.id,
        titulo=f"Faxina {marca}",
        inicio=agora - timedelta(days=5),
        fim=agora - timedelta(days=5) + timedelta(hours=2),
        origem="manual",
        visibilidade="corrente",
    )
    db.add_all([aviso, grupo, atividade])
    await db.flush()
    db.add_all(
        [
            ComunicadoLeitura(tenant_id=tenant.id, comunicado_id=aviso.id, medium_id=medium.id),
            CorrenteGrupoMembro(tenant_id=tenant.id, grupo_id=grupo.id, medium_id=medium.id),
            AtividadeParticipacao(
                tenant_id=tenant.id,
                atividade_id=atividade.id,
                medium_id=medium.id,
                convocado=True,
                origem="manual",
                resposta="nao_vou",
                respondido_em=agora - timedelta(days=6),
                justificativa=f"Motivo {marca}",
                justificativa_em=agora - timedelta(days=6),
                presenca="ausente",
                presenca_origem="chamada",
            ),
        ]
    )
    await db.commit()


async def test_exportar_traz_so_os_meus_dados(client, db):
    tenant, _ = await _casa(db)
    outro_tenant, _ = await _casa(db, nome="Outra Casa")
    _, ana, h_ana = await _medium_ligado(
        db, tenant, "Ana Paula Ribeiro", nascimento=date(1985, 4, 20), telefone="11987654321",
        observacoes="ANOTACAO-INTERNA", data_saida=date(2031, 1, 1),
    )
    _, bia, _ = await _medium_ligado(db, tenant, "Bia Santos")
    _, carla, _ = await _medium_ligado(db, outro_tenant, "Carla Dias")
    await _semear_dados(db, tenant, ana, "ANA")
    await _semear_dados(db, tenant, bia, "BIA")
    await _semear_dados(db, outro_tenant, carla, "CARLA")

    resp = await client.get(EXPORTAR, headers=h_ana)
    assert resp.status_code == 200, resp.text
    dados = resp.json()
    corpo = resp.text

    assert dados["terreiro"] == "Casa Luz" and dados["formato"] == 1
    assert dados["cadastro"]["nome"] == "Ana Paula Ribeiro"
    assert dados["cadastro"]["data_nascimento"] == "1985-04-20"
    assert dados["consentimento"]["versao_aceita"] == CONSENTIMENTO_AREA_VERSAO
    assert dados["consentimento"]["revogado_em"] is None
    assert dados["grupos"] == [{"nome": "Grupo ANA", "desde": dados["grupos"][0]["desde"]}]
    assert dados["avisos_lidos"][0]["aviso"] == "Aviso ANA" and len(dados["avisos_lidos"]) == 1
    assert dados["avisos_por_email"]["mensalidade"] is True
    [mens] = dados["mensalidades"]
    assert mens["mes"] == "2026-09" and mens["situacao"] == "PAGO" and mens["valor"] == 50.0
    assert mens["comprovante"]["arquivo"] == "comprovante-ANA.jpg" and mens["comprovante"]["tipo"] == "image/jpeg"
    [part] = dados["participacoes"]
    assert part["atividade"] == "Faxina ANA" and part["motivo_contado"] == "Motivo ANA"
    assert part["presenca"] == "ausente" and part["resposta"] == "nao_vou"

    # Nada de outro médium nem de outro terreiro; nada interno; nunca os bytes do comprovante.
    for proibido in ("BIA", "Bia", "CARLA", "Carla", "Outra Casa", "ANOTACAO-INTERNA", "2031-01-01",
                     "BYTES-DO-COMPROVANTE", "nota interna", str(bia.id), str(carla.id)):
        assert proibido not in corpo, proibido


async def test_impersonacao_nao_exporta_nem_encerra(client, db, emails):
    tenant, _ = await _casa(db)
    user, medium, _ = await _medium_ligado(db, tenant, "Ana Paula")
    token = create_access_token(user.id, tenant.id, "medium", impersonated_by=uuid.uuid4())
    h = {"Authorization": f"Bearer {token}"}
    assert (await client.get(MEDIUM_ME, headers=h)).status_code == 200
    assert (await client.get(EXPORTAR, headers=h)).status_code == 403
    assert (await client.post(ENCERRAR, headers=h, json={"senha": SENHA})).status_code == 403
    assert (await client.put(ANIVERSARIO, headers=h, json={"mostrar": False})).status_code == 403
    assert (await _fresh(Medium, medium.id)).user_id == user.id
    assert emails == []


# ── AM-14: encerrar ─────────────────────────────────────────────────────────


async def test_encerrar_conta_medium_desativa_derruba_sessao_avisa_admins_e_aceita_novo_convite(client, db, emails):
    tenant, admin = await _casa(db)
    admin2 = await create_user(db, tenant, UserRole.ADMIN, name="mae-pequena")
    inativo = await create_user(db, tenant, UserRole.ADMIN, name="antigo")
    inativo.user.is_active = False
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="porteiro")
    outro_tenant, admin_outro = await _casa(db, nome="Outra Casa")
    medium = Medium(
        tenant_id=tenant.id, nome="Ana Paula Ribeiro", email="ana.encerra@example.com",
        data_nascimento=date(1990, 1, 5), aniversario_visivel=True,
    )
    db.add(medium)
    await db.commit()
    await _entrar_pelo_convite(client, admin, medium)
    user_id = (await _fresh(Medium, medium.id)).user_id
    assert (await client.get(MEDIUM_ME)).status_code == 200
    emails.clear()

    # Senha errada: 400 (não 401), nada muda e a sessão continua.
    errada = await client.post(ENCERRAR, json={"senha": "Outra-senha-999"})
    assert errada.status_code == 400 and errada.json()["error_code"] == "SENHA_INCORRETA"
    assert (await client.get(MEDIUM_ME)).status_code == 200
    salvo = await _fresh(Medium, medium.id)
    assert salvo.user_id == user_id and salvo.area_consentimento_revogado_em is None
    assert emails == []

    resp = await client.post(ENCERRAR, json={"senha": SENHA})
    assert resp.status_code == 200, resp.text
    assert resp.json()["conta_desativada"] is True and resp.json()["redirect"] == "/login?acesso_encerrado=1"
    apagados = resp.headers.get_list("set-cookie")
    for nome in ("access_token", "refresh_token", "auth_state"):
        assert any(c.startswith(f"{nome}=") and ("Max-Age=0" in c or "expires=" in c.lower()) for c in apagados), nome

    # Vínculo desfeito, consentimento revogado (data + versão), opt-in desligado; cadastro fica.
    salvo = await _fresh(Medium, medium.id)
    assert salvo.user_id is None and salvo.deleted_at is None and salvo.is_active is True
    assert salvo.area_consentimento_revogado_em is not None
    assert salvo.area_consentimento_revogado_versao == CONSENTIMENTO_AREA_VERSAO
    assert salvo.area_consentimento_versao == CONSENTIMENTO_AREA_VERSAO  # o aceite fica como histórico
    assert salvo.aniversario_visivel is False
    conta = await _fresh(User, user_id)
    assert conta.is_active is False and conta.sessions_revoked_at is not None and conta.deleted_at is None

    # A sessão (mesmo um token ainda válido) não entra mais.
    assert (await client.get(MEDIUM_ME, headers={"Authorization": f"Bearer {create_access_token(user_id, tenant.id, 'medium')}"})).status_code == 401

    # Só os administradores ATIVOS deste terreiro recebem o aviso, com o primeiro nome.
    assert sorted(m.to_email for m in emails) == sorted([admin.user.email, admin2.user.email])
    assert all(m.subject == "Ana encerrou o acesso à Área do Médium" for m in emails)
    assert "Ribeiro" not in emails[0].text_body and "Médiuns → Acesso à Área" in emails[0].text_body
    assert operador.user.email not in [m.to_email for m in emails]
    assert admin_outro.user.email not in [m.to_email for m in emails]

    # Auditoria do terreiro: ids/versões, sem nome nem e-mail.
    logs = (
        await db.execute(
            select(AuditLog).where(AuditLog.tenant_id == tenant.id, AuditLog.resource_id == medium.id)
            .order_by(AuditLog.created_at)
        )
    ).scalars().all()
    ultimo = logs[-1]
    assert ultimo.details["new_state"]["acesso_area"] == "encerrado_pelo_medium"
    assert ultimo.details["new_state"]["conta_desativada"] is True
    assert "Ana" not in str(ultimo.details) and "example.com" not in str(ultimo.details)

    # O painel mostra "sem acesso" e a casa pode convidar de novo: a mesma conta volta, com aceite novo.
    client.cookies.clear()
    lista = await client.get(f"{MEDIUNS}?include_inactive=true", headers=admin.headers)
    assert next(m for m in lista.json() if m["id"] == str(medium.id))["acesso_area"]["status"] == "sem_acesso"
    convite = await client.post(f"{MEDIUNS}/{medium.id}/convite", headers=admin.headers)
    assert convite.status_code == 200, convite.text
    volta = await client.post(
        f"{PUBLICO}/{_token(convite.json()['link'])}/aceitar", json={"senha": "Nova-senha-456", "aceite_termo": True}
    )
    assert volta.status_code == 200, volta.text
    assert volta.json()["user"]["id"] == str(user_id)
    assert (await client.get(MEDIUM_ME)).status_code == 200
    de_novo = await _fresh(Medium, medium.id)
    assert de_novo.area_consentimento_em > de_novo.area_consentimento_revogado_em
    # O opt-in do aniversário não volta sozinho.
    assert de_novo.aniversario_visivel is False


async def test_encerrar_operador_medium_so_tira_a_area(client, db, emails):
    tenant, admin = await _casa(db)
    user, medium, h = await _medium_ligado(db, tenant, "Carlos Porteiro", role=UserRole.OPERATOR)
    assert (await client.get(MEDIUM_ME, headers=h)).status_code == 200

    resp = await client.post(ENCERRAR, headers=h, json={"senha": SENHA})
    assert resp.status_code == 200, resp.text
    assert resp.json()["conta_desativada"] is False and resp.json()["redirect"] == "/admin/dashboard"
    assert not any(c.startswith("access_token=") for c in resp.headers.get_list("set-cookie"))

    conta = await _fresh(User, user.id)
    assert conta.is_active is True and conta.role == UserRole.OPERATOR and conta.sessions_revoked_at is None
    salvo = await _fresh(Medium, medium.id)
    assert salvo.user_id is None and salvo.area_consentimento_revogado_em is not None

    # Perdeu só a Área; o painel continua (a mesma sessão).
    assert (await client.get(MEDIUM_ME, headers=h)).status_code == 403
    perfil = await client.get("/api/v1/auth/me", headers=h)
    assert perfil.status_code == 200 and perfil.json()["areas"] == {"admin": True, "medium": None}
    assert (await client.get("/api/v1/admin/dashboard-summary", headers=h)).status_code == 200
    assert [m.to_email for m in emails] == [admin.user.email]


# ── AM-20: opt-in ───────────────────────────────────────────────────────────


async def test_opt_in_do_aniversario_no_perfil(client, db):
    tenant, _ = await _casa(db)
    _, medium, h = await _medium_ligado(db, tenant, "Ana Paula")

    perfil = (await client.get(PERFIL, headers=h)).json()
    assert perfil["mostrar_aniversario"] is False

    sem_data = await client.put(ANIVERSARIO, headers=h, json={"mostrar": True})
    assert sem_data.status_code == 422 and "data de nascimento" in sem_data.json()["message"]
    assert (await _fresh(Medium, medium.id)).aniversario_visivel is False

    assert (await client.patch(PERFIL, headers=h, json={"data_nascimento": "1985-04-20"})).status_code == 200
    ligado = await client.put(ANIVERSARIO, headers=h, json={"mostrar": True})
    assert ligado.status_code == 200 and ligado.json()["mostrar_aniversario"] is True
    assert (await _fresh(Medium, medium.id)).aniversario_visivel is True
    desligado = await client.put(ANIVERSARIO, headers=h, json={"mostrar": False})
    assert desligado.status_code == 200 and desligado.json()["mostrar_aniversario"] is False

    acoes = [
        log.details["new_state"]["acao"]
        for log in (
            await db.execute(
                select(AuditLog)
                .where(AuditLog.tenant_id == tenant.id, AuditLog.resource_type == "medium_perfil")
                .order_by(AuditLog.created_at)
            )
        ).scalars()
    ]
    assert acoes[-2:] == [
        "médium passou a mostrar o aniversário para a corrente",
        "médium deixou de mostrar o aniversário para a corrente",
    ]
    assert (await client.put(ANIVERSARIO, headers=h, json={"mostrar": True, "ano": 1})).status_code == 422


# ── AM-20: Início ───────────────────────────────────────────────────────────


async def test_aniversariantes_da_semana_respeitam_opt_in_semana_e_terreiro(client, db, hoje):
    # Quarta, 14/10/2026: a semana vai de segunda 12/10 a domingo 18/10.
    hoje(date(2026, 10, 14))
    tenant, _ = await _casa(db)
    outro, _ = await _casa(db, nome="Outra Casa")
    _, _, h = await _medium_ligado(db, tenant, "Ana Paula", nascimento=date(1985, 4, 20), visivel=True)
    await _medium_ligado(db, tenant, "Bia Santos", nascimento=date(1991, 10, 12), visivel=True)  # segunda
    await _medium_ligado(db, tenant, "Caio Lima", nascimento=date(1979, 10, 18), visivel=True)  # domingo
    await _medium_ligado(db, tenant, "Duda Reis", nascimento=date(1988, 10, 14), visivel=True)  # hoje
    await _medium_ligado(db, tenant, "Edu Fora", nascimento=date(1990, 10, 11), visivel=True)  # domingo anterior
    await _medium_ligado(db, tenant, "Fabi Fora", nascimento=date(1990, 10, 19), visivel=True)  # segunda seguinte
    await _medium_ligado(db, tenant, "Gabi Oculta", nascimento=date(1990, 10, 15), visivel=False)  # sem opt-in
    await _medium_ligado(db, tenant, "Hugo Inativo", nascimento=date(1990, 10, 15), visivel=True, is_active=False)
    await _medium_ligado(db, outro, "Iara Outra", nascimento=date(1990, 10, 15), visivel=True)  # outro terreiro
    sem_area = Medium(tenant_id=tenant.id, nome="Juca SemArea", data_nascimento=date(1990, 10, 15), aniversario_visivel=True)
    db.add(sem_area)
    await db.commit()

    resp = await client.get(INICIO, headers=h)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["aniversariantes"] == [
        {"primeiro_nome": "Bia", "dia": 12, "mes": 10, "hoje": False, "sou_eu": False},
        {"primeiro_nome": "Duda", "dia": 14, "mes": 10, "hoje": True, "sou_eu": False},
        {"primeiro_nome": "Caio", "dia": 18, "mes": 10, "hoje": False, "sou_eu": False},
    ]
    # Nunca o ano nem sobrenome.
    for proibido in ("1991", "1979", "1988", "Santos", "Lima", "Reis"):
        assert proibido not in str(body["aniversariantes"])
    assert body["meu_aniversario"] is None


async def test_meu_aniversario_mostra_a_mensagem_da_casa_sem_opt_in(client, db, hoje):
    hoje(date(2026, 4, 20))
    tenant, admin = await _casa(db, nome="Tenda Luz")
    _, _, h = await _medium_ligado(db, tenant, "Ana Paula", nascimento=date(1985, 4, 20), visivel=False)

    body = (await client.get(INICIO, headers=h)).json()
    assert body["meu_aniversario"] == {"mensagem": "A Tenda Luz deseja um feliz aniversário, Ana! Axé!"}
    # Sem opt-in, não aparece para a corrente (nem para ele na lista).
    assert body["aniversariantes"] == []

    # Mensagem da casa (Configurações → Área do Médium), com {nome}.
    longa = await client.put(CONFIG, headers=admin.headers, json={"aniversario_mensagem": "x" * 201})
    assert longa.status_code == 422
    resp = await client.put(
        CONFIG, headers=admin.headers, json={"aniversario_mensagem": "  Parabéns, {nome}! <b>Oxalá</b> te abençoe.  "}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["aniversario_mensagem"] == "Parabéns, {nome}! Oxalá te abençoe."
    body = (await client.get(INICIO, headers=h)).json()
    assert body["meu_aniversario"] == {"mensagem": "Parabéns, Ana! Oxalá te abençoe."}

    # Vazio volta ao padrão.
    assert (await client.put(CONFIG, headers=admin.headers, json={"aniversario_mensagem": ""})).json()[
        "aniversario_mensagem"
    ] is None
    hoje(date(2026, 4, 21))
    assert (await client.get(INICIO, headers=h)).json()["meu_aniversario"] is None


async def test_aniversariante_com_opt_in_se_ve_na_lista(client, db, hoje):
    hoje(date(2027, 3, 1))  # 2027 não é bissexto: 29/02 vira 01/03
    tenant, _ = await _casa(db)
    _, _, h = await _medium_ligado(db, tenant, "Ana Paula", nascimento=date(1992, 2, 29), visivel=True)
    body = (await client.get(INICIO, headers=h)).json()
    assert body["aniversariantes"] == [{"primeiro_nome": "Ana", "dia": 1, "mes": 3, "hoje": True, "sou_eu": True}]
    assert body["meu_aniversario"] is not None
