"""Authenticated user profile endpoints."""

import asyncio
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, File, status
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user
from src.core.config import settings
from src.core.database import get_db
from src.core.errors import ValidationError, UnauthorizedError, InsufficientPermissionsError
from src.core.limiter import limiter
from src.models import User, UserRole
from src.models.audit_logs import AuditLog, AuditAction
from src.security.password import verify_password, hash_password, validate_password_policy
from src.services.email.base import EmailMessage
from src.services.email.resend_fallback import ResendEmailService
from src.services.email.brevo_provider import BrevoEmailService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth-profile"])


class UpdateProfileRequest(BaseModel):
    """Payload for current user profile updates."""

    full_name: Optional[str] = None
    phone: Optional[str] = None

    @field_validator("full_name", mode="before")
    @classmethod
    def validate_full_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None

        trimmed = value.strip()
        if trimmed == "":
            return None

        if len(trimmed) < 3:
            raise ValueError("Nome deve ter ao menos 3 caracteres")

        if len(trimmed) > 255:
            raise ValueError("Nome deve ter no máximo 255 caracteres")

        return trimmed

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None

        normalized = "".join(ch for ch in str(value) if ch.isdigit())
        if normalized == "":
            return None

        if len(normalized) < 10 or len(normalized) > 15:
            raise ValueError("Telefone deve conter entre 10 e 15 dígitos")

        return normalized


class ChangePasswordRequest(BaseModel):
    """Payload for current user password change."""

    current_password: str
    new_password: str


MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_PROFILE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _build_photo_url(request: Request, user: User) -> Optional[str]:
    """Build photo URL — use public DB endpoint if binary exists, else legacy stored_value."""
    if user.profile_photo_data:
        base = str(request.base_url).rstrip("/")
        return f"{base}/api/v1/public/user/{user.id}/photo"

    stored_value = user.profile_photo_url
    if not stored_value:
        return None

    if stored_value.startswith("http://") or stored_value.startswith("https://"):
        return stored_value

    if stored_value.startswith("/"):
        return f"{str(request.base_url).rstrip('/')}{stored_value}"

    return stored_value


def _serialize_user_profile(request: Request, user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "username": user.username,
        "role": user.role.value,
        "tenant_id": str(user.tenant_id) if user.tenant_id else None,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat(),
        "full_name": user.full_name,
        "phone": user.phone,
        "profile_photo_url": _build_photo_url(request, user),
    }


@router.get("/profile")
async def get_profile(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Return current authenticated user profile."""
    return _serialize_user_profile(request, current_user)


@router.put("/profile")
async def update_profile(
    profile_update: UpdateProfileRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update full name and phone for current user."""
    update_data = profile_update.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(current_user, key, value)

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)

    return {
        "message": "Perfil atualizado com sucesso",
        "user": _serialize_user_profile(request, current_user),
    }


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change password for current authenticated user."""
    if not verify_password(payload.current_password, current_user.password_hash):
        raise UnauthorizedError("Senha atual inválida")

    if payload.current_password == payload.new_password:
        raise ValidationError("A nova senha deve ser diferente da senha atual")

    validate_password_policy(payload.new_password)

    current_user.password_hash = hash_password(payload.new_password)
    db.add(current_user)
    await db.commit()

    return {"message": "Senha alterada com sucesso"}


@router.post("/profile/photo")
async def upload_profile_photo(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload current user profile photo (stored as binary in database)."""
    if file.content_type not in ALLOWED_PROFILE_CONTENT_TYPES:
        raise ValidationError("Formato de imagem inválido. Use JPG, PNG ou WEBP")

    contents = await file.read()
    if len(contents) == 0:
        raise ValidationError("Arquivo de imagem vazio")

    if len(contents) > MAX_PROFILE_IMAGE_BYTES:
        raise ValidationError("Imagem excede o limite de 5MB")

    current_user.profile_photo_data = contents
    current_user.profile_photo_content_type = file.content_type
    current_user.profile_photo_url = None  # clear legacy path

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)

    return {
        "message": "Foto de perfil atualizada com sucesso",
        "profile_photo_url": _build_photo_url(request, current_user),
    }


# ---------------------------------------------------------------------------
# Account deletion (LGPD Art. 18 VI)
# ---------------------------------------------------------------------------

class DeleteAccountRequest(BaseModel):
    """Payload for permanent account deletion — password confirms identity."""

    password: str


async def _send_account_deleted_email(email: str, username: str) -> None:
    """Best-effort notification email after account deletion (fire-and-forget)."""
    html = (
        f"<p>Olá, {username}.</p>"
        f"<p>Confirmamos que sua conta no <strong>GiraHub</strong> foi excluída permanentemente "
        f"conforme solicitado, em cumprimento ao Art. 18, VI da LGPD.</p>"
        f"<p>Todos os seus dados pessoais foram removidos de nossos sistemas.</p>"
        f"<p>Se você não solicitou essa exclusão, entre em contato imediatamente com "
        f"<a href='mailto:privacidade@girahub.com.br'>privacidade@girahub.com.br</a>.</p>"
    )
    msg = EmailMessage(
        to_email=email,
        subject="Sua conta no GiraHub foi excluída",
        html_body=html,
        text_body=(
            f"Olá, {username}.\n\n"
            "Confirmamos que sua conta no GiraHub foi excluída permanentemente conforme solicitado, "
            "em cumprimento ao Art. 18, VI da LGPD.\n\n"
            "Todos os seus dados pessoais foram removidos de nossos sistemas.\n\n"
            "Se você não solicitou essa exclusão, entre em contato imediatamente com "
            "privacidade@girahub.com.br."
        ),
    )
    try:
        sent = await ResendEmailService().send_async(msg)
        if not sent:
            raise RuntimeError("Resend returned False")
    except Exception:
        try:
            await BrevoEmailService().send_async(msg)
        except Exception as exc:
            logger.warning("Account deletion notification email failed for %s: %s", email, exc)


@router.delete("/account", status_code=status.HTTP_200_OK)
@limiter.limit("3/hour")
async def delete_own_account(
    request: Request,
    response: Response,
    payload: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete the authenticated user's own account (LGPD Art. 18 VI).

    Guards:
    - SUPER_ADMIN accounts cannot be self-deleted via this endpoint.
    - Impersonated sessions are blocked.
    - Last ADMIN of a tenant is blocked (would orphan the tenant).
    - Password confirmation required.
    - Rate-limited to 3 requests/hour per IP.

    On success:
    - User row is hard-deleted from the database.
    - All FK references with SET NULL are automatically nullified by PostgreSQL.
    - A best-effort notification email is sent (fire-and-forget).
    - The refresh-token cookie is cleared in the response.
    """
    # Guard 1: SUPER_ADMIN cannot self-delete via this endpoint
    if current_user.role == UserRole.SUPER_ADMIN:
        raise InsufficientPermissionsError(
            "Contas de plataforma não podem ser excluídas por aqui. "
            "Entre em contato com privacidade@girahub.com.br."
        )

    # Guard 2: Block impersonated sessions
    token_data = getattr(request.state, "token", None)
    impersonated_by = getattr(token_data, "impersonated_by", None) if token_data else None
    if impersonated_by:
        raise InsufficientPermissionsError(
            "Operação não permitida durante impersonação."
        )

    # Guard 3: Confirm identity via password
    if not verify_password(payload.password, current_user.password_hash):
        raise UnauthorizedError("Senha incorreta. Confirme sua senha para continuar.")

    # Capture values before delete (user row will be gone after commit)
    user_id = current_user.id
    user_email = current_user.email
    user_username = current_user.username
    tenant_id = current_user.tenant_id
    user_role = current_user.role

    # Guard 4 + hard delete — atomic transaction
    # flush the delete first, then re-check admin count to prevent race condition.
    try:
        await db.delete(current_user)
        await db.flush()

        # Guard 4: If user was an ADMIN, ensure at least one ADMIN remains
        if user_role == UserRole.ADMIN and tenant_id is not None:
            remaining = await db.scalar(
                select(func.count()).where(
                    and_(
                        User.tenant_id == tenant_id,
                        User.role == UserRole.ADMIN,
                        User.is_active == True,
                        User.deleted_at.is_(None),
                    )
                )
            )
            if remaining == 0:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "Você é o único administrador deste terreiro. "
                        "Transfira a administração para outro usuário antes de excluir sua conta."
                    ),
                )

        # Write audit log (user_id FK will be SET NULL by DB after commit,
        # but we store it here while the row still exists in the flush buffer)
        audit = AuditLog(
            tenant_id=tenant_id,
            user_id=user_id,
            action=AuditAction.DELETE,
            resource_type="User",
            resource_id=user_id,
            details={"reason": "LGPD Art. 18 VI — self-requested account deletion"},
        )
        db.add(audit)

        await db.commit()

    except (HTTPException, Exception):
        await db.rollback()
        raise

    # Clear refresh-token cookie
    response.delete_cookie(
        key="refresh_token",
        httponly=True,
        secure=True,
        samesite="strict",
    )

    # Send notification email asynchronously (best-effort, non-blocking)
    asyncio.create_task(
        _send_account_deleted_email(user_email, user_username)
    )

    return {"message": "Sua conta foi excluída permanentemente."}
