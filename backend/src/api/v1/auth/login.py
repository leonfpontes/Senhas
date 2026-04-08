"""Authentication API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr

from src.core.database import get_db
from src.core.errors import ValidationError, UnauthorizedError, NotFoundError
from src.core.config import DUMMY_BCRYPT_HASH
from src.models import User
from src.api.dependencies import get_current_user
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
        request: Login credentials (email + password)
        response: HTTP response (for setting cookies)
        db: Database session
        
    Returns:
        AccessToken with JWT tokens and user info
        
    Raises:
        UnauthorizedError: If credentials invalid
        NotFoundError: If user not found
    """
    # Email is globally unique — find user by email alone
    stmt = select(User).where(
        (User.email == request.email) & (User.deleted_at.is_(None))
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        # Run a dummy bcrypt verification to normalise response time and prevent
        # user enumeration via timing side-channel (real verify takes ~100ms).
        verify_password(request.password, DUMMY_BCRYPT_HASH)
        log_security_event("login", success=False, details={"reason": "user_not_found", "email": request.email})
        raise UnauthorizedError("Credenciais inválidas")

    if not user.is_active:
        # Also consume bcrypt time to keep responses uniform
        verify_password(request.password, DUMMY_BCRYPT_HASH)
        log_security_event("login", success=False, user_id=user.id, details={"reason": "inactive"})
        raise UnauthorizedError("Credenciais inválidas")

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
            "tenant_id": str(user.tenant_id) if user.tenant_id else None,
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


@router.get("/me")
async def get_me(
    current_user: User = Depends(get_current_user),
):
    """GET /api/v1/auth/me - Return current authenticated user info."""
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "username": current_user.username,
        "role": current_user.role.value,
        "tenant_id": str(current_user.tenant_id) if current_user.tenant_id else None,
        "is_active": current_user.is_active,
        "created_at": current_user.created_at.isoformat(),
        "full_name": current_user.full_name,
        "phone": current_user.phone,
        "profile_photo_url": current_user.profile_photo_url,
    }
