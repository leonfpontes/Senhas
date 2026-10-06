"""Platform API - Tenant management endpoints (T104)."""
from fastapi import APIRouter, Depends, HTTPException, Path, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from uuid import UUID
from datetime import datetime, timezone

from src.core.database import get_db
from src.core.errors import NotFoundError, InvalidInputError
from src.core.logging import log_security_event
from src.api.dependencies import require_super_admin
from src.models import User, PlanType
from src.models.subscriptions import Subscription
from src.services.tenant_service import TenantService
from src.services import session_service
from src.models.audit_logs import AuditAction
from src.repositories.tenant_repo import TenantRepository
from src.security.password import hash_password, validate_password_policy
from src.services.platform_audit import log_platform_action

router = APIRouter(prefix="/api/v1/platform/tenants", tags=["platform-tenants"])


class CreateTenantRequest(BaseModel):
    """Request to create new tenant."""
    slug: str
    name: str
    email_admin: EmailStr
    plan: PlanType = PlanType.BASIC
    is_trial: bool = False


class UpdateTenantRequest(BaseModel):
    """Request to update tenant.

    Só os campos ENVIADOS são aplicados (``model_fields_set``): ``description: null``
    limpa a descrição; campo ausente fica como está. ``name``/``is_active`` não
    aceitam null (colunas NOT NULL).
    """
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class DeleteTenantRequest(BaseModel):
    """Request to permanently delete a tenant.

    confirm_slug must match the tenant slug exactly — this prevents
    accidental deletions and forces the operator to consciously type
    the target identifier.
    """

    confirm_slug: str


class TenantResponse(BaseModel):
    """Tenant response."""
    id: str
    slug: str
    name: str
    description: Optional[str]
    is_active: bool
    created_at: str
    updated_at: str
    plan: Optional[str] = None
    subscription_status: Optional[str] = None
    is_bonus: Optional[bool] = None
    # Terreiro excluído (soft delete). Com self_deactivated_at preenchido, foi o
    # próprio terreiro que se desativou pelo painel (/auth/deactivate-account).
    deleted_at: Optional[str] = None
    self_deactivated_at: Optional[str] = None


@router.post("", status_code=status.HTTP_201_CREATED, response_model=dict)
async def create_tenant(
    request: CreateTenantRequest,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create new tenant with initial admin user.
    
    This endpoint is SUPER_ADMIN only and creates:
    - New tenant
    - Initial admin user (``temp_password`` volta UMA vez na resposta para o
      super-admin repassar; não é enviada por e-mail nem registrada em log)
    - Subscription
    """
    service = TenantService(db)
    
    try:
        result = await service.create_tenant(
            slug=request.slug,
            name=request.name,
            email_admin=request.email_admin,
            plan=request.plan,
            is_trial=request.is_trial,
        )
        log_platform_action(
            db,
            actor_id=current_user.id,
            action=AuditAction.CREATE,
            platform_action="tenant_create",
            description=f"Terreiro criado pela plataforma (admin {request.email_admin})",
            tenant_id=UUID(result["id"]),
            resource_type="Tenant",
            resource_id=UUID(result["id"]),
            slug=request.slug,
            plan=request.plan.value,
        )

        await db.commit()
        return result
    except InvalidInputError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao criar tenant: {str(e)}",
        )


@router.get("/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get tenant by ID.

    Inclui terreiros excluídos (soft delete) — a aba Assinaturas lista quem se
    desativou e o Tenant 360 precisa abrir para a exclusão definitiva (LGPD).
    """
    repo = TenantRepository(db)
    
    try:
        tenant = await repo.get_by_id(tenant_id, None, include_deleted=True)
        if not tenant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tenant não encontrado",
            )

        sub_result = await db.execute(
            select(Subscription).where(Subscription.tenant_id == tenant.id)
        )
        sub = sub_result.scalar_one_or_none()

        return TenantResponse(
            id=str(tenant.id),
            slug=tenant.slug,
            name=tenant.name,
            description=tenant.description,
            is_active=tenant.is_active,
            created_at=tenant.created_at.isoformat(),
            updated_at=tenant.updated_at.isoformat(),
            plan=sub.plan.value.lower() if sub else None,
            subscription_status=sub.status.value.lower() if sub else None,
            is_bonus=sub.is_bonus if sub else None,
            deleted_at=tenant.deleted_at.isoformat() if tenant.deleted_at else None,
            self_deactivated_at=(
                tenant.self_deactivated_at.isoformat() if tenant.self_deactivated_at else None
            ),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar tenant: {str(e)}",
        )


@router.put("/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: UUID,
    request: UpdateTenantRequest,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update tenant (só os campos enviados; ``description: null`` limpa)."""
    service = TenantService(db)
    
    try:
        update_data = request.model_dump(exclude_unset=True)
        for field in ("name", "is_active"):
            if field in update_data and update_data[field] is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=f"Campo '{field}' não pode ser nulo",
                )
        if "name" in update_data and not update_data["name"].strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Nome não pode ficar vazio",
            )
        if update_data.get("description") is not None and not update_data["description"].strip():
            update_data["description"] = None

        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nenhum campo para atualizar",
            )

        before = await service.get_tenant(tenant_id)
        result = await service.update_tenant(tenant_id, **update_data) if before else None

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tenant não encontrado",
            )

        changed = [k for k in update_data if before.get(k) != result.get(k)]
        log_platform_action(
            db,
            actor_id=current_user.id,
            action=AuditAction.UPDATE,
            platform_action="tenant_update",
            description="Dados do terreiro alterados pela plataforma",
            tenant_id=tenant_id,
            resource_type="Tenant",
            resource_id=tenant_id,
            previous_values={k: before.get(k) for k in changed},
            new_values={k: result.get(k) for k in changed},
        )

        await db.commit()
        
        return TenantResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao atualizar tenant: {str(e)}",
        )


@router.delete("/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tenant(
    tenant_id: UUID,
    request: DeleteTenantRequest,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Permanently hard-delete a tenant and all its data (LGPD Art. 18 VI).

    Requires confirm_slug matching the tenant slug to prevent accidents.
    Cancels active Stripe subscription before deletion (best-effort).
    Audit trail is preserved with tenant_id=NULL.
    """
    service = TenantService(db)

    try:
        await service.hard_delete_tenant(
            tenant_id=tenant_id,
            confirm_slug=request.confirm_slug,
            actor_id=current_user.id,
        )
        await db.commit()
        log_security_event(
            "tenant_hard_deleted",
            user_id=current_user.id,
            tenant_id=None,
            success=True,
        )
    except NotFoundError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except InvalidInputError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(e),
        )
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao excluir tenant permanentemente: {str(e)}",
        )


@router.get("", response_model=List[TenantResponse])
async def list_tenants(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_active: Optional[bool] = None,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> List[dict]:
    """List all tenants with pagination."""
    repo = TenantRepository(db)
    
    try:
        tenants = await repo.search(
            is_active=is_active,
            skip=skip,
            limit=limit,
        )
        
        # Batch-load subscriptions to avoid N+1 queries
        tenant_ids = [t.id for t in tenants]
        if tenant_ids:
            subs_result = await db.execute(
                select(Subscription).where(Subscription.tenant_id.in_(tenant_ids))
            )
            subs_map = {s.tenant_id: s for s in subs_result.scalars().all()}
        else:
            subs_map = {}

        return [
            TenantResponse(
                id=str(t.id),
                slug=t.slug,
                name=t.name,
                description=t.description,
                is_active=t.is_active,
                created_at=t.created_at.isoformat(),
                updated_at=t.updated_at.isoformat(),
                plan=subs_map[t.id].plan.value.lower() if t.id in subs_map else None,
                subscription_status=subs_map[t.id].status.value.lower() if t.id in subs_map else None,
                is_bonus=subs_map[t.id].is_bonus if t.id in subs_map else None,
            )
            for t in tenants
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao listar tenants: {str(e)}",
        )


class TenantUserResponse(BaseModel):
    """User response for tenant detail."""
    id: str
    email: str
    username: str
    role: str
    is_active: bool
    created_at: str


@router.get("/{tenant_id}/users", response_model=List[TenantUserResponse])
async def list_tenant_users(
    tenant_id: UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> List[TenantUserResponse]:
    """List all users for a specific tenant (também de terreiro excluído)."""
    # Verify tenant exists — inclui soft-deleted para o Tenant 360 de quem se desativou
    repo = TenantRepository(db)
    tenant = await repo.get_by_id(tenant_id, None, include_deleted=True)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant não encontrado",
        )

    result = await db.execute(
        select(User).where(
            User.tenant_id == tenant_id,
            User.deleted_at.is_(None),
        )
    )
    users = result.scalars().all()

    return [
        TenantUserResponse(
            id=str(u.id),
            email=u.email,
            username=u.username,
            role=u.role.value if hasattr(u.role, 'value') else str(u.role),
            is_active=u.is_active,
            created_at=u.created_at.isoformat(),
        )
        for u in users
    ]


class ResetPasswordRequest(BaseModel):
    """Request to force-reset a tenant user's password (super admin only)."""

    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        # Guard bcrypt 72-byte silent truncation
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Senha deve ter no máximo 72 caracteres")
        try:
            validate_password_policy(v)
        except Exception as exc:
            raise ValueError(str(exc)) from exc
        return v


@router.post(
    "/{tenant_id}/users/{user_id}/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def reset_tenant_user_password(
    tenant_id: UUID = Path(...),
    user_id: UUID = Path(...),
    body: ResetPasswordRequest = None,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Force-reset a tenant user's password (super admin only)."""
    # Verify tenant exists
    repo = TenantRepository(db)
    tenant = await repo.get_by_id(tenant_id, None)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant não encontrado",
        )

    # Fetch user — mandatory tenant_id filter (multi-tenant isolation)
    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.tenant_id == tenant_id,
            User.deleted_at.is_(None),
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado",
        )

    user.password_hash = hash_password(body.new_password)
    user.sessions_revoked_at = datetime.now(timezone.utc)
    db.add(user)
    await session_service.end_all_sessions(db, user.id)
    log_platform_action(
        db,
        actor_id=current_user.id,
        action=AuditAction.UPDATE,
        platform_action="user_password_reset",
        description=f"Senha de {user.email} redefinida pela plataforma (sessões encerradas)",
        tenant_id=tenant_id,
        resource_type="User",
        resource_id=user.id,
    )
    await db.commit()

    log_security_event(
        "password_reset_by_admin",
        user_id=str(current_user.id),
        tenant_id=str(tenant_id),
        details={"target_user_id": str(user_id)},
    )
