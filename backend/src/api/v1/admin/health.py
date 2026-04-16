"""T070: Admin Health - GET /api/v1/admin/health (DB, email, storage)"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from pydantic import BaseModel
from typing import Dict, Any
import logging

from src.core.database import get_db
from src.models import User
from src.services.email.brevo_provider import BrevoEmailService
from src.services.email.resend_fallback import ResendEmailService
from src.api.dependencies import get_current_user
from src.core.errors import InsufficientPermissionsError

router = APIRouter(prefix="/api/v1/admin", tags=["admin-health"])
logger = logging.getLogger(__name__)


class ServiceHealthResponse(BaseModel):
    """Service health status."""
    status: str  # ok, degraded, error
    message: str
    details: Dict[str, Any] = {}


class HealthCheckResponse(BaseModel):
    """Full health check response."""
    overall_status: str
    database: ServiceHealthResponse
    email_primary: ServiceHealthResponse
    email_fallback: ServiceHealthResponse
    timestamp: str


@router.get("/health", response_model=HealthCheckResponse)
async def health_check(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HealthCheckResponse:
    """Health check for admin services.
    
    Requires admin role.
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")
    
    from datetime import datetime
    import asyncio
    
    # Check database
    db_status = ServiceHealthResponse(status="ok", message="Database connected")
    try:
        result = await db.execute(text("SELECT 1"))
        result.scalar()
    except Exception as e:
        db_status.status = "error"
        db_status.message = f"Database error: {str(e)}"
    
    # Check email primary (Brevo)
    email_primary_status = ServiceHealthResponse(status="ok", message="Brevo ready")
    try:
        brevo_service = BrevoEmailService()
        # Quick validation - just check if we can instantiate
        if not brevo_service.api_key:
            email_primary_status.status = "error"
            email_primary_status.message = "Brevo API key not configured"
    except Exception as e:
        email_primary_status.status = "error"
        email_primary_status.message = f"Brevo error: {str(e)}"
    
    # Check email fallback (Resend)
    email_fallback_status = ServiceHealthResponse(status="ok", message="Resend ready")
    try:
        resend_service = ResendEmailService()
        # Quick validation - just check if we can instantiate
        if not resend_service.api_key:
            email_fallback_status.status = "degraded"
            email_fallback_status.message = "Resend API key not configured (fallback disabled)"
    except Exception as e:
        email_fallback_status.status = "degraded"
        email_fallback_status.message = f"Resend error: {str(e)}"
    
    # Determine overall status
    overall_status = "ok"
    if (
        db_status.status != "ok"
        or email_primary_status.status == "error"
    ):
        overall_status = "error"
    elif (
        email_primary_status.status == "degraded"
        or email_fallback_status.status == "degraded"
    ):
        overall_status = "degraded"
    
    return HealthCheckResponse(
        overall_status=overall_status,
        database=db_status,
        email_primary=email_primary_status,
        email_fallback=email_fallback_status,
        timestamp=datetime.utcnow().isoformat() + "Z",
    )
