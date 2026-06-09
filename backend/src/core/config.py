"""Application Configuration"""
from pydantic_settings import BaseSettings
from pydantic import model_validator
from typing import Optional
from datetime import timedelta
import logging

logger = logging.getLogger("senhas")

# Bcrypt hash of a throwaway string — used to normalise timing when a user
# is not found at login, preventing user-enumeration via response latency.
# Generated once with bcrypt.hashpw(b"__dummy__", bcrypt.gensalt(rounds=12))
DUMMY_BCRYPT_HASH = "$2b$12$KIX/USmfNVJQI7N9AJLF3.ib7v3L4mnlM5WBEK6BfVYYJCWbv2lRO"

_INSECURE_SECRET_KEY_DEFAULT = "your-secret-key-change-in-production"
_INSECURE_DB_URL_MARKER = "senhas:senhas@"


class Settings(BaseSettings):
    """Application settings from environment variables."""

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://senhas:senhas@localhost:5432/senhas_db"

    # JWT
    SECRET_KEY: str = _INSECURE_SECRET_KEY_DEFAULT
    ACCESS_TOKEN_EXPIRE_HOURS: int = 24
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ALGORITHM: str = "HS256"

    # CORS — stored as comma-separated string to avoid pydantic-settings JSON parse
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS_ORIGINS string into a list."""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # App
    APP_NAME: str = "Senhas API"
    APP_VERSION: str = "1.1.0"
    DEBUG: bool = False

    # Frontend URL for building public links
    FRONTEND_URL: str = "http://localhost:3000"

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_BASIC: str = ""
    STRIPE_PRICE_PRO: str = ""
    STRIPE_PRICE_PREMIUM: str = ""

    # Email — Resend (primary)
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "noreply@girahub.com.br"

    # Email — Brevo (fallback)
    BREVO_API_KEY: str = ""
    BREVO_FROM_EMAIL: str = "noreply@girahub.com.br"
    BREVO_FROM_NAME: str = "GiraHub"

    # Password policy
    PASSWORD_MIN_LENGTH: int = 12
    PASSWORD_REQUIRE_UPPERCASE: bool = True
    PASSWORD_REQUIRE_LOWERCASE: bool = True
    PASSWORD_REQUIRE_DIGIT: bool = True
    PASSWORD_REQUIRE_SYMBOL: bool = True

    @model_validator(mode="after")
    def _validate_production_secrets(self) -> "Settings":
        """Fail-fast if critical secrets are insecure in production.

        Prevents accidental deploy with default/weak values that would allow
        an attacker to forge JWTs or use the database with default credentials.
        """
        if self.DEBUG:
            return self

        errors: list[str] = []

        if self.SECRET_KEY == _INSECURE_SECRET_KEY_DEFAULT:
            errors.append(
                "SECRET_KEY está com o valor padrão inseguro. "
                "Gere com: openssl rand -hex 32"
            )
        elif len(self.SECRET_KEY) < 32:
            errors.append(
                f"SECRET_KEY muito curta ({len(self.SECRET_KEY)} chars). Mínimo: 32."
            )

        if _INSECURE_DB_URL_MARKER in self.DATABASE_URL:
            errors.append(
                "DATABASE_URL contém credenciais padrão ('senhas:senhas'). "
                "Defina DB_USER e DB_PASSWORD seguros no .env."
            )

        if self.STRIPE_PRICE_BASIC and not self.STRIPE_WEBHOOK_SECRET:
            errors.append(
                "Stripe está configurado (STRIPE_PRICE_BASIC definido) mas "
                "STRIPE_WEBHOOK_SECRET está vazio. Eventos Stripe não serão validados."
            )

        if errors:
            msg = "Configuração insegura para produção (DEBUG=False):\n" + "\n".join(
                f"  • {e}" for e in errors
            )
            raise ValueError(msg)

        return self

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


settings = Settings()
