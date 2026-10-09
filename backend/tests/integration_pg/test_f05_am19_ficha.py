"""F-05 (ficha espiritual no painel) + AM-19 (minha caminhada na Área), com Postgres real.

- RBAC: `FICHA_ESPIRITUAL` separada de `MEDIUNS`; operador do grupo padrão "Acesso total" NÃO tem
  (exceção consciente); operador com o grupo marcado acessa; admin faz bypass.
- Plano: fora do Pro → 403 no painel; na Área, 403 neutro e `ficha = false` em `/medium/me`.
- Consentimento explícito antes de gravar (409), registrado pela direção (com a versão do texto)
  ou pelo médium na Área; revogar deixa os dados inacessíveis, avisa os admins (e-mail discreto) e
  a direção apaga.
- Vazamento: lista de médiuns, auditoria e e-mail nunca levam valores da ficha.
- Isolamento entre terreiros: ids de outro terreiro → 404/422 sem gravar.
- Área: só campos e marcos visíveis do próprio médium; sugestão só entra depois de aceita;
  impersonação lê mas não escreve.
- Migração 088/089 sobe e desce.
"""
from __future__ import annotations

import json
import subprocess
import sys
import uuid

import pytest
from sqlalchemy import func, select, text

from src.models import AuditLog, FichaSugestao, FichaValor, Medium, MediumMarco
from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.users import UserRole
from src.security.jwt import create_access_token
from src.services.ficha_espiritual import CONSENTIMENTO_FICHA_VERSAO

from .conftest import BACKEND_DIR
from .factories import create_tenant, create_user, grant

BASE = "/api/v1/admin/mediuns"
CAMPOS = f"{BASE}/ficha-campos"
PENDENCIAS = f"{BASE}/ficha-pendencias"
AREA = "/api/v1/medium/ficha"

ORIXA = "Oxóssi e Iemanjá"
GUIA = "Caboclo Sete Flechas"
TITULO_MARCO = "Obrigação de sete anos na casa"


@pytest.fixture
def emails(monkeypatch):
    from src.services.email.email_queue import email_queue

    enviados = []
    monkeypatch.setattr(email_queue, "enqueue", lambda item: enviados.append(item.message))
    return enviados


async def _cenario(db, *, plan=PlanType.PRO, nome="Casa Ficha", liberada=True):
    tenant = await create_tenant(db, name=nome, plan=plan, area_medium_liberada=liberada)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="dirigente")
    actor = await create_user(db, tenant, UserRole.MEDIUM, name="ana")
    medium = Medium(tenant_id=tenant.id, nome="Ana Paula", is_atendimento=True, is_active=True, user_id=actor.user.id)
    db.add(medium)
    await db.commit()
    return tenant, admin, actor, medium


async def _aplicar_umbanda(client, admin) -> dict[str, dict]:
    resp = await client.post(f"{CAMPOS}/modelos/umbanda", headers=admin.headers)
    assert resp.status_code == 201, resp.text
    return {c["chave"]: c for c in resp.json()}


async def _consentir(client, admin, medium):
    resp = await client.post(
        f"{BASE}/{medium.id}/ficha/consentimento",
        headers=admin.headers,
        json={"confirmo": True, "versao": CONSENTIMENTO_FICHA_VERSAO},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _contar(model, medium_id) -> int:
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        return (
            await fresh.execute(select(func.count()).select_from(model).where(model.medium_id == medium_id))
        ).scalar_one()


async def _auditoria_texto(tenant_id) -> str:
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        rows = (await fresh.execute(select(AuditLog).where(AuditLog.tenant_id == tenant_id))).scalars().all()
    return json.dumps(
        [[r.resource_type, r.details] for r in rows], ensure_ascii=False, default=str
    )


# ── RBAC e plano ────────────────────────────────────────────────────────────


async def test_grupo_padrao_nao_tem_ficha_e_operador_dele_leva_403(client, db):
    tenant, admin, _, medium = await _cenario(db)
    suffix = uuid.uuid4().hex[:6]
    resp = await client.post(
        "/api/v1/admin/users",
        headers=admin.headers,
        json={"email": f"op-{suffix}@example.com", "username": f"op-{suffix}", "password": "Senha-forte-123", "role": "operator"},
    )
    assert resp.status_code == 201, resp.text
    op_token = create_access_token(uuid.UUID(resp.json()["id"]), tenant.id, "operator")
    op = {"Authorization": f"Bearer {op_token}"}

    # O grupo padrão abre os médiuns, mas não a ficha.
    assert (await client.get(BASE, headers=op)).status_code == 200
    assert (await client.get(CAMPOS, headers=op)).status_code == 403
    assert (await client.get(f"{BASE}/{medium.id}/ficha", headers=op)).status_code == 403
    perms = (await client.get("/api/v1/admin/permission-groups/me/permissions", headers=op)).json()
    assert perms["ficha_espiritual"] == {"view": False, "insert": False, "edit": False, "delete": False}
    assert perms["mediuns"]["view"] is True

    from src.core.database import engine

    async with engine.connect() as conn:
        n = (
            await conn.execute(
                text(
                    "SELECT count(*) FROM group_permissions gp JOIN permission_groups pg ON pg.id = gp.group_id "
                    "WHERE pg.tenant_id = :t AND pg.is_default AND gp.feature = 'ficha_espiritual'"
                ),
                {"t": tenant.id},
            )
        ).scalar_one()
    assert n == 0

    # Admin faz bypass dos grupos.
    assert (await client.get(CAMPOS, headers=admin.headers)).status_code == 200


async def test_operador_com_o_grupo_marcado_ve_e_so_edita_com_edit(client, db):
    tenant, admin, _, medium = await _cenario(db)
    leitor = await create_user(db, tenant, UserRole.OPERATOR, name="leitor")
    await grant(db, leitor, tenant, PermissionFeature.FICHA_ESPIRITUAL, "view")
    campos = await _aplicar_umbanda(client, admin)
    await _consentir(client, admin, medium)

    assert (await client.get(f"{BASE}/{medium.id}/ficha", headers=leitor.headers)).status_code == 200
    body = {"valores": [{"campo_id": campos["umb_orixa_de_cabeca"]["id"], "valor": ORIXA}]}
    assert (await client.put(f"{BASE}/{medium.id}/ficha", headers=leitor.headers, json=body)).status_code == 403
    assert (await client.post(f"{CAMPOS}/modelos/candomble", headers=leitor.headers)).status_code == 403
    # Só a ficha: sem MEDIUNS ele não abre o cadastro.
    assert (await client.get(BASE, headers=leitor.headers)).status_code == 403

    editor = await create_user(db, tenant, UserRole.OPERATOR, name="editor")
    await grant(db, editor, tenant, PermissionFeature.FICHA_ESPIRITUAL, "view", "edit")
    assert (await client.put(f"{BASE}/{medium.id}/ficha", headers=editor.headers, json=body)).status_code == 200


async def test_fora_do_plano_pro_painel_403(client, db):
    _, admin, _, medium = await _cenario(db, plan=PlanType.BASIC)
    resp = await client.get(CAMPOS, headers=admin.headers)
    assert resp.status_code == 403
    assert "Pro" in resp.text
    assert (await client.get(f"{BASE}/{medium.id}/ficha", headers=admin.headers)).status_code == 403


# ── Consentimento, gravação e vazamentos ────────────────────────────────────


async def test_sem_consentimento_nada_se_grava(client, db):
    _, admin, _, medium = await _cenario(db)
    campos = await _aplicar_umbanda(client, admin)
    body = {"valores": [{"campo_id": campos["umb_orixa_de_cabeca"]["id"], "valor": ORIXA}]}

    resp = await client.put(f"{BASE}/{medium.id}/ficha", headers=admin.headers, json=body)
    assert resp.status_code == 409 and "FICHA_SEM_CONSENTIMENTO" in resp.text
    marco = {"tipo": "batismo", "data": "2020-05-10"}
    assert (await client.post(f"{BASE}/{medium.id}/marcos", headers=admin.headers, json=marco)).status_code == 409
    assert await _contar(FichaValor, medium.id) == 0
    assert await _contar(MediumMarco, medium.id) == 0

    # Caixa desmarcada ou versão antiga do texto: recusado.
    url = f"{BASE}/{medium.id}/ficha/consentimento"
    assert (await client.post(url, headers=admin.headers, json={"confirmo": False, "versao": CONSENTIMENTO_FICHA_VERSAO})).status_code == 422
    assert (await client.post(url, headers=admin.headers, json={"confirmo": True, "versao": "0"})).status_code == 422

    consent = await _consentir(client, admin, medium)
    assert consent["dado"] is True and consent["versao"] == CONSENTIMENTO_FICHA_VERSAO
    salvo = (await client.get(f"{BASE}/{medium.id}/ficha", headers=admin.headers)).json()
    assert salvo["consentimento"]["dado"] is True


async def test_admin_preenche_ficha_e_caminhada_sem_vazar_em_lista_e_auditoria(client, db):
    tenant, admin, _, medium = await _cenario(db)
    campos = await _aplicar_umbanda(client, admin)
    # Modelo de novo não duplica.
    assert (await client.post(f"{CAMPOS}/modelos/umbanda", headers=admin.headers)).json() == []
    await _consentir(client, admin, medium)

    body = {
        "valores": [
            {"campo_id": campos["umb_orixa_de_cabeca"]["id"], "valor": ORIXA},
            {"campo_id": campos["umb_guia_de_frente"]["id"], "valor": GUIA},
            {"campo_id": campos["umb_data_batismo"]["id"], "valor": "2019-03-10"},
        ]
    }
    resp = await client.put(f"{BASE}/{medium.id}/ficha", headers=admin.headers, json=body)
    assert resp.status_code == 200, resp.text
    valores = {c["chave"]: c["valor"] for c in resp.json()["campos"]}
    assert valores["umb_orixa_de_cabeca"] == ORIXA and valores["umb_data_batismo"] == "2019-03-10"

    # Data inválida → 422.
    ruim = {"valores": [{"campo_id": campos["umb_data_batismo"]["id"], "valor": "10/03/2019"}]}
    assert (await client.put(f"{BASE}/{medium.id}/ficha", headers=admin.headers, json=ruim)).status_code == 422

    marco = await client.post(
        f"{BASE}/{medium.id}/marcos",
        headers=admin.headers,
        json={"tipo": "obrigacao", "titulo": TITULO_MARCO, "data": "2024-01-20", "observacao": "Com a mãe pequena"},
    )
    assert marco.status_code == 201, marco.text
    oculto = await client.post(
        f"{BASE}/{medium.id}/marcos",
        headers=admin.headers,
        json={"tipo": "outro", "titulo": "Anotação da direção", "data": "2024-02-01", "visivel_ao_medium": False},
    )
    assert oculto.status_code == 201
    lista = (await client.get(f"{BASE}/{medium.id}/marcos", headers=admin.headers)).json()
    assert [m["titulo"] for m in lista["marcos"]] == [TITULO_MARCO, "Anotação da direção"]

    # Cadastro de médiuns (MEDIUNS) não leva nada da ficha.
    mediuns = await client.get(BASE, headers=admin.headers)
    assert mediuns.status_code == 200
    for proibido in (ORIXA, GUIA, TITULO_MARCO, "consentimento_dado_religioso"):
        assert proibido not in mediuns.text
    options = await client.get(f"{BASE}/options", headers=admin.headers)
    assert ORIXA not in options.text and "consentimento" not in options.text

    # Auditoria: só ids e contagens.
    auditoria = await _auditoria_texto(tenant.id)
    assert "ficha_espiritual" in auditoria
    for proibido in (ORIXA, GUIA, TITULO_MARCO, "Com a mãe pequena", "2019-03-10"):
        assert proibido not in auditoria


async def test_campo_configuravel_lista_e_sugestao_exige_visivel(client, db):
    _, admin, _, _ = await _cenario(db)
    resp = await client.post(
        CAMPOS,
        headers=admin.headers,
        json={"rotulo": "Nação", "tipo": "lista", "tradicao": "candomble", "opcoes": ["Ketu", "Angola", "ketu"],
              "medium_pode_sugerir": True},
    )
    assert resp.status_code == 201, resp.text
    campo = resp.json()
    assert campo["chave"] == "nacao" and campo["opcoes"] == ["Ketu", "Angola"]
    assert campo["visivel_ao_medium"] is True  # sugerir exige que o médium veja
    sem_opcoes = await client.post(CAMPOS, headers=admin.headers, json={"rotulo": "Linha", "tipo": "lista"})
    assert sem_opcoes.status_code == 422
    # Esconder do médium tira o "pode sugerir".
    edit = await client.put(f"{CAMPOS}/{campo['id']}", headers=admin.headers, json={"visivel_ao_medium": False})
    assert edit.json()["medium_pode_sugerir"] is False
    arq = await client.delete(f"{CAMPOS}/{campo['id']}", headers=admin.headers)
    assert arq.status_code == 204
    assert all(c["id"] != campo["id"] for c in (await client.get(CAMPOS, headers=admin.headers)).json())


# ── Isolamento entre terreiros ──────────────────────────────────────────────


async def test_ids_de_outro_terreiro_404_ou_422_sem_gravar(client, db):
    _, admin_a, _, medium_a = await _cenario(db, nome="Casa A")
    _, admin_b, _, medium_b = await _cenario(db, nome="Casa B")
    campos_a = await _aplicar_umbanda(client, admin_a)
    await _aplicar_umbanda(client, admin_b)
    await _consentir(client, admin_a, medium_a)
    await _consentir(client, admin_b, medium_b)
    campo_a = campos_a["umb_orixa_de_cabeca"]["id"]

    assert (await client.get(f"{BASE}/{medium_a.id}/ficha", headers=admin_b.headers)).status_code == 404
    assert (
        await client.put(f"{BASE}/{medium_a.id}/ficha", headers=admin_b.headers, json={"valores": [{"campo_id": campo_a, "valor": "x"}]})
    ).status_code == 404
    # Campo de A na ficha de um médium de B.
    assert (
        await client.put(f"{BASE}/{medium_b.id}/ficha", headers=admin_b.headers, json={"valores": [{"campo_id": campo_a, "valor": "x"}]})
    ).status_code == 422
    assert (await client.put(f"{CAMPOS}/{campo_a}", headers=admin_b.headers, json={"rotulo": "Hack"})).status_code == 404
    assert (
        await client.post(f"{BASE}/{medium_a.id}/marcos", headers=admin_b.headers, json={"tipo": "batismo", "data": "2020-01-01"})
    ).status_code == 404
    assert (
        await client.post(f"{BASE}/{medium_a.id}/ficha/consentimento", headers=admin_b.headers,
                          json={"confirmo": True, "versao": CONSENTIMENTO_FICHA_VERSAO})
    ).status_code == 404
    marco_a = await client.post(f"{BASE}/{medium_a.id}/marcos", headers=admin_a.headers, json={"tipo": "batismo", "data": "2020-01-01"})
    assert (await client.delete(f"{BASE}/{medium_b.id}/marcos/{marco_a.json()['id']}", headers=admin_b.headers)).status_code == 404
    assert await _contar(FichaValor, medium_a.id) == 0
    assert await _contar(FichaValor, medium_b.id) == 0
    assert await _contar(MediumMarco, medium_a.id) == 1


# ── Área do Médium (AM-19) ──────────────────────────────────────────────────


async def test_area_ve_so_campos_e_marcos_visiveis_e_so_os_proprios(client, db):
    tenant, admin, actor, medium = await _cenario(db)
    outro_actor = await create_user(db, tenant, UserRole.MEDIUM, name="beto")
    outro = Medium(tenant_id=tenant.id, nome="Beto", is_active=True, user_id=outro_actor.user.id)
    db.add(outro)
    await db.commit()

    campos = await _aplicar_umbanda(client, admin)
    await _consentir(client, admin, medium)
    await _consentir(client, admin, outro)
    await client.put(
        f"{BASE}/{medium.id}/ficha",
        headers=admin.headers,
        json={"valores": [
            {"campo_id": campos["umb_orixa_de_cabeca"]["id"], "valor": ORIXA},
            {"campo_id": campos["umb_guia_de_frente"]["id"], "valor": GUIA},
        ]},
    )
    await client.put(
        f"{BASE}/{outro.id}/ficha",
        headers=admin.headers,
        json={"valores": [{"campo_id": campos["umb_orixa_de_cabeca"]["id"], "valor": "Ogum do Beto"}]},
    )
    await client.post(f"{BASE}/{medium.id}/marcos", headers=admin.headers, json={"tipo": "batismo", "titulo": "Batismo", "data": "2019-03-10"})
    await client.post(
        f"{BASE}/{medium.id}/marcos", headers=admin.headers,
        json={"tipo": "outro", "titulo": "Nota interna", "data": "2020-01-01", "visivel_ao_medium": False},
    )

    me = (await client.get("/api/v1/medium/me", headers=actor.headers)).json()
    assert me["ficha"] is True
    resp = await client.get(AREA, headers=actor.headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert [c["rotulo"] for c in body["campos"]] == ["Orixá de cabeça"]  # só o visível por padrão
    assert body["campos"][0]["valor"] == ORIXA
    assert [m["titulo"] for m in body["marcos"]] == ["Batismo"]
    for proibido in (GUIA, "Nota interna", "Ogum do Beto"):
        assert proibido not in resp.text


async def test_area_sem_consentimento_nao_mostra_nada_e_medium_autoriza(client, db):
    _, admin, actor, medium = await _cenario(db)
    campos = await _aplicar_umbanda(client, admin)
    vazio = (await client.get(AREA, headers=actor.headers)).json()
    assert vazio["consentimento"]["dado"] is False and vazio["campos"] == [] and vazio["marcos"] == []

    sug = {"campo_id": campos["umb_orixa_de_cabeca"]["id"], "valor": ORIXA}
    assert (await client.post(f"{AREA}/sugestoes", headers=actor.headers, json=sug)).status_code == 409

    resp = await client.post(f"{AREA}/consentimento", headers=actor.headers, json={"confirmo": True, "versao": CONSENTIMENTO_FICHA_VERSAO})
    assert resp.status_code == 200, resp.text
    assert resp.json()["consentimento"]["dado"] is True
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        m = (await fresh.execute(select(Medium).where(Medium.id == medium.id))).scalar_one()
    assert m.consentimento_dado_religioso_por == actor.user.id
    assert m.consentimento_dado_religioso_versao == CONSENTIMENTO_FICHA_VERSAO


async def test_sugestao_so_entra_depois_de_aceita(client, db):
    tenant, admin, actor, medium = await _cenario(db)
    campos = await _aplicar_umbanda(client, admin)
    orixa = campos["umb_orixa_de_cabeca"]["id"]
    guia = campos["umb_guia_de_frente"]["id"]
    await _consentir(client, admin, medium)

    # Campo sem "pode sugerir" → 422.
    assert (await client.post(f"{AREA}/sugestoes", headers=actor.headers, json={"campo_id": orixa, "valor": ORIXA})).status_code == 422
    # Campo oculto também (mesmo marcado, precisa estar visível — o painel garante).
    await client.put(f"{CAMPOS}/{orixa}", headers=admin.headers, json={"medium_pode_sugerir": True})

    resp = await client.post(f"{AREA}/sugestoes", headers=actor.headers, json={"campo_id": orixa, "valor": "Oxóssi"})
    assert resp.status_code == 201, resp.text
    resp = await client.post(f"{AREA}/sugestoes", headers=actor.headers, json={"campo_id": orixa, "valor": ORIXA})
    campo = resp.json()["campos"][0]
    assert campo["valor"] is None and campo["sugestao_pendente"]["valor"] == ORIXA  # uma pendente, trocada
    assert await _contar(FichaValor, medium.id) == 0
    assert await _contar(FichaSugestao, medium.id) == 1
    # Campo de outro terreiro → 404.
    _, admin_b, _, _ = await _cenario(db, nome="Casa B")
    campos_b = await _aplicar_umbanda(client, admin_b)
    fora = {"campo_id": campos_b["umb_orixa_de_cabeca"]["id"], "valor": "x"}
    assert (await client.post(f"{AREA}/sugestoes", headers=actor.headers, json=fora)).status_code == 404
    # Campo oculto de B não; de A oculto (guia) → 422.
    assert (await client.post(f"{AREA}/sugestoes", headers=actor.headers, json={"campo_id": guia, "valor": "x"})).status_code == 422

    pend = (await client.get(PENDENCIAS, headers=admin.headers)).json()
    assert len(pend["sugestoes"]) == 1 and pend["sugestoes"][0]["valor_sugerido"] == ORIXA
    sid = pend["sugestoes"][0]["id"]
    # Outro terreiro não decide.
    assert (await client.post(f"{BASE}/ficha-sugestoes/{sid}/aceitar", headers=admin_b.headers)).status_code == 404
    assert (await client.post(f"{BASE}/ficha-sugestoes/{sid}/aceitar", headers=admin.headers)).status_code == 200
    assert (await client.post(f"{BASE}/ficha-sugestoes/{sid}/aceitar", headers=admin.headers)).status_code == 404
    area = (await client.get(AREA, headers=actor.headers)).json()
    assert area["campos"][0]["valor"] == ORIXA and area["campos"][0]["sugestao_pendente"] is None

    # Recusar não grava.
    await client.post(f"{AREA}/sugestoes", headers=actor.headers, json={"campo_id": orixa, "valor": "Xangô"})
    sid2 = (await client.get(PENDENCIAS, headers=admin.headers)).json()["sugestoes"][0]["id"]
    assert (await client.post(f"{BASE}/ficha-sugestoes/{sid2}/recusar", headers=admin.headers)).status_code == 200
    area = (await client.get(AREA, headers=actor.headers)).json()
    assert area["campos"][0]["valor"] == ORIXA
    assert "Xangô" not in await _auditoria_texto(tenant.id)


async def test_impersonacao_le_mas_nao_escreve(client, db):
    tenant, admin, actor, medium = await _cenario(db)
    token = create_access_token(actor.user.id, tenant.id, "medium", impersonated_by=uuid.uuid4())
    h = {"Authorization": f"Bearer {token}"}
    assert (await client.get(AREA, headers=h)).status_code == 200
    body = {"confirmo": True, "versao": CONSENTIMENTO_FICHA_VERSAO}
    assert (await client.post(f"{AREA}/consentimento", headers=h, json=body)).status_code == 403
    await _consentir(client, admin, medium)
    assert (await client.delete(f"{AREA}/consentimento", headers=h)).status_code == 403
    assert (await client.get(f"{BASE}/{medium.id}/ficha", headers=admin.headers)).json()["consentimento"]["dado"] is True


async def test_medium_retira_autorizacao_dados_somem_direcao_avisada_e_apaga(client, db, emails):
    tenant, admin, actor, medium = await _cenario(db)
    campos = await _aplicar_umbanda(client, admin)
    await _consentir(client, admin, medium)
    await client.put(
        f"{BASE}/{medium.id}/ficha",
        headers=admin.headers,
        json={"valores": [{"campo_id": campos["umb_orixa_de_cabeca"]["id"], "valor": ORIXA}]},
    )
    await client.post(f"{BASE}/{medium.id}/marcos", headers=admin.headers, json={"tipo": "batismo", "titulo": TITULO_MARCO, "data": "2019-03-10"})

    resp = await client.delete(f"{AREA}/consentimento", headers=actor.headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["consentimento"]["dado"] is False and resp.json()["campos"] == []

    # E-mail aos admins, discreto: sem nome do médium nem dado da ficha.
    assert [m.to_email for m in emails] == [admin.user.email]
    texto = emails[0].subject + emails[0].html_body
    for proibido in (ORIXA, TITULO_MARCO, "Ana Paula", "orixá", "Orixá", "religi"):
        assert proibido not in texto

    ficha = (await client.get(f"{BASE}/{medium.id}/ficha", headers=admin.headers)).json()
    assert ficha["consentimento"]["dado"] is False and ficha["consentimento"]["revogado_em"]
    assert all(c["valor"] is None for c in ficha["campos"])
    assert ficha["registros_guardados"] == 2
    assert ORIXA not in json.dumps(ficha, ensure_ascii=False)
    marcos = await client.get(f"{BASE}/{medium.id}/marcos", headers=admin.headers)
    assert marcos.json()["marcos"] == []
    pend = (await client.get(PENDENCIAS, headers=admin.headers)).json()
    assert [r["medium_nome"] for r in pend["revogacoes"]] == ["Ana Paula"]
    body = {"valores": [{"campo_id": campos["umb_orixa_de_cabeca"]["id"], "valor": "outro"}]}
    assert (await client.put(f"{BASE}/{medium.id}/ficha", headers=admin.headers, json=body)).status_code == 409

    apagar = await client.delete(f"{BASE}/{medium.id}/ficha", headers=admin.headers)
    assert apagar.status_code == 200 and apagar.json()["apagados"] == 2
    assert await _contar(FichaValor, medium.id) == 0 and await _contar(MediumMarco, medium.id) == 0
    assert (await client.get(PENDENCIAS, headers=admin.headers)).json()["revogacoes"] == []


async def test_area_sem_o_plano_da_ficha_responde_403_neutro(client, db):
    _, _, actor, _ = await _cenario(db, plan=PlanType.BASIC)
    me = (await client.get("/api/v1/medium/me", headers=actor.headers)).json()
    assert me["ficha"] is False
    resp = await client.get(AREA, headers=actor.headers)
    assert resp.status_code == 403
    assert "MEDIUM_MODULO_INDISPONIVEL" in resp.text and "plano" not in resp.text.lower()


# ── Migração ────────────────────────────────────────────────────────────────


def _alembic(*args):
    subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR, check=True, capture_output=True)


async def test_migracao_089_sobe_e_desce(client, db):
    from src.core.database import engine

    async def _tabelas():
        async with engine.connect() as conn:
            return set((await conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))).scalars())

    novas = {"ficha_campos", "ficha_valores", "medium_marcos", "ficha_sugestoes"}
    assert novas <= await _tabelas()
    _alembic("downgrade", "087_materiais_corrente")
    try:
        assert not (novas & await _tabelas())
        async with engine.connect() as conn:
            colunas = set(
                (
                    await conn.execute(
                        text("SELECT column_name FROM information_schema.columns WHERE table_name = 'mediuns'")
                    )
                ).scalars()
            )
            enum = (
                await conn.execute(
                    text("SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid "
                         "WHERE t.typname = 'permission_feature' AND e.enumlabel = 'ficha_espiritual'")
                )
            ).scalar_one()
        assert "consentimento_dado_religioso_em" not in colunas
        assert enum == 1  # valor de ENUM não sai no downgrade (088 é no-op ao descer)
    finally:
        _alembic("upgrade", "head")
    assert novas <= await _tabelas()
