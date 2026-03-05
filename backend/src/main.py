"""Main FastAPI application factory (T026)."""
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from contextlib import asynccontextmanager
import logging

from .core.config import settings
from .core.errors import APIException
from .core.database import engine, Base
from .middleware import jwt_middleware, tenant_context_middleware, audit_logging_middleware
from .api import auth_router
from .api.v1.admin import admin_router
from .models import (
    Tenant,
    User,
    UserRole,
    Gira,
    Consulente,
    Ticket,
    TicketStatus,
    SenhaControl,
    AuditLog,
    AuditAction,
)


logger = logging.getLogger("senhas")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager.
    
    Handles startup and shutdown events.
    """
    # Startup
    logger.info("Starting Senhas API...")
    
    # Create tables if needed
    async with engine.begin() as conn:
        # Note: In production, use Alembic migrations
        await conn.run_sync(Base.metadata.create_all)
    
    logger.info(f"Database initialized: {settings.DATABASE_URL}")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Senhas API...")
    await engine.dispose()


def create_app() -> FastAPI:
    """Create and configure FastAPI application.
    
    Returns:
        Configured FastAPI app instance
    """
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="Sistema Multi-Tenant de Gestão de Senhas para Terreiros de Umbanda",
        lifespan=lifespan,
    )
    
    # ============================================
    # MIDDLEWARE STACK
    # ============================================
    
    # Trusted Host Middleware
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["localhost", "127.0.0.1", "*.localhost"],
    )
    
    # CORS Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Tenant Context Middleware
    app.middleware("http")(tenant_context_middleware)
    
    # JWT Validation Middleware
    app.middleware("http")(jwt_middleware)
    
    # Audit Logging Middleware (for admin endpoints)
    app.middleware("http")(audit_logging_middleware)
    
    # ============================================
    # EXCEPTION HANDLERS
    # ============================================
    
    @app.exception_handler(APIException)
    async def api_exception_handler(request: Request, exc: APIException):
        """Handle custom API exceptions."""
        logger.error(f"API Error: {exc.error_code} - {exc.message}")
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error_code": exc.error_code,
                "message": exc.message,
                "details": exc.details,
            },
        )
    
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        """Handle pydantic validation errors."""
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error_code": "VALIDATION_ERROR",
                "message": "Erro na validação dos dados",
                "details": exc.errors(),
            },
        )
    
    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        """Handle uncaught exceptions."""
        logger.exception(f"Uncaught exception: {exc}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error_code": "INTERNAL_ERROR",
                "message": "Erro interno do servidor",
            },
        )
    
    # ============================================
    # ROUTES
    # ============================================
    
    # Health check
    @app.get("/health", tags=["health"])
    async def health_check():
        """Health check endpoint."""
        return {
            "status": "ok",
            "service": settings.APP_NAME,
            "version": settings.APP_VERSION,
        }
    
    # API v1 root
    @app.get("/api/v1", tags=["api"])
    async def api_v1_root():
        """API v1 root endpoint."""
        return {
            "message": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "endpoints": {
                "auth": "/api/v1/auth",
                "health": "/health",
            },
        }
    
    # Auth routes
    app.include_router(auth_router)
    
    # Admin routes
    app.include_router(admin_router)
    
    logger.info("FastAPI app created successfully")
    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
