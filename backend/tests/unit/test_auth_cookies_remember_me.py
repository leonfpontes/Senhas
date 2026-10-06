"""Cookies da sessão e "Lembrar-me" (core/auth_cookies.py + claim `persist` do refresh token)."""
import uuid
from unittest.mock import MagicMock

from src.core.auth_cookies import REFRESH_COOKIE_MAX_AGE, set_auth_cookies
from src.core.config import settings
from src.security.jwt import create_refresh_token, decode_refresh_token


def _cookies(response) -> dict:
    return {c.kwargs["key"]: c.kwargs for c in response.set_cookie.call_args_list}


def test_persistente_seta_3_cookies_com_max_age():
    response = MagicMock()
    set_auth_cookies(response, "acc", "ref", persistent=True)
    cookies = _cookies(response)
    assert set(cookies) == {"access_token", "refresh_token", "auth_state"}
    assert cookies["access_token"]["max_age"] == settings.ACCESS_TOKEN_EXPIRE_HOURS * 3600
    assert cookies["refresh_token"]["max_age"] == REFRESH_COOKIE_MAX_AGE
    assert cookies["auth_state"]["httponly"] is False
    assert cookies["access_token"]["httponly"] is True
    assert all(c["secure"] is (not settings.DEBUG) for c in cookies.values())


def test_sem_lembrar_me_vira_cookie_de_sessao():
    response = MagicMock()
    set_auth_cookies(response, "acc", "ref", persistent=False)
    assert all(c["max_age"] is None for c in _cookies(response).values())


def test_refresh_token_carrega_a_escolha():
    ids = dict(user_id=uuid.uuid4(), tenant_id=uuid.uuid4(), role="admin", session_id=uuid.uuid4(), jti=uuid.uuid4())
    assert decode_refresh_token(create_refresh_token(**ids)).persistent is True
    assert decode_refresh_token(create_refresh_token(**ids, persistent=False)).persistent is False
