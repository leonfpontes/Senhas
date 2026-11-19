"""Convites para entrar no painel — /api/v1/admin/users/convites (11/2026).

Substitui o "Nova pessoa" com senha: quem cadastra informa e-mail, nome, tipo de acesso e
perfil; a pessoa recebe um link e cria a própria senha (ou usa a que já usa no GiraHub).
A conta só nasce no aceite (`api/v1/public/convite_equipe.py`).

Permissões (grupo USUARIOS; admin faz bypass):
- listar → view · convidar e reenviar → insert · ajustar → edit · cancelar → delete.
- Operador (mesmo com o grupo) não convida administrador nem mexe em convite de
  administrador — mesma regra de `users.py` (escalada de privilégio).

Este router entra no `admin_router` ANTES do de `users.py`: lá `/{user_id}` casaria com
"convites".
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user, require_group_permission
from src.core.database import get_db
from src.core.errors import InsufficientPermissionsError, NotFoundError
from src.models import PermissionFeature, User, UserRole, UsuarioConvite
from src.repositories.permission_group_repo import PermissionGroupRepository
from src.services import usuario_convite as svc
from src.services.audit_service import AuditService
from src.services.medium_area import BACKOFFICE_ROLES

router = APIRouter(prefix="/api/v1/admin/users/convites", tags=["admin-users-convites"])
logger = logging.getLogger(__name__)

RESOURCE = "UsuarioConvite"


class ConviteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    nome: str = Field(..., min_length=1, max_length=255)
    role: UserRole = UserRole.OPERATOR
    group_id: Optional[UUID] = None


class ConviteUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: Optional[str] = Field(None, min_length=1, max_length=255)
    role: Optional[UserRole] = None
    group_id: Optional[UUID] = None


class ConviteResponse(BaseModel):
    id: UUID
    email: str
    nome: str
    role: str
    group_id: Optional[UUID] = None
    situacao: str  # enviado | vencido | recusado
    enviado_em: datetime
    expira_em: datetime
    recusado_em: Optional[datetime] = None
    criado_por_nome: Optional[str] = None
    created_at: datetime


def _response(c: UsuarioConvite, nomes: dict) -> ConviteResponse:
    return ConviteResponse(
        id=c.id,
        email=c.email,
        nome=c.nome,
        role=c.role,
        group_id=c.group_id,
        situacao=svc.situacao(c),
        enviado_em=c.enviado_em,
        expira_em=c.expira_em,
        recusado_em=c.recusado_em,
        criado_por_nome=nomes.get(c.criado_por) if c.criado_por else None,
        created_at=c.created_at,
    )


def _erro(code: int, message: str, error_code: str, **extra) -> HTTPException:
    return HTTPException(status_code=code, detail={"message": message, "error_code": error_code, **extra})


def _papel_convidavel(current_user: User, role: UserRole) -> None:
    """Só admin/operador; admin só por administrador (users._require_assignable_role)."""
    if role.value not in svc.PAPEIS_CONVIDAVEIS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Perfil de acesso inválido.")
    if role == UserRole.ADMIN and not current_user.is_admin:
        raise InsufficientPermissionsError("Só administradores podem convidar administradores.")


def _pode_mexer(current_user: User, convite: UsuarioConvite) -> None:
    if convite.role == UserRole.ADMIN.value and not current_user.is_admin:
        raise InsufficientPermissionsError("Só administradores podem mexer no convite de um administrador.")


async def _validar_grupo_do_tenant(db: AsyncSession, tenant_id: UUID, group_id: Optional[UUID]) -> Optional[UUID]:
    """Perfil escolhido, conferido no terreiro de quem convida (FK do corpo)."""
    if group_id is None:
        return None
    group = await PermissionGroupRepository(db).get_by_id(group_id, tenant_id)
    if group is None:
        raise NotFoundError("Perfil de acesso não encontrado")
    return group.id


async def _convite(db: AsyncSession, current_user: User, convite_id: UUID) -> UsuarioConvite:
    convite = await svc.convite_do_tenant(db, current_user.tenant_id, convite_id)
    # Some da lista: aceito ou cancelado. Recusado ainda aparece (pode reenviar ou tirar).
    if convite is None or (not svc.em_aberto(convite) and convite.recusado_em is None):
        raise NotFoundError("Convite não encontrado")
    return convite


def _quem_convida(user: User) -> str:
    return user.full_name or user.username


async def _enviar(db: AsyncSession, current_user: User, convite: UsuarioConvite, token: str) -> None:
    tenant, config = await svc.marca_do_terreiro(db, current_user.tenant_id)
    if tenant is None:
        return
    try:
        svc.enfileirar_email_convite(tenant, config, convite, _quem_convida(current_user), token)
    except Exception:  # fila fora do ar não desfaz o convite; o admin pode reenviar
        logger.exception("Falha ao enfileirar o e-mail do convite %s", convite.id)


@router.get(
    "",
    response_model=List[ConviteResponse],
    dependencies=[Depends(require_group_permission(PermissionFeature.USUARIOS, "view"))],
)
async def listar_convites(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[ConviteResponse]:
    if current_user.tenant_id is None:
        return []
    convites = await svc.convites_pendentes(db, current_user.tenant_id)
    nomes = await svc.nomes_de_quem_convidou(db, current_user.tenant_id, {c.criado_por for c in convites if c.criado_por})
    return [_response(c, nomes) for c in convites]


@router.post(
    "",
    response_model=ConviteResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_group_permission(PermissionFeature.USUARIOS, "insert"))],
)
async def criar_convite(
    body: ConviteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConviteResponse:
    """Convida alguém para o painel. A conta só nasce quando a pessoa aceita."""
    if current_user.tenant_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Convite é sempre de um terreiro.")
    tenant_id = current_user.tenant_id
    _papel_convidavel(current_user, body.role)
    email = svc.normalizar_email(str(body.email))
    if email is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="E-mail inválido.")
    group_id = await _validar_grupo_do_tenant(db, tenant_id, body.group_id) if body.role == UserRole.OPERATOR else None

    conta = await svc.conta_do_email_no_tenant(db, tenant_id, email)
    if conta is not None and conta.deleted_at is None and conta.role in BACKOFFICE_ROLES:
        if conta.is_active:
            raise _erro(409, "Esta pessoa já tem acesso ao painel do terreiro.", "JA_TEM_ACESSO")
        raise _erro(
            409,
            "Esta pessoa já está cadastrada, mas desativada. Para devolver o acesso, reative pela edição.",
            "CONTA_DESATIVADA",
            user_id=str(conta.id),
        )

    aberto = await svc.convite_em_aberto_do_email(db, tenant_id, email)
    if aberto is not None and svc.valido(aberto):
        raise _erro(
            409,
            "Já existe um convite em aberto para este e-mail. Você pode reenviá-lo.",
            "CONVITE_EM_ABERTO",
            convite_id=str(aberto.id),
        )
    if aberto is not None:  # vencido: sai para dar lugar ao novo
        await svc.revogar_em_aberto_do_email(db, tenant_id, email)
        await db.flush()

    agora = datetime.now(timezone.utc)
    token, token_hash = svc.gerar_token()
    convite = UsuarioConvite(
        tenant_id=tenant_id,
        email=email,
        nome=body.nome.strip(),
        role=body.role.value,
        group_id=group_id,
        token_hash=token_hash,
        enviado_em=agora,
        expira_em=agora + timedelta(days=svc.CONVITE_VALIDADE_DIAS),
        criado_por=current_user.id,
        created_at=agora,
    )
    db.add(convite)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise _erro(409, "Já existe um convite em aberto para este e-mail.", "CONVITE_EM_ABERTO")

    await AuditService(db).log_create(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type=RESOURCE,
        resource_id=convite.id,
        details={"email": email, "role": convite.role, "group_id": str(group_id) if group_id else None},
    )
    await db.commit()
    await _enviar(db, current_user, convite, token)
    return _response(convite, {current_user.id: _quem_convida(current_user)})


@router.put(
    "/{convite_id}",
    response_model=ConviteResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.USUARIOS, "edit"))],
)
async def ajustar_convite(
    body: ConviteUpdate,
    convite_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConviteResponse:
    """Ajusta nome, tipo e perfil de um convite ainda em aberto (o e-mail não muda)."""
    convite = await _convite(db, current_user, convite_id)
    if not svc.em_aberto(convite):
        raise NotFoundError("Convite não encontrado")
    _pode_mexer(current_user, convite)
    antes = {"nome": convite.nome, "role": convite.role, "group_id": str(convite.group_id) if convite.group_id else None}
    if body.role is not None:
        _papel_convidavel(current_user, body.role)
        convite.role = body.role.value
    if body.nome is not None:
        convite.nome = body.nome.strip()
    if convite.role == UserRole.ADMIN.value:
        convite.group_id = None
    elif "group_id" in body.model_fields_set:
        group_id = await _validar_grupo_do_tenant(db, current_user.tenant_id, body.group_id)
        convite.group_id = group_id
    depois = {"nome": convite.nome, "role": convite.role, "group_id": str(convite.group_id) if convite.group_id else None}
    db.add(convite)
    await AuditService(db).log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type=RESOURCE,
        resource_id=convite.id,
        previous_state=antes,
        new_state=depois,
    )
    await db.commit()
    nomes = await svc.nomes_de_quem_convidou(db, current_user.tenant_id, {convite.criado_por} if convite.criado_por else set())
    return _response(convite, nomes)


@router.post(
    "/{convite_id}/reenviar",
    response_model=ConviteResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.USUARIOS, "insert"))],
)
async def reenviar_convite(
    convite_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConviteResponse:
    """Link novo, mais 7 dias; o anterior para de valer. Vale também para o vencido e o recusado."""
    convite = await _convite(db, current_user, convite_id)
    _pode_mexer(current_user, convite)
    if not svc.pode_reenviar_agora(convite):
        raise _erro(429, "O convite acabou de ser enviado. Espere um minuto para reenviar.", "REENVIO_CEDO")
    conta = await svc.conta_do_email_no_tenant(db, current_user.tenant_id, convite.email)
    if conta is not None and conta.deleted_at is None and conta.role in BACKOFFICE_ROLES and conta.is_active:
        raise _erro(409, "Esta pessoa já tem acesso ao painel do terreiro.", "JA_TEM_ACESSO")
    convite.recusado_em = None
    token = svc.renovar_token(convite)
    db.add(convite)
    try:
        await db.flush()
    except IntegrityError:  # recusado reaberto colidiu com um convite novo do mesmo e-mail
        await db.rollback()
        raise _erro(409, "Já existe um convite em aberto para este e-mail.", "CONVITE_EM_ABERTO")
    await AuditService(db).log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type=RESOURCE,
        resource_id=convite.id,
        new_state={"acao": "reenviado", "expira_em": convite.expira_em.isoformat()},
    )
    await db.commit()
    await _enviar(db, current_user, convite, token)
    nomes = await svc.nomes_de_quem_convidou(db, current_user.tenant_id, {convite.criado_por} if convite.criado_por else set())
    return _response(convite, nomes)


@router.delete(
    "/{convite_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_group_permission(PermissionFeature.USUARIOS, "delete"))],
)
async def cancelar_convite(
    convite_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancela o convite: o link para de funcionar na hora. Recusado só sai da lista."""
    convite = await _convite(db, current_user, convite_id)
    _pode_mexer(current_user, convite)
    convite.revogado_em = datetime.now(timezone.utc)
    db.add(convite)
    await AuditService(db).log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type=RESOURCE,
        resource_id=convite.id,
        previous_state={"email": convite.email, "role": convite.role},
    )
    await db.commit()
