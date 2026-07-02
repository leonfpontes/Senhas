"""Authentication API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
import logging
import secrets
import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from src.core.database import get_db
from src.core.errors import ValidationError, UnauthorizedError, NotFoundError
from src.core.config import DUMMY_BCRYPT_HASH, settings
from src.models import User, Tenant
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
from src.services import session_service
from sqlalchemy import select

logger = logging.getLogger(__name__)

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
    request_obj: Request,
    db: AsyncSession = Depends(get_db),
):
    """POST /api/v1/auth/login - Authenticate user and return tokens.

    Args:
        request: Login credentials (email + password)
        response: HTTP response (for setting cookies)
        request_obj: HTTP request (for User-Agent, stored on the session row)
        db: Database session

    Returns:
        AccessToken with JWT tokens and user info
        
    Raises:
        UnauthorizedError: If credentials invalid
        NotFoundError: If user not found
    """
    # Email may exist in multiple tenants — pick the oldest active record.
    # If a user belongs to multiple tenants, the first-created account wins.
    stmt = (
        select(User)
        .where((User.email == request.email) & (User.deleted_at.is_(None)))
        .order_by(User.created_at.asc())
        .limit(1)
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
        # is_active=False has two possible causes: ordinary administrative
        # suspension (an admin disabled this specific user — stays generic,
        # exactly as before) or the tenant was self-deactivated via
        # POST /auth/deactivate-account (reversible — see deactivation.py).
        # The second case is only revealed *after* confirming the real
        # password, so someone without the password can't use this endpoint
        # as an oracle to learn "this tenant is deactivated".
        tenant_deactivated = False
        if user.tenant_id is not None:
            tenant = await db.get(Tenant, user.tenant_id)
            # Deliberately keyed off this dedicated column alone (not
            # is_active/deleted_at), which only the self-deactivation flow
            # ever sets — avoids sharing a signature with unrelated tenant
            # states (e.g. a future platform-side suspension/hold).
            tenant_deactivated = bool(tenant and tenant.self_deactivated_at is not None)

        if tenant_deactivated:
            if not verify_password(request.password, user.password_hash):
                log_security_event("login", success=False, user_id=user.id, details={"reason": "invalid_password"})
                raise UnauthorizedError("Credenciais inválidas")
            log_security_event("login", success=False, user_id=user.id, details={"reason": "tenant_deactivated"})
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "message": "Esta conta está desativada. Deseja reativá-la?",
                    "error_code": "TENANT_DEACTIVATED",
                },
            )

        # Ordinary administrative suspension — unchanged: consume bcrypt time
        # without checking the real password, keep the response generic.
        verify_password(request.password, DUMMY_BCRYPT_HASH)
        log_security_event("login", success=False, user_id=user.id, details={"reason": "inactive"})
        raise UnauthorizedError("Credenciais inválidas")

    # Verify password
    if not verify_password(request.password, user.password_hash):
        log_security_event("login", success=False, user_id=user.id, details={"reason": "invalid_password"})
        raise UnauthorizedError("Credenciais inválidas")
    
    # Create tokens. The refresh token is bound to a new UserSession row so it
    # can be rotated/revoked server-side (see src/services/session_service.py).
    session_id, jti = await session_service.start_session(
        db, user, user_agent=request_obj.headers.get("user-agent")
    )
    access_token = create_access_token(user.id, user.tenant_id, user.role.value)
    refresh_token = create_refresh_token(user.id, user.tenant_id, user.role.value, session_id, jti)
    await db.commit()

    # Access token em cookie HttpOnly — não fica exposto no localStorage
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="strict",
        max_age=settings.ACCESS_TOKEN_EXPIRE_HOURS * 3600,
    )

    # Refresh token em cookie HttpOnly
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="strict",
        max_age=30 * 24 * 60 * 60,
    )

    # Cookie legível pelo JS só para o frontend saber que está autenticado
    # sem precisar guardar o JWT em localStorage
    response.set_cookie(
        key="auth_state",
        value="1",
        httponly=False,
        secure=not settings.DEBUG,
        samesite="strict",
        max_age=settings.ACCESS_TOKEN_EXPIRE_HOURS * 3600,
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
    request_obj: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """POST /api/v1/auth/refresh - Renova access_token usando o refresh_token do cookie.

    Lê o cookie HttpOnly 'refresh_token', valida, busca o usuário no banco e emite
    um novo access_token + rotaciona o refresh_token (com detecção de reuso — ver
    src/services/session_service.py — e teto absoluto de MAX_SESSION_DAYS).
    """
    from src.security.jwt import decode_refresh_token

    raw_refresh = request_obj.cookies.get("refresh_token")
    if not raw_refresh:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="refresh_token não encontrado")

    try:
        payload = decode_refresh_token(raw_refresh)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="refresh_token inválido ou expirado")

    # Valida que o usuário ainda existe e está ativo
    stmt = select(User).where(User.id == uuid.UUID(payload.sub))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário inativo ou não encontrado")

    # Troca de senha / "logout em todos os dispositivos" invalida qualquer token
    # emitido antes desse timestamp, mesmo que ainda esteja dentro da validade.
    if user.sessions_revoked_at is not None:
        token_iat = payload.iat if payload.iat.tzinfo else payload.iat.replace(tzinfo=timezone.utc)
        revoked_at = user.sessions_revoked_at if user.sessions_revoked_at.tzinfo else user.sessions_revoked_at.replace(tzinfo=timezone.utc)
        if token_iat < revoked_at:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão revogada")

    if payload.session_id and payload.jti:
        rotation = await session_service.rotate_session(
            db, user.id, uuid.UUID(payload.session_id), uuid.UUID(payload.jti)
        )
        if not rotation.ok:
            await db.commit()  # persist the revoke (delete) from rotate_session
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="refresh_token inválido ou expirado")
        session_id, new_jti = uuid.UUID(payload.session_id), rotation.new_jti
    else:
        # Legacy refresh token issued before rotation tracking existed — upgrade
        # it transparently to a tracked session instead of forcing a re-login.
        session_id, new_jti = await session_service.start_session(
            db, user, user_agent=request_obj.headers.get("user-agent")
        )

    # Emite novos tokens
    new_access = create_access_token(user.id, user.tenant_id, user.role.value)
    new_refresh = create_refresh_token(user.id, user.tenant_id, user.role.value, session_id, new_jti)
    await db.commit()

    response.set_cookie(key="access_token", value=new_access, httponly=True,
                        secure=not settings.DEBUG, samesite="strict",
                        max_age=settings.ACCESS_TOKEN_EXPIRE_HOURS * 3600)
    response.set_cookie(key="refresh_token", value=new_refresh, httponly=True,
                        secure=not settings.DEBUG, samesite="strict",
                        max_age=30 * 24 * 60 * 60)
    response.set_cookie(key="auth_state", value="1", httponly=False,
                        secure=not settings.DEBUG, samesite="strict",
                        max_age=settings.ACCESS_TOKEN_EXPIRE_HOURS * 3600)

    log_security_event("token_refresh", user_id=user.id, tenant_id=user.tenant_id, success=True)

    return RefreshResponse(access_token=new_access, token_type="bearer",
                           expires_in=settings.ACCESS_TOKEN_EXPIRE_HOURS * 3600)


@router.post("/logout")
async def logout(request_obj: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """POST /api/v1/auth/logout - Logout user and clear refresh token.

    Clears the auth cookies client-side and, best-effort, revokes the
    matching UserSession row server-side (this device only — other devices
    keep working, see /logout-all for revoking everything).

    Args:
        request_obj: HTTP request (to read the refresh_token cookie)
        response: HTTP response
        db: Database session

    Returns:
        Success message
    """
    from src.security.jwt import decode_refresh_token

    raw_refresh = request_obj.cookies.get("refresh_token")
    if raw_refresh:
        try:
            payload = decode_refresh_token(raw_refresh)
            if payload.session_id:
                await session_service.end_session(db, uuid.UUID(payload.sub), uuid.UUID(payload.session_id))
                await db.commit()
        except Exception:
            pass  # Best-effort: an already-invalid/expired token has nothing to revoke.

    response.delete_cookie(key="access_token",  httponly=True,  secure=not settings.DEBUG, samesite="strict")
    response.delete_cookie(key="refresh_token", httponly=True,  secure=not settings.DEBUG, samesite="strict")
    response.delete_cookie(key="auth_state",    httponly=False, secure=not settings.DEBUG, samesite="strict")

    log_security_event("logout", success=True)

    return {"message": "Logout realizado com sucesso"}


@router.post("/logout-all")
async def logout_all(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """POST /api/v1/auth/logout-all - Revoke every session for the current user.

    Ends all other devices/tabs immediately (their next request is rejected —
    see get_current_user's sessions_revoked_at check — no need to wait for
    their refresh token to be used), and clears cookies for this device too.
    Intended for a lost/stolen device or "sign out everywhere" in account settings.
    """
    current_user.sessions_revoked_at = datetime.now(timezone.utc)
    db.add(current_user)
    await session_service.end_all_sessions(db, current_user.id)
    await db.commit()

    response.delete_cookie(key="access_token",  httponly=True,  secure=not settings.DEBUG, samesite="strict")
    response.delete_cookie(key="refresh_token", httponly=True,  secure=not settings.DEBUG, samesite="strict")
    response.delete_cookie(key="auth_state",    httponly=False, secure=not settings.DEBUG, samesite="strict")

    log_security_event("logout_all", user_id=current_user.id, tenant_id=current_user.tenant_id, success=True)

    return {"message": "Todas as sessões foram encerradas"}


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


# ---------------------------------------------------------------------------
# Password Reset
# ---------------------------------------------------------------------------

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
async def forgot_password(
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """POST /api/v1/auth/forgot-password — Request a password reset link.

    Always returns the same generic message to prevent user enumeration.
    """
    from sqlalchemy import select
    from src.services.email.brevo_provider import BrevoEmailService
    from src.services.email.resend_fallback import ResendEmailService
    from src.services.email.base import EmailMessage
    from src.services.email.templates.password_reset import render_password_reset_email

    stmt = select(User).where(
        (User.email == body.email) & (User.deleted_at.is_(None)) & (User.is_active.is_(True))
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user:
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        user.reset_token_hash = token_hash
        user.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        await db.commit()

        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={raw_token}"
        html_body = render_password_reset_email(reset_url, user.full_name or user.username)
        msg = EmailMessage(
            to_email=user.email,
            subject="Redefinição de senha — GiraHub",
            html_body=html_body,
            text_body=f"Acesse o link para redefinir sua senha: {reset_url}",
        )

        # Resend é o provedor primário do GiraHub; se falhar (chave inválida,
        # domínio não verificado, indisponibilidade), cai para o Brevo antes de
        # desistir — sem isso o usuário nunca recebe o link e a falha fica só
        # no log. Mesmo padrão usado em profile.py (e-mail de exclusão de conta)
        # e onboarding.py (e-mail de boas-vindas).
        sent = False
        try:
            sent = await ResendEmailService().send_async(msg)
        except Exception as exc:
            logger.warning("Resend forgot-password email failed for user %s: %s", user.id, exc)

        if not sent:
            try:
                sent = await BrevoEmailService().send_async(msg)
            except Exception as exc:
                logger.warning("Brevo forgot-password email failed for user %s: %s", user.id, exc)

        log_security_event(
            "forgot_password",
            user_id=user.id,
            success=sent,
            details=None if sent else {"reason": "email_send_failed"},
        )

    return {"message": "Se o e-mail estiver cadastrado, você receberá as instruções em breve."}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """POST /api/v1/auth/reset-password — Set a new password using a reset token."""
    from sqlalchemy import select

    token_hash = hashlib.sha256(body.token.encode()).hexdigest()

    stmt = select(User).where(
        (User.reset_token_hash == token_hash) & (User.deleted_at.is_(None))
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Token inválido.", "error_code": "INVALID_TOKEN"},
        )

    now = datetime.now(timezone.utc)
    expires = user.reset_token_expires_at
    if expires is None or (expires.tzinfo is None and expires.replace(tzinfo=timezone.utc) < now) or (expires.tzinfo is not None and expires < now):
        user.reset_token_hash = None
        user.reset_token_expires_at = None
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Token expirado.", "error_code": "EXPIRED_TOKEN"},
        )

    # Validate password policy (raises ValidationError with PT-BR messages)
    validate_password_policy(body.new_password)

    user.password_hash = hash_password(body.new_password)
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    # A forgotten-password reset is often triggered *because* the account may
    # be compromised — revoke every existing session, not just future ones.
    user.sessions_revoked_at = datetime.now(timezone.utc)
    await session_service.end_all_sessions(db, user.id)
    await db.commit()

    log_security_event("reset_password", user_id=user.id, success=True)

    return {"message": "Senha redefinida com sucesso."}
