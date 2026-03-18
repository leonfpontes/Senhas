"""T057: Audit Logging Middleware - Auto-log CRUD operations."""
from fastapi import Request, HTTPException
from typing import Callable
import logging

from ..services.audit_service import AuditService
from ..core.database import AsyncSessionLocal
from ..core.errors import UnauthorizedError

logger = logging.getLogger(__name__)


async def audit_logging_middleware(request: Request, call_next: Callable):
    """Middleware that automatically logs admin CRUD operations.
    
    Monitors:
    - POST /api/v1/admin/* (CREATE)
    - PUT /api/v1/admin/* (UPDATE)
    - DELETE /api/v1/admin/* (DELETE)
    
    Captures:
    - Actor (user_id from JWT)
    - Tenant (tenant_id from JWT)
    - Action type
    - Resource type
    - Status (success/failure)
    
    Args:
        request: FastAPI request
        call_next: Next middleware/endpoint
        
    Returns:
        Response from next middleware/endpoint
    """
    
    # Skip WebSocket connections
    if request.scope.get("type") == "websocket":
        return await call_next(request)
    
    # Only audit admin endpoints
    if not request.url.path.startswith("/api/v1/admin"):
        return await call_next(request)
    
    # Extract audit context from request
    user_id = getattr(request.state, "user_id", None)
    tenant_id = getattr(request.state, "tenant_id", None)
    
    # Check if this is an impersonated session
    token_data = getattr(request.state, "token", None)
    impersonated_by = getattr(token_data, "impersonated_by", None) if token_data else None
    
    if not user_id or not tenant_id:
        # Skip audit logging - let the endpoint handle auth
        return await call_next(request)
    
    # Determine action type from HTTP method
    action_map = {
        "POST": "CREATE",
        "PUT": "UPDATE",
        "PATCH": "UPDATE",
        "DELETE": "DELETE",
        "GET": "READ",
    }
    
    action = action_map.get(request.method, "READ")
    
    # Extract resource type from path
    # e.g., /api/v1/admin/giras/xxx -> giras
    path_parts = request.url.path.split("/")
    resource_type = path_parts[4] if len(path_parts) > 4 else "Unknown"
    
    try:
        # Call the endpoint
        response = await call_next(request)
        
        # Log successful operation
        if response.status_code < 400:  # Success
            async with AsyncSessionLocal() as db:
                audit_service = AuditService(db)
                
                try:
                    _imp = {"impersonated_by": impersonated_by} if impersonated_by else {}
                    if action == "CREATE":
                        await audit_service.log_create(
                            tenant_id=tenant_id,
                            user_id=user_id,
                            resource_type=resource_type,
                            resource_id=None,  # Will be in response
                            details={
                                "path": request.url.path,
                                "ip_address": request.client.host if request.client else None,
                                "user_agent": request.headers.get("user-agent"),
                                **_imp,
                            },
                        )
                    elif action in ["UPDATE", "DELETE"]:
                        await audit_service.log_update(
                            tenant_id=tenant_id,
                            user_id=user_id,
                            resource_type=resource_type,
                            resource_id=None,
                            new_state={
                                "path": request.url.path,
                                "method": request.method,
                                **_imp,
                            },
                        )
                    
                    await db.commit()
                except Exception as e:
                    logger.error(f"Error logging audit trail: {str(e)}")
                    await db.rollback()
        
        return response
        
    except Exception as e:
        # Log failed operation
        logger.error(f"Admin operation failed: {request.method} {request.url.path} - {str(e)}")
        
        try:
            async with AsyncSessionLocal() as db:
                audit_service = AuditService(db)
                
                # Still log the failed attempt
                await audit_service.log_create(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    resource_type=resource_type,
                    resource_id=None,
                    details={
                        "path": request.url.path,
                        "error": str(e),
                        "status": "failed",
                        "ip_address": request.client.host if request.client else None,
                        **({"impersonated_by": impersonated_by} if impersonated_by else {}),
                    },
                )
                
                await db.commit()
        except Exception as audit_error:
            logger.error(f"Error logging failed audit trail: {str(audit_error)}")
        
        raise
