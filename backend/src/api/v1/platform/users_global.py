"""Platform API - Global SUPER_ADMIN users endpoint (T106)."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from uuid import UUID

from src.core.database import get_db
from src.api.dependencies import get_current_user
from src.models import User, UserRole
from src.repositories.platform_user_repo import PlatformUserRepository
from src.security.password import hash_password
from src.core.errors import InvalidInputError

router = APIRouter(prefix="/api/v1/platform/users", tags=["platform-users"])


class CreatePlatformUserRequest(BaseModel):
    """Request to create SUPER_ADMIN user."""
    email: EmailStr
    username: str
    password: str


class UpdatePlatformUserRequest(BaseModel):
    """Request to update SUPER_ADMIN user."""
    username: Optional[str] = None
    is_active: Optional[bool] = None


class PlatformUserResponse(BaseModel):
    """Platform user response."""
    id: str
    email: str
    username: str
    role: str
    is_active: bool
    created_at: str


async def require_super_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency to require SUPER_ADMIN role."""
    if user.role != UserRole.SUPER_ADMIN or user.tenant_id is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas SUPER_ADMIN pode acessar esta operação",
        )
    return user


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
            detail=f"Erro ao criar usuário: {str(e)}",
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
            k: v for k, v in request.dict().items() if v is not None
        }
        
        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nenhum campo para atualizar",
            )
        
        user = await repo.update(user_id, **update_data)
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuário não encontrado",
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
    """Soft delete platform user."""
    repo = PlatformUserRepository(db)
    
    try:
        user = await repo.soft_delete(user_id)
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuário não encontrado",
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
