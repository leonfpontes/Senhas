"""Desligar avisos por e-mail da Área sem entrar — o link do rodapé dos lembretes (AM-15).

    POST /api/v1/public/avisos-email/consultar  {token}            → terreiro e o que está ligado
    POST /api/v1/public/avisos-email/desligar   {token, tipo}      → desliga um tipo ou `todos`

O link do e-mail abre `pages/descadastro/[token].tsx`, que só desliga no toque em "Desligar" (leitor
de link do provedor de e-mail que abre a página não muda nada). O token é o
`medium_preferencias.token_descadastro` do médium (aleatório, único; só liga/desliga e-mail, nada
mais). Token inexistente → a mesma resposta genérica 404 `LINK_INVALIDO`. Ligar de novo é pelo Perfil
da Área (com login).

A busca pelo token é a "busca raiz" desta rota (o token é a chave; o tenant passa a ser o da
preferência — exceção justificada em scripts/audit_tenant_isolation.py); a query seguinte filtra
por `pref.tenant_id`.
"""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.limiter import limiter
from src.core.tz import utc_now
from src.models import MediumPreferencia, Tenant
from src.models.medium_lembretes import PREFERENCIAS
from src.services.medium_lembretes import preferencias_payload

router = APIRouter(prefix="/api/v1/public/avisos-email", tags=["public-avisos-email"])

LINK_INVALIDO = {
    "message": "Este link não vale mais. Você pode mudar os avisos por e-mail no Perfil da Área.",
    "error_code": "LINK_INVALIDO",
}

TipoDescadastro = Literal["mensalidade", "escalas", "confirmacao", "faltas", "avisos", "todos"]


class ConsultarRequest(BaseModel):
    token: str = Field(..., min_length=1, max_length=128)


class DesligarRequest(ConsultarRequest):
    tipo: TipoDescadastro


class PreferenciasPublicas(BaseModel):
    terreiro_nome: Optional[str] = None
    preferencias: dict[str, bool]


async def _preferencia_pelo_token(db: AsyncSession, token: str) -> Optional[MediumPreferencia]:
    """Busca raiz: o token identifica a preferência — e, por ela, o terreiro."""
    stmt = select(MediumPreferencia).where(MediumPreferencia.token_descadastro == token).with_for_update()
    return (await db.execute(stmt)).scalar_one_or_none()


async def _resposta(db: AsyncSession, pref: MediumPreferencia) -> PreferenciasPublicas:
    nome = (await db.execute(select(Tenant.name).where(Tenant.id == pref.tenant_id))).scalar_one_or_none()
    return PreferenciasPublicas(terreiro_nome=nome, preferencias=preferencias_payload(pref))


@router.post("/consultar", response_model=PreferenciasPublicas)
@limiter.limit("30/minute")
async def consultar(request: Request, body: ConsultarRequest, db: AsyncSession = Depends(get_db)) -> PreferenciasPublicas:
    pref = await _preferencia_pelo_token(db, body.token)
    if pref is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=LINK_INVALIDO)
    resposta = await _resposta(db, pref)
    await db.rollback()  # solta o FOR UPDATE: consultar não muda nada
    return resposta


@router.post("/desligar", response_model=PreferenciasPublicas)
@limiter.limit("10/minute")
async def desligar(request: Request, body: DesligarRequest, db: AsyncSession = Depends(get_db)) -> PreferenciasPublicas:
    pref = await _preferencia_pelo_token(db, body.token)
    if pref is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=LINK_INVALIDO)
    tipos = PREFERENCIAS if body.tipo == "todos" else (body.tipo,)
    for tipo in tipos:
        setattr(pref, f"email_{tipo}", False)
    pref.updated_at = utc_now()
    await db.commit()
    await db.refresh(pref)
    return await _resposta(db, pref)
