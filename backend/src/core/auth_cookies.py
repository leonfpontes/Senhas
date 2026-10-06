"""Cookies da sessão (AGENTS.md §3.2) — um lugar só para quem abre e fecha sessão.

Login, refresh, cadastro (onboarding) e reativação de conta setam os MESMOS
3 cookies; antes o cadastro setava só o refresh_token (e com secure=True fixo),
deixando a primeira navegação sem access_token nem auth_state.

- access_token  — HttpOnly, vida do access token.
- refresh_token — HttpOnly, 30 dias.
- auth_state=1  — legível pelo JS (hasAuthToken()), mesma vida do access_token.

"Lembrar-me" desmarcado (`persistent=False`): os três viram cookies de sessão
(sem max_age) e somem quando o navegador fecha. A escolha viaja no próprio
refresh token (claim `persist`), para o /auth/refresh renovar no mesmo modo.
"""

from typing import Any

from fastapi import Request, Response

from src.core.config import settings

REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60


def set_auth_cookies(response: Response, access_token: str, refresh_token: str, persistent: bool = True) -> None:
    access_max_age = settings.ACCESS_TOKEN_EXPIRE_HOURS * 3600 if persistent else None
    refresh_max_age = REFRESH_COOKIE_MAX_AGE if persistent else None
    secure = not settings.DEBUG

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=secure,
        samesite="strict",
        max_age=access_max_age,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=secure,
        samesite="strict",
        max_age=refresh_max_age,
    )
    # Cookie legível pelo JS só para o frontend saber que está autenticado
    # sem precisar guardar o JWT em localStorage.
    response.set_cookie(
        key="auth_state",
        value="1",
        httponly=False,
        secure=secure,
        samesite="strict",
        max_age=access_max_age,
    )


def clear_auth_cookies(response: Response) -> None:
    """Apaga os 3 cookies de auth com os mesmos atributos do login."""
    secure = not settings.DEBUG
    response.delete_cookie(key="access_token", httponly=True, secure=secure, samesite="strict")
    response.delete_cookie(key="refresh_token", httponly=True, secure=secure, samesite="strict")
    response.delete_cookie(key="auth_state", httponly=False, secure=secure, samesite="strict")


def is_impersonated_request(request: Request) -> bool:
    """True quando o JWT da requisicao e de impersonacao (claim impersonated_by).

    Durante a impersonacao o super-admin usa o token do usuario do tenant via
    header Bearer, mas os cookies do navegador sao os DELE — qualquer endpoint
    que apaga cookies ou revoga sessoes precisa recusar esse caso.
    """
    token_data: Any = getattr(request.state, "token", None)
    return bool(getattr(token_data, "impersonated_by", None)) if token_data else False
