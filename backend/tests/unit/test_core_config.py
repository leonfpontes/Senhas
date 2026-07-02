"""Tests for application configuration."""
import pytest
from src.core.config import Settings, settings


class TestSettings:
    """Tests for Settings configuration."""

    def test_default_database_url(self):
        s = Settings()
        assert "postgresql" in s.DATABASE_URL
        assert "asyncpg" in s.DATABASE_URL

    def test_default_jwt_settings(self):
        s = Settings()
        assert s.ACCESS_TOKEN_EXPIRE_HOURS == 24
        assert s.REFRESH_TOKEN_EXPIRE_DAYS == 30
        assert s.ALGORITHM == "HS256"

    def test_default_password_policy(self):
        s = Settings()
        assert s.PASSWORD_MIN_LENGTH == 12
        assert s.PASSWORD_REQUIRE_UPPERCASE is True
        assert s.PASSWORD_REQUIRE_LOWERCASE is True
        assert s.PASSWORD_REQUIRE_DIGIT is True
        assert s.PASSWORD_REQUIRE_SYMBOL is True

    def test_default_cors_origins(self):
        s = Settings()
        assert "http://localhost:3000" in s.CORS_ORIGINS

    def test_default_app_info(self, monkeypatch):
        # DEBUG=False triggers _validate_production_secrets — needs
        # non-default SECRET_KEY/DATABASE_URL to construct successfully,
        # independent of what this test actually wants to check.
        monkeypatch.delenv("DEBUG", raising=False)
        monkeypatch.setenv("SECRET_KEY", "a" * 32)
        monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://safe_user:safe_pass@localhost:5432/senhas_db")
        s = Settings()
        assert s.APP_NAME == "Senhas API"
        assert s.DEBUG is False

    def test_singleton_instance(self):
        assert settings is not None
        assert isinstance(settings, Settings)
        assert settings.APP_NAME == "Senhas API"

    def test_secret_key_exists(self):
        s = Settings()
        assert len(s.SECRET_KEY) > 0
