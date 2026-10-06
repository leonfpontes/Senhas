"""Helpers dos cookies de autenticacao (access_token, refresh_token, auth_state).

Fonte unica dos atributos usados para APAGAR os 3 cookies — precisam bater com
os do `set_cookie` do login/refresh (secure depende de DEBUG, SameSite=Strict),
senao o navegador ignora o delete e a sessao "sobrevive" no front.
"""

from typing import Any

from fastapi import Request, Response

from src.core.config import settings


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
