"""Application Configuration"""
from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import Optional
from datetime import timedelta
import json


class Settings(BaseSettings):
    """Application settings from environment variables."""
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://senhas:senhas@localhost:5432/senhas_db"
    
    # JWT
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_HOURS: int = 24
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ALGORITHM: str = "HS256"
    
    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    
    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """Accept both JSON array and comma-separated string."""
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except (json.JSONDecodeError, TypeError):
                pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v
    
    # App
    APP_NAME: str = "Senhas API"
    APP_VERSION: str = "1.1.0"
    DEBUG: bool = False
    
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
