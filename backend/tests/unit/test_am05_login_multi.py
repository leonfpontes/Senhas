"""AM-05 — mesmo e-mail em mais de um terreiro (unidade).

Cobre: seleção das contas candidatas (SQL), custo de bcrypt (verificação falsa
sem conta e todas conferidas, sem atalho), token de escolha (`account_select`:
ida e volta, validade, recusado como access/refresh e pelo middleware), login
com 2 contas que conferem (sem cookies), `/auth/login/select` (lista, validade,
conta inativa, revogação) e o e-mail de redefinição com um link por terreiro.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import jwt as pyjwt
import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

import src.api.v1.auth.login as login_module
from src.api.v1.auth.login import (
    MAX_LOGIN_ACCOUNTS,
    AccountChoiceResponse,
    AccountOption,
    AccountOptionAreas,
    LoginRequest,
    LoginResponse,
    LoginSelectRequest,
    active_login_accounts_stmt,
    login,
    login_select,
    matching_accounts,
    selection_revoked,
)
from src.core.config import DUMMY_BCRYPT_HASH, settings
from src.core.errors import InvalidTokenError
from src.middleware.jwt_middleware import jwt_middleware
from src.models import User, UserRole
from src.security.jwt import (
    ACCOUNT_SELECT_TOKEN_TYPE,
    create_account_select_token,
    decode_account_select_token,
    decode_refresh_token,
    decode_token,
)
from src.services.email.templates.password_reset import render_password_reset_multi_email


@pytest.fixture(autouse=True)
def _bypass_rate_limit():
    original = login_module.limiter.enabled
    login_module.limiter.enabled = False
    yield
    login_module.limiter.enabled = original


def _user(tenant_id=None, role=UserRole.ADMIN, password_hash="$2b$12$fake") -> User:
    u = User()
    u.id = uuid.uuid4()
    u.tenant_id = tenant_id or uuid.uuid4()
    u.email = "pessoa@example.com"
    u.username = f"u-{u.id.hex[:6]}"
    u.password_hash = password_hash
    u.role = role
    u.is_active = True
    u.deleted_at = None
    u.sessions_revoked_at = None
    u.created_at = datetime.now(timezone.utc)
    return u


def _request():
    req = MagicMock()
    req.headers = {"user-agent": "pytest"}
    req.cookies = {}
    return req


def _option(user: User) -> AccountOption:
    return AccountOption(
        user_id=str(user.id),
        terreiro_nome=f"Casa {user.id.hex[:4]}",
        terreiro_slug="casa",
        logo_url=None,
        areas=AccountOptionAreas(admin=True, medium=False),
    )


# ── Seleção das contas ───────────────────────────────────────────────────────


class TestActiveLoginAccountsStmt:
    def _sql(self, email="Pessoa@Example.com") -> str:
        stmt = active_login_accounts_stmt(email)
        return str(stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))

    def test_so_contas_ativas_em_terreiros_ativos(self):
        sql = self._sql()
        assert "lower(users.email) = 'pessoa@example.com'" in sql
        assert "users.deleted_at IS NULL" in sql
        assert "users.is_active IS true" in sql
        assert "tenants.self_deactivated_at IS NULL" in sql
        assert "tenants.deleted_at IS NULL" in sql
        # super admin (sem terreiro) também entra: LEFT OUTER JOIN
        assert "LEFT OUTER JOIN tenants" in sql

    def test_mais_antigas_primeiro_e_teto(self):
        sql = self._sql()
        assert "ORDER BY users.created_at ASC, users.id ASC" in sql
        assert f"LIMIT {MAX_LOGIN_ACCOUNTS}" in sql
        assert MAX_LOGIN_ACCOUNTS == 5


# ── Custo de bcrypt ──────────────────────────────────────────────────────────


class TestMatchingAccounts:
    def test_sem_conta_faz_uma_verificacao_falsa(self):
        with patch.object(login_module, "verify_password", return_value=True) as verify:
            assert matching_accounts("senha", []) == []
        verify.assert_called_once_with("senha", DUMMY_BCRYPT_HASH)

    def test_confere_todas_sem_parar_na_primeira(self):
        a, b, c = _user(password_hash="h-a"), _user(password_hash="h-b"), _user(password_hash="h-c")
        with patch.object(login_module, "verify_password", side_effect=lambda pw, h: h in ("h-a", "h-c")) as verify:
            assert matching_accounts("senha", [a, b, c]) == [a, c]
        assert [call.args[1] for call in verify.call_args_list] == ["h-a", "h-b", "h-c"]

    def test_bcrypt_real(self):
        from src.security.password import hash_password

        certa = _user(password_hash=hash_password("Senha-forte-123"))
        outra = _user(password_hash=hash_password("Outra-senha-456"))
        assert matching_accounts("Senha-forte-123", [certa, outra]) == [certa]


# ── Token de escolha ─────────────────────────────────────────────────────────


class TestAccountSelectToken:
    def test_ida_e_volta(self):
        ids = [uuid.uuid4(), uuid.uuid4()]
        payload = decode_account_select_token(create_account_select_token(ids, remember_me=False))
        assert payload.user_ids == ids
        assert payload.remember_me is False
        assert timedelta(minutes=4) < payload.exp - payload.iat <= timedelta(minutes=5)

    def test_claims_sem_identidade_de_acesso(self):
        raw = pyjwt.decode(
            create_account_select_token([uuid.uuid4()], True), settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        assert raw["type"] == ACCOUNT_SELECT_TOKEN_TYPE
        assert "sub" not in raw and "role" not in raw and "tenant_id" not in raw

    def test_expirado_recusado(self):
        token = create_account_select_token([uuid.uuid4()], True, expires_delta=timedelta(seconds=-1))
        with pytest.raises(InvalidTokenError):
            decode_account_select_token(token)

    def test_nao_serve_como_access(self):
        with pytest.raises(InvalidTokenError):
            decode_token(create_account_select_token([uuid.uuid4()], True))

    def test_nao_serve_como_refresh(self):
        with pytest.raises(InvalidTokenError):
            decode_refresh_token(create_account_select_token([uuid.uuid4()], True))

    def test_access_nao_serve_como_escolha(self):
        from src.security.jwt import create_access_token

        with pytest.raises(InvalidTokenError):
            decode_account_select_token(create_access_token(uuid.uuid4(), uuid.uuid4(), "admin"))

    def test_sem_contas_recusado(self):
        token = pyjwt.encode(
            {
                "type": ACCOUNT_SELECT_TOKEN_TYPE,
                "uids": [],
                "iat": datetime.now(timezone.utc),
                "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
            },
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )
        with pytest.raises(InvalidTokenError):
            decode_account_select_token(token)

    def test_assinatura_alheia_recusada(self):
        token = pyjwt.encode(
            {"type": ACCOUNT_SELECT_TOKEN_TYPE, "uids": [str(uuid.uuid4())], "iat": 0, "exp": 9999999999},
            "outra-chave-de-assinatura-com-32-bytes-ou-mais",
            algorithm=settings.ALGORITHM,
        )
        with pytest.raises(InvalidTokenError):
            decode_account_select_token(token)

    @pytest.mark.parametrize("onde", ["header", "cookie"])
    @patch("src.middleware.jwt_middleware.log_security_event")
    async def test_middleware_recusa_como_access(self, mock_log, onde):
        token = create_account_select_token([uuid.uuid4()], True)
        headers = {"Authorization": f"Bearer {token}"} if onde == "header" else {}
        request = MagicMock()
        request.url.path = "/api/v1/admin/giras"
        request.headers.get = MagicMock(side_effect=lambda k, d=None: headers.get(k, d))
        request.cookies = {"access_token": token} if onde == "cookie" else {}
        request.scope = {"type": "http"}
        call_next = AsyncMock()
        response = await jwt_middleware(request, call_next)
        assert response.status_code == 401
        call_next.assert_not_called()

    async def test_login_select_e_publico_no_middleware(self):
        request = MagicMock()
        request.url.path = "/api/v1/auth/login/select"
        request.scope = {"type": "http"}
        call_next = AsyncMock(return_value=MagicMock(status_code=200))
        await jwt_middleware(request, call_next)
        call_next.assert_called_once()


class TestSelectionRevoked:
    def test_sem_revogacao(self):
        assert selection_revoked(datetime.now(timezone.utc), None) is False

    def test_revogado_depois_do_token(self):
        iat = datetime.now(timezone.utc).replace(microsecond=0)
        assert selection_revoked(iat, iat + timedelta(seconds=2)) is True

    def test_revogado_antes_do_token(self):
        iat = datetime.now(timezone.utc).replace(microsecond=0)
        assert selection_revoked(iat, iat - timedelta(minutes=1)) is False

    def test_mesmo_segundo_nao_revoga(self):
        iat = datetime.now(timezone.utc).replace(microsecond=0)
        assert selection_revoked(iat, iat.replace(microsecond=500_000)) is False

    def test_revogacao_sem_fuso(self):
        iat = datetime.now(timezone.utc).replace(microsecond=0)
        naive = (iat + timedelta(seconds=5)).replace(tzinfo=None)
        assert selection_revoked(iat, naive) is True


# ── Login com várias contas ──────────────────────────────────────────────────


def _login_db(session, candidates):
    result = MagicMock()
    result.scalars.return_value.all.return_value = candidates
    session.execute.side_effect = [result]


class TestLoginVariasContas:
    @patch("src.api.v1.auth.login.log_security_event")
    async def test_duas_contas_conferem_pede_escolha_sem_cookies(self, mock_log, mock_db_session):
        a, b = _user(), _user()
        _login_db(mock_db_session, [a, b])
        response = MagicMock()
        with (
            patch.object(login_module, "verify_password", return_value=True),
            patch.object(login_module, "account_option", new=AsyncMock(side_effect=lambda db, u: _option(u))),
        ):
            result = await login(
                LoginRequest(email="pessoa@example.com", password="x", remember_me=False),
                response, _request(), mock_db_session,
            )
        assert isinstance(result, AccountChoiceResponse)
        assert result.choose_account is True
        assert [o.user_id for o in result.options] == [str(a.id), str(b.id)]
        response.set_cookie.assert_not_called()
        mock_db_session.commit.assert_not_awaited()
        sel = decode_account_select_token(result.selection_token)
        assert sel.user_ids == [a.id, b.id]
        assert sel.remember_me is False

    @patch("src.api.v1.auth.login.log_security_event")
    async def test_lista_so_os_terreiros_em_que_a_senha_conferiu(self, mock_log, mock_db_session):
        a, b, c = _user(password_hash="ok"), _user(password_hash="nao"), _user(password_hash="ok")
        _login_db(mock_db_session, [a, b, c])
        with (
            patch.object(login_module, "verify_password", side_effect=lambda pw, h: h == "ok"),
            patch.object(login_module, "account_option", new=AsyncMock(side_effect=lambda db, u: _option(u))),
        ):
            result = await login(
                LoginRequest(email="pessoa@example.com", password="x"), MagicMock(), _request(), mock_db_session
            )
        assert [o.user_id for o in result.options] == [str(a.id), str(c.id)]
        assert decode_account_select_token(result.selection_token).user_ids == [a.id, c.id]

    @patch("src.api.v1.auth.login.compute_areas", new=AsyncMock(return_value={"admin": True, "medium": None}))
    @patch("src.api.v1.auth.login.log_security_event")
    async def test_uma_so_confere_entra_direto(self, mock_log, mock_db_session):
        a, b = _user(password_hash="nao"), _user(password_hash="ok")
        _login_db(mock_db_session, [a, b])
        response = MagicMock()
        with patch.object(login_module, "verify_password", side_effect=lambda pw, h: h == "ok"):
            result = await login(
                LoginRequest(email="pessoa@example.com", password="x"), response, _request(), mock_db_session
            )
        assert isinstance(result, LoginResponse)
        assert result.user["id"] == str(b.id)
        assert response.set_cookie.call_count == 3

    @patch("src.api.v1.auth.login.log_security_event")
    async def test_nenhuma_confere_401(self, mock_log, mock_db_session):
        _login_db(mock_db_session, [_user(), _user()])
        with patch.object(login_module, "verify_password", return_value=False):
            with pytest.raises(Exception) as exc:
                await login(LoginRequest(email="pessoa@example.com", password="x"), MagicMock(), _request(), mock_db_session)
        assert getattr(exc.value, "status_code", None) == 401


# ── /auth/login/select ───────────────────────────────────────────────────────


def _select_db(session, user):
    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    session.execute.return_value = result


class TestLoginSelect:
    @patch("src.api.v1.auth.login.compute_areas", new=AsyncMock(return_value={"admin": False, "medium": {"medium_id": "m", "nome": "Ana"}}))
    @patch("src.api.v1.auth.login.log_security_event")
    async def test_escolha_valida_abre_sessao(self, mock_log, mock_db_session):
        a, b = _user(), _user(role=UserRole.MEDIUM)
        _select_db(mock_db_session, b)
        token = create_account_select_token([a.id, b.id], remember_me=False)
        response = MagicMock()
        result = await login_select(LoginSelectRequest(selection_token=token, user_id=b.id), response, _request(), mock_db_session)
        assert result.user["id"] == str(b.id)
        assert result.areas["medium"]["nome"] == "Ana"
        assert response.set_cookie.call_count == 3
        # "Lembrar-me" do login: desmarcado → cookies sem max_age
        for call in response.set_cookie.call_args_list:
            assert call.kwargs.get("max_age") is None

    @patch("src.api.v1.auth.login.log_security_event")
    async def test_conta_fora_da_lista_recusada(self, mock_log, mock_db_session):
        token = create_account_select_token([uuid.uuid4()], True)
        with pytest.raises(HTTPException) as exc:
            await login_select(LoginSelectRequest(selection_token=token, user_id=uuid.uuid4()), MagicMock(), _request(), mock_db_session)
        assert exc.value.status_code == 401
        assert exc.value.detail["error_code"] == "SELECTION_INVALID"
        mock_db_session.execute.assert_not_awaited()

    @patch("src.api.v1.auth.login.log_security_event")
    async def test_token_expirado_recusado(self, mock_log, mock_db_session):
        uid = uuid.uuid4()
        token = create_account_select_token([uid], True, expires_delta=timedelta(seconds=-1))
        with pytest.raises(HTTPException) as exc:
            await login_select(LoginSelectRequest(selection_token=token, user_id=uid), MagicMock(), _request(), mock_db_session)
        assert exc.value.status_code == 401

    @patch("src.api.v1.auth.login.log_security_event")
    async def test_access_token_nao_serve_de_escolha(self, mock_log, mock_db_session):
        from src.security.jwt import create_access_token

        uid = uuid.uuid4()
        with pytest.raises(HTTPException) as exc:
            await login_select(
                LoginSelectRequest(selection_token=create_access_token(uid, uuid.uuid4(), "admin"), user_id=uid),
                MagicMock(), _request(), mock_db_session,
            )
        assert exc.value.status_code == 401

    @patch("src.api.v1.auth.login.log_security_event")
    async def test_conta_que_deixou_de_estar_ativa_recusada(self, mock_log, mock_db_session):
        uid = uuid.uuid4()
        _select_db(mock_db_session, None)
        with pytest.raises(HTTPException) as exc:
            await login_select(
                LoginSelectRequest(selection_token=create_account_select_token([uid], True), user_id=uid),
                MagicMock(), _request(), mock_db_session,
            )
        assert exc.value.status_code == 401

    @patch("src.api.v1.auth.login.log_security_event")
    async def test_senha_trocada_depois_do_token_recusada(self, mock_log, mock_db_session):
        user = _user()
        token = create_account_select_token([user.id], True)
        user.sessions_revoked_at = datetime.now(timezone.utc) + timedelta(seconds=5)
        _select_db(mock_db_session, user)
        response = MagicMock()
        with pytest.raises(HTTPException) as exc:
            await login_select(LoginSelectRequest(selection_token=token, user_id=user.id), response, _request(), mock_db_session)
        assert exc.value.status_code == 401
        response.set_cookie.assert_not_called()

    def test_rate_limit_registrado(self):
        limits = [str(lim.limit) for lim in login_module.limiter._route_limits.get("src.api.v1.auth.login.login_select", [])]
        assert limits == ["10 per 1 minute"]


# ── E-mail de redefinição com vários terreiros ───────────────────────────────


class TestPasswordResetMultiEmail:
    def test_um_link_por_terreiro_com_nome_escapado(self):
        html = render_password_reset_multi_email(
            [("Casa <Luz>", "https://app/reset-password?token=a1"), ("Tenda & Paz", "https://app/reset-password?token=b2")],
            "Ana",
        )
        assert "Casa &lt;Luz&gt;" in html and "<Luz>" not in html
        assert "Tenda &amp; Paz" in html
        assert html.count('href="https://app/reset-password?token=a1"') == 1
        assert html.count('href="https://app/reset-password?token=b2"') == 1
        assert "mais de um terreiro" in html
        assert "Ana" in html
