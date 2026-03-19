"""Authenticated user profile endpoints."""
from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Request, UploadFile, File
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user
from src.core.database import get_db
from src.core.errors import ValidationError, UnauthorizedError
from src.models import User
from src.security.password import verify_password, hash_password, validate_password_policy

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


def _build_photo_url(request: Request, stored_value: Optional[str]) -> Optional[str]:
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
        "profile_photo_url": _build_photo_url(request, user.profile_photo_url),
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
    """Upload current user profile photo and update profile URL."""
    if file.content_type not in ALLOWED_PROFILE_CONTENT_TYPES:
        raise ValidationError("Formato de imagem inválido. Use JPG, PNG ou WEBP")

    contents = await file.read()
    if len(contents) == 0:
        raise ValidationError("Arquivo de imagem vazio")

    if len(contents) > MAX_PROFILE_IMAGE_BYTES:
        raise ValidationError("Imagem excede o limite de 5MB")

    extension = Path(file.filename or "photo").suffix.lower()
    if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        guessed = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
        }
        extension = guessed[file.content_type]

    tenant_segment = str(current_user.tenant_id) if current_user.tenant_id else "platform"
    relative_dir = Path("uploads") / "profiles" / tenant_segment
    os.makedirs(relative_dir, exist_ok=True)

    file_name = f"{current_user.id}{extension}"
    target_path = relative_dir / file_name
    with open(target_path, "wb") as out_file:
        out_file.write(contents)

    stored_url = f"/{relative_dir.as_posix()}/{file_name}".replace("//", "/")
    current_user.profile_photo_url = stored_url

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)

    return {
        "message": "Foto de perfil atualizada com sucesso",
        "profile_photo_url": _build_photo_url(request, current_user.profile_photo_url),
    }
