"""AM-29 — ajustes do piloto da Área do Médium, com Postgres real (migrações + app via HTTP).

- "Pôr na escala" com grupos inteiros: só os membros ATIVOS naquele momento, respeitando quem o
  tipo alcança (os de fora voltam no resultado), origem "grupo" + `grupo_id`, sem duplicar nem
  rebaixar a linha de quem já estava, médiuns e grupos na mesma chamada; grupo de outro terreiro
  ou arquivado → 422 sem gravar nada; sem ESCALAS:insert → 403.
- Início: `mensalidade.pix_disponivel` true/false sem revelar a chave.
- Perfil: tirar a foto (volta às iniciais; auditoria sem valores; impersonando → 403).
"""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import func, select, text, update

from src.models import AtividadeParticipacao, Medium, MensalidadeConfig
from src.models.audit_logs import AuditLog
from src.models.atividades import AtividadeTipo, AtividadeTipoGrupo
from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.users import User, UserRole
from src.security.jwt import create_access_token
from src.services.atividades import ensure_default_atividade_tipos

from .factories import create_tenant, create_user, grant

ADMIN = "/api/v1/admin/atividades"
GRUPOS = "/api/v1/admin/corrente-grupos"
MEDIUM = "/api/v1/medium"
JPEG = b"\xff\xd8\xff\xe0" + b"foto-de-teste" * 20


@pytest.fixture(autouse=True)
def _sem_cookies(client):
    client.cookies.clear()
    yield
    client.cookies.clear()


def _em_dias(dias: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=dias)).isoformat()


async def _cenario(db, nome="Terreiro AM29"):
    tenant = await create_tenant(db, name=nome, plan=PlanType.BASIC, area_medium_liberada=True)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="dirigente")
    await ensure_default_atividade_tipos(db, tenant.id)
    await db.commit()
    return tenant, admin


async def _medium(db, tenant, nome, *, atendimento=True):
    actor = await create_user(db, tenant, UserRole.MEDIUM, name=nome.split()[0].lower())
    medium = Medium(tenant_id=tenant.id, nome=nome, is_atendimento=atendimento, user_id=actor.user.id)
    db.add(medium)
    await db.commit()
    return actor, medium


async def _grupo(client, admin, nome, mediuns):
    resp = await client.post(GRUPOS, headers=admin.headers, json={"nome": nome, "medium_ids": [str(m.id) for m in mediuns]})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _tipo(db, tenant, nome) -> AtividadeTipo:
    return (
        await db.execute(select(AtividadeTipo).where(AtividadeTipo.tenant_id == tenant.id, AtividadeTipo.nome == nome))
    ).scalar_one()


async def _faxina(client, admin, db, tenant, titulo="Faxina · G1", **tipo_kw):
    """Faxina = "só escalados" (ninguém está na escala sem ser posto)."""
    tipo = await _tipo(db, tenant, "Faxina")
    if tipo_kw:
        await db.execute(update(AtividadeTipo).where(AtividadeTipo.id == tipo.id).values(**tipo_kw))
        await db.commit()
    resp = await client.post(ADMIN, headers=admin.headers, json={"tipo_id": str(tipo.id), "titulo": titulo, "inicio": _em_dias(3)})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"], tipo


async def _convocar(client, actor, atividade_id, *, mediuns=(), grupos=()):
    return await client.post(
        f"{ADMIN}/{atividade_id}/convocar",
        headers=actor.headers,
        json={"medium_ids": [str(m.id) for m in mediuns], "grupo_ids": [str(g) for g in grupos]},
    )


async def _linhas(atividade_id) -> dict:
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        rows = await fresh.execute(
            select(AtividadeParticipacao).where(AtividadeParticipacao.atividade_id == uuid.UUID(str(atividade_id)))
        )
        return {p.medium_id: p for p in rows.scalars()}


# ── 1. Convocar grupos inteiros ─────────────────────────────────────────────


async def test_grupo_entra_so_com_membros_ativos_e_elegiveis(client, db):
    tenant, admin = await _cenario(db)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    _, beto_m = await _medium(db, tenant, "Beto Cambone", atendimento=False)
    _, caio_m = await _medium(db, tenant, "Caio Silva")
    g1 = await _grupo(client, admin, "G1", [ana_m, beto_m, caio_m])
    # Caio saiu da casa depois de entrar no grupo (a linha do grupo ficou): não entra.
    await db.execute(update(Medium).where(Medium.id == caio_m.id).values(is_active=False))
    await db.commit()
    # O tipo só alcança quem é de atendimento: Beto (cambone) fica de fora.
    faxina, _ = await _faxina(client, admin, db, tenant, elegiveis="atendimento")

    resp = await _convocar(client, admin, faxina, grupos=[g1])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["resultado"] == {
        "novos": 1,
        "ja_estavam": 0,
        "fora_da_elegibilidade": 1,
        "fora_da_elegibilidade_nomes": ["Beto Cambone"],
    }
    linhas = await _linhas(faxina)
    assert set(linhas) == {ana_m.id}
    assert (linhas[ana_m.id].origem, str(linhas[ana_m.id].grupo_id), linhas[ana_m.id].convocado) == ("grupo", g1, True)
    pessoas = {p["nome"]: p for p in body["pessoas"]}
    assert pessoas["Ana Paula"]["grupo"] == "G1" and pessoas["Ana Paula"]["origem"] == "grupo"
    # Na escala de verdade: a Ana já pode responder.
    r = await client.post(f"{MEDIUM}/atividades/atividade/{faxina}/resposta", headers=ana.headers, json={"resposta": "vou"})
    assert r.status_code == 200, r.text
    # Auditoria: só ids, nunca nomes.
    log = (
        await db.execute(
            select(AuditLog).where(AuditLog.tenant_id == tenant.id, AuditLog.resource_type == "atividade_escala")
        )
    ).scalars().all()[-1]
    assert log.details["new_state"]["grupos"] == [g1] and "Ana" not in str(log.details)


async def test_elegibilidade_por_grupos_do_tipo(client, db):
    tenant, admin = await _cenario(db)
    _, ana_m = await _medium(db, tenant, "Ana Paula")
    _, dani_m = await _medium(db, tenant, "Dani Souza")
    g1 = await _grupo(client, admin, "G1", [ana_m])
    g2 = await _grupo(client, admin, "G2", [ana_m, dani_m])
    faxina, tipo = await _faxina(client, admin, db, tenant, elegiveis="grupos")
    db.add(AtividadeTipoGrupo(tenant_id=tenant.id, tipo_id=tipo.id, grupo_id=uuid.UUID(g1)))
    await db.commit()

    body = (await _convocar(client, admin, faxina, grupos=[g2])).json()
    # Ana (em G1, que o tipo alcança) entra pelo G2; Dani (só G2) fica de fora.
    assert (body["resultado"]["novos"], body["resultado"]["fora_da_elegibilidade_nomes"]) == (1, ["Dani Souza"])
    linhas = await _linhas(faxina)
    assert set(linhas) == {ana_m.id} and str(linhas[ana_m.id].grupo_id) == g2


async def test_sem_duplicar_sem_rebaixar_e_chamada_mista(client, db):
    tenant, admin = await _cenario(db)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    _, beto_m = await _medium(db, tenant, "Beto Lima")
    _, dani_m = await _medium(db, tenant, "Dani Souza")
    _, edu_m = await _medium(db, tenant, "Edu Ramos")
    g1 = await _grupo(client, admin, "G1", [ana_m, beto_m])
    g2 = await _grupo(client, admin, "G2", [beto_m, dani_m])
    faxina, _ = await _faxina(client, admin, db, tenant)

    # Ana foi posta à mão e já respondeu "vou".
    assert (await _convocar(client, admin, faxina, mediuns=[ana_m])).status_code == 200
    r = await client.post(f"{MEDIUM}/atividades/atividade/{faxina}/resposta", headers=ana.headers, json={"resposta": "vou"})
    assert r.status_code == 200, r.text

    # Mista: Edu um a um + G1 e G2 (Beto está nos dois; Dani está no G2 e também é pedido um a um).
    resp = await _convocar(client, admin, faxina, mediuns=[edu_m, dani_m], grupos=[g1, g2])
    assert resp.status_code == 200, resp.text
    assert resp.json()["resultado"] == {
        "novos": 3,  # Edu, Dani (à mão) e Beto (G1)
        "ja_estavam": 1,  # Ana
        "fora_da_elegibilidade": 0,
        "fora_da_elegibilidade_nomes": [],
    }
    linhas = await _linhas(faxina)
    assert set(linhas) == {ana_m.id, beto_m.id, dani_m.id, edu_m.id}
    assert (linhas[ana_m.id].origem, linhas[ana_m.id].resposta, linhas[ana_m.id].grupo_id) == ("manual", "vou", None)
    assert (linhas[beto_m.id].origem, str(linhas[beto_m.id].grupo_id)) == ("grupo", g1)
    assert (linhas[dani_m.id].origem, linhas[dani_m.id].grupo_id) == ("manual", None)
    assert linhas[edu_m.id].origem == "manual"

    # De novo, igual: ninguém novo, nenhuma linha a mais.
    de_novo = (await _convocar(client, admin, faxina, mediuns=[edu_m, dani_m], grupos=[g1, g2])).json()
    assert (de_novo["resultado"]["novos"], de_novo["resultado"]["ja_estavam"]) == (0, 4)
    total = (
        await db.execute(
            select(func.count()).select_from(AtividadeParticipacao).where(
                AtividadeParticipacao.atividade_id == uuid.UUID(faxina)
            )
        )
    ).scalar_one()
    assert total == 4

    # Quem foi tirado da escala volta com o grupo, sem perder a origem nem a resposta.
    assert (
        await client.post(f"{ADMIN}/{faxina}/dispensar", headers=admin.headers, json={"medium_ids": [str(ana_m.id)]})
    ).status_code == 200
    volta = (await _convocar(client, admin, faxina, grupos=[g1])).json()
    assert (volta["resultado"]["novos"], volta["resultado"]["ja_estavam"]) == (1, 1)
    ana_linha = (await _linhas(faxina))[ana_m.id]
    assert (ana_linha.dispensado_em, ana_linha.origem, ana_linha.resposta) == (None, "manual", "vou")


async def test_grupo_de_outro_terreiro_ou_arquivado_e_recusado(client, db):
    tenant, admin = await _cenario(db)
    outro, admin_b = await _cenario(db, nome="Outro Terreiro")
    _, ana_m = await _medium(db, tenant, "Ana Paula")
    _, zeca_m = await _medium(db, outro, "Zeca de B")
    g_b = await _grupo(client, admin_b, "G1 de B", [zeca_m])
    g_arquivado = await _grupo(client, admin, "Antigo", [ana_m])
    assert (await client.delete(f"{GRUPOS}/{g_arquivado}", headers=admin.headers)).status_code == 204
    faxina, _ = await _faxina(client, admin, db, tenant)

    for grupos in ([g_b], [g_arquivado], [str(uuid.uuid4())]):
        resp = await _convocar(client, admin, faxina, mediuns=[ana_m], grupos=grupos)
        assert resp.status_code == 422, resp.text
    assert await _linhas(faxina) == {}  # nada gravado, nem a Ana pedida junto
    assert (await client.post(f"{ADMIN}/{faxina}/convocar", headers=admin.headers, json={})).status_code == 422

    # Atividade de A pelo admin de B: 404 (nem chega a olhar o grupo).
    assert (await _convocar(client, admin_b, faxina, grupos=[g_b])).status_code == 404
    assert await _linhas(faxina) == {}


async def test_convocar_exige_escalas_insert(client, db):
    tenant, admin = await _cenario(db)
    _, ana_m = await _medium(db, tenant, "Ana Paula")
    _, zeca_m = await _medium(db, (await _cenario(db, nome="Outro"))[0], "Zeca de B")
    g1 = await _grupo(client, admin, "G1", [ana_m])
    faxina, _ = await _faxina(client, admin, db, tenant)
    so_ver = await create_user(db, tenant, UserRole.OPERATOR, name="leitor")
    await grant(db, so_ver, tenant, PermissionFeature.ESCALAS, "view")
    assert (await _convocar(client, so_ver, faxina, grupos=[g1])).status_code == 403
    assert (await client.get(f"{ADMIN}/convocar/mediuns", headers=so_ver.headers)).status_code == 403

    escalador = await create_user(db, tenant, UserRole.OPERATOR, name="escalador")
    await grant(db, escalador, tenant, PermissionFeature.ESCALAS, "view", "insert")
    resp = await client.get(f"{ADMIN}/convocar/mediuns", headers=escalador.headers)
    assert resp.status_code == 200, resp.text
    # Só médiuns ativos do próprio terreiro, só id e nome.
    assert resp.json() == [{"id": str(ana_m.id), "nome": "Ana Paula"}]
    assert str(zeca_m.id) not in resp.text
    assert (await _convocar(client, escalador, faxina, grupos=[g1])).status_code == 200


# ── 3. Início: PIX disponível ───────────────────────────────────────────────


@pytest.mark.parametrize("com_chave", [True, False])
async def test_inicio_diz_se_ha_chave_pix_sem_revelar(client, db, monkeypatch, com_chave):
    from datetime import date

    from src.api.v1.medium import inicio as inicio_mod

    monkeypatch.setattr(inicio_mod, "today_local", lambda: date(2026, 10, 8))
    tenant = await create_tenant(db, name="Casa PIX", plan=PlanType.BASIC, area_medium_liberada=True)
    config = MensalidadeConfig(tenant_id=tenant.id, valor_mensal=Decimal("50.00"), dia_vencimento=10, ativo=True)
    if com_chave:
        config.pix_tipo = "cpf"
        config.pix_chave = "12345678909"
        config.pix_nome_recebedor = "Casa de Oxala"
        config.pix_cidade = "Sao Paulo"
    db.add(config)
    actor = await create_user(db, tenant, UserRole.MEDIUM, name="medium")
    db.add(Medium(tenant_id=tenant.id, nome="Ana Paula", user_id=actor.user.id))
    await db.commit()

    resp = await client.get(f"{MEDIUM}/inicio", headers=actor.headers)
    assert resp.status_code == 200, resp.text
    mensalidade = resp.json()["mensalidade"]
    assert mensalidade["status"] == "pendente" and mensalidade["pix_disponivel"] is com_chave
    assert "12345678909" not in resp.text and "chave" not in str(mensalidade)
    assert resp.json()["pendencias"][0]["tipo"] == "mensalidade"


# ── 4. Perfil: tirar a foto ─────────────────────────────────────────────────


async def test_remover_foto_e_impersonacao(client, db):
    tenant = await create_tenant(db, name="Casa Foto", plan=PlanType.BASIC, area_medium_liberada=True)
    actor = await create_user(db, tenant, UserRole.MEDIUM, name="medium")
    db.add(Medium(tenant_id=tenant.id, nome="Ana Paula", user_id=actor.user.id))
    await db.commit()
    foto = f"{MEDIUM}/perfil/foto"
    assert (
        await client.post(foto, headers=actor.headers, files={"file": ("eu.jpg", JPEG, "image/jpeg")})
    ).status_code == 200

    # Impersonando: recusa e a foto fica.
    token = create_access_token(actor.user.id, tenant.id, "medium", impersonated_by=uuid.uuid4())
    assert (await client.delete(foto, headers={"Authorization": f"Bearer {token}"})).status_code == 403

    async def _foto_no_banco():
        from src.core.database import AsyncSessionLocal

        async with AsyncSessionLocal() as fresh:
            u = (await fresh.execute(select(User).where(User.id == actor.user.id))).scalar_one()
            return u.profile_photo_data, u.profile_photo_content_type, u.profile_photo_url

    assert (await _foto_no_banco())[0] == JPEG

    resp = await client.delete(foto, headers=actor.headers)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"message": "Foto removida.", "foto_url": None}
    assert await _foto_no_banco() == (None, None, None)
    assert (await client.get(f"{MEDIUM}/perfil", headers=actor.headers)).json()["foto_url"] is None
    assert (await client.get(f"{MEDIUM}/me", headers=actor.headers)).json()["foto_url"] is None
    assert (await client.get(f"/api/v1/public/user/{actor.user.id}/photo")).status_code == 404

    logs = (
        await db.execute(
            select(AuditLog).where(AuditLog.tenant_id == tenant.id, AuditLog.resource_type == "medium_perfil")
        )
    ).scalars().all()
    acoes = [log.details["new_state"]["acao"] for log in logs]
    assert acoes.count("médium removeu a foto") == 1
    assert all("profile_photo" not in str(log.details) for log in logs)

    # Sem foto: nada muda e não audita de novo.
    assert (await client.delete(foto, headers=actor.headers)).status_code == 200
    total = (
        await db.execute(
            text("SELECT count(*) FROM audit_logs WHERE tenant_id = :t AND resource_type = 'medium_perfil'"),
            {"t": tenant.id},
        )
    ).scalar_one()
    assert total == len(logs)
