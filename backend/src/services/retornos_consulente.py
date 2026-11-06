"""Beta "Retorno do consulente na porta": achar os retornos abertos de quem está na fila.

Um retorno é do consulente em que foi anotado (`consulente_retornos.consulente_id`), mas a Porta o
mostra para qualquer cadastro do mesmo terreiro que seja a mesma pessoa pelas chaves do banco:
o mesmo `consulentes.id`, o mesmo `email_normalized` ou o mesmo `phone_normalized`. Quem chegou
"sem senha" numa gira e pelo link na outra ganha cadastros diferentes, mas o e-mail ou o telefone
liga os dois.

Retornos anotados na própria gira que está na tela não entram: o recado vale para as giras
seguintes. Toda consulta filtra pelo `tenant_id` recebido.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from src.models import Consulente, Gira
from src.models.consulente_retornos import ConsulenteRetorno

CHAVE_BETA = "beta_retorno_consulente"


@dataclass(frozen=True)
class RetornoAberto:
    id: UUID
    medium_nome: Optional[str]
    entidade: Optional[str]
    recado: Optional[str]
    criado_em: datetime
    gira_nome: Optional[str]
    gira_data: Optional[datetime]


async def retornos_abertos_por_consulente(
    db: AsyncSession,
    tenant_id: UUID,
    consulentes: Iterable[Consulente],
    gira_atual_id: Optional[UUID],
) -> dict[UUID, list[RetornoAberto]]:
    """Mapa `consulente_id` (de quem está na fila) → retornos abertos dessa pessoa, do mais antigo
    ao mais novo. Quem não tem retorno fica fora do mapa."""
    pessoas = {c.id: c for c in consulentes if c is not None}
    if not pessoas:
        return {}
    ids = set(pessoas)
    emails = {c.email_normalized for c in pessoas.values() if c.email_normalized}
    fones = {c.phone_normalized for c in pessoas.values() if c.phone_normalized}

    origem = aliased(Consulente)
    chaves = [origem.id.in_(ids)]
    if emails:
        chaves.append(origem.email_normalized.in_(emails))
    if fones:
        chaves.append(origem.phone_normalized.in_(fones))

    stmt = (
        select(ConsulenteRetorno, origem.id, origem.email_normalized, origem.phone_normalized, Gira.nome, Gira.data_inicio)
        .join(origem, and_(origem.id == ConsulenteRetorno.consulente_id, origem.tenant_id == tenant_id))
        .outerjoin(Gira, and_(Gira.id == ConsulenteRetorno.gira_id, Gira.tenant_id == tenant_id))
        .where(
            ConsulenteRetorno.tenant_id == tenant_id,
            ConsulenteRetorno.resolvido_em.is_(None),
            or_(*chaves),
        )
        .order_by(ConsulenteRetorno.created_at)
    )
    if gira_atual_id is not None:
        stmt = stmt.where(or_(ConsulenteRetorno.gira_id.is_(None), ConsulenteRetorno.gira_id != gira_atual_id))

    por_id: dict[UUID, list[UUID]] = defaultdict(list)
    por_email: dict[str, list[UUID]] = defaultdict(list)
    por_fone: dict[str, list[UUID]] = defaultdict(list)
    for c in pessoas.values():
        por_id[c.id].append(c.id)
        if c.email_normalized:
            por_email[c.email_normalized].append(c.id)
        if c.phone_normalized:
            por_fone[c.phone_normalized].append(c.id)

    resultado: dict[UUID, list[RetornoAberto]] = defaultdict(list)
    for retorno, origem_id, origem_email, origem_fone, gira_nome, gira_data in (await db.execute(stmt)).all():
        alvos = set(por_id.get(origem_id, []))
        if origem_email:
            alvos.update(por_email.get(origem_email, []))
        if origem_fone:
            alvos.update(por_fone.get(origem_fone, []))
        aberto = RetornoAberto(
            id=retorno.id,
            medium_nome=retorno.medium_nome,
            entidade=retorno.entidade,
            recado=retorno.recado,
            criado_em=retorno.created_at,
            gira_nome=gira_nome,
            gira_data=gira_data,
        )
        for alvo in alvos:
            resultado[alvo].append(aberto)
    return dict(resultado)


async def retorno_da_senha(db: AsyncSession, tenant_id: UUID, ticket_id: UUID) -> Optional[ConsulenteRetorno]:
    """O retorno anotado nesta senha (um por senha), aberto ou resolvido."""
    return await db.scalar(
        select(ConsulenteRetorno).where(
            ConsulenteRetorno.tenant_id == tenant_id,
            ConsulenteRetorno.ticket_id == ticket_id,
        )
    )


async def retornos_das_senhas(db: AsyncSession, tenant_id: UUID, ticket_ids: Iterable[UUID]) -> dict[UUID, ConsulenteRetorno]:
    ids = list(ticket_ids)
    if not ids:
        return {}
    rows = await db.scalars(
        select(ConsulenteRetorno).where(
            ConsulenteRetorno.tenant_id == tenant_id,
            ConsulenteRetorno.ticket_id.in_(ids),
        )
    )
    return {r.ticket_id: r for r in rows if r.ticket_id is not None}
