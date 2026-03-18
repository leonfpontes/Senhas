"""Multi-tenant context extraction middleware (T027)."""
from fastapi import Request, HTTPException, status
from typing import Callable
import uuid

from ..core.errors import MultiTenantViolationError


async def tenant_context_middleware(request: Request, call_next: Callable) -> any:
    """Extract and validate tenant context from request.
    
    For public and auth routes: passes through (tenant resolved by JWT or endpoint).
    For query-param tenant_id: validates and attaches to request.state.
    For JWT-authenticated routes: JWT middleware (runs after this) sets tenant_id.
    """
    # Skip WebSocket connections (they handle auth in the endpoint)
    if request.scope.get("type") == "websocket":
        return await call_next(request)
    
    # Paths that never need tenant context
    skip_paths = ["/health", "/docs", "/openapi.json", "/redoc"]
    if request.url.path in skip_paths:
        return await call_next(request)
    
    # Public API endpoints resolve tenant themselves (via tenant_slug or gira lookup)
    if request.url.path.startswith("/api/v1/public"):
        return await call_next(request)
    
    # Auth routes don't need tenant context (JWT middleware will extract from token)
    if request.url.path.startswith("/api/v1/auth"):
        return await call_next(request)
    
    # Try to extract tenant_id from query params (used by some admin/platform endpoints)
    tenant_id_str = request.query_params.get("tenant_id")
    if tenant_id_str:
        try:
            request.state.tenant_id = uuid.UUID(tenant_id_str)
        except (ValueError, AttributeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Formato de tenant_id inválido",
            )
    
    # For all other routes, pass through — JWT middleware (next in chain)
    # will set request.state.tenant_id from the token payload
    response = await call_next(request)
    return response


def get_tenant_id(request: Request) -> uuid.UUID:
    """Get tenant_id from request context.
    
    Args:
        request: FastAPI request object
        
    Returns:
        Tenant ID
        
    Raises:
        MultiTenantViolationError: If tenant_id not found in context
    """
    tenant_id = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        raise MultiTenantViolationError()
    return tenant_id
