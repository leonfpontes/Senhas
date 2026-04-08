"""JWT token creation and validation (T019)."""
from datetime import datetime, timedelta, timezone
from typing import Optional, Any
import uuid
from jose import jwt, JWTError
from pydantic import BaseModel, Field

from ..core.config import settings
from ..core.errors import InvalidTokenError


class TokenPayload(BaseModel):
    """JWT token payload structure."""
    
    sub: str  # subject: user_id
    tenant_id: Optional[str] = None  # tenant_id (None for SUPER_ADMIN)
    role: str  # user role
    exp: datetime  # expiration
    iat: datetime  # issued at
    impersonated_by: Optional[str] = None  # SUPER_ADMIN user_id when impersonating


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
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create JWT refresh token.
    
    Args:
        user_id: User ID
        tenant_id: Tenant ID
        role: User role
        expires_delta: Custom expiration delta (default 30 days)
        
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
        "type": "refresh",
    }
    
    encoded = jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    
    return encoded


def decode_token(token: str) -> TokenPayload:
    """Decode and validate JWT token.
    
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
        
    except JWTError as e:
        raise InvalidTokenError(f"Token inválido: {str(e)}")
    except Exception as e:
        raise InvalidTokenError(f"Erro ao decodificar token: {str(e)}")
