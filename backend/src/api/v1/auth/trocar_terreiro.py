"""Trocar de terreiro sem sair da conta (pedido do dono, 2026-10-09).

Quem tem conta com o mesmo e-mail em mais de um terreiro (AM-05) troca de terreiro pelo menu,
sem sair e entrar de novo:

- `GET  /api/v1/auth/minhas-contas` — as OUTRAS contas ativas do e-mail da conta logada (mesma
  noção do login: `active_login_accounts_stmt`, máx. `MAX_LOGIN_ACCOUNTS`), cada uma com
  `precisa_senha`.
- `POST /api/v1/auth/trocar-terreiro` `{conta_id, senha?}` — encerra a sessão atual (como o
  logout) e abre a da conta escolhida (`issue_session`, 3 cookies), com a mesma resposta do login.

Segurança — contas de terreiros diferentes podem ter senhas DIFERENTES, e o login só abre as
contas cuja senha conferiu. Então a troca nunca abre uma conta cuja senha não foi conferida:

- As contas conferidas ficam na LINHA DA SESSÃO (`user_sessions.verified_accounts`, servidor),
  gravadas no login (as que a senha abriu) e herdadas pela sessão aberta na troca. A sessão
  atual é achada pelo refresh token do cookie (HttpOnly), com o mesmo dono do access token.
  Nada vem do cliente.
- Conta do mapa, com a senha inalterada desde então (`sessions_revoked_at` anterior ao
  instante conferido) → troca direta. Qualquer outra → pede a senha DAQUELA conta (bcrypt;
  sem senha, verificação falsa contra DUMMY_BCRYPT_HASH). Senha errada → 400
  `SENHA_INCORRETA` (nunca 401: o front desloga em 401) e nada muda na sessão.
- Impersonação → lista vazia e troca 403 (os cookies do navegador são do super admin).
- Conta da plataforma (super admin, sem terreiro) fica de fora nos dois sentidos: não aparece
  como destino e, logado nela, a lista vem vazia. Entrar na plataforma continua sendo pelo
  login (e-mail + senha); trocar a partir dela não faz sentido (ela não é de terreiro).
- Rate limit igual ao do login: slowapi 10/min por IP + `location =` na zona `login_limit`
  do nginx.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user
from src.core.auth_cookies import is_impersonated_request
from src.core.config import DUMMY_BCRYPT_HASH
from src.core.database import get_db
from src.core.errors import InsufficientPermissionsError, NotFoundError
from src.core.limiter import limiter
from src.core.logging import log_security_event
from src.models import User
from src.models.user_sessions import UserSession
from src.models.users import UserRole
from src.security import verify_password
from src.services import session_service

from src.services.medium_area import compute_areas

from .login import (
    LoginResponse,
    account_option,
    active_login_accounts_stmt,
    issue_session,
    login_user_payload,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

SENHA_INCORRETA_MESSAGE = "Senha incorreta para esta conta."
SENHA_OBRIGATORIA_MESSAGE = "Esta conta tem outra senha. Digite a senha dela para entrar."


class MinhaConta(BaseModel):
    """Outra conta ativa com o mesmo e-mail (outro terreiro)."""

    conta_id: str
    terreiro: str
    logo_url: str | None = None
    area: Literal["painel", "medium", "ambas"]
    precisa_senha: bool


class TrocarTerreiroRequest(BaseModel):
    conta_id: uuid.UUID
    senha: str | None = None


@dataclass
class _SessaoAtual:
    """Sessão do refresh token do cookie, do mesmo usuário do access token."""

    session_id: uuid.UUID | None
    row: UserSession | None
    persistent: bool


async def _sessao_atual(db: AsyncSession, request: Request, user: User) -> _SessaoAtual:
    from src.security.jwt import decode_refresh_token

    raw = request.cookies.get("refresh_token")
    if not raw:
        return _SessaoAtual(None, None, True)
    try:
        payload = decode_refresh_token(raw)
    except Exception:
        return _SessaoAtual(None, None, True)
    if payload.sub != str(user.id) or not payload.session_id:
        return _SessaoAtual(None, None, True)
    session_id = uuid.UUID(payload.session_id)
    jti = uuid.UUID(payload.jti) if payload.jti else None
    row = await session_service.get_active_session(db, user.id, session_id, jti)
    return _SessaoAtual(session_id, row, payload.persistent is not False)


def _conferida(account: User, verified: dict[uuid.UUID, datetime]) -> bool:
    """Senha conferida neste login e não trocada depois (troca/redefinição de senha ou
    "sair de todos" grava `sessions_revoked_at`)."""
    at = verified.get(account.id)
    if at is None:
        return False
    revoked = account.sessions_revoked_at
    if revoked is None:
        return True
    revoked = revoked if revoked.tzinfo else revoked.replace(tzinfo=timezone.utc)
    return at >= revoked


def _area(areas: dict) -> Literal["painel", "medium", "ambas"]:
    admin, medium = bool(areas.get("admin")), bool(areas.get("medium"))
    if admin and medium:
        return "ambas"
    # Sem nenhuma área (médium cujo terreiro perdeu o plano) vai para /medium, como no login.
    return "painel" if admin else "medium"


async def _outras_contas(db: AsyncSession, user: User) -> list[User]:
    """Outras contas ativas do e-mail da conta logada (nunca outro e-mail), sem a plataforma."""
    if user.role == UserRole.SUPER_ADMIN or user.tenant_id is None:
        return []
    contas = (await db.execute(active_login_accounts_stmt(user.email))).scalars().all()
    return [c for c in contas if c.id != user.id and c.role != UserRole.SUPER_ADMIN and c.tenant_id is not None]


@router.get("/minhas-contas", response_model=list[MinhaConta])
async def minhas_contas(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """GET /api/v1/auth/minhas-contas — outras contas (terreiros) do mesmo e-mail.

    Lista vazia quando só há uma, sob impersonação e na conta da plataforma.
    `precisa_senha=false` só para contas cuja senha conferiu no login desta sessão."""
    if is_impersonated_request(request):
        return []
    contas = await _outras_contas(db, current_user)
    if not contas:
        return []
    verified = session_service.verified_map((await _sessao_atual(db, request, current_user)).row)
    out: list[MinhaConta] = []
    for conta in contas:
        opcao = await account_option(db, conta)
        out.append(
            MinhaConta(
                conta_id=str(conta.id),
                terreiro=opcao.terreiro_nome,
                logo_url=opcao.logo_url,
                area=_area({"admin": opcao.areas.admin, "medium": opcao.areas.medium}),
                precisa_senha=not _conferida(conta, verified),
            )
        )
    return out


def _erro_senha(code: str, message: str) -> HTTPException:
    # 400, nunca 401: o api_client do front desloga em 401 (skipAutoLogout à parte).
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"message": message, "error_code": code})


@router.post("/trocar-terreiro", response_model=LoginResponse)
@limiter.limit("10/minute")
async def trocar_terreiro(
    body: TrocarTerreiroRequest,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """POST /api/v1/auth/trocar-terreiro — entra em outra conta do mesmo e-mail sem sair.

    Destino precisa estar em `minhas-contas` (senão 404). Conta conferida no login desta
    sessão → sem senha; senão `senha` obrigatória (400 `SENHA_OBRIGATORIA`/`SENHA_INCORRETA`,
    sessão intacta). Sucesso: encerra a sessão atual (linha apagada — o refresh token antigo
    deixa de valer), abre a do destino com o mesmo "Lembrar-me" e o mapa de contas conferidas
    herdado, e responde como o login (`user`, `areas`)."""
    if is_impersonated_request(request):
        raise InsufficientPermissionsError("Operação não permitida durante impersonação.")

    destino = next((c for c in await _outras_contas(db, current_user) if c.id == body.conta_id), None)
    if destino is None:
        log_security_event(
            "switch_tenant", success=False, user_id=current_user.id, tenant_id=current_user.tenant_id,
            details={"reason": "target_not_allowed", "target_user_id": str(body.conta_id)},
        )
        raise NotFoundError("Conta não encontrada")

    sessao = await _sessao_atual(db, request, current_user)
    verified = session_service.verified_map(sessao.row)
    agora = datetime.now(timezone.utc)

    com_senha = not _conferida(destino, verified)
    if com_senha:
        senha = body.senha or ""
        if senha:
            ok = verify_password(senha, destino.password_hash)
        else:
            # Sem senha: verificação falsa, o mesmo custo de uma senha errada.
            verify_password("senha-ausente", DUMMY_BCRYPT_HASH)
            ok = False
        if not ok:
            log_security_event(
                "switch_tenant", success=False, user_id=current_user.id, tenant_id=current_user.tenant_id,
                details={"reason": "password_required" if not senha else "invalid_password", "target_user_id": str(destino.id)},
            )
            if not senha:
                raise _erro_senha("SENHA_OBRIGATORIA", SENHA_OBRIGATORIA_MESSAGE)
            raise _erro_senha("SENHA_INCORRETA", SENHA_INCORRETA_MESSAGE)
        verified[destino.id] = agora

    # A conta de onde sai também fica conferida (para voltar sem senha): a sessão dela existe,
    # então ela foi autenticada no login/troca que abriu essa sessão.
    if sessao.row is not None:
        orig = sessao.row.orig_iat if sessao.row.orig_iat.tzinfo else sessao.row.orig_iat.replace(tzinfo=timezone.utc)
        verified.setdefault(current_user.id, orig)

    # Só herda contas do mesmo e-mail que ainda estão ativas (as outras não entram mais).
    validas = {c.id for c in await _outras_contas(db, destino)} | {destino.id}
    herdado = {k: v for k, v in verified.items() if k in validas}

    if sessao.session_id is not None:
        await session_service.end_session(db, current_user.id, sessao.session_id)
    access_token = await issue_session(
        db, destino, request, response, persistent=sessao.persistent, verified_accounts=herdado
    )

    log_security_event(
        "switch_tenant", success=True, user_id=destino.id, tenant_id=destino.tenant_id,
        details={
            "from_user_id": str(current_user.id),
            "from_tenant_id": str(current_user.tenant_id) if current_user.tenant_id else None,
            "with_password": com_senha,
        },
    )
    return LoginResponse(
        access_token=access_token,
        user=login_user_payload(destino),
        areas=await compute_areas(db, destino),
    )
