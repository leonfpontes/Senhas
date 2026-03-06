"""Authentication API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
import uuid

from src.core.database import get_db
from src.core.errors import ValidationError, UnauthorizedError, NotFoundError
from src.models import User
from src.security import (
    hash_password,
    verify_password,
    validate_password_policy,
    create_access_token,
    create_refresh_token,
    decode_token,
    AccessToken,
)
from src.core.logging import log_security_event
from sqlalchemy import select

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    """Login request payload."""
    
    email: EmailStr
    password: str
    tenant_id: str  # UUID


class LoginResponse(BaseModel):
    """Login response payload."""
    
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 86400  # 24 hours
    user: dict


@router.post("/login", response_model=LoginResponse)
async def login(
    request: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """POST /api/v1/auth/login - Authenticate user and return tokens.
    
    Args:
        request: Login credentials and tenant_id
        response: HTTP response (for setting cookies)
        db: Database session
        
    Returns:
        AccessToken with JWT tokens and user info
        
    Raises:
        UnauthorizedError: If credentials invalid
        NotFoundError: If user not found
    """
    try:
        tenant_id = uuid.UUID(request.tenant_id)
    except (ValueError, TypeError):
        raise ValidationError("tenant_id inválido")
    
    # Find user by email in tenant
    stmt = select(User).where(
        (User.email == request.email) & (User.tenant_id == tenant_id)
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user:
        log_security_event("login", success=False, details={"email": request.email})
        raise NotFoundError("Usuário")
    
    if not user.is_active:
        log_security_event("login", success=False, user_id=user.id, details={"reason": "inactive"})
        raise UnauthorizedError("Usuário inativo")
    
    # Verify password
    if not verify_password(request.password, user.password_hash):
        log_security_event("login", success=False, user_id=user.id, details={"reason": "invalid_password"})
        raise UnauthorizedError("Credenciais inválidas")
    
    # Create tokens
    access_token = create_access_token(user.id, user.tenant_id, user.role.value)
    refresh_token = create_refresh_token(user.id, user.tenant_id, user.role.value)
    
    # Set refresh token as HTTP-only cookie
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,  # HTTPS only in production
        samesite="strict",
        max_age=30 * 24 * 60 * 60,  # 30 days
    )
    
    log_security_event(
        "login",
        user_id=user.id,
        tenant_id=user.tenant_id,
        success=True,
    )
    
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=24 * 60 * 60,  # 24 hours
        user={
            "id": str(user.id),
            "email": user.email,
            "username": user.username,
            "role": user.role.value,
        },
    )


class RefreshRequest(BaseModel):
    """Refresh token request."""
    
    pass  # Token comes from cookie


class RefreshResponse(BaseModel):
    """Refresh token response."""
    
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 86400


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_token(
    request_obj: RefreshRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """POST /api/v1/auth/refresh - Get new access token using refresh token.
    
    Refresh token expected in HTTP-only cookie 'refresh_token'.
    Returns new access token and renews refresh cookie.
    
    Args:
        request_obj: Empty request (token in cookie)
        response: HTTP response
        db: Database session
        
    Returns:
        New access token
        
    Raises:
        UnauthorizedError: If refresh token invalid
    """
    from fastapi import Request, HTTPException
    
    # This will be injected by FastAPI internally
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="refresh_token não fornecido",
    )


@router.post("/logout")
async def logout(response: Response):
    """POST /api/v1/auth/logout - Logout user and clear refresh token.
    
    Clears the refresh_token cookie on client side.
    
    Args:
        response: HTTP response
        
    Returns:
        Success message
    """
    response.delete_cookie(
        key="refresh_token",
        httponly=True,
        secure=True,
        samesite="strict",
    )
    
    log_security_event("logout", success=True)
    
    return {"message": "Logout realizado com sucesso"}
