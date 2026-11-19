"""Convite para entrar no painel do terreiro — lado público (11/2026).

- ``GET  /api/v1/public/convite-equipe/{token}``: o que a tela do convite mostra — nome e marca
  do terreiro, primeiro nome do convidado, quem convidou, tipo de acesso, e-mail mascarado e
  `situacao` da pessoa no GiraHub (decide o que a tela pede):
  ``nova`` (cria senha) · ``outra_casa`` (já tem conta ativa em outro terreiro: usa a mesma
  senha, ou cria outra só para esta casa) · ``medium_da_casa`` (conta da Área do Médium deste
  terreiro: a mesma conta ganha o painel, com a senha que já usa). Nunca diz EM QUAIS casas.
- ``POST /{token}/aceitar``: cria/reativa a conta, aplica tipo e perfil, grava o aceite dos
  Termos e da Privacidade e abre a sessão (cookies, `issue_session`). Uso único, com o convite
  travado (FOR UPDATE).
- ``POST /{token}/recusar``: "Não é para mim" — o link morre e a lista mostra "Recusado".

Token inválido, vencido, usado, cancelado ou recusado → a MESMA resposta genérica (404
``CONVITE_INVALIDO``). Rate limit por IP. A busca pelo token é a "busca raiz" (exceção
justificada em scripts/audit_tenant_isolation.py); toda query seguinte filtra por
``convite.tenant_id``.

Por que "a mesma senha": o login confere a senha em todas as contas do e-mail e só mostra
na escolha de terreiro/área as contas em que ela bateu (AM-05). Senha igual = tudo junto.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.v1.auth.login import active_login_accounts_stmt, issue_session, login_user_payload
from src.core.config import settings
from src.core.database import get_db
from src.core.legal_versions import DOCUMENTOS_DO_CADASTRO, LEGAL_VERSIONS
from src.core.limiter import get_client_ip, limiter
from src.core.logging import log_security_event
from src.core.public_links import public_tenant_logo_url
from src.models import LegalAcceptance, PermissionGroup, Tenant, User, UserGroupMembership, UserRole, UsuarioConvite
from src.repositories.permission_group_repo import PermissionGroupRepository
from src.security import hash_password, validate_password_policy, verify_password
from src.services import session_service
from src.services import usuario_convite as svc
from src.services.audit_service import AuditService
from src.services.medium_area import BACKOFFICE_ROLES, compute_areas

router = APIRouter(prefix="/api/v1/public/convite-equipe", tags=["public-convite-equipe"])
logger = logging.getLogger(__name__)

_DEFAULT_PRIMARY = "#2E6A4E"

CONVITE_INVALIDO = {
    "message": "Este convite não vale mais. Peça um novo convite à casa.",
    "error_code": "CONVITE_INVALIDO",
}

Situacao = Literal["nova", "outra_casa", "medium_da_casa", "ja_tem_acesso"]


class TerreiroConvite(BaseModel):
    nome: str
    slug: str


class MarcaConvite(BaseModel):
    logo_url: Optional[str] = None
    primary_color: str


class ConviteEquipePublico(BaseModel):
    terreiro: TerreiroConvite
    marca: MarcaConvite
    primeiro_nome: str
    convidou: Optional[str] = None
    role: str
    email_mascarado: str
    situacao: Situacao
    expira_em: datetime


class AceitarRequest(BaseModel):
    # `senha_existente`: a senha que a pessoa já usa (outra casa ou Área do Médium).
    # `senha_nova`: cria uma senha (conta nova, ou senha só para esta casa).
    modo: Literal["senha_existente", "senha_nova"]
    senha: str = Field(..., min_length=1, max_length=128)
    aceite_termos: bool = False


class AceitarResponse(BaseModel):
    redirect: str
    user: dict
    areas: dict


def _invalido() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=CONVITE_INVALIDO)


def _erro(code: int, message: str, error_code: str) -> HTTPException:
    return HTTPException(status_code=code, detail={"message": message, "error_code": error_code})


async def _convite_pelo_token(db: AsyncSession, token: str, travar: bool = False) -> Optional[UsuarioConvite]:
    """Busca raiz: o token (sha256) identifica o convite — e, por ele, o terreiro."""
    if not token or len(token) > 128:
        return None
    stmt = select(UsuarioConvite).where(UsuarioConvite.token_hash == svc.hash_token(token))
    if travar:
        stmt = stmt.with_for_update()
    return (await db.execute(stmt)).scalar_one_or_none()


async def _resolver(db: AsyncSession, token: str, travar: bool = False) -> tuple[UsuarioConvite, Tenant]:
    convite = await _convite_pelo_token(db, token, travar)
    if convite is None or not svc.valido(convite):
        raise _invalido()
    tenant = (await db.execute(select(Tenant).where(Tenant.id == convite.tenant_id))).scalar_one_or_none()
    if (
        tenant is None
        or not tenant.is_active
        or tenant.deleted_at is not None
        or tenant.self_deactivated_at is not None
    ):
        raise _invalido()
    if convite.role == UserRole.ADMIN.value:
        # Convite de administrador só vale enquanto quem convidou segue administrador ativo
        # da casa (perdeu o cargo ou saiu → o convite cai junto).
        quem = None
        if convite.criado_por is not None:
            quem = (
                await db.execute(
                    select(User).where(
                        User.id == convite.criado_por,
                        User.tenant_id == convite.tenant_id,
                        User.deleted_at.is_(None),
                        User.is_active.is_(True),
                    )
                )
            ).scalar_one_or_none()
        if quem is None or quem.role != UserRole.ADMIN:
            raise _invalido()
    return convite, tenant


async def _outras_contas(db: AsyncSession, convite: UsuarioConvite) -> list[User]:
    """Contas ATIVAS do e-mail em OUTROS terreiros (as do login). Sem a conta da plataforma."""
    contas = list((await db.execute(active_login_accounts_stmt(convite.email))).scalars().all())
    return [u for u in contas if u.tenant_id is not None and u.tenant_id != convite.tenant_id]


def _e_painel_ativo(user: Optional[User]) -> bool:
    return user is not None and user.deleted_at is None and user.role in BACKOFFICE_ROLES


async def _situacao(db: AsyncSession, convite: UsuarioConvite, conta: Optional[User]) -> Situacao:
    if _e_painel_ativo(conta):
        return "ja_tem_acesso"
    if conta is not None and conta.deleted_at is None and conta.role == UserRole.MEDIUM and conta.is_active:
        return "medium_da_casa"
    if await _outras_contas(db, convite):
        return "outra_casa"
    return "nova"


@router.get("/{token}", response_model=ConviteEquipePublico)
@limiter.limit("30/minute")
async def ver_convite(request: Request, token: str, db: AsyncSession = Depends(get_db)) -> ConviteEquipePublico:
    convite, tenant = await _resolver(db, token)
    _, config = await svc.marca_do_terreiro(db, tenant.id)
    conta = await svc.conta_do_email_no_tenant(db, tenant.id, convite.email)
    nomes = await svc.nomes_de_quem_convidou(db, tenant.id, {convite.criado_por} if convite.criado_por else set())
    return ConviteEquipePublico(
        terreiro=TerreiroConvite(nome=tenant.name, slug=tenant.slug),
        marca=MarcaConvite(
            logo_url=public_tenant_logo_url(settings.FRONTEND_URL, config),
            primary_color=(config.primary_color if config and config.primary_color else _DEFAULT_PRIMARY),
        ),
        primeiro_nome=svc.primeiro_nome(convite.nome),
        convidou=nomes.get(convite.criado_por) or None if convite.criado_por else None,
        role=convite.role,
        email_mascarado=svc.mascarar_email(convite.email),
        situacao=await _situacao(db, convite, conta),
        expira_em=convite.expira_em,
    )


async def _aplicar_perfil(db: AsyncSession, convite: UsuarioConvite, user: User) -> None:
    """Admin sai de todo grupo; operador entra no perfil do convite (ou no padrão, Q-05)."""
    repo = PermissionGroupRepository(db)
    await repo.remove_all_memberships(user.id, convite.tenant_id)
    if user.role != UserRole.OPERATOR:
        return
    group = None
    if convite.group_id is not None:
        group = (
            await db.execute(
                select(PermissionGroup).where(
                    PermissionGroup.id == convite.group_id,
                    PermissionGroup.tenant_id == convite.tenant_id,
                    PermissionGroup.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
    if group is None:
        await repo.assign_default_group_if_groupless(user)
        return
    db.add(UserGroupMembership(group_id=group.id, user_id=user.id, tenant_id=convite.tenant_id))
    await db.flush()


async def _gravar_aceite_legal(db: AsyncSession, request: Request, convite: UsuarioConvite, user: User) -> None:
    """Prova do aceite (LGPD art. 8º §2º) das versões vigentes que a conta ainda não aceitou."""
    ja = {
        (d, v)
        for d, v in (
            await db.execute(
                select(LegalAcceptance.document, LegalAcceptance.version).where(
                    LegalAcceptance.user_id == user.id,
                    LegalAcceptance.tenant_id == convite.tenant_id,
                )
            )
        ).all()
    }
    user_agent = (request.headers.get("user-agent") or "")[:255] or None
    ip = (get_client_ip(request) or "")[:45] or None
    for documento in DOCUMENTOS_DO_CADASTRO:
        if (documento, LEGAL_VERSIONS[documento]) in ja:
            continue
        db.add(
            LegalAcceptance(
                tenant_id=convite.tenant_id,
                user_id=user.id,
                document=documento,
                version=LEGAL_VERSIONS[documento],
                ip_address=ip,
                user_agent=user_agent,
            )
        )


@router.post("/{token}/aceitar", response_model=AceitarResponse)
@limiter.limit("10/minute")
async def aceitar_convite(
    request: Request,
    response: Response,
    token: str,
    body: AceitarRequest,
    db: AsyncSession = Depends(get_db),
) -> AceitarResponse:
    convite, tenant = await _resolver(db, token, travar=True)
    if not body.aceite_termos:
        raise _erro(
            422,
            "Para aceitar, marque que você leu e aceita os Termos de Uso e a Política de Privacidade.",
            "TERMOS_OBRIGATORIOS",
        )

    agora = datetime.now(timezone.utc)
    conta = await svc.conta_do_email_no_tenant(db, tenant.id, convite.email)
    if _e_painel_ativo(conta):
        raise _erro(
            409,
            "Você já tem acesso a este terreiro. Entre com seu e-mail e a sua senha.",
            "JA_TEM_ACESSO",
        )

    verificadas: list[User] = []
    medium_ativo = conta is not None and conta.deleted_at is None and conta.role == UserRole.MEDIUM and conta.is_active

    if medium_ativo:
        # Médium desta casa: a MESMA conta ganha o painel; prova com a senha que já usa.
        if not verify_password(body.senha, conta.password_hash):
            log_security_event("usuario_convite_aceite", success=False, user_id=conta.id, details={"reason": "invalid_password"})
            # 400 (e não 401): no front, 401 dispara o fluxo de sessão expirada.
            raise _erro(400, "Senha incorreta. Use a senha que você já usa na Área do Médium.", "SENHA_INCORRETA")
        user = conta
        password_hash = None
    elif body.modo == "senha_existente":
        outras = await _outras_contas(db, convite)
        verificadas = [u for u in outras if verify_password(body.senha, u.password_hash)]
        if not verificadas:
            log_security_event("usuario_convite_aceite", success=False, details={"reason": "invalid_password"})
            raise _erro(400, "Senha incorreta. Use a senha que você já usa para entrar no GiraHub.", "SENHA_INCORRETA")
        # Mesmo hash: o login seguinte confere nas duas contas e mostra a escolha de terreiro.
        password_hash = verificadas[0].password_hash
        user = conta
    else:
        validate_password_policy(body.senha)
        password_hash = hash_password(body.senha)
        user = conta

    if user is None:
        user = User(
            tenant_id=tenant.id,
            email=convite.email,
            username=convite.nome,
            full_name=convite.nome,
            password_hash=password_hash,
            role=UserRole(convite.role),
            is_active=True,
        )
        db.add(user)
    else:
        previous_role = user.role
        if user.deleted_at is not None:
            # Conta excluída antes: volta limpa (sem foto nem dados antigos).
            user.username = convite.nome
            user.full_name = convite.nome
            user.phone = None
            user.profile_photo_data = None
            user.profile_photo_url = None
            user.profile_photo_content_type = None
            user.deleted_at = None
        if password_hash is not None:
            user.password_hash = password_hash
            user.reset_token_hash = None
            user.reset_token_expires_at = None
            # Sessões antigas desta conta caem; a nova (iat em segundos) continua valendo.
            user.sessions_revoked_at = agora.replace(microsecond=0)
            await session_service.end_all_sessions(db, user.id)
        user.role = UserRole(convite.role)
        user.is_active = True
        user.updated_at = agora
        db.add(user)
        logger.info("Convite %s: conta %s de %s para %s", convite.id, user.id, previous_role.value, convite.role)

    try:
        await db.flush()
        await _aplicar_perfil(db, convite, user)
        await _gravar_aceite_legal(db, request, convite, user)
        convite.usado_em = agora
        convite.user_id = user.id
        db.add(convite)
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise _erro(409, "Não foi possível aceitar agora. Tente de novo em instantes.", "CONFLITO")

    audit = AuditService(db)
    await audit.log_create(
        tenant_id=tenant.id,
        user_id=user.id,
        resource_type="User",
        resource_id=user.id,
        details={"email": convite.email, "role": convite.role, "via": "convite", "convite_id": str(convite.id)},
    )
    await audit.log_update(
        tenant_id=tenant.id,
        user_id=user.id,
        resource_type="UsuarioConvite",
        resource_id=convite.id,
        previous_state={"situacao": "enviado"},
        new_state={"situacao": "aceito"},
    )

    verified: dict[uuid.UUID, datetime] = {user.id: agora}
    for u in verificadas:
        verified[u.id] = agora
    await issue_session(db, user, request, response, verified_accounts=verified)
    log_security_event("usuario_convite_aceite", user_id=user.id, tenant_id=tenant.id, success=True)

    areas = await compute_areas(db, user)
    return AceitarResponse(
        redirect="/escolher-area" if areas.get("admin") and areas.get("medium") else "/admin",
        user=login_user_payload(user),
        areas=areas,
    )


@router.post("/{token}/recusar", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
async def recusar_convite(request: Request, token: str, db: AsyncSession = Depends(get_db)):
    """"Não é para mim": o link deixa de valer e a casa vê "Recusado" na lista."""
    convite = await _convite_pelo_token(db, token, travar=True)
    if convite is None or not svc.valido(convite):
        raise _invalido()
    convite.recusado_em = datetime.now(timezone.utc)
    db.add(convite)
    await db.commit()
    log_security_event("usuario_convite_recusa", tenant_id=convite.tenant_id, success=True)
