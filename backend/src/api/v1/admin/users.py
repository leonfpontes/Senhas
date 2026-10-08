"""T065: Admin Users - GET/POST/PUT/DELETE /api/v1/admin/users/{id}"""
from fastapi import APIRouter, HTTPException, Depends, status, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, ConfigDict, EmailStr
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone
import logging

from src.core.database import get_db
from src.models import User, UserRole, PermissionFeature
from src.repositories.user_repo import UserRepository
from src.repositories.permission_group_repo import PermissionGroupRepository
from src.security.password import hash_password, validate_password_policy
from src.services.audit_service import AuditService
from src.services import session_service
from src.services.medium_area import get_linked_medium, unlink_user
from src.api.dependencies import get_current_user, require_group_permission
from src.core.errors import (
    InsufficientPermissionsError,
    NotFoundError,
)
from sqlalchemy import select, func, and_
from src.core.tz import utc_now

router = APIRouter(prefix="/api/v1/admin/users", tags=["admin-users"])
logger = logging.getLogger(__name__)


class UserCreate(BaseModel):
    """User creation request."""
    email: EmailStr
    username: str
    password: str
    role: UserRole = UserRole.OPERATOR


class UserUpdate(BaseModel):
    """User update request."""
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


_ADMIN_ROLES = (UserRole.ADMIN, UserRole.SUPER_ADMIN)


def _require_assignable_role(current_user: User, role: UserRole) -> None:
    """Perfil que quem chama pode atribuir.

    SUPER_ADMIN é da plataforma — nunca sai daqui. ADMIN só por administrador:
    operador com USUARIOS:insert/edit (grupo) não pode se promover nem criar
    administradores (escalada de privilégio). MEDIUM (Área do Médium, AM-02)
    não se cria por aqui: a conta nasce do convite do médium (AM-03); o único
    caminho para `medium` nesta tela é tirar o painel de quem é médium
    (ver _require_medium_link).
    """
    if role in (UserRole.SUPER_ADMIN, UserRole.MEDIUM):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Perfil de acesso inválido.",
        )
    if role == UserRole.ADMIN and not current_user.is_admin:
        raise InsufficientPermissionsError(
            "Só administradores podem criar ou promover administradores."
        )


async def _require_medium_link(db: AsyncSession, tenant_id: UUID, target: User) -> None:
    """Só vira `medium` quem tem médium ativo ligado à conta (AM-02).

    Sem o vínculo a conta `medium` não acessaria nada — para isso existe
    desativar/remover.
    """
    if await get_linked_medium(db, tenant_id, target.id) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Só quem está ligado a um médium ativo pode ficar apenas com a Área do Médium. "
                "Para tirar o acesso desta conta, desative ou remova o usuário."
            ),
        )


async def _demote_to_medium(db: AsyncSession, tenant_id: UUID, target: User) -> None:
    """Tira o painel e deixa a Área do Médium: papel `medium`, sem grupos (sem commit)."""
    target.role = UserRole.MEDIUM
    db.add(target)
    await PermissionGroupRepository(db).remove_all_memberships(target.id, tenant_id)
    await db.flush()


def _require_can_manage_target(current_user: User, target: User) -> None:
    """Operador (mesmo com permissão de grupo) não altera nem remove administradores."""
    if target.role in _ADMIN_ROLES and not current_user.is_admin:
        raise InsufficientPermissionsError(
            "Só administradores podem alterar ou remover a conta de um administrador."
        )


async def _ensure_other_active_admin(db: AsyncSession, tenant_id: UUID, target_id: UUID) -> None:
    """Bloqueia tirar do ar o último administrador ativo do terreiro."""
    remaining = await db.scalar(
        select(func.count()).select_from(User).where(
            and_(
                User.tenant_id == tenant_id,
                User.role == UserRole.ADMIN,
                User.is_active.is_(True),
                User.deleted_at.is_(None),
                User.id != target_id,
            )
        )
    )
    if not remaining:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Este é o único administrador ativo do terreiro. "
                "Promova outra pessoa a administrador antes."
            ),
        )


class UserResponse(BaseModel):
    """User response."""
    id: UUID
    email: str
    username: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_group_permission(PermissionFeature.USUARIOS, "insert"))])
async def create_user(
    user_data: UserCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Create new user.

    Autorização pelo grupo (USUARIOS:insert — admin faz bypass). Operador não
    cria administrador (ver _require_assignable_role).
    """
    _require_assignable_role(current_user, user_data.role)
    validate_password_policy(user_data.password)

    # Sem limite de usuários: ilimitados em todos os planos (out/2026) — quem
    # opera a plataforma vira promotor do upgrade (ver PLAN_LIMITS).

    # Check if email already exists
    repo = UserRepository(db)
    existing = await repo.get_by_email(current_user.tenant_id, user_data.email)
    if existing and existing.role == UserRole.MEDIUM:
        # AM-02: a pessoa já tem conta da Área do Médium neste terreiro — é a
        # mesma pessoa, então ela ganha o painel na MESMA conta (o vínculo com o
        # médium continua). Papel pedido já passou por _require_assignable_role
        # (operador não promove a admin). A senha e o nome de usuário da conta
        # NÃO mudam: quem cadastra não fica sabendo a senha de um médium (que vê
        # a própria mensalidade); a pessoa entra com a senha que já usa.
        existing.role = user_data.role
        existing.is_active = True
        existing.updated_at = utc_now()
        db.add(existing)
        await db.flush()
        await PermissionGroupRepository(db).assign_default_group_if_groupless(existing)
        await AuditService(db).log_update(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            resource_type="User",
            resource_id=existing.id,
            previous_state={"role": UserRole.MEDIUM.value},
            new_state={"role": user_data.role.value},
        )
        await db.commit()
        await db.refresh(existing)
        return UserResponse.model_validate(existing)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email já registrado",
        )

    # Check if email belongs to a soft-deleted user — if so, resurrect it
    hashed_password = hash_password(user_data.password)
    deleted_user = await repo.get_by_email_including_deleted(current_user.tenant_id, user_data.email)
    if deleted_user:
        deleted_user.username = user_data.username
        deleted_user.password_hash = hashed_password
        deleted_user.role = user_data.role
        deleted_user.is_active = True
        deleted_user.deleted_at = None
        deleted_user.full_name = None
        deleted_user.phone = None
        deleted_user.profile_photo_data = None
        deleted_user.profile_photo_url = None
        deleted_user.profile_photo_content_type = None
        deleted_user.updated_at = utc_now()
        await db.flush()
        await db.refresh(deleted_user)
        created_user = deleted_user
    else:
        # Create user
        created_user = await repo.create(
            tenant_id=current_user.tenant_id,
            email=user_data.email,
            username=user_data.username,
            password_hash=hashed_password,
            role=user_data.role,
        )
    
    # Q-05: sem grupo o operador não acessa nada — entra no grupo padrão.
    await PermissionGroupRepository(db).assign_default_group_if_groupless(created_user)

    # Log audit
    audit_service = AuditService(db)
    await audit_service.log_create(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="User",
        resource_id=created_user.id,
        details={"email": user_data.email, "role": user_data.role.value},
    )
    
    await db.commit()
    return UserResponse.model_validate(created_user)


@router.get("", response_model=List[UserResponse], dependencies=[Depends(require_group_permission(PermissionFeature.USUARIOS, "view"))])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    role_filter: Optional[UserRole] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[UserResponse]:
    """List users (admin or operator).

    Contas `medium` (só Área do Médium, AM-02) ficam fora por padrão — a tela
    Usuários é de quem acessa o painel; `?role_filter=medium` lista só elas.
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")
    
    repo = UserRepository(db)
    
    # SUPER_ADMIN (no tenant) sees all users
    if current_user.tenant_id is None:
        stmt = select(User).where(User.deleted_at.is_(None))
        if role_filter:
            stmt = stmt.where(User.role == role_filter)
        else:
            stmt = stmt.where(User.role != UserRole.MEDIUM)
        stmt = stmt.order_by(User.email).offset(skip).limit(limit)
        result = await db.execute(stmt)
        users = result.scalars().all()
    elif role_filter:
        users = await repo.get_by_role(
            current_user.tenant_id,
            role_filter,
            skip=skip,
            limit=limit,
        )
    else:
        users = await repo.list_backoffice(current_user.tenant_id, skip=skip, limit=limit)
    
    return [UserResponse.model_validate(u) for u in users]


@router.get("/{user_id}", response_model=UserResponse, dependencies=[Depends(require_group_permission(PermissionFeature.USUARIOS, "view"))])
async def get_user(
    user_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Get user details (admin or operator)."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")
    
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id, current_user.tenant_id)
    
    if not user:
        raise NotFoundError("Usuário não encontrado")
    
    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse, dependencies=[Depends(require_group_permission(PermissionFeature.USUARIOS, "edit"))])
async def update_user(
    user_id: UUID = Path(...),
    user_update: UserUpdate = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Update user.

    Autorização pelo grupo (USUARIOS:edit — admin faz bypass). Proteções:
    ninguém muda o próprio perfil nem se desativa por aqui; o último
    administrador ativo não pode ser rebaixado/desativado; operador não mexe
    em administradores. Reativar não tem limite (usuários ilimitados em todos os planos).
    """
    repo = UserRepository(db)
    existing_user = await repo.get_by_id(user_id, current_user.tenant_id)
    
    if not existing_user:
        raise NotFoundError("Usuário não encontrado")

    _require_can_manage_target(current_user, existing_user)

    # Update fields (None em role/is_active = "não mudar", não "apagar")
    update_data = user_update.model_dump(exclude_unset=True, exclude={"password"})
    for key in ("role", "is_active"):
        if key in update_data and update_data[key] is None:
            del update_data[key]

    is_self = existing_user.id == current_user.id
    new_role = update_data.get("role")
    role_change = new_role is not None and new_role != existing_user.role
    deactivating = update_data.get("is_active") is False and existing_user.is_active

    if role_change:
        if is_self:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Você não pode mudar o seu próprio perfil de acesso. Peça a outro administrador.",
            )
        if new_role == UserRole.MEDIUM:
            # Tirar o painel de quem é médium (AM-02): fica só a Área do Médium.
            await _require_medium_link(db, current_user.tenant_id, existing_user)
        else:
            _require_assignable_role(current_user, new_role)
    if deactivating and is_self:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Você não pode desativar a sua própria conta por aqui.",
        )
    if (
        existing_user.role == UserRole.ADMIN
        and existing_user.is_active
        and (deactivating or (role_change and new_role != UserRole.ADMIN))
    ):
        await _ensure_other_active_admin(db, current_user.tenant_id, existing_user.id)
    if user_update.password:
        validate_password_policy(user_update.password)

    # Desativar quem é operador/admin e também médium (decisão do dono, 07/10) tira só
    # o painel: a conta vira `medium` e segue ativa na Área do Médium. Quem tira a
    # Área é inativar/excluir o cadastro de médium.
    if (
        deactivating
        and not role_change
        and existing_user.role in (UserRole.ADMIN, UserRole.OPERATOR)
        and await get_linked_medium(db, current_user.tenant_id, existing_user.id) is not None
    ):
        del update_data["is_active"]
        update_data["role"] = UserRole.MEDIUM

    for key, value in update_data.items():
        if hasattr(existing_user, key):
            setattr(existing_user, key, value)
    
    # Handle password separately
    if user_update.password:
        existing_user.password_hash = hash_password(user_update.password)
        existing_user.sessions_revoked_at = datetime.now(timezone.utc)
        await session_service.end_all_sessions(db, existing_user.id)

    db.add(existing_user)
    await db.flush()
    await db.refresh(existing_user)

    # Q-05: admin rebaixado a operador sem grupo ficaria sem acesso nenhum.
    if update_data.get("role") == UserRole.OPERATOR:
        await PermissionGroupRepository(db).assign_default_group_if_groupless(existing_user)
    # AM-02: conta que ficou só com a Área do Médium sai de todos os grupos.
    elif update_data.get("role") == UserRole.MEDIUM:
        await PermissionGroupRepository(db).remove_all_memberships(existing_user.id, current_user.tenant_id)
    
    # Log audit
    audit_service = AuditService(db)
    await audit_service.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="User",
        resource_id=user_id,
    )
    
    await db.commit()
    return UserResponse.model_validate(existing_user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_group_permission(PermissionFeature.USUARIOS, "delete"))])
async def delete_user(
    user_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete (soft delete) user.

    Autorização pelo grupo (USUARIOS:delete — admin faz bypass). Ninguém se
    exclui por aqui (a própria conta sai em Meu perfil), operador não remove
    administrador e o último administrador ativo não pode ser removido.

    AM-02: operador/admin ligado a um médium ativo NÃO é excluído — perde o
    painel e fica com a Área do Médium (papel `medium`), para não quebrar o
    vínculo. Conta excluída de verdade solta o vínculo com o médium.
    """
    repo = UserRepository(db)
    target = await repo.get_by_id(user_id, current_user.tenant_id)
    if not target:
        raise NotFoundError("Usuário não encontrado")
    if target.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Você não pode remover a sua própria conta por aqui. Use Meu perfil > Zona de risco.",
        )
    _require_can_manage_target(current_user, target)
    if target.role == UserRole.ADMIN and target.is_active:
        await _ensure_other_active_admin(db, current_user.tenant_id, target.id)

    if target.role in (UserRole.ADMIN, UserRole.OPERATOR) and await get_linked_medium(
        db, current_user.tenant_id, target.id
    ):
        previous_role = target.role.value
        await _demote_to_medium(db, current_user.tenant_id, target)
        await AuditService(db).log_update(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            resource_type="User",
            resource_id=user_id,
            previous_state={"role": previous_role},
            new_state={"role": UserRole.MEDIUM.value},
        )
        await db.commit()
        return

    deleted = await repo.delete_soft(user_id, current_user.tenant_id)
    
    if not deleted:
        raise NotFoundError("Usuário não encontrado")
    await unlink_user(db, current_user.tenant_id, user_id)
    
    # Log audit
    audit_service = AuditService(db)
    await audit_service.log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="User",
        resource_id=user_id,
    )
    
    await db.commit()
