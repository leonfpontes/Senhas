"""Application Configuration"""
from pydantic_settings import BaseSettings, SettingsConfigDict
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

    # Redis
    REDIS_URL: str = ""

    # JWT
    SECRET_KEY: str = _INSECURE_SECRET_KEY_DEFAULT
    ACCESS_TOKEN_EXPIRE_HOURS: int = 24
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ALGORITHM: str = "HS256"
    # Absolute session lifetime cap: even with continuous silent refresh, a
    # session forces a fresh login this many days after the *original* login
    # (tracked via UserSession.orig_iat / expires_at), independent of activity.
    MAX_SESSION_DAYS: int = 14
    # Grace window for benign refresh-token races between concurrent tabs/devices
    # sharing the same session: a jti superseded by rotation within this window
    # is still accepted once, instead of being treated as a reuse/theft signal.
    REFRESH_REUSE_GRACE_SECONDS: int = 30

    # CORS — stored as comma-separated string to avoid pydantic-settings JSON parse
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS_ORIGINS string into a list."""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # App
    APP_NAME: str = "Senhas API"
    APP_VERSION: str = "2.2.0"
    DEBUG: bool = False

    # Frontend URL for building public links
    FRONTEND_URL: str = "http://localhost:3000"
    # E-mails de onboarding D+1/D+3 (services/onboarding_email_scheduler.py).
    # Chave de desligar: ONBOARDING_EMAILS_ENABLED=false no .env + restart do backend.
    ONBOARDING_EMAILS_ENABLED: bool = True

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_BASIC: str = ""
    STRIPE_PRICE_PRO: str = ""
    STRIPE_PRICE_PREMIUM: str = ""
    # $-04 — assinatura paga por fatura (boleto) em vez de cartão: formas de pagamento
    # oferecidas na página da fatura da Stripe (separadas por vírgula) e prazo para pagar.
    # Pix fica de fora: conta Stripe do Brasil não tem Pix em fatura/assinatura (só pagamento
    # avulso, sob convite; o Pix Automático não está disponível no Brasil). Quando a Stripe
    # liberar, basta "boleto,pix" aqui — o painel passa a mostrar "PIX ou boleto".
    STRIPE_INVOICE_PAYMENT_METHODS: str = "boleto"
    STRIPE_INVOICE_DAYS_UNTIL_DUE: int = 5

    # Mensalidade com baixa automática pelo Stripe Connect (F-02/AM-22). Os eventos das
    # contas conectadas (casas) chegam num webhook PRÓPRIO (POST /api/v1/webhooks/stripe-connect),
    # com segredo de assinatura diferente do webhook da assinatura do GiraHub. Sem este
    # segredo (ou sem STRIPE_SECRET_KEY), a opção "Stripe" nem aparece no painel.
    STRIPE_CONNECT_WEBHOOK_SECRET: str = ""

    # Segredo em repouso (core/secret_box.py): chave Fernet para cifrar credenciais de terceiros
    # (token OAuth do Mercado Pago). Vazia = nada que precise de segredo é gravado.
    # Gerar: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    SECRETS_ENCRYPTION_KEY: str = ""

    # Mensalidade com baixa automática pelo Mercado Pago (F-02/AM-22) — aplicação do GiraHub no
    # painel de Developers do Mercado Pago (OAuth: a casa autoriza e o GiraHub cobra na conta dela).
    # Sem as quatro (ou sem SECRETS_ENCRYPTION_KEY, que cifra os tokens), a opção não aparece.
    # REDIRECT_URI = a página do painel que recebe o código (…/admin/financeiro/mercadopago-retorno),
    # exatamente como cadastrada na aplicação. WEBHOOK_SECRET = "assinatura secreta" dos webhooks.
    MERCADOPAGO_CLIENT_ID: str = ""
    MERCADOPAGO_CLIENT_SECRET: str = ""
    MERCADOPAGO_REDIRECT_URI: str = ""
    MERCADOPAGO_WEBHOOK_SECRET: str = ""

    # Email — Resend (primary)
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "noreply@girahub.com.br"

    # Email — Brevo (fallback)
    BREVO_API_KEY: str = ""
    BREVO_FROM_EMAIL: str = "noreply@girahub.com.br"
    BREVO_FROM_NAME: str = "GiraHub"

    # Notificação no celular da Área do Médium (AM-16) — Web Push com VAPID, sem serviço pago.
    # Sem as três, o push fica desligado sem erro (API diz `disponivel: false`, a tela esconde a
    # opção e o agendador só manda e-mail). Gerar: `npx web-push generate-vapid-keys`
    # (docs/deployment.md). Nunca commitar a chave privada.
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_SUBJECT: str = ""  # "mailto:contato@girahub.com.br"

    # Sentry
    SENTRY_DSN: str = ""
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1   # 10% das transações em prod
    SENTRY_ENVIRONMENT: str = "development"

    # Alertas de erro — email do operador que receberá notificações de erros 5xx
    ALERT_EMAIL: str = ""
    # Threshold: quantos erros 5xx em ERROR_RATE_WINDOW_MINUTES para disparar alerta
    ERROR_RATE_THRESHOLD: int = 5
    ERROR_RATE_WINDOW_MINUTES: int = 5
    # Cooldown entre alertas do mesmo tipo (minutos) para evitar flood de emails
    ERROR_ALERT_COOLDOWN_MINUTES: int = 30

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

        if self.STRIPE_SECRET_KEY and not self.STRIPE_SECRET_KEY.startswith("sk_live_"):
            errors.append(
                "STRIPE_SECRET_KEY não começa com 'sk_live_' — parece uma chave de "
                "teste (sk_test_) sendo usada em produção (DEBUG=False). Isso "
                "aceitaria pagamentos de teste como reais ou vice-versa."
            )

        if errors:
            msg = "Configuração insegura para produção (DEBUG=False):\n" + "\n".join(
                f"  • {e}" for e in errors
            )
            raise ValueError(msg)

        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
