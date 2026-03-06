"""Platform API - Feature flags endpoint (T110)."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import datetime

from src.core.database import get_db
from src.api.dependencies import get_current_user
from src.models import User, UserRole
from src.repositories.feature_flags_repo import FeatureFlagsRepository

router = APIRouter(prefix="/api/v1/platform/feature-flags", tags=["platform-features"])


class SetFeatureFlagRequest(BaseModel):
    """Request to set feature flag."""
    feature: str
    enabled: bool
    expires_at: Optional[str] = None
    description: Optional[str] = None


class FeatureFlagResponse(BaseModel):
    """Feature flag response."""
    id: str
    tenant_id: str
    feature: str
    enabled: bool
    expires_at: Optional[str]
    description: Optional[str]
    created_at: str


async def require_super_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency to require SUPER_ADMIN role."""
    if user.role != UserRole.SUPER_ADMIN or user.tenant_id is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas SUPER_ADMIN pode acessar esta operação",
        )
    return user


@router.post("/{tenant_id}", status_code=status.HTTP_201_CREATED, response_model=FeatureFlagResponse)
async def set_feature_flag(
    tenant_id: UUID,
    request: SetFeatureFlagRequest,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create or update feature flag for tenant."""
    repo = FeatureFlagsRepository(db)
    
    try:
        expires_at = None
        if request.expires_at:
            try:
                expires_at = datetime.fromisoformat(
                    request.expires_at.replace("Z", "+00:00")
                )
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="expires_at deve ser ISO format válido",
                )
        
        flag = await repo.create_or_update(
            tenant_id=tenant_id,
            feature=request.feature,
            enabled=request.enabled,
            expires_at=expires_at,
            description=request.description,
        )
        
        await db.commit()
        
        return FeatureFlagResponse(
            id=str(flag.id),
            tenant_id=str(flag.tenant_id),
            feature=flag.feature,
            enabled=flag.enabled,
            expires_at=flag.expires_at.isoformat() if flag.expires_at else None,
            description=flag.description,
            created_at=flag.created_at.isoformat(),
        )
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao criar/atualizar feature flag: {str(e)}",
        )


@router.get("/{tenant_id}/{feature}", response_model=FeatureFlagResponse)
async def get_feature_flag(
    tenant_id: UUID,
    feature: str,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get feature flag for tenant."""
    repo = FeatureFlagsRepository(db)
    
    try:
        flag = await repo.get_by_name(tenant_id, feature)
        
        if not flag:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Feature flag não encontrada",
            )
        
        return FeatureFlagResponse(
            id=str(flag.id),
            tenant_id=str(flag.tenant_id),
            feature=flag.feature,
            enabled=flag.enabled,
            expires_at=flag.expires_at.isoformat() if flag.expires_at else None,
            description=flag.description,
            created_at=flag.created_at.isoformat(),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar feature flag: {str(e)}",
        )


@router.get("/{tenant_id}", response_model=List[FeatureFlagResponse])
async def list_feature_flags(
    tenant_id: UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> List[dict]:
    """List all feature flags for tenant."""
    repo = FeatureFlagsRepository(db)
    
    try:
        flags = await repo.list_all_for_tenant(tenant_id)
        
        return [
            FeatureFlagResponse(
                id=str(f.id),
                tenant_id=str(f.tenant_id),
                feature=f.feature,
                enabled=f.enabled,
                expires_at=f.expires_at.isoformat() if f.expires_at else None,
                description=f.description,
                created_at=f.created_at.isoformat(),
            )
            for f in flags
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao listar feature flags: {str(e)}",
        )


@router.delete("/{tenant_id}/{feature}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_feature_flag(
    tenant_id: UUID,
    feature: str,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove feature flag (resets to disabled)."""
    repo = FeatureFlagsRepository(db)
    
    try:
        flag = await repo.disable(tenant_id, feature)
        
        if not flag:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Feature flag não encontrada",
            )
        
        await db.commit()
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao deletar feature flag: {str(e)}",
        )


@router.get("/{tenant_id}/enabled", response_model=List[FeatureFlagResponse])
async def list_enabled_features(
    tenant_id: UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> List[dict]:
    """List only enabled feature flags for tenant."""
    repo = FeatureFlagsRepository(db)
    
    try:
        flags = await repo.list_enabled(tenant_id)
        
        return [
            FeatureFlagResponse(
                id=str(f.id),
                tenant_id=str(f.tenant_id),
                feature=f.feature,
                enabled=f.enabled,
                expires_at=f.expires_at.isoformat() if f.expires_at else None,
                description=f.description,
                created_at=f.created_at.isoformat(),
            )
            for f in flags
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao listar features ativadas: {str(e)}",
        )
