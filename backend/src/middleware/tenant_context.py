"""Multi-tenant context extraction middleware (T027)."""
from fastapi import Request, HTTPException, status
from typing import Callable
import uuid

from ..core.errors import MultiTenantViolationError


async def tenant_context_middleware(request: Request, call_next: Callable) -> any:
    """Extract and validate tenant context from request.
    
    Extracts tenant_id from:
    1. JWT token (request.state.tenant_id) - primary source
    2. Query parameter ?tenant_id=... - for public endpoints
    3. Request body tenant_id - not used (use JWT)
    
    This middleware ensures all requests are scoped to a tenant,
    preventing data leakage between organizations.
    
    Args:
        request: FastAPI request object
        call_next: Next middleware/endpoint
        
    Returns:
        Response from next middleware/endpoint
    """
    # Public paths that don't require tenant context
    public_paths = ["/health", "/docs", "/openapi.json"]
    if request.url.path in public_paths:
        return await call_next(request)
    
    # Get tenant_id from JWT token (already decoded by jwt_middleware)
    tenant_id = getattr(request.state, "tenant_id", None)
    
    # For public endpoints, allow tenant_id from query parameter
    if not tenant_id and request.url.path.startswith("/api/v1/public"):
        tenant_id_param = request.query_params.get("tenant_id")
        if tenant_id_param:
            try:
                tenant_id = uuid.UUID(tenant_id_param)
            except (ValueError, TypeError):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="tenant_id inválido",
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="tenant_id requerido para endpoints públicos",
            )
    
    # Attach tenant_id to request.state
    request.state.tenant_id = tenant_id
    
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
