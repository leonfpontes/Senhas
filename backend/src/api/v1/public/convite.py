"""Convite da casa para a Área do Médium — lado público (AM-03).

- ``GET  /api/v1/public/convite/{token}``: o que a tela do convite mostra — nome e marca do
  terreiro (o mesmo subconjunto público do branding), primeiro nome do médium, e-mail
  mascarado e se já existe conta do painel com esse e-mail no terreiro (aí o aceite pede a
  senha dessa conta).
- ``POST /api/v1/public/convite/{token}/aceitar``: cria a conta `medium` (ou usa a conta do
  painel com a senha dela), grava o consentimento, liga `mediuns.user_id` e abre a sessão
  (cookies, `issue_session`). Uso único, com o convite travado (FOR UPDATE).

Token inválido, vencido, usado ou revogado → a MESMA resposta genérica (404
``CONVITE_INVALIDO``), sem dizer qual foi o caso. Rate limit por IP (`core/limiter.py`).
A busca pelo token é a "busca raiz" desta rota (o token é a chave; o tenant passa a ser o
do convite — exceção justificada em scripts/audit_tenant_isolation.py); toda query
seguinte filtra por ``convite.tenant_id``.
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.v1.auth.login import issue_session, login_user_payload
from src.core.database import get_db
from src.core.limiter import limiter
from src.core.logging import log_security_event
from src.core.public_links import public_tenant_logo_url
from src.core.config import settings
from src.models import Medium, MediumConvite, Tenant, User, UserRole
from src.security import hash_password, validate_password_policy, verify_password
from src.services import session_service
from src.services.audit_service import AuditService
from src.services.medium_area import BACKOFFICE_ROLES, compute_areas, tenant_has_area_medium
from src.services.medium_convite import (
    CONSENTIMENTO_AREA_VERSAO,
    convite_em_aberto,
    hash_token,
    marca_do_terreiro,
    mascarar_email,
    normalizar_email,
    primeiro_nome,
)

router = APIRouter(prefix="/api/v1/public/convite", tags=["public-convite"])
logger = logging.getLogger(__name__)

_DEFAULT_PRIMARY = "#6366f1"
_DEFAULT_SECONDARY = "#ec4899"

CONVITE_INVALIDO = {
    "message": "Este convite não vale mais. Peça um novo convite à casa.",
    "error_code": "CONVITE_INVALIDO",
}
AREA_INDISPONIVEL = {
    "message": "A Área do Médium não está disponível agora. Fale com a direção da casa.",
    "error_code": "AREA_INDISPONIVEL",
}
_JA_LIGADA = {
    "message": "Este e-mail já tem acesso à Área do Médium por outro cadastro. Fale com a direção da casa.",
    "error_code": "CONTA_JA_LIGADA",
}


class TerreiroConvite(BaseModel):
    nome: str
    slug: str


class MarcaConvite(BaseModel):
    logo_url: Optional[str] = None
    primary_color: str
    secondary_color: str
    font_color: Optional[str] = None


class ConvitePublicoResponse(BaseModel):
    terreiro: TerreiroConvite
    marca: MarcaConvite
    medium_primeiro_nome: str
    email_mascarado: str
    # Já existe conta do painel (admin/operador) com este e-mail no terreiro: o aceite
    # pede a senha dessa conta em vez de criar outra.
    conta_existente: bool
    expira_em: datetime
    consentimento_versao: str


class AceitarConviteRequest(BaseModel):
    senha: str = Field(..., min_length=1, max_length=128)
    aceite_termo: bool = False


class AceitarConviteResponse(BaseModel):
    redirect: str
    user: dict
    areas: dict


def _invalido() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=CONVITE_INVALIDO)


async def _convite_pelo_token(db: AsyncSession, token: str, travar: bool = False) -> Optional[MediumConvite]:
    """Busca raiz: o token (sha256) identifica o convite — e, por ele, o terreiro."""
    if not token or len(token) > 128:
        return None
    stmt = select(MediumConvite).where(MediumConvite.token_hash == hash_token(token))
    if travar:
        stmt = stmt.with_for_update()
    return (await db.execute(stmt)).scalar_one_or_none()


async def _resolver(db: AsyncSession, token: str, travar: bool = False) -> tuple[MediumConvite, Medium, Tenant]:
    """Convite em aberto + médium ativo ainda sem acesso + terreiro com a Área liberada."""
    convite = await _convite_pelo_token(db, token, travar)
    if convite is None or not convite_em_aberto(convite):
        raise _invalido()
    medium = (
        await db.execute(
            select(Medium).where(
                Medium.id == convite.medium_id,
                Medium.tenant_id == convite.tenant_id,
                Medium.deleted_at.is_(None),
                Medium.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    # Cadastro trocou de e-mail depois do convite: o link foi para outro endereço, não vale.
    if medium is None or medium.user_id is not None or normalizar_email(medium.email) != convite.email:
        raise _invalido()
    tenant = (await db.execute(select(Tenant).where(Tenant.id == convite.tenant_id))).scalar_one_or_none()
    if tenant is None or not tenant.is_active or tenant.deleted_at is not None:
        raise _invalido()
    if not await tenant_has_area_medium(db, tenant.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=AREA_INDISPONIVEL)
    return convite, medium, tenant


async def _conta_do_email(db: AsyncSession, convite: MediumConvite) -> Optional[User]:
    """Conta do terreiro com o e-mail do convite (ativa primeiro; senão a excluída mais antiga)."""
    return (
        await db.execute(
            select(User)
            .where(User.tenant_id == convite.tenant_id, func.lower(User.email) == convite.email)
            .order_by(User.deleted_at.is_not(None), User.created_at.asc())
            .limit(1)
        )
    ).scalars().first()


async def _ligada_a_outro_medium(db: AsyncSession, convite: MediumConvite, user: User) -> bool:
    return (
        await db.execute(
            select(Medium.id).where(
                Medium.tenant_id == convite.tenant_id,
                Medium.user_id == user.id,
                Medium.deleted_at.is_(None),
            )
        )
    ).first() is not None


def _e_conta_do_painel(user: Optional[User]) -> bool:
    return user is not None and user.deleted_at is None and user.role in BACKOFFICE_ROLES


@router.get("/{token}", response_model=ConvitePublicoResponse)
@limiter.limit("30/minute")
async def ver_convite(request: Request, token: str, db: AsyncSession = Depends(get_db)) -> ConvitePublicoResponse:
    convite, medium, tenant = await _resolver(db, token)
    _, config = await marca_do_terreiro(db, tenant.id)
    font_color = None
    if config is not None and isinstance(config.custom_settings, dict):
        fc = config.custom_settings.get("font_color")
        font_color = fc if isinstance(fc, str) else None
    return ConvitePublicoResponse(
        terreiro=TerreiroConvite(nome=tenant.name, slug=tenant.slug),
        marca=MarcaConvite(
            logo_url=public_tenant_logo_url(settings.FRONTEND_URL, config),
            primary_color=(config.primary_color if config and config.primary_color else _DEFAULT_PRIMARY),
            secondary_color=(config.secondary_color if config and config.secondary_color else _DEFAULT_SECONDARY),
            font_color=font_color,
        ),
        medium_primeiro_nome=primeiro_nome(medium.nome),
        email_mascarado=mascarar_email(convite.email),
        conta_existente=_e_conta_do_painel(await _conta_do_email(db, convite)),
        expira_em=convite.expira_em,
        consentimento_versao=CONSENTIMENTO_AREA_VERSAO,
    )


@router.post("/{token}/aceitar", response_model=AceitarConviteResponse)
@limiter.limit("10/minute")
async def aceitar_convite(
    request: Request,
    response: Response,
    token: str,
    body: AceitarConviteRequest,
    db: AsyncSession = Depends(get_db),
) -> AceitarConviteResponse:
    convite, medium, tenant = await _resolver(db, token, travar=True)
    if not body.aceite_termo:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "message": "Para ativar, marque que você autoriza a casa a usar seus dados nesta área.",
                "error_code": "TERMO_OBRIGATORIO",
            },
        )

    agora = datetime.now(timezone.utc)
    user = await _conta_do_email(db, convite)
    if _e_conta_do_painel(user):
        # Operador/admin que também é médium: mesma conta, prova com a senha que já usa.
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": "A conta deste e-mail está desativada. Fale com a direção da casa.",
                    "error_code": "CONTA_INATIVA",
                },
            )
        if not verify_password(body.senha, user.password_hash):
            log_security_event("medium_convite_aceite", success=False, user_id=user.id, details={"reason": "invalid_password"})
            # 400 (e não 401): no front, 401 dispara o fluxo de sessão expirada.
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": "Senha incorreta. Use a senha que você já usa para entrar no GiraHub.", "error_code": "SENHA_INCORRETA"},
            )
        if await _ligada_a_outro_medium(db, convite, user):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_JA_LIGADA)
    else:
        # Sem conta do painel: a pessoa cria a senha da Área. O convite prova a posse do
        # e-mail (como o "esqueci a senha"), então uma conta `medium` antiga (acesso tirado)
        # ou excluída deste e-mail volta com a senha nova — nunca ganha o painel.
        validate_password_policy(body.senha)
        if user is None:
            local = convite.email.split("@", 1)[0][:40]
            user = User(
                tenant_id=convite.tenant_id,
                email=convite.email,
                username=f"{local}.{secrets.token_hex(3)}",
                full_name=medium.nome,
                password_hash=hash_password(body.senha),
                role=UserRole.MEDIUM,
                is_active=True,
            )
            db.add(user)
        else:
            if user.deleted_at is None and await _ligada_a_outro_medium(db, convite, user):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_JA_LIGADA)
            if user.deleted_at is not None:
                user.full_name = medium.nome
                user.phone = None
                user.profile_photo_data = None
                user.profile_photo_url = None
                user.profile_photo_content_type = None
                user.deleted_at = None
            user.role = UserRole.MEDIUM
            user.password_hash = hash_password(body.senha)
            user.is_active = True
            user.reset_token_hash = None
            user.reset_token_expires_at = None
            # Sessões antigas desta conta caem; a nova (iat em segundos) continua valendo.
            user.sessions_revoked_at = agora.replace(microsecond=0)
            await session_service.end_all_sessions(db, user.id)
            db.add(user)

    try:
        await db.flush()
        medium.user_id = user.id
        medium.area_consentimento_em = agora
        medium.area_consentimento_versao = CONSENTIMENTO_AREA_VERSAO
        convite.usado_em = agora
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_JA_LIGADA)

    await AuditService(db).log_update(
        tenant_id=convite.tenant_id,
        user_id=user.id,
        resource_type="Medium",
        resource_id=medium.id,
        previous_state={"acesso_area": "convite_enviado"},
        new_state={"acesso_area": "ativo", "consentimento_versao": CONSENTIMENTO_AREA_VERSAO},
    )
    # Abre a sessão (cookies) e faz o commit de tudo.
    await issue_session(db, user, request, response)
    log_security_event("medium_convite_aceite", user_id=user.id, tenant_id=convite.tenant_id, success=True)

    return AceitarConviteResponse(
        redirect="/medium",
        user=login_user_payload(user),
        areas=await compute_areas(db, user),
    )
