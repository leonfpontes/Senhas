"""Authentication API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
import logging
import secrets
import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from src.core.database import get_db
from src.core.errors import ValidationError, UnauthorizedError, NotFoundError, InsufficientPermissionsError, InvalidTokenError
from src.core.config import DUMMY_BCRYPT_HASH, settings
from src.models import User, Tenant, TenantConfig
from src.api.dependencies import get_current_user
from src.security.jwt import create_account_select_token, decode_account_select_token
from src.core.public_links import public_tenant_logo_url
from src.security import (
    hash_password,
    verify_password,
    validate_password_policy,
    create_access_token,
    create_refresh_token,
    decode_token,
    AccessToken,
)
from src.core.limiter import limiter
from src.core.logging import log_security_event
from src.services import session_service
from src.core.auth_cookies import clear_auth_cookies, is_impersonated_request, set_auth_cookies
from src.services.medium_area import compute_areas
from sqlalchemy import case, func, select

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    """Login request payload."""

    email: EmailStr
    password: str
    # "Lembrar-me": False → cookies de sessão (somem ao fechar o navegador).
    remember_me: bool = True


def normalize_login_email(email: str) -> str:
    """E-mail de login comparado sem diferença de maiúsculas.

    EmailStr só baixa o domínio; "Maria@x.com" e "maria@x.com" eram contas
    diferentes no login/esqueci a senha/cadastro. Gravação nova vai em
    minúsculas e as buscas usam func.lower(User.email) — cobre também as
    linhas antigas gravadas com maiúsculas, sem migração.
    """
    return email.strip().lower()


def user_by_login_email_stmt(email: str):
    """SELECT de UMA conta pelo e-mail de login: ignora maiúsculas e, se o mesmo
    e-mail existir em mais de um terreiro, fica com a conta ativa (usuário ativo
    num terreiro não desativado) e, entre elas, a mais antiga.

    Desde o AM-05 o login e o esqueci a senha olham TODAS as contas ativas
    (active_login_accounts_stmt); esta regra de conta única ficou para a
    reativação (/auth/reactivate-account) e para o login quando não há nenhuma
    conta ativa (conta inativa / terreiro desativado — "Deseja reativá-la?").

    Conta inativa só é escolhida quando não há nenhuma ativa. Antes ganhava
    sempre a mais antiga: quem tinha desativado um terreiro de teste e depois
    virou médium/operador de outro com o mesmo e-mail caía no "Deseja
    reativá-la?" do terreiro velho — e reativava sem querer."""
    conta_ativa = (User.is_active.is_(True)) & (Tenant.self_deactivated_at.is_(None))
    return (
        select(User)
        .outerjoin(Tenant, Tenant.id == User.tenant_id)
        .where((func.lower(User.email) == normalize_login_email(email)) & (User.deleted_at.is_(None)))
        .order_by(case((conta_ativa, 0), else_=1), User.created_at.asc())
        .limit(1)
    )


# Teto de contas conferidas por login (AM-05): cada uma custa um bcrypt (~100 ms).
# O número de verificações = número de contas ativas com o e-mail (no máximo 5);
# e-mail sem conta ativa custa 1 verificação (a real da conta inativa ou a
# falsa contra DUMMY_BCRYPT_HASH). Acima de 5 contas, as mais novas ficam de
# fora do login (ordem: mais antiga primeiro, como em user_by_login_email_stmt).
MAX_LOGIN_ACCOUNTS = 5


def active_login_accounts_stmt(email: str, limit: int = MAX_LOGIN_ACCOUNTS):
    """SELECT das contas ATIVAS com o e-mail de login (AM-05), mais antigas primeiro.

    "Ativa" = a mesma noção do user_by_login_email_stmt: usuário ativo e não
    excluído, num terreiro não desativado pelo próprio dono e não excluído
    (super admin, sem terreiro, também conta). Usado pelo login (confere a
    senha em cada uma) e pelo esqueci a senha (um link por conta)."""
    return (
        select(User)
        .outerjoin(Tenant, Tenant.id == User.tenant_id)
        .where(
            (func.lower(User.email) == normalize_login_email(email))
            & (User.deleted_at.is_(None))
            & (User.is_active.is_(True))
            & (Tenant.self_deactivated_at.is_(None))
            & (Tenant.deleted_at.is_(None))
        )
        .order_by(User.created_at.asc(), User.id.asc())
        .limit(limit)
    )


def matching_accounts(password: str, candidates: list[User]) -> list[User]:
    """Contas cuja senha confere. Confere TODAS (sem parar na primeira), para o
    custo depender só do número de contas, não de qual conferiu. Sem conta
    nenhuma, faz uma verificação falsa: "e-mail não existe" custa o mesmo que
    "senha errada" numa conta só."""
    if not candidates:
        verify_password(password, DUMMY_BCRYPT_HASH)
        return []
    return [u for u in candidates if verify_password(password, u.password_hash)]


def login_user_payload(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "username": user.username,
        "role": user.role.value,
        "tenant_id": str(user.tenant_id) if user.tenant_id else None,
    }


async def issue_session(
    db: AsyncSession,
    user: User,
    request: Request | None,
    response: Response,
    persistent: bool = True,
) -> str:
    """Abre a sessão do usuário: UserSession (rotação/revogação do refresh),
    tokens e os 3 cookies. Usado por login, cadastro e reativação. Faz commit.
    Retorna o access_token (também devolvido no corpo, por compatibilidade)."""
    user_agent = request.headers.get("user-agent") if request is not None else None
    session_id, jti = await session_service.start_session(db, user, user_agent=user_agent)
    access_token = create_access_token(user.id, user.tenant_id, user.role.value)
    refresh_token = create_refresh_token(
        user.id, user.tenant_id, user.role.value, session_id, jti, persistent=persistent
    )
    await db.commit()
    set_auth_cookies(response, access_token, refresh_token, persistent=persistent)
    return access_token


class LoginResponse(BaseModel):
    """Login response payload."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int = 86400  # 24 hours
    user: dict
    # Áreas que a conta acessa (AM-02): {"admin": bool, "medium": {medium_id, nome} | None}.
    # Calculadas no servidor (nunca no JWT) — ver src/services/medium_area.py.
    areas: dict | None = None


class AccountOptionAreas(BaseModel):
    admin: bool
    medium: bool


class AccountOption(BaseModel):
    """Um terreiro em que a senha conferiu (AM-05). Só o que a tela de escolha mostra:
    nome, slug e logo (os mesmos dados públicos do branding) e as áreas da conta."""

    user_id: str
    terreiro_nome: str
    terreiro_slug: str | None = None
    logo_url: str | None = None
    areas: AccountOptionAreas


class AccountChoiceResponse(BaseModel):
    """Senha conferiu em mais de uma conta (AM-05): a pessoa escolhe o terreiro e o
    front chama POST /auth/login/select. Nenhum cookie é setado nesta resposta."""

    choose_account: bool = True
    selection_token: str
    options: list[AccountOption]


# Nome mostrado quando a conta não é de terreiro (super admin da plataforma).
PLATFORM_ACCOUNT_LABEL = "Plataforma GiraHub"


async def account_option(db: AsyncSession, user: User) -> AccountOption:
    """Opção de escolha para uma conta cuja senha já conferiu."""
    tenant = await db.get(Tenant, user.tenant_id) if user.tenant_id is not None else None
    logo_url = None
    if tenant is not None:
        config = (
            await db.execute(select(TenantConfig).where(TenantConfig.tenant_id == tenant.id))
        ).scalar_one_or_none()
        logo_url = public_tenant_logo_url(settings.FRONTEND_URL, config)
    areas = await compute_areas(db, user)
    return AccountOption(
        user_id=str(user.id),
        terreiro_nome=tenant.name if tenant is not None else PLATFORM_ACCOUNT_LABEL,
        terreiro_slug=tenant.slug if tenant is not None else None,
        logo_url=logo_url,
        areas=AccountOptionAreas(admin=bool(areas.get("admin")), medium=bool(areas.get("medium"))),
    )


async def _open_login_session(
    db: AsyncSession,
    user: User,
    request: Request,
    response: Response,
    persistent: bool,
    via: str | None = None,
) -> LoginResponse:
    """Abre a sessão de UMA conta já autenticada (login direto ou após a escolha)."""
    # The refresh token is bound to a new UserSession row so it can be
    # rotated/revoked server-side (see src/services/session_service.py).
    # Access/refresh em cookies HttpOnly + auth_state legível pelo JS; com
    # "Lembrar-me" desmarcado viram cookies de sessão (src/core/auth_cookies.py).
    access_token = await issue_session(db, user, request, response, persistent=persistent)
    log_security_event(
        "login",
        user_id=user.id,
        tenant_id=user.tenant_id,
        success=True,
        details={"via": via} if via else None,
    )
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=24 * 60 * 60,  # 24 hours
        user=login_user_payload(user),
        areas=await compute_areas(db, user),
    )


async def _reject_without_active_account(db: AsyncSession, credentials: "LoginRequest") -> None:
    """Login sem nenhuma conta ativa com o e-mail: sempre levanta 401.

    Conta escolhida pela regra do #85 (user_by_login_email_stmt — a mais antiga
    entre as inativas). Custa sempre 1 bcrypt, como o caminho de senha errada.
    """
    user = (await db.execute(user_by_login_email_stmt(credentials.email))).scalar_one_or_none()

    if not user:
        # Run a dummy bcrypt verification to normalise response time and prevent
        # user enumeration via timing side-channel (real verify takes ~100ms).
        verify_password(credentials.password, DUMMY_BCRYPT_HASH)
        log_security_event("login", success=False, details={"reason": "user_not_found", "email": credentials.email})
        raise UnauthorizedError("Credenciais inválidas")

    # Conta inativa tem duas causas possíveis: suspensão administrativa comum
    # (um admin desativou este usuário — resposta genérica, como sempre) ou o
    # terreiro foi desativado pelo próprio dono via POST /auth/deactivate-account
    # (reversível — ver deactivation.py). O segundo caso só é revelado *depois*
    # de conferir a senha real, para que quem não tem a senha não use este
    # endpoint como oráculo de "este terreiro está desativado".
    tenant_deactivated = False
    if user.tenant_id is not None:
        tenant = await db.get(Tenant, user.tenant_id)
        # Deliberately keyed off this dedicated column alone (not
        # is_active/deleted_at), which only the self-deactivation flow
        # ever sets — avoids sharing a signature with unrelated tenant
        # states (e.g. a future platform-side suspension/hold).
        tenant_deactivated = bool(tenant and tenant.self_deactivated_at is not None)

    if tenant_deactivated:
        if not verify_password(credentials.password, user.password_hash):
            log_security_event("login", success=False, user_id=user.id, details={"reason": "invalid_password"})
            raise UnauthorizedError("Credenciais inválidas")
        log_security_event("login", success=False, user_id=user.id, details={"reason": "tenant_deactivated"})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "message": "Esta conta está desativada. Deseja reativá-la?",
                "error_code": "TENANT_DEACTIVATED",
            },
        )

    # Ordinary administrative suspension — unchanged: consume bcrypt time
    # without checking the real password, keep the response generic.
    verify_password(credentials.password, DUMMY_BCRYPT_HASH)
    log_security_event("login", success=False, user_id=user.id, details={"reason": "inactive"})
    raise UnauthorizedError("Credenciais inválidas")


@router.post("/login", response_model=LoginResponse | AccountChoiceResponse)
@limiter.limit("10/minute")
async def login(
    credentials: LoginRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """POST /api/v1/auth/login - Authenticate user and return tokens.

    Rate-limited per client IP (anti credential stuffing) — the app-level
    limit mirrors nginx's login_limit zone as defense in depth.

    O mesmo e-mail pode ter conta em vários terreiros (usuário é único por
    tenant + e-mail). AM-05: a senha é conferida em TODAS as contas ativas com
    o e-mail (no máximo MAX_LOGIN_ACCOUNTS, mais antigas primeiro):
    - nenhuma conta ativa → regra do #85 (conta inativa / terreiro desativado
      com "Deseja reativá-la?" / 401 genérico), com 1 bcrypt;
    - senha confere em nenhuma → 401 "Credenciais inválidas";
    - confere em uma → sessão aberta nela (cookies, `areas`), como sempre;
    - confere em mais de uma → 200 `AccountChoiceResponse` SEM cookies; a
      escolha segue em POST /auth/login/select. Só entram na lista os
      terreiros em que a senha conferiu (anti-enumeração).

    Custo: uma verificação bcrypt por conta ativa (máx. 5) — "e-mail não
    existe" e "senha errada numa conta" custam o mesmo (1 verificação).
    """
    candidates = list((await db.execute(active_login_accounts_stmt(credentials.email))).scalars().all())
    if not candidates:
        await _reject_without_active_account(db, credentials)

    matched = matching_accounts(credentials.password, candidates)

    if not matched:
        log_security_event(
            "login", success=False, user_id=candidates[0].id if len(candidates) == 1 else None,
            details={"reason": "invalid_password", "accounts": len(candidates)},
        )
        raise UnauthorizedError("Credenciais inválidas")

    if len(matched) == 1:
        return await _open_login_session(db, matched[0], request, response, persistent=credentials.remember_me)

    options = [await account_option(db, u) for u in matched]
    log_security_event("login_account_choice", success=True, details={"accounts": len(matched)})
    return AccountChoiceResponse(
        selection_token=create_account_select_token([u.id for u in matched], credentials.remember_me),
        options=options,
    )


class LoginSelectRequest(BaseModel):
    """Escolha do terreiro depois de um login com mais de uma conta (AM-05)."""

    selection_token: str
    user_id: uuid.UUID


SELECTION_INVALID_MESSAGE = "O tempo para escolher o terreiro acabou. Entre de novo com seu e-mail e senha."


def _selection_invalid() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"message": SELECTION_INVALID_MESSAGE, "error_code": "SELECTION_INVALID"},
    )


def selection_revoked(selection_iat: datetime, sessions_revoked_at: datetime | None) -> bool:
    """Troca/redefinição de senha (ou "sair de todos") depois da emissão do token
    de escolha invalida o token. O `iat` do JWT vem em segundos inteiros."""
    if sessions_revoked_at is None:
        return False
    revoked_at = sessions_revoked_at if sessions_revoked_at.tzinfo else sessions_revoked_at.replace(tzinfo=timezone.utc)
    return selection_iat < revoked_at.replace(microsecond=0)


@router.post("/login/select", response_model=LoginResponse)
@limiter.limit("10/minute")
async def login_select(
    body: LoginSelectRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """POST /api/v1/auth/login/select — abre a sessão no terreiro escolhido (AM-05).

    Público (está em `public_paths` do jwt_middleware) e com rate limit por IP.
    Exige o `selection_token` do /auth/login (`type=account_select`, 5 min) e um
    `user_id` da lista dele; a conta precisa continuar ativa (usuário ativo e não
    excluído, terreiro não desativado) e sem revogação de sessões depois da
    emissão do token (troca/redefinição de senha). Depois disso, mesma sessão
    do login direto: `issue_session` (3 cookies, "Lembrar-me" do login),
    `areas` e evento de segurança. Não é de uso único — só expira.
    Qualquer recusa → 401 `SELECTION_INVALID` (a tela volta ao e-mail e senha).
    """
    try:
        selection = decode_account_select_token(body.selection_token)
    except InvalidTokenError:
        log_security_event("login", success=False, details={"reason": "selection_token_invalid"})
        raise _selection_invalid()

    if body.user_id not in selection.user_ids:
        log_security_event("login", success=False, details={"reason": "selection_user_not_allowed"})
        raise _selection_invalid()

    user = (
        await db.execute(
            select(User)
            .outerjoin(Tenant, Tenant.id == User.tenant_id)
            .where(
                (User.id == body.user_id)
                & (User.deleted_at.is_(None))
                & (User.is_active.is_(True))
                & (Tenant.self_deactivated_at.is_(None))
                & (Tenant.deleted_at.is_(None))
            )
        )
    ).scalar_one_or_none()
    if user is None:
        log_security_event("login", success=False, user_id=body.user_id, details={"reason": "selection_account_inactive"})
        raise _selection_invalid()

    if selection_revoked(selection.iat, user.sessions_revoked_at):
        log_security_event("login", success=False, user_id=user.id, details={"reason": "selection_revoked"})
        raise _selection_invalid()

    return await _open_login_session(
        db, user, request, response, persistent=selection.remember_me, via="account_select"
    )



class RefreshRequest(BaseModel):
    """Refresh token request."""
    
    pass  # Token comes from cookie


class RefreshResponse(BaseModel):
    """Refresh token response."""
    
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 86400


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_token(
    request_obj: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """POST /api/v1/auth/refresh - Renova access_token usando o refresh_token do cookie.

    Lê o cookie HttpOnly 'refresh_token', valida, busca o usuário no banco e emite
    um novo access_token + rotaciona o refresh_token (com detecção de reuso — ver
    src/services/session_service.py — e teto absoluto de MAX_SESSION_DAYS).
    """
    from src.security.jwt import decode_refresh_token

    raw_refresh = request_obj.cookies.get("refresh_token")
    if not raw_refresh:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="refresh_token não encontrado")

    try:
        payload = decode_refresh_token(raw_refresh)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="refresh_token inválido ou expirado")

    # Valida que o usuário ainda existe, está ativo e não foi excluído
    stmt = select(User).where(User.id == uuid.UUID(payload.sub))
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user or not user.is_active or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário inativo ou não encontrado")

    # Troca de senha / "logout em todos os dispositivos" invalida qualquer token
    # emitido antes desse timestamp, mesmo que ainda esteja dentro da validade.
    if user.sessions_revoked_at is not None:
        token_iat = payload.iat if payload.iat.tzinfo else payload.iat.replace(tzinfo=timezone.utc)
        revoked_at = user.sessions_revoked_at if user.sessions_revoked_at.tzinfo else user.sessions_revoked_at.replace(tzinfo=timezone.utc)
        if token_iat < revoked_at:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão revogada")

    if payload.session_id and payload.jti:
        rotation = await session_service.rotate_session(
            db, user.id, uuid.UUID(payload.session_id), uuid.UUID(payload.jti)
        )
        if not rotation.ok:
            await db.commit()  # persist the revoke (delete) from rotate_session
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="refresh_token inválido ou expirado")
        session_id, new_jti = uuid.UUID(payload.session_id), rotation.new_jti
    else:
        # Legacy refresh token issued before rotation tracking existed — upgrade
        # it transparently to a tracked session instead of forcing a re-login.
        session_id, new_jti = await session_service.start_session(
            db, user, user_agent=request_obj.headers.get("user-agent")
        )

    # Emite novos tokens — no mesmo modo ("Lembrar-me") do login original.
    persistent = getattr(payload, "persistent", True) is not False
    new_access = create_access_token(user.id, user.tenant_id, user.role.value)
    new_refresh = create_refresh_token(
        user.id, user.tenant_id, user.role.value, session_id, new_jti, persistent=persistent
    )
    await db.commit()

    set_auth_cookies(response, new_access, new_refresh, persistent=persistent)

    log_security_event("token_refresh", user_id=user.id, tenant_id=user.tenant_id, success=True)

    return RefreshResponse(access_token=new_access, token_type="bearer",
                           expires_in=settings.ACCESS_TOKEN_EXPIRE_HOURS * 3600)


@router.post("/logout")
async def logout(request_obj: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """POST /api/v1/auth/logout - Logout user and clear refresh token.

    Clears the auth cookies client-side and, best-effort, revokes the
    matching UserSession row server-side (this device only — other devices
    keep working, see /logout-all for revoking everything).

    Args:
        request_obj: HTTP request (to read the refresh_token cookie)
        response: HTTP response
        db: Database session

    Returns:
        Success message
    """
    from src.security.jwt import decode_refresh_token

    raw_refresh = request_obj.cookies.get("refresh_token")
    if raw_refresh:
        try:
            payload = decode_refresh_token(raw_refresh)
            if payload.session_id:
                await session_service.end_session(db, uuid.UUID(payload.sub), uuid.UUID(payload.session_id))
                await db.commit()
        except Exception:
            pass  # Best-effort: an already-invalid/expired token has nothing to revoke.

    clear_auth_cookies(response)

    log_security_event("logout", success=True)

    return {"message": "Logout realizado com sucesso"}


@router.post("/logout-all")
async def logout_all(
    request_obj: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """POST /api/v1/auth/logout-all - Revoke every session for the current user.

    Ends all other devices/tabs immediately (their next request is rejected —
    see get_current_user's sessions_revoked_at check — no need to wait for
    their refresh token to be used), and clears cookies for this device too.
    Intended for a lost/stolen device or "sign out everywhere" in account settings.

    Blocked during impersonation (403): it would revoke the tenant user's real
    sessions and wipe the super-admin's own cookies in that browser.
    """
    if is_impersonated_request(request_obj):
        raise InsufficientPermissionsError("Operação não permitida durante impersonação.")

    current_user.sessions_revoked_at = datetime.now(timezone.utc)
    db.add(current_user)
    await session_service.end_all_sessions(db, current_user.id)
    await db.commit()

    clear_auth_cookies(response)

    log_security_event("logout_all", user_id=current_user.id, tenant_id=current_user.tenant_id, success=True)

    return {"message": "Todas as sessões foram encerradas"}


@router.get("/me")
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """GET /api/v1/auth/me - Return current authenticated user info.

    `areas` (AM-02): admin (papel admin/operator) e médium (vínculo ativo + plano
    com area_medium), recalculadas a cada chamada.
    """
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "username": current_user.username,
        "role": current_user.role.value,
        "tenant_id": str(current_user.tenant_id) if current_user.tenant_id else None,
        "is_active": current_user.is_active,
        "created_at": current_user.created_at.isoformat(),
        "full_name": current_user.full_name,
        "phone": current_user.phone,
        "profile_photo_url": current_user.profile_photo_url,
        "areas": await compute_areas(db, current_user),
    }


# ---------------------------------------------------------------------------
# Password Reset
# ---------------------------------------------------------------------------

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
@limiter.limit("5/hour")
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """POST /api/v1/auth/forgot-password — Request a password reset link.

    Always returns the same generic message to prevent user enumeration.
    Rate-limited per client IP (anti e-mail bombing / enumeration).
    E-mail com conta ativa em mais de um terreiro (AM-05): um e-mail só, com
    um link por terreiro (um token por conta).
    """
    from src.services.email.brevo_provider import BrevoEmailService
    from src.services.email.resend_fallback import ResendEmailService
    from src.services.email.base import EmailMessage
    from src.services.email.templates.password_reset import (
        render_password_reset_email,
        render_password_reset_multi_email,
    )

    # Mesma regra do login: e-mail sem diferença de maiúsculas, só contas
    # ATIVAS (usuário ativo num terreiro não desativado), mais antigas primeiro,
    # no máximo MAX_LOGIN_ACCOUNTS. Uma conta → o e-mail de sempre. Mais de uma
    # (AM-05) → UM e-mail listando cada terreiro com o link da própria conta
    # (cada conta tem o seu reset_token_hash; o /reset-password já é por token).
    accounts = list((await db.execute(active_login_accounts_stmt(body.email))).scalars().all())

    if accounts:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        links: list[tuple[User, str]] = []
        for account in accounts:
            raw_token = secrets.token_urlsafe(32)
            account.reset_token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
            account.reset_token_expires_at = expires_at
            links.append((account, f"{settings.FRONTEND_URL}/reset-password?token={raw_token}"))
        await db.commit()

        first = accounts[0]
        display_name = first.full_name or first.username
        if len(links) == 1:
            reset_url = links[0][1]
            html_body = render_password_reset_email(reset_url, display_name)
            text_body = f"Acesse o link para redefinir sua senha: {reset_url}"
        else:
            named: list[tuple[str, str]] = []
            for account, url in links:
                tenant = await db.get(Tenant, account.tenant_id) if account.tenant_id is not None else None
                named.append((tenant.name if tenant is not None else PLATFORM_ACCOUNT_LABEL, url))
            html_body = render_password_reset_multi_email(named, display_name)
            text_body = (
                "Seu e-mail tem conta em mais de um terreiro no GiraHub. "
                "Cada link redefine a senha de uma conta só:\n"
                + "\n".join(f"- {nome}: {url}" for nome, url in named)
            )
        msg = EmailMessage(
            to_email=first.email,
            subject="Redefinição de senha — GiraHub",
            html_body=html_body,
            text_body=text_body,
        )

        # Resend é o provedor primário do GiraHub; se falhar (chave inválida,
        # domínio não verificado, indisponibilidade), cai para o Brevo antes de
        # desistir — sem isso o usuário nunca recebe o link e a falha fica só
        # no log. Mesmo padrão usado em profile.py (e-mail de exclusão de conta)
        # e onboarding.py (e-mail de boas-vindas).
        sent = False
        try:
            sent = await ResendEmailService().send_async(msg)
        except Exception as exc:
            logger.warning("Resend forgot-password email failed for user %s: %s", first.id, exc)

        if not sent:
            try:
                sent = await BrevoEmailService().send_async(msg)
            except Exception as exc:
                logger.warning("Brevo forgot-password email failed for user %s: %s", first.id, exc)

        for account in accounts:
            log_security_event(
                "forgot_password",
                user_id=account.id,
                success=sent,
                details=None if sent else {"reason": "email_send_failed"},
            )

    return {"message": "Se o e-mail estiver cadastrado, você receberá as instruções em breve."}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
@limiter.limit("10/hour")
async def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """POST /api/v1/auth/reset-password — Set a new password using a reset token.

    Rate-limited per client IP (anti token brute-force).
    """
    from sqlalchemy import select

    token_hash = hashlib.sha256(body.token.encode()).hexdigest()

    stmt = select(User).where(
        (User.reset_token_hash == token_hash) & (User.deleted_at.is_(None))
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Token inválido.", "error_code": "INVALID_TOKEN"},
        )

    now = datetime.now(timezone.utc)
    expires = user.reset_token_expires_at
    if expires is None or (expires.tzinfo is None and expires.replace(tzinfo=timezone.utc) < now) or (expires.tzinfo is not None and expires < now):
        user.reset_token_hash = None
        user.reset_token_expires_at = None
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Token expirado.", "error_code": "EXPIRED_TOKEN"},
        )

    # Validate password policy (raises ValidationError with PT-BR messages)
    validate_password_policy(body.new_password)

    user.password_hash = hash_password(body.new_password)
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    # A forgotten-password reset is often triggered *because* the account may
    # be compromised — revoke every existing session, not just future ones.
    user.sessions_revoked_at = datetime.now(timezone.utc)
    await session_service.end_all_sessions(db, user.id)
    await db.commit()

    log_security_event("reset_password", user_id=user.id, success=True)

    return {"message": "Senha redefinida com sucesso."}
