"""JWT token creation and validation (T019)."""
from datetime import datetime, timedelta, timezone
from typing import Optional, Any
import uuid
import jwt  # PyJWT — substitui python-jose (que arrastava ecdsa/pyasn1 vulneráveis)
from pydantic import BaseModel, Field

from ..core.config import settings
from ..core.errors import InvalidTokenError

# Tipos de JWT (claim `type`). `decode_token` é ALLOWLIST: só `access` serve
# para autenticar requisição. Qualquer outro tipo — `refresh`, e os que ainda
# vão existir (`account_select`, `mfa_pending`, convite...) — é recusado.
ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"
# Escolha do terreiro no login (AM-05): prova curta de que a senha conferiu em
# mais de uma conta com o mesmo e-mail. Não autentica nada sozinho — só o
# POST /auth/login/select aceita (decode_account_select_token).
ACCOUNT_SELECT_TOKEN_TYPE = "account_select"
ACCOUNT_SELECT_TOKEN_TTL = timedelta(minutes=5)

# Janela de compatibilidade (T-02, out/2026). Antes do T-02 o access token
# não tinha `type`. Um token SEM `type` só é aceito se foi emitido antes deste
# corte E ainda está dentro do maior TTL de access contado do próprio `iat`
# (ACCESS_TOKEN_EXPIRE_HOURS) — ou seja, os tokens legados morrem
# naturalmente e, passado CUTOFF + TTL, o ramo legado não aceita mais nada.
# O corte precisa ser >= o momento do deploy do T-02: token sem `type`
# emitido depois dele (pelo código antigo, se o deploy atrasar) toma 401 e o
# front renova sozinho via /auth/refresh (api_client.ts), sem deslogar.
# TODO(T-02): remover o ramo legado (e esta constante) a partir de
# 2026-10-10 — CUTOFF + 24h de TTL + folga; a partir daí ele é código morto.
LEGACY_UNTYPED_ACCESS_CUTOFF = datetime(2026, 10, 8, 0, 0, tzinfo=timezone.utc)


class TokenPayload(BaseModel):
    """JWT token payload structure."""

    sub: str  # subject: user_id
    tenant_id: Optional[str] = None  # tenant_id (None for SUPER_ADMIN)
    role: str  # user role
    exp: datetime  # expiration
    iat: datetime  # issued at
    impersonated_by: Optional[str] = None  # SUPER_ADMIN user_id when impersonating
    # Refresh-token rotation/reuse-detection fields (only meaningful for refresh
    # tokens). Optional so tokens issued before this field existed keep decoding —
    # decode_refresh_token treats a missing session_id/jti as a legacy token to be
    # transparently upgraded on its next use, instead of forcing a mass logout.
    session_id: Optional[str] = None
    jti: Optional[str] = None
    orig_iat: Optional[datetime] = None
    # "Lembrar-me" (só refresh tokens): False → cookies de sessão no refresh.
    persistent: bool = True


class AccessToken(BaseModel):
    """Access token response."""
    
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class RefreshTokenData(BaseModel):
    """Refresh token data."""
    
    user_id: str
    tenant_id: str
    role: str


def create_access_token(
    user_id: uuid.UUID,
    tenant_id: uuid.UUID,
    role: str,
    expires_delta: Optional[timedelta] = None,
    impersonated_by: Optional[uuid.UUID] = None,
) -> str:
    """Create JWT access token.
    
    Args:
        user_id: User ID
        tenant_id: Tenant ID
        role: User role
        expires_delta: Custom expiration delta (default 24 hours)
        impersonated_by: SUPER_ADMIN user_id when impersonating
        
    Returns:
        Encoded JWT token
    """
    if expires_delta is None:
        expires_delta = timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS)
    
    now = datetime.now(timezone.utc)
    exp = now + expires_delta
    
    payload = {
        "sub": str(user_id),
        "tenant_id": str(tenant_id) if tenant_id is not None else None,
        "role": role,
        "exp": exp,
        "iat": now,
        "type": ACCESS_TOKEN_TYPE,
    }
    
    if impersonated_by is not None:
        payload["impersonated_by"] = str(impersonated_by)
    
    encoded = jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    
    return encoded


def create_refresh_token(
    user_id: uuid.UUID,
    tenant_id: uuid.UUID,
    role: str,
    session_id: uuid.UUID,
    jti: uuid.UUID,
    expires_delta: Optional[timedelta] = None,
    persistent: bool = True,
) -> str:
    """Create JWT refresh token.

    Args:
        user_id: User ID
        tenant_id: Tenant ID
        role: User role
        session_id: Stable identifier for this login (unchanged across rotations),
            used to look up the matching UserSession row for reuse detection and
            the absolute session-lifetime cap.
        jti: Unique identifier for *this* refresh token issuance. The caller
            persists it as UserSession.current_jti so the next refresh can
            detect whether a stale/stolen token is being replayed.
        expires_delta: Custom expiration delta (default 30 days)
        persistent: "Lembrar-me". False grava o claim `persist: false`, que o
            /auth/refresh lê para continuar emitindo cookies de sessão (sem
            max_age). True (padrão) não grava claim nenhum — tokens antigos,
            sem o claim, seguem persistentes.

    Returns:
        Encoded JWT token
    """
    if expires_delta is None:
        expires_delta = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    now = datetime.now(timezone.utc)
    exp = now + expires_delta

    payload = {
        "sub": str(user_id),
        "tenant_id": str(tenant_id) if tenant_id is not None else None,
        "role": role,
        "exp": exp,
        "iat": now,
        "type": REFRESH_TOKEN_TYPE,
        "session_id": str(session_id),
        "jti": str(jti),
    }
    if not persistent:
        payload["persist"] = False

    encoded = jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )

    return encoded


def _utcnow() -> datetime:
    """Relógio da janela legada (isolado para os testes congelarem o tempo)."""
    return datetime.now(timezone.utc)


def _legacy_untyped_access_allowed(payload: dict[str, Any]) -> bool:
    """Janela de compatibilidade do T-02 para access tokens sem `type`.

    Aceita só se `iat` < LEGACY_UNTYPED_ACCESS_CUTOFF e agora < iat + TTL
    máximo de access. Como iat < corte, isso nunca passa de CUTOFF + TTL:
    depois disso o decode é allowlist pura (`type == "access"`).
    TODO(T-02): remover a partir de 2026-10-10 (ver LEGACY_UNTYPED_ACCESS_CUTOFF).
    """
    iat_raw = payload.get("iat")
    if not isinstance(iat_raw, (int, float)) or isinstance(iat_raw, bool):
        return False
    iat = datetime.fromtimestamp(iat_raw, tz=timezone.utc)
    if iat >= LEGACY_UNTYPED_ACCESS_CUTOFF:
        return False
    max_ttl = timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS)
    return _utcnow() < iat + max_ttl


def decode_token(token: str) -> TokenPayload:
    """Decode and validate an ACCESS token (o que o jwt_middleware usa).

    Allowlist: só `type == "access"`. Refresh e qualquer outro tipo são
    recusados; token sem `type` só dentro da janela de compatibilidade
    (`_legacy_untyped_access_allowed`).

    Args:
        token: JWT token string
        
    Returns:
        TokenPayload with decoded claims
        
    Raises:
        InvalidTokenError: If token is invalid or expired
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )

        token_type = payload.get("type")
        if token_type == REFRESH_TOKEN_TYPE:
            raise InvalidTokenError(
                "Token inválido: refresh token não pode ser usado como access token"
            )
        if token_type is None:
            if not _legacy_untyped_access_allowed(payload):
                raise InvalidTokenError("Token inválido: tipo de token ausente")
        elif token_type != ACCESS_TOKEN_TYPE:
            raise InvalidTokenError(
                "Token inválido: tipo de token não aceito como access token"
            )

        # Validate required fields
        user_id = payload.get("sub")
        tenant_id = payload.get("tenant_id")  # None for SUPER_ADMIN
        role = payload.get("role")

        # tenant_id is required for all roles except super_admin
        missing_tenant = not tenant_id and role != "super_admin"
        if not user_id or not role or missing_tenant:
            raise InvalidTokenError("Token inválido: campos obrigatórios faltando")
        
        return TokenPayload(
            sub=user_id,
            tenant_id=tenant_id,
            role=role,
            exp=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
            iat=datetime.fromtimestamp(payload["iat"], tz=timezone.utc),
            impersonated_by=payload.get("impersonated_by"),
        )
        
    except jwt.PyJWTError as e:
        raise InvalidTokenError(f"Token inválido: {str(e)}")
    except InvalidTokenError:
        raise
    except Exception as e:
        raise InvalidTokenError(f"Erro ao decodificar token: {str(e)}")


def decode_refresh_token(token: str) -> TokenPayload:
    """Decode and validate a refresh token.

    Same as decode_token but requires `type == 'refresh'` in the payload,
    preventing refresh tokens from being accepted as access tokens and vice-versa.

    Raises:
        InvalidTokenError: If token is invalid, expired, or not a refresh token.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])

        if payload.get("type") != REFRESH_TOKEN_TYPE:
            raise InvalidTokenError("Token não é um refresh token")

        user_id = payload.get("sub")
        role = payload.get("role")
        if not user_id or not role:
            raise InvalidTokenError("Refresh token inválido: campos obrigatórios faltando")

        return TokenPayload(
            sub=user_id,
            tenant_id=payload.get("tenant_id"),
            role=role,
            exp=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
            iat=datetime.fromtimestamp(payload["iat"], tz=timezone.utc),
            # Absent on refresh tokens issued before rotation/reuse-detection was
            # added — decode succeeds regardless, caller treats missing session_id
            # as a legacy token to transparently upgrade.
            session_id=payload.get("session_id"),
            jti=payload.get("jti"),
            persistent=payload.get("persist", True) is not False,
        )
    except jwt.PyJWTError as e:
        raise InvalidTokenError(f"Refresh token inválido: {str(e)}")
    except InvalidTokenError:
        raise
    except Exception as e:
        raise InvalidTokenError(f"Erro ao decodificar refresh token: {str(e)}")


class AccountSelectPayload(BaseModel):
    """Conteúdo do token de escolha de terreiro (AM-05)."""

    user_ids: list[uuid.UUID]
    remember_me: bool = True
    iat: datetime
    exp: datetime


def create_account_select_token(
    user_ids: list[uuid.UUID],
    remember_me: bool,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Token de escolha de terreiro (AM-05): `type=account_select`, 5 min.

    Carrega só as contas cuja senha conferiu no login (`uids`) e o "Lembrar-me"
    (`remember`). Sem `sub`/`role`/`tenant_id`: mesmo que um decoder errado o
    aceitasse, não haveria identidade para autenticar. `decode_token` e
    `decode_refresh_token` o recusam pelo `type` (allowlist do T-02).
    """
    if expires_delta is None:
        expires_delta = ACCOUNT_SELECT_TOKEN_TTL
    now = datetime.now(timezone.utc)
    payload = {
        "type": ACCOUNT_SELECT_TOKEN_TYPE,
        "uids": [str(u) for u in user_ids],
        "remember": bool(remember_me),
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_account_select_token(token: str) -> AccountSelectPayload:
    """Valida o token de escolha de terreiro: assinatura, validade e `type`.

    Raises:
        InvalidTokenError: token inválido, expirado, de outro tipo ou sem contas.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != ACCOUNT_SELECT_TOKEN_TYPE:
            raise InvalidTokenError("Token não é de escolha de conta")
        raw_ids = payload.get("uids")
        if not isinstance(raw_ids, list) or not raw_ids:
            raise InvalidTokenError("Token de escolha sem contas")
        return AccountSelectPayload(
            user_ids=[uuid.UUID(str(u)) for u in raw_ids],
            remember_me=payload.get("remember", True) is not False,
            iat=datetime.fromtimestamp(payload["iat"], tz=timezone.utc),
            exp=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
        )
    except jwt.PyJWTError as e:
        raise InvalidTokenError(f"Token de escolha inválido: {str(e)}")
    except InvalidTokenError:
        raise
    except Exception as e:
        raise InvalidTokenError(f"Erro ao decodificar token de escolha: {str(e)}")
