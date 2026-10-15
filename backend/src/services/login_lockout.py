"""Bloqueio de login por e-mail depois de muitas senhas erradas (pentest L10).

O rate limit do /login é por IP (`limiter`, 10/min): um ataque espalhado por muitos IPs
testava senhas contra a mesma conta sem limite. Aqui a contagem é por e-mail de login
(normalizado): ``MAX_FAILURES`` senhas erradas na janela bloqueiam novas tentativas desse
e-mail até a janela virar (429 ``LOGIN_LOCKED``). Login certo zera a contagem.

- E-mail inexistente conta igual (não vira oráculo de "esse e-mail existe").
- O bloqueio é checado ANTES do bcrypt: tentativa bloqueada nem confere a senha.
- Trancar a conta de alguém de propósito custa 10 tentativas e dura no máximo a janela;
  o "esqueci a senha" segue funcionando.
- Armazenamento: o mesmo do slowapi (Redis com REDIS_URL, memória sem ele).
"""

from limits import RateLimitItemPerMinute
from limits.storage import storage_from_string
from limits.strategies import FixedWindowRateLimiter

from src.core.config import settings
from src.core.errors import APIException

MAX_FAILURES = 10
WINDOW_MINUTES = 15

_ITEM = RateLimitItemPerMinute(MAX_FAILURES, WINDOW_MINUTES)
_NAMESPACE = "login_fail"
_storage = storage_from_string(settings.REDIS_URL or "memory://")
_strategy = FixedWindowRateLimiter(_storage)


class LoginLockedError(APIException):
    def __init__(self) -> None:
        super().__init__(
            f"Muitas tentativas de login com este e-mail. Tente de novo em até {WINDOW_MINUTES} minutos "
            "ou use \"Esqueci minha senha\".",
            status_code=429,
            error_code="LOGIN_LOCKED",
        )


def ensure_not_locked(email_key: str) -> None:
    """Levanta 429 se o e-mail já esgotou as tentativas da janela."""
    if not _strategy.test(_ITEM, _NAMESPACE, email_key):
        raise LoginLockedError()


def register_failure(email_key: str) -> None:
    _strategy.hit(_ITEM, _NAMESPACE, email_key)


def clear_failures(email_key: str) -> None:
    _strategy.clear(_ITEM, _NAMESPACE, email_key)


def reset_all() -> None:
    """Só para testes."""
    _storage.reset()
