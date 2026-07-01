"""Tests for JWT token creation and validation."""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock

import pytest
from jose import jwt

from src.security.jwt import (
    create_access_token,
    create_refresh_token,
    decode_token,
    decode_refresh_token,
    TokenPayload,
    AccessToken,
    RefreshTokenData,
)
from src.core.errors import InvalidTokenError
from src.core.config import settings


class TestCreateAccessToken:
    """Tests for create_access_token function."""

    def test_creates_valid_jwt(self):
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        token = create_access_token(user_id, tenant_id, "admin")
        assert isinstance(token, str)
        assert len(token) > 0

    def test_token_contains_correct_claims(self):
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        token = create_access_token(user_id, tenant_id, "admin")
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert payload["sub"] == str(user_id)
        assert payload["tenant_id"] == str(tenant_id)
        assert payload["role"] == "admin"
        assert "exp" in payload
        assert "iat" in payload

    def test_default_expiration_24_hours(self):
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        token = create_access_token(user_id, tenant_id, "operator")
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        iat = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
        delta = exp - iat
        assert abs(delta.total_seconds() - settings.ACCESS_TOKEN_EXPIRE_HOURS * 3600) < 2

    def test_custom_expiration(self):
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        custom_delta = timedelta(minutes=30)
        token = create_access_token(user_id, tenant_id, "admin", expires_delta=custom_delta)
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        iat = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
        delta = exp - iat
        assert abs(delta.total_seconds() - 1800) < 2

    def test_different_roles(self):
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        for role in ["super_admin", "admin", "operator"]:
            token = create_access_token(user_id, tenant_id, role)
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            assert payload["role"] == role


class TestCreateRefreshToken:
    """Tests for create_refresh_token function."""

    def test_creates_valid_jwt(self):
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        token = create_refresh_token(user_id, tenant_id, "admin", uuid.uuid4(), uuid.uuid4())
        assert isinstance(token, str)
        assert len(token) > 0

    def test_contains_type_refresh(self):
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        token = create_refresh_token(user_id, tenant_id, "admin", uuid.uuid4(), uuid.uuid4())
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert payload["type"] == "refresh"

    def test_contains_session_id_and_jti(self):
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        session_id = uuid.uuid4()
        jti = uuid.uuid4()
        token = create_refresh_token(user_id, tenant_id, "admin", session_id, jti)
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert payload["session_id"] == str(session_id)
        assert payload["jti"] == str(jti)

    def test_default_expiration_30_days(self):
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        token = create_refresh_token(user_id, tenant_id, "admin", uuid.uuid4(), uuid.uuid4())
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        iat = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
        delta = exp - iat
        expected = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400
        assert abs(delta.total_seconds() - expected) < 2

    def test_custom_expiration(self):
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        custom_delta = timedelta(days=7)
        token = create_refresh_token(user_id, tenant_id, "admin", uuid.uuid4(), uuid.uuid4(), expires_delta=custom_delta)
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        iat = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
        delta = exp - iat
        assert abs(delta.total_seconds() - 7 * 86400) < 2


class TestDecodeRefreshToken:
    """Tests for decode_refresh_token function."""

    def test_decodes_session_id_and_jti(self):
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        session_id = uuid.uuid4()
        jti = uuid.uuid4()
        token = create_refresh_token(user_id, tenant_id, "admin", session_id, jti)
        payload = decode_refresh_token(token)
        assert payload.session_id == str(session_id)
        assert payload.jti == str(jti)

    def test_legacy_token_without_session_id_still_decodes(self):
        """Refresh tokens issued before rotation tracking existed (no
        session_id/jti claims) must still decode successfully — the caller
        (POST /auth/refresh) is responsible for transparently upgrading them."""
        payload = {
            "sub": str(uuid.uuid4()),
            "tenant_id": str(uuid.uuid4()),
            "role": "admin",
            "exp": datetime.now(timezone.utc) + timedelta(days=30),
            "iat": datetime.now(timezone.utc),
            "type": "refresh",
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        result = decode_refresh_token(token)
        assert result.session_id is None
        assert result.jti is None

    def test_rejects_access_token(self):
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        access = create_access_token(user_id, tenant_id, "admin")
        with pytest.raises(InvalidTokenError):
            decode_refresh_token(access)


class TestDecodeToken:
    """Tests for decode_token function."""

    def test_decode_valid_access_token(self):
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        token = create_access_token(user_id, tenant_id, "admin")
        payload = decode_token(token)
        assert isinstance(payload, TokenPayload)
        assert payload.sub == str(user_id)
        assert payload.tenant_id == str(tenant_id)
        assert payload.role == "admin"

    def test_decode_expired_token_raises(self):
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        token = create_access_token(user_id, tenant_id, "admin", expires_delta=timedelta(seconds=-1))
        with pytest.raises(InvalidTokenError):
            decode_token(token)

    def test_decode_invalid_token_raises(self):
        with pytest.raises(InvalidTokenError):
            decode_token("invalid.token.string")

    def test_decode_empty_string_raises(self):
        with pytest.raises(InvalidTokenError):
            decode_token("")

    def test_decode_token_missing_sub_raises(self):
        payload = {
            "tenant_id": str(uuid.uuid4()),
            "role": "admin",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            "iat": datetime.now(timezone.utc),
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        with pytest.raises(InvalidTokenError, match="campos obrigatórios"):
            decode_token(token)

    def test_decode_token_missing_tenant_id_raises(self):
        payload = {
            "sub": str(uuid.uuid4()),
            "role": "admin",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            "iat": datetime.now(timezone.utc),
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        with pytest.raises(InvalidTokenError, match="campos obrigatórios"):
            decode_token(token)

    def test_decode_token_missing_role_raises(self):
        payload = {
            "sub": str(uuid.uuid4()),
            "tenant_id": str(uuid.uuid4()),
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            "iat": datetime.now(timezone.utc),
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        with pytest.raises(InvalidTokenError, match="campos obrigatórios"):
            decode_token(token)

    def test_decode_token_wrong_secret_raises(self):
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        payload = {
            "sub": str(user_id),
            "tenant_id": str(tenant_id),
            "role": "admin",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            "iat": datetime.now(timezone.utc),
        }
        token = jwt.encode(payload, "wrong-secret-key", algorithm=settings.ALGORITHM)
        with pytest.raises(InvalidTokenError):
            decode_token(token)

    def test_decode_returns_correct_types(self):
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        token = create_access_token(user_id, tenant_id, "operator")
        payload = decode_token(token)
        assert isinstance(payload.exp, datetime)
        assert isinstance(payload.iat, datetime)
        assert isinstance(payload.sub, str)


class TestTokenPayloadModel:
    """Tests for TokenPayload pydantic model."""

    def test_valid_payload(self):
        now = datetime.now(timezone.utc)
        p = TokenPayload(
            sub="user-id",
            tenant_id="tenant-id",
            role="admin",
            exp=now + timedelta(hours=1),
            iat=now,
        )
        assert p.sub == "user-id"
        assert p.role == "admin"

    def test_access_token_model(self):
        at = AccessToken(access_token="token123", expires_in=3600)
        assert at.token_type == "bearer"
        assert at.expires_in == 3600

    def test_refresh_token_data_model(self):
        rtd = RefreshTokenData(user_id="uid", tenant_id="tid", role="admin")
        assert rtd.role == "admin"
