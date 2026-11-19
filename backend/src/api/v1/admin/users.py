"""T065: Admin Users - GET/POST/PUT/DELETE /api/v1/admin/users/{id}"""
from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends, Request, status, Path, Query
from src.core.limiter import limiter
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, ConfigDict, EmailStr, model_validator
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone
import logging

from src.core.database import get_db
from src.models import User, UserRole, PermissionFeature
from src.repositories.user_repo import UserRepository
from src.repositories.permission_group_repo import PermissionGroupRepository
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


class UserUpdate(BaseModel):
    """User update request.

    Sem senha (11/2026): ninguém define a senha de outra pessoa. Para quem esqueceu, o
    painel manda o link de criar nova senha (POST /{user_id}/link-nova-senha). Campo
    `password` no corpo → 422, para o chamador antigo não achar que trocou.
    """

    @model_validator(mode="before")
    @classmethod
    def _sem_senha(cls, data):
        if isinstance(data, dict) and "password" in data:
            raise ValueError("A senha não é mais definida por aqui: mande o link de criar nova senha.")
        return data

    email: Optional[EmailStr] = None
    username: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


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


# Criar pessoa com senha saiu em 11/2026: o cadastro agora é por convite
# (POST /api/v1/admin/users/convites, admin/usuario_convites.py) e a pessoa cria a própria senha.


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
    update_data = user_update.model_dump(exclude_unset=True)
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


@router.post(
    "/{user_id}/link-nova-senha",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_group_permission(PermissionFeature.USUARIOS, "edit"))],
)
@limiter.limit("10/hour")
async def enviar_link_nova_senha(
    request: Request,
    background_tasks: BackgroundTasks,
    user_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manda à pessoa o link de criar nova senha — só desta conta (11/2026).

    Substitui o "Nova senha (opcional)" da edição: quem administra nunca fica sabendo a
    senha de ninguém. Mesmo link e validade (1 h) do "Esqueci a senha"; a senha atual segue
    valendo até a pessoa usar o link.
    """
    import hashlib
    import secrets
    from datetime import timedelta

    from src.api.v1.auth.login import _send_forgot_password_email
    from src.core.config import settings
    from src.services.email.base import EmailMessage
    from src.services.email.templates.password_reset import render_password_reset_email

    target = await UserRepository(db).get_by_id(user_id, current_user.tenant_id)
    if not target or target.role not in (UserRole.ADMIN, UserRole.OPERATOR):
        raise NotFoundError("Usuário não encontrado")
    _require_can_manage_target(current_user, target)
    if not target.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A conta está desativada. Reative antes de mandar o link.",
        )

    raw_token = secrets.token_urlsafe(32)
    target.reset_token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    target.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    db.add(target)
    await AuditService(db).log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="User",
        resource_id=target.id,
        new_state={"acao": "link_nova_senha_enviado"},
    )
    await db.commit()

    reset_url = f"{settings.FRONTEND_URL}/reset-password#token={raw_token}"
    msg = EmailMessage(
        to_email=target.email,
        subject="Crie uma nova senha — GiraHub",
        html_body=render_password_reset_email(reset_url, target.full_name or target.username),
        text_body=f"Acesse o link para criar uma nova senha: {reset_url}",
    )
    background_tasks.add_task(_send_forgot_password_email, msg, target.id, [target.id])
    return {"message": "Enviamos o link para a pessoa criar uma nova senha."}
