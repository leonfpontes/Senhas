"""Confirmação do novo e-mail de login — lado público (AM-13, Perfil do médium).

``POST /api/v1/public/email/confirmar {token}``: quem abre o link enviado ao endereço NOVO prova
que recebe nele; só então `users.email` muda. A tela (`pages/confirmar-email/[token].tsx`) pede
um toque em "Confirmar" antes de chamar — leitor de link de e-mail que abre a página não gasta o
token.

- Token opaco guardado como sha256 (`users.email_pendente_token_hash`), 24 h, uso único: as três
  colunas `email_pendente*` são limpas na confirmação; pedir de novo troca o token.
- Token inexistente, vencido, já usado ou de conta inativa/excluída → a MESMA resposta genérica
  (404 ``LINK_INVALIDO``). E-mail tomado por outra conta do terreiro no meio do caminho → 409
  ``EMAIL_EM_USO`` (o índice `uq_users_tenant_email` segura a corrida).
- Depois da troca: o cadastro do médium ligado (`mediuns.email`) acompanha, o link de "esqueci
  a senha" pendente (mandado ao endereço antigo) deixa de valer, a auditoria do terreiro registra
  sem os endereços e o endereço ANTIGO recebe o aviso. As sessões abertas continuam (a senha não
  mudou).

A busca pelo token é a "busca raiz" desta rota (o token é a chave; o tenant passa a ser o da
conta — exceção justificada em scripts/audit_tenant_isolation.py); toda query seguinte filtra
por ``user.tenant_id``.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.limiter import limiter
from src.models import Tenant, User
from src.services.audit_service import AuditService
from src.services.medium_perfil import (
    email_em_uso,
    enfileirar_aviso_email_trocado,
    hash_token,
    limpar_troca_pendente,
    medium_da_conta,
    troca_pendente_valida,
)

router = APIRouter(prefix="/api/v1/public/email", tags=["public-email"])
logger = logging.getLogger(__name__)

LINK_INVALIDO = {
    "message": "Este link não vale mais. Peça a troca de novo pelo seu perfil.",
    "error_code": "LINK_INVALIDO",
}
EMAIL_EM_USO = {
    "message": "Este e-mail passou a ser usado por outra conta da casa. Peça a troca com outro e-mail.",
    "error_code": "EMAIL_EM_USO",
}


class ConfirmarEmailRequest(BaseModel):
    token: str = Field(..., min_length=1, max_length=128)


class ConfirmarEmailResponse(BaseModel):
    email: str
    terreiro_nome: Optional[str] = None


async def _conta_pelo_token(db: AsyncSession, token: str) -> Optional[User]:
    """Busca raiz: o token (sha256) identifica a conta — e, por ela, o terreiro."""
    stmt = select(User).where(User.email_pendente_token_hash == hash_token(token)).with_for_update()
    return (await db.execute(stmt)).scalar_one_or_none()


@router.post("/confirmar", response_model=ConfirmarEmailResponse)
@limiter.limit("10/minute")
async def confirmar_email(
    request: Request,
    body: ConfirmarEmailRequest,
    db: AsyncSession = Depends(get_db),
) -> ConfirmarEmailResponse:
    user = await _conta_pelo_token(db, body.token)
    if (
        user is None
        or user.tenant_id is None
        or not user.is_active
        or user.deleted_at is not None
        or not troca_pendente_valida(user)
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=LINK_INVALIDO)

    tenant_id = user.tenant_id
    novo = user.email_pendente
    antigo = user.email
    if await email_em_uso(db, tenant_id, novo, user.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=EMAIL_EM_USO)

    user.email = novo
    limpar_troca_pendente(user)
    # O "esqueci a senha" pendente foi mandado ao endereço antigo: deixa de valer.
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    medium = await medium_da_conta(db, tenant_id, user.id)
    if medium is not None:
        medium.email = novo
        db.add(medium)
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=EMAIL_EM_USO)

    # Auditoria sem os endereços (§6.8).
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=user.id,
        resource_type="medium_perfil",
        resource_id=medium.id if medium is not None else user.id,
        previous_state={},
        new_state={"acao": "médium confirmou o novo e-mail de login", "campos": ["email"]},
    )
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    await db.commit()

    nome = medium.nome if medium is not None else (user.full_name or "")
    try:
        await enfileirar_aviso_email_trocado(db, tenant_id, nome, antigo, novo)
    except Exception:  # o aviso é melhor-esforço: a troca já foi gravada
        logger.exception("Falha ao enfileirar o aviso de troca de e-mail da conta %s", user.id)

    return ConfirmarEmailResponse(email=novo, terreiro_nome=tenant.name if tenant else None)
