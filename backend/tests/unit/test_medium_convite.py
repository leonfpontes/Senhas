"""AM-03 — convite da casa para a Área do Médium: token, aceite e guards (sem banco).

Os mesmos cenários passam pelo HTTP com Postgres real em
tests/integration_pg/test_am03_convite.py.
"""
import hashlib
import inspect
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute

from src.models import Medium, MediumConvite, User, UserRole
from src.models.permission_groups import PermissionFeature
from src.services import medium_convite as mc

REPO = Path(__file__).resolve().parents[3]
TENANT_ID = uuid.uuid4()
AGORA = datetime.now(timezone.utc)


def _convite(**kw) -> MediumConvite:
    c = MediumConvite()
    c.id = uuid.uuid4()
    c.tenant_id = TENANT_ID
    c.medium_id = uuid.uuid4()
    c.email = "ana@exemplo.com"
    c.token_hash = "x" * 64
    c.expira_em = AGORA + timedelta(days=7)
    c.usado_em = None
    c.revogado_em = None
    c.created_at = AGORA
    for k, v in kw.items():
        setattr(c, k, v)
    return c


def _medium(**kw) -> Medium:
    m = Medium()
    m.id = uuid.uuid4()
    m.tenant_id = TENANT_ID
    m.nome = "Ana Paula Ribeiro"
    m.email = "Ana@Exemplo.com"
    m.is_active = True
    m.deleted_at = None
    m.user_id = None
    m.area_consentimento_em = None
    for k, v in kw.items():
        setattr(m, k, v)
    return m


# ── Token ───────────────────────────────────────────────────────────────────


def test_token_opaco_guardado_como_sha256():
    token, token_hash = mc.gerar_token()
    assert len(token) >= 43  # token_urlsafe(32)
    assert token_hash == hashlib.sha256(token.encode()).hexdigest() == mc.hash_token(token)
    assert token not in token_hash
    assert mc.gerar_token()[0] != token


def test_convite_em_aberto_so_sem_uso_sem_revogacao_e_no_prazo():
    assert mc.convite_em_aberto(_convite())
    assert not mc.convite_em_aberto(_convite(usado_em=AGORA))
    assert not mc.convite_em_aberto(_convite(revogado_em=AGORA))
    assert not mc.convite_em_aberto(_convite(expira_em=AGORA - timedelta(seconds=1)))
    # Data sem fuso (vinda de SQLite/mocks) é tratada como UTC.
    assert mc.convite_em_aberto(_convite(expira_em=(AGORA + timedelta(hours=1)).replace(tzinfo=None)))


def test_validade_de_7_dias():
    assert mc.CONVITE_VALIDADE_DIAS == 7


async def test_criar_convite_revoga_o_anterior_e_expira_em_7_dias():
    db = MagicMock(execute=AsyncMock(), flush=AsyncMock(), add=MagicMock())
    medium = _medium()
    convite, token = await mc.criar_convite(db, TENANT_ID, medium, "ana@exemplo.com", None)
    revogacao = db.execute.await_args_list[0].args[0]
    sql = str(revogacao.compile(compile_kwargs={"literal_binds": False}))
    assert sql.startswith("UPDATE medium_convites") and "revogado_em" in sql and "tenant_id" in sql
    assert convite.token_hash == mc.hash_token(token)
    assert timedelta(days=6, hours=23) < convite.expira_em - datetime.now(timezone.utc) <= timedelta(days=7)
    db.add.assert_called_once_with(convite)


async def test_criar_convite_recusa_medium_de_outro_tenant():
    with pytest.raises(ValueError):
        await mc.criar_convite(MagicMock(), uuid.uuid4(), _medium(), "ana@exemplo.com", None)


# ── Textos e links ──────────────────────────────────────────────────────────


def test_normalizar_email():
    assert mc.normalizar_email("  Ana.Paula@Exemplo.COM ") == "ana.paula@exemplo.com"
    assert mc.normalizar_email("sem-arroba") is None
    assert mc.normalizar_email("") is None and mc.normalizar_email(None) is None


def test_mascarar_email_nao_expoe_o_usuario():
    assert mc.mascarar_email("ana.paula@gmail.com") == "an•••••••@gmail.com"
    assert mc.mascarar_email("bo@x.com") == "b•••@x.com"
    assert "paula" not in mc.mascarar_email("ana.paula@gmail.com")


def test_whatsapp_url_com_e_sem_telefone():
    assert mc.whatsapp_url("(11) 98765-4321", "oi").startswith("https://wa.me/5511987654321?text=oi")
    assert mc.whatsapp_url("5511987654321", "oi").startswith("https://wa.me/5511987654321?")
    assert mc.whatsapp_url(None, "oi").startswith("https://wa.me/?text=")
    assert mc.whatsapp_url("123", "a b").endswith("?text=a%20b")


def test_mensagem_whatsapp_simpatica_com_link():
    """No WhatsApp (enviado pela casa) vale o vocabulário do terreiro (decisão do dono, 07/10)."""
    texto = mc.mensagem_whatsapp("Ana", "Casa Luz", "https://girahub.com.br/convite/abc")
    assert texto.startswith("Oi, Ana! Tudo bem?")
    assert "A nossa casa, Casa Luz, agora tem a Área do Médium" in texto
    assert "https://girahub.com.br/convite/abc" in texto and "7 dias" in texto
    assert texto.endswith("Axé!")
    assert mc.mensagem_whatsapp("", "Casa Luz", "x").startswith("Oi! Tudo bem?")


def test_template_do_email_escapa_html_e_e_discreto():
    from src.services.email.templates.medium_convite import medium_convite_subject, render_medium_convite_email

    html = render_medium_convite_email("<b>Ana</b>", "Casa <script>", "https://x/convite/t?a=1&b=2", 7)
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert "&lt;b&gt;Ana&lt;/b&gt;" in html
    assert "https://x/convite/t?a=1&amp;b=2" in html
    assert medium_convite_subject("Casa Luz") == "Convite de Casa Luz para acessar sua área no GiraHub"


def test_status_acesso():
    assert mc.status_acesso(_medium(), None) == {"status": "sem_acesso"}
    assert mc.status_acesso(_medium(), _convite(revogado_em=AGORA)) == {"status": "sem_acesso"}
    aberto = _convite()
    assert mc.status_acesso(_medium(), aberto)["status"] == "convite_enviado"
    ligado = _medium(user_id=uuid.uuid4(), area_consentimento_em=AGORA)
    assert mc.status_acesso(ligado, aberto) == {"status": "ativo", "desde": AGORA}


def test_versao_do_consentimento_espelhada_no_frontend():
    ts = (REPO / "frontend" / "src" / "constants" / "areaMedium.ts").read_text()
    m = re.search(r"AREA_MEDIUM_CONSENTIMENTO_VERSAO\s*=\s*'([^']+)'", ts)
    assert m and m.group(1) == mc.CONSENTIMENTO_AREA_VERSAO


def test_link_do_convite_aponta_para_pagina_que_existe():
    from src.core import public_links as pl

    assert pl.medium_convite_link("https://girahub.com.br/", "tok") == "https://girahub.com.br/convite/tok"
    assert (REPO / "frontend" / "src" / "pages" / "convite" / "[token].tsx").exists()


# ── Tirar o acesso ──────────────────────────────────────────────────────────


def _user(role: UserRole) -> User:
    u = User()
    u.id = uuid.uuid4()
    u.tenant_id = TENANT_ID
    u.role = role
    u.is_active = True
    u.sessions_revoked_at = None
    return u


def _db_com_usuario(user):
    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    return MagicMock(execute=AsyncMock(return_value=result), flush=AsyncMock(), add=MagicMock())


async def test_tirar_acesso_desativa_conta_medium_pura_e_derruba_sessoes():
    user = _user(UserRole.MEDIUM)
    medium = _medium(user_id=user.id)
    db = _db_com_usuario(user)
    with patch("src.services.medium_convite.unlink_user", AsyncMock()) as unlink, \
            patch("src.services.medium_convite.session_service.end_all_sessions", AsyncMock()) as end:
        assert await mc.tirar_acesso(db, TENANT_ID, medium) is user
    unlink.assert_awaited_once_with(db, TENANT_ID, user.id)
    end.assert_awaited_once_with(db, user.id)
    assert medium.user_id is None
    assert user.is_active is False and user.sessions_revoked_at is not None


async def test_tirar_acesso_de_operador_so_desfaz_o_vinculo():
    user = _user(UserRole.OPERATOR)
    medium = _medium(user_id=user.id)
    db = _db_com_usuario(user)
    with patch("src.services.medium_convite.unlink_user", AsyncMock()), \
            patch("src.services.medium_convite.session_service.end_all_sessions", AsyncMock()) as end:
        await mc.tirar_acesso(db, TENANT_ID, medium)
    end.assert_not_awaited()
    assert user.is_active is True and medium.user_id is None


async def test_tirar_acesso_sem_vinculo_so_revoga_convite():
    db = MagicMock(execute=AsyncMock(), flush=AsyncMock())
    assert await mc.tirar_acesso(db, TENANT_ID, _medium()) is None
    assert db.execute.await_count == 1  # só o UPDATE de revogação


# ── Aceite: resposta genérica ───────────────────────────────────────────────


@pytest.mark.parametrize(
    "convite",
    [
        None,
        _convite(usado_em=AGORA),
        _convite(revogado_em=AGORA),
        _convite(expira_em=AGORA - timedelta(minutes=1)),
    ],
    ids=["inexistente", "usado", "revogado", "vencido"],
)
async def test_convite_invalido_tem_resposta_generica(convite):
    from src.api.v1.public import convite as rota

    with patch.object(rota, "_convite_pelo_token", AsyncMock(return_value=convite)):
        with pytest.raises(HTTPException) as exc:
            await rota._resolver(MagicMock(), "tok")
    assert exc.value.status_code == 404
    assert exc.value.detail == rota.CONVITE_INVALIDO


@pytest.mark.parametrize(
    "medium",
    [None, _medium(user_id=uuid.uuid4()), _medium(email="outro@exemplo.com")],
    ids=["medium_inativo_ou_excluido", "ja_tem_acesso", "email_trocado"],
)
async def test_medium_que_nao_pode_mais_aceitar_tem_resposta_generica(medium):
    from src.api.v1.public import convite as rota

    result = MagicMock()
    result.scalar_one_or_none.return_value = medium
    db = MagicMock(execute=AsyncMock(return_value=result))
    with patch.object(rota, "_convite_pelo_token", AsyncMock(return_value=_convite())):
        with pytest.raises(HTTPException) as exc:
            await rota._resolver(db, "tok")
    assert exc.value.status_code == 404 and exc.value.detail == rota.CONVITE_INVALIDO


async def test_token_gigante_nem_consulta_o_banco():
    from src.api.v1.public import convite as rota

    db = MagicMock(execute=AsyncMock())
    assert await rota._convite_pelo_token(db, "x" * 500) is None
    db.execute.assert_not_awaited()


# ── Guards das rotas admin ──────────────────────────────────────────────────


def _guards(route: APIRoute) -> tuple[set, set]:
    planos, grupos = set(), set()
    for dep in route.dependencies:
        fn = dep.dependency
        if getattr(fn, "plan_feature", None):
            planos.add(fn.plan_feature)
        nonlocals = inspect.getclosurevars(fn).nonlocals
        if "feature" in nonlocals and "action" in nonlocals:
            grupos.add((nonlocals["feature"], nonlocals["action"]))
    return planos, grupos


@pytest.mark.parametrize(
    "path, method",
    [
        ("/api/v1/admin/mediuns/{medium_id}/convite", "POST"),
        ("/api/v1/admin/mediuns/convite/lote", "POST"),
        ("/api/v1/admin/mediuns/{medium_id}/acesso", "DELETE"),
    ],
)
def test_rotas_de_acesso_exigem_area_medium_e_mediuns_edit(path, method):
    from src.api.v1.admin.mediuns_acesso import router

    route = next(r for r in router.routes if r.path == path and method in r.methods)
    planos, grupos = _guards(route)
    assert planos == {"area_medium"}
    assert grupos == {(PermissionFeature.MEDIUNS, "edit")}


def test_rotas_publicas_tem_rate_limit():
    from src.api.v1.public import convite as rota

    assert rota.ver_convite.__name__ == "ver_convite"
    for fn in (rota.ver_convite, rota.aceitar_convite):
        assert hasattr(fn, "__wrapped__"), "endpoint público sem @limiter.limit"
