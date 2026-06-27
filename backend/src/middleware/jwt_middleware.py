"""JWT validation middleware (T020)."""
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from typing import Callable, Optional
import uuid

from ..core.errors import InvalidTokenError, UnauthorizedError
from ..security.jwt import decode_token
from ..core.logging import log_security_event


async def jwt_middleware(request: Request, call_next: Callable) -> any:
    """JWT validation middleware.
    
    Validates JWT token from Authorization header and attaches
    decoded token data to request.state for use in endpoints.
    
    Token format: Authorization: Bearer <token>
    
    Args:
        request: FastAPI request object
        call_next: Next middleware/endpoint
        
    Returns:
        Response from next middleware/endpoint
    """
    # Skip WebSocket connections (they handle auth in the endpoint)
    if request.scope.get("type") == "websocket":
        return await call_next(request)
    
    # Skip JWT validation for public paths
    # Note: /docs and /openapi.json are disabled in production (FastAPI config);
    # they are kept here only for local DEBUG use.
    public_paths = ["/health", "/docs", "/redoc", "/openapi.json", "/api/v1/auth/login", "/api/v1/webhooks/stripe"]
    if request.url.path in public_paths or request.url.path.startswith("/api/v1/public"):
        return await call_next(request)
    
    # Extract token — Authorization header (impersonation) first, then HttpOnly cookie
    auth_header = request.headers.get("Authorization")
    token: Optional[str] = None

    if auth_header:
        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return JSONResponse(
                status_code=401,
                content={"error_code": "UNAUTHORIZED", "message": "Formato de Authorization inválido"},
            )
        token = parts[1]
    else:
        # Fall back to HttpOnly cookie set by login endpoint
        token = request.cookies.get("access_token")

    if not token:
        # No token anywhere — pass through, endpoint can require auth via dependencies
        return await call_next(request)
    
    # Decode and validate token
    try:
        token_data = decode_token(token)
    except InvalidTokenError as e:
        log_security_event(
            event_type="invalid_token",
            success=False,
            details={"error": str(e)},
        )
        return JSONResponse(
            status_code=401,
            content={"error_code": "UNAUTHORIZED", "message": str(e)},
        )
    except Exception as e:
        log_security_event(
            event_type="token_error",
            success=False,
            details={"error": str(e)},
        )
        return JSONResponse(
            status_code=401,
            content={"error_code": "UNAUTHORIZED", "message": "Erro ao validar token"},
        )
    
    # Attach decoded token data to request.state
    request.state.user_id = uuid.UUID(token_data.sub)
    request.state.tenant_id = uuid.UUID(token_data.tenant_id) if token_data.tenant_id else None
    request.state.role = token_data.role
    request.state.token = token_data
    
    response = await call_next(request)
    return response
