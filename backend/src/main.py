"""Main FastAPI application factory (T026)."""
import os
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import logging

from .core.config import settings
from .core.errors import APIException
from .core.database import engine
from .models.base import Base
from .middleware import jwt_middleware, tenant_context_middleware, audit_logging_middleware
from .api import auth_router
from .api.v1.admin import admin_router
from .api.v1.platform import platform_router
from .api.v1.public import next_gira_router, emit_ticket_router, resend_email_router, images_router, onboarding_router
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
    Subscription,
    PlanType,
    SubscriptionStatus,
    Invoice,
    InvoiceStatus,
    FeatureFlag,
)


logger = logging.getLogger("senhas")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager.
    
    Handles startup and shutdown events.
    """
    from .services.email.email_queue import email_queue

    # Startup
    logger.info("Starting Senhas API...")
    
    # In production, Alembic handles schema via entrypoint.sh.
    # create_all is only used in local development when running without Alembic.
    if settings.DEBUG:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    email_queue.start()
    logger.info("Senhas API started successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Senhas API...")
    await email_queue.stop()
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
    
    # ---- Middleware order: last added = outermost (runs first) ----
    # Desired request flow: CORS → TrustedHost → tenant → jwt → audit → handler
    # So we add innermost first, outermost last.

    # Audit Logging Middleware (innermost - needs user_id/tenant_id from jwt)
    app.middleware("http")(audit_logging_middleware)
    
    # JWT Validation Middleware
    app.middleware("http")(jwt_middleware)
    
    # Tenant Context Middleware
    app.middleware("http")(tenant_context_middleware)
    
    # Trusted Host Middleware
    # In production behind nginx, allow the domain + internal Docker hostnames
    allowed_hosts = ["localhost", "127.0.0.1", "*.localhost"]
    domain = os.environ.get("DOMAIN", "")
    if domain:
        allowed_hosts.extend([domain, f"*.{domain}"])
    # Allow direct IP access for initial testing
    server_ip = os.environ.get("SERVER_IP", "")
    if server_ip:
        allowed_hosts.append(server_ip)
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=allowed_hosts,
    )
    
    # CORS Middleware (outermost - ensures CORS headers on ALL responses)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
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

    # Static uploads (profile photos and future tenant assets)
    uploads_dir = Path("uploads")
    uploads_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(uploads_dir), check_dir=False), name="uploads")
    
    # Admin routes (tenant-scoped)
    app.include_router(admin_router)
    
    # Platform routes (SUPER_ADMIN only)
    app.include_router(platform_router)
    
    # Public routes (no auth required)
    app.include_router(next_gira_router)
    app.include_router(emit_ticket_router)
    app.include_router(resend_email_router)
    app.include_router(images_router)
    app.include_router(onboarding_router)
    
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
