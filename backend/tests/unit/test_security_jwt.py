"""Tests for JWT token creation and validation."""
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
import jwt  # PyJWT

import src.security.jwt as jwt_module
from src.security.jwt import (
    LEGACY_UNTYPED_ACCESS_CUTOFF,
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

    def test_rejects_refresh_token(self):
        """A refresh token (long-lived) must never be accepted as an access
        token — decode_token is what jwt_middleware authenticates with."""
        user_id = uuid.uuid4()
        tenant_id = uuid.uuid4()
        refresh = create_refresh_token(user_id, tenant_id, "admin", uuid.uuid4(), uuid.uuid4())
        with pytest.raises(InvalidTokenError, match="refresh token"):
            decode_token(refresh)

    def test_rejects_handcrafted_type_refresh_payload(self):
        payload = {
            "sub": str(uuid.uuid4()),
            "tenant_id": str(uuid.uuid4()),
            "role": "admin",
            "exp": datetime.now(timezone.utc) + timedelta(days=30),
            "iat": datetime.now(timezone.utc),
            "type": "refresh",
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        with pytest.raises(InvalidTokenError, match="refresh token"):
            decode_token(token)

    def test_decode_token_missing_sub_raises(self):
        payload = {
            "tenant_id": str(uuid.uuid4()),
            "role": "admin",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            "iat": datetime.now(timezone.utc),
            "type": "access",
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
            "type": "access",
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
            "type": "access",
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
            "type": "access",
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


def _assinar(payload: dict) -> str:
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def _payload_access(**extra) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "sub": str(uuid.uuid4()),
        "tenant_id": str(uuid.uuid4()),
        "role": "admin",
        "exp": now + timedelta(hours=1),
        "iat": now,
        **extra,
    }


class TestAccessTokenType:
    """T-02: access token tipado e decode_token em modo allowlist."""

    def test_access_token_tem_type_access(self):
        token = create_access_token(uuid.uuid4(), uuid.uuid4(), "operator")
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert payload["type"] == "access"

    def test_token_de_impersonacao_tem_type_access_e_decodifica(self):
        user_id, tenant_id, super_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        token = create_access_token(
            user_id, tenant_id, "admin", expires_delta=timedelta(hours=1), impersonated_by=super_id
        )
        raw = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert raw["type"] == "access"
        assert raw["impersonated_by"] == str(super_id)
        decoded = decode_token(token)
        assert decoded.sub == str(user_id)
        assert decoded.impersonated_by == str(super_id)

    def test_super_admin_sem_tenant_tem_type_access(self):
        token = create_access_token(uuid.uuid4(), None, "super_admin")
        assert jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])["type"] == "access"
        assert decode_token(token).tenant_id is None

    def test_access_token_feito_a_mao_com_type_access_e_aceito(self):
        assert decode_token(_assinar(_payload_access(type="access"))).role == "admin"

    @pytest.mark.parametrize(
        "tipo", ["account_select", "mfa_pending", "invite", "Access", "ACCESS", "", "qualquer-coisa", 1]
    )
    def test_tipo_desconhecido_e_recusado(self, tipo):
        with pytest.raises(InvalidTokenError, match="tipo de token"):
            decode_token(_assinar(_payload_access(type=tipo)))

    def test_refresh_continua_funcionando_e_nao_vira_access(self):
        user_id, tenant_id = uuid.uuid4(), uuid.uuid4()
        refresh = create_refresh_token(user_id, tenant_id, "admin", uuid.uuid4(), uuid.uuid4())
        assert decode_refresh_token(refresh).sub == str(user_id)
        with pytest.raises(InvalidTokenError, match="refresh token"):
            decode_token(refresh)

    def test_access_tipado_nao_vira_refresh(self):
        with pytest.raises(InvalidTokenError, match="não é um refresh token"):
            decode_refresh_token(create_access_token(uuid.uuid4(), uuid.uuid4(), "admin"))

    def test_corte_legado_e_fixo_em_utc(self):
        assert LEGACY_UNTYPED_ACCESS_CUTOFF == datetime(2026, 10, 8, tzinfo=timezone.utc)

    def test_so_security_jwt_assina_tokens(self):
        """Todo access token sai de create_access_token (que grava type=access):
        nenhum outro módulo de src/ chama jwt.encode direto."""
        src_dir = Path(jwt_module.__file__).resolve().parents[1]
        culpados = [
            str(p.relative_to(src_dir))
            for p in src_dir.rglob("*.py")
            if p.name != "jwt.py" and re.search(r"\bjwt\.encode\(", p.read_text(encoding="utf-8"))
        ]
        assert culpados == []


class TestLegacyUntypedAccessWindow:
    """Janela de compatibilidade: token sem `type` emitido antes do corte vale
    até iat + TTL de access; depois disso (ou emitido após o corte) é recusado."""

    CORTE = datetime(2026, 9, 1, tzinfo=timezone.utc)

    @pytest.fixture(autouse=True)
    def corte_no_passado(self):
        # Corte no passado real: assim o `iat` dos tokens também fica no
        # passado e o PyJWT não recusa por iat no futuro (falso positivo).
        with patch.object(jwt_module, "LEGACY_UNTYPED_ACCESS_CUTOFF", self.CORTE):
            yield

    def _legado(self, iat: datetime) -> str:
        return _assinar({
            "sub": str(uuid.uuid4()),
            "tenant_id": str(uuid.uuid4()),
            "role": "admin",
            "exp": datetime(2099, 1, 1, tzinfo=timezone.utc),
            "iat": iat,
        })

    def _agora(self, quando: datetime):
        return patch.object(jwt_module, "_utcnow", return_value=quando)

    def test_aceito_dentro_da_janela(self):
        iat = self.CORTE - timedelta(hours=2)
        with self._agora(iat + timedelta(hours=1)):
            assert decode_token(self._legado(iat)).role == "admin"

    def test_impersonacao_legada_aceita_dentro_da_janela(self):
        iat = self.CORTE - timedelta(minutes=10)
        token = _assinar({
            "sub": str(uuid.uuid4()), "tenant_id": str(uuid.uuid4()), "role": "admin",
            "exp": datetime(2099, 1, 1, tzinfo=timezone.utc), "iat": iat,
            "impersonated_by": str(uuid.uuid4()),
        })
        with self._agora(iat + timedelta(minutes=30)):
            assert decode_token(token).impersonated_by is not None

    def test_recusado_depois_do_ttl_do_proprio_iat(self):
        iat = self.CORTE - timedelta(hours=2)
        ttl = timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS)
        with self._agora(iat + ttl + timedelta(seconds=1)):
            with pytest.raises(InvalidTokenError, match="tipo de token ausente"):
                decode_token(self._legado(iat))

    def test_recusado_depois_de_corte_mais_ttl(self):
        """Passado CUTOFF + TTL nenhum token sem type passa: allowlist pura."""
        iat = self.CORTE - timedelta(seconds=1)
        ttl = timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS)
        with self._agora(self.CORTE + ttl):
            with pytest.raises(InvalidTokenError, match="tipo de token ausente"):
                decode_token(self._legado(iat))

    def test_sem_type_emitido_depois_do_corte_e_recusado(self):
        iat = self.CORTE + timedelta(seconds=1)
        with self._agora(iat + timedelta(minutes=1)):
            with pytest.raises(InvalidTokenError, match="tipo de token ausente"):
                decode_token(self._legado(iat))

    def test_sem_type_e_sem_iat_e_recusado(self):
        token = _assinar({
            "sub": str(uuid.uuid4()), "tenant_id": str(uuid.uuid4()), "role": "admin",
            "exp": datetime(2099, 1, 1, tzinfo=timezone.utc),
        })
        with self._agora(self.CORTE - timedelta(hours=1)):
            with pytest.raises(InvalidTokenError, match="tipo de token ausente"):
                decode_token(token)

    def test_access_tipado_nao_depende_da_janela(self):
        token = create_access_token(uuid.uuid4(), uuid.uuid4(), "admin")
        with self._agora(datetime(2030, 1, 1, tzinfo=timezone.utc)):
            assert decode_token(token).role == "admin"


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
