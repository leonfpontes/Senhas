"""Application Configuration"""
from pydantic_settings import BaseSettings
from typing import Optional
from datetime import timedelta


class Settings(BaseSettings):
    """Application settings from environment variables."""
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://senhas:senhas@localhost:5432/senhas_db"
    
    # JWT
    SECRET_KEY: str = "your-secret-key-change-in-production"
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
    
    # Password policy
    PASSWORD_MIN_LENGTH: int = 12
    PASSWORD_REQUIRE_UPPERCASE: bool = True
    PASSWORD_REQUIRE_LOWERCASE: bool = True
    PASSWORD_REQUIRE_DIGIT: bool = True
    PASSWORD_REQUIRE_SYMBOL: bool = True
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
