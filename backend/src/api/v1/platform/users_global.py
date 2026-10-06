"""Platform API - Global SUPER_ADMIN users endpoint (T106)."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from uuid import UUID

from sqlalchemy.exc import IntegrityError

from src.core.database import get_db
from src.api.dependencies import require_super_admin
from src.models import User
from src.models.audit_logs import AuditAction
from src.repositories.platform_user_repo import PlatformUserRepository
from src.security.password import hash_password, validate_password_policy
from src.services.platform_audit import log_platform_action

router = APIRouter(prefix="/api/v1/platform/users", tags=["platform-users"])


class CreatePlatformUserRequest(BaseModel):
    """Request to create SUPER_ADMIN user."""
    email: EmailStr
    username: str
    password: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        # Mesma política do resto do sistema (antes aceitava qualquer senha aqui).
        if len(v.encode("utf-8")) > 72:  # bcrypt trunca em silêncio depois de 72 bytes
            raise ValueError("Senha deve ter no máximo 72 caracteres")
        try:
            validate_password_policy(v)
        except Exception as exc:
            raise ValueError(str(exc)) from exc
        return v


class UpdatePlatformUserRequest(BaseModel):
    """Request to update SUPER_ADMIN user."""
    username: Optional[str] = None
    is_active: Optional[bool] = None


async def _guard_last_active_super_admin(
    repo: PlatformUserRepository, target: User, acting: User, verb: str
) -> None:
    """Bloqueia desativar/excluir a si mesmo ou o último super-admin ativo."""
    if target.id == acting.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Você não pode {verb} a sua própria conta de super-admin.",
        )
    if target.is_active and await repo.count_active() <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Não é possível {verb} o último super-admin ativo da plataforma.",
        )


class PlatformUserResponse(BaseModel):
    """Platform user response."""
    id: str
    email: str
    username: str
    role: str
    is_active: bool
    created_at: str


@router.post("", status_code=status.HTTP_201_CREATED, response_model=PlatformUserResponse)
async def create_platform_user(
    request: CreatePlatformUserRequest,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create new platform SUPER_ADMIN user."""
    repo = PlatformUserRepository(db)
    
    try:
        # Check email uniqueness
        existing = await repo.get_by_email(request.email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email já está em uso",
            )
        
        # Hash password
        password_hash = hash_password(request.password)
        
        # Create user
        user = await repo.create(
            email=request.email,
            username=request.username,
            password_hash=password_hash,
            is_active=True,
        )
        log_platform_action(
            db,
            actor_id=current_user.id,
            action=AuditAction.CREATE,
            platform_action="super_admin_create",
            description=f"Super-admin {user.email} criado",
            tenant_id=None,
            resource_type="User",
            resource_id=user.id,
        )

        await db.commit()
        
        return PlatformUserResponse(
            id=str(user.id),
            email=user.email,
            username=user.username,
            role=user.role.value,
            is_active=user.is_active,
            created_at=user.created_at.isoformat(),
        )
    except HTTPException:
        raise
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email já está em uso",
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao criar usuário",
        )


@router.get("/{user_id}", response_model=PlatformUserResponse)
async def get_platform_user(
    user_id: UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get platform user by ID."""
    repo = PlatformUserRepository(db)
    
    try:
        user = await repo.get_by_id(user_id)
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuário não encontrado",
            )
        
        return PlatformUserResponse(
            id=str(user.id),
            email=user.email,
            username=user.username,
            role=user.role.value,
            is_active=user.is_active,
            created_at=user.created_at.isoformat(),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar usuário: {str(e)}",
        )


@router.put("/{user_id}", response_model=PlatformUserResponse)
async def update_platform_user(
    user_id: UUID,
    request: UpdatePlatformUserRequest,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update platform user."""
    repo = PlatformUserRepository(db)
    
    try:
        update_data = {
            k: v for k, v in request.model_dump().items() if v is not None
        }
        
        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nenhum campo para atualizar",
            )

        target = await repo.get_by_id(user_id)
        if not target:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuário não encontrado",
            )
        if update_data.get("is_active") is False:
            await _guard_last_active_super_admin(repo, target, current_user, "desativar")
        previous = {k: getattr(target, k) for k in update_data}

        user = await repo.update(user_id, **update_data)
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuário não encontrado",
            )

        log_platform_action(
            db,
            actor_id=current_user.id,
            action=AuditAction.UPDATE,
            platform_action="super_admin_update",
            description=f"Super-admin {user.email} alterado",
            tenant_id=None,
            resource_type="User",
            resource_id=user.id,
            previous_values=previous,
            new_values={k: getattr(user, k) for k in update_data},
        )

        await db.commit()
        
        return PlatformUserResponse(
            id=str(user.id),
            email=user.email,
            username=user.username,
            role=user.role.value,
            is_active=user.is_active,
            created_at=user.created_at.isoformat(),
        )
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao atualizar usuário: {str(e)}",
        )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_platform_user(
    user_id: UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft delete platform user (nunca a si mesmo nem o último super-admin ativo)."""
    repo = PlatformUserRepository(db)
    
    try:
        target = await repo.get_by_id(user_id)
        if not target:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuário não encontrado",
            )
        await _guard_last_active_super_admin(repo, target, current_user, "excluir")

        user = await repo.soft_delete(user_id)
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuário não encontrado",
            )

        log_platform_action(
            db,
            actor_id=current_user.id,
            action=AuditAction.DELETE,
            platform_action="super_admin_delete",
            description=f"Super-admin {user.email} excluído",
            tenant_id=None,
            resource_type="User",
            resource_id=user.id,
        )

        await db.commit()
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao deletar usuário: {str(e)}",
        )


@router.get("", response_model=List[PlatformUserResponse])
async def list_platform_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> List[dict]:
    """List all platform SUPER_ADMIN users."""
    repo = PlatformUserRepository(db)
    
    try:
        users = await repo.list_all(skip=skip, limit=limit)
        
        return [
            PlatformUserResponse(
                id=str(u.id),
                email=u.email,
                username=u.username,
                role=u.role.value,
                is_active=u.is_active,
                created_at=u.created_at.isoformat(),
            )
            for u in users
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao listar usuários: {str(e)}",
        )
