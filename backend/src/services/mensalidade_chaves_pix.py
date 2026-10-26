"""Qual chave PIX (e qual conta bancária) vale para cada médium (migração 100).

Regra única, usada pela Área do Médium, pelos lembretes e pelo espelho em contas a receber:

1. médium num grupo da corrente (não arquivado) que tem chave → a chave do grupo;
   em dois grupos com chaves diferentes → a chave cadastrada primeiro (`created_at`, depois
   `id`), e `conflitos()` lista esses médiuns para a tela de configuração;
2. senão → a chave do terreiro (`mensalidade_configs.pix_*`).

A conta bancária segue a chave: `conta_bancaria_id` da chave do grupo ou
`pix_conta_bancaria_id` da chave do terreiro.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.corrente_grupos import CorrenteGrupo, CorrenteGrupoMembro
from src.models.mensalidade_chaves_pix import MensalidadeChavePix, MensalidadeChavePixGrupo
from src.models.mensalidades import MensalidadeConfig


@dataclass(frozen=True)
class PixEfetivo:
    """A chave que um médium usa para pagar (do grupo ou do terreiro)."""

    tipo: Optional[str]
    chave: str
    nome_recebedor: Optional[str]
    cidade: Optional[str]
    instrucoes: Optional[str]
    alterado_em: Optional[datetime]
    conta_bancaria_id: Optional[uuid.UUID]
    # None = chave do terreiro.
    chave_id: Optional[uuid.UUID] = None


def pix_do_terreiro(config: Optional[MensalidadeConfig]) -> Optional[PixEfetivo]:
    if config is None or not (config.pix_chave or "").strip():
        return None
    return PixEfetivo(
        tipo=config.pix_tipo,
        chave=config.pix_chave,
        nome_recebedor=config.pix_nome_recebedor,
        cidade=config.pix_cidade,
        instrucoes=config.pix_instrucoes,
        alterado_em=config.pix_alterado_em,
        conta_bancaria_id=config.pix_conta_bancaria_id,
    )


def _pix_da_chave(chave: MensalidadeChavePix) -> PixEfetivo:
    return PixEfetivo(
        tipo=chave.pix_tipo,
        chave=chave.pix_chave,
        nome_recebedor=chave.pix_nome_recebedor,
        cidade=chave.pix_cidade,
        instrucoes=chave.pix_instrucoes,
        alterado_em=chave.pix_alterado_em,
        conta_bancaria_id=chave.conta_bancaria_id,
        chave_id=chave.id,
    )


async def _chaves_dos_medium(
    db: AsyncSession, tenant_id: uuid.UUID, medium_ids: Optional[Iterable[uuid.UUID]] = None
) -> dict[uuid.UUID, list[MensalidadeChavePix]]:
    """Médium → chaves dos grupos dele (distintas, na ordem de precedência)."""
    stmt = (
        select(CorrenteGrupoMembro.medium_id, MensalidadeChavePix)
        .join(
            CorrenteGrupo,
            (CorrenteGrupo.id == CorrenteGrupoMembro.grupo_id)
            & (CorrenteGrupo.tenant_id == tenant_id)
            & CorrenteGrupo.arquivado_em.is_(None),
        )
        .join(
            MensalidadeChavePixGrupo,
            (MensalidadeChavePixGrupo.grupo_id == CorrenteGrupoMembro.grupo_id)
            & (MensalidadeChavePixGrupo.tenant_id == tenant_id),
        )
        .join(
            MensalidadeChavePix,
            (MensalidadeChavePix.id == MensalidadeChavePixGrupo.chave_id)
            & (MensalidadeChavePix.tenant_id == tenant_id),
        )
        .where(CorrenteGrupoMembro.tenant_id == tenant_id)
        .order_by(MensalidadeChavePix.created_at, MensalidadeChavePix.id)
    )
    if medium_ids is not None:
        ids = list(medium_ids)
        if not ids:
            return {}
        stmt = stmt.where(CorrenteGrupoMembro.medium_id.in_(ids))
    out: dict[uuid.UUID, list[MensalidadeChavePix]] = {}
    for medium_id, chave in (await db.execute(stmt)).all():
        lista = out.setdefault(medium_id, [])
        if all(c.id != chave.id for c in lista):
            lista.append(chave)
    return out


async def pix_por_medium(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    config: Optional[MensalidadeConfig],
    medium_ids: Iterable[uuid.UUID],
) -> dict[uuid.UUID, Optional[PixEfetivo]]:
    """A chave de cada médium pedido (None = a casa não tem chave para ele)."""
    ids = list(medium_ids)
    do_terreiro = pix_do_terreiro(config)
    por_grupo = await _chaves_dos_medium(db, tenant_id, ids)
    return {mid: (_pix_da_chave(por_grupo[mid][0]) if por_grupo.get(mid) else do_terreiro) for mid in ids}


async def pix_do_medium(
    db: AsyncSession, tenant_id: uuid.UUID, medium_id: uuid.UUID, config: Optional[MensalidadeConfig]
) -> Optional[PixEfetivo]:
    return (await pix_por_medium(db, tenant_id, config, [medium_id]))[medium_id]


async def conta_bancaria_do_medium(
    db: AsyncSession, tenant_id: uuid.UUID, medium_id: uuid.UUID
) -> Optional[uuid.UUID]:
    """Conta bancária onde cai a mensalidade do médium (a da chave que ele usa)."""
    config = (
        await db.execute(select(MensalidadeConfig).where(MensalidadeConfig.tenant_id == tenant_id))
    ).scalar_one_or_none()
    pix = await pix_do_medium(db, tenant_id, medium_id, config)
    if pix is not None:
        return pix.conta_bancaria_id
    return config.pix_conta_bancaria_id if config is not None else None


async def conta_bancaria_do_terreiro(db: AsyncSession, tenant_id: uuid.UUID) -> Optional[uuid.UUID]:
    """Conta da chave do terreiro (associados pagam sempre nela)."""
    return (
        await db.execute(
            select(MensalidadeConfig.pix_conta_bancaria_id).where(MensalidadeConfig.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()


async def conflitos(db: AsyncSession, tenant_id: uuid.UUID) -> dict[uuid.UUID, list[MensalidadeChavePix]]:
    """Médiuns em grupos com chaves diferentes (a primeira da lista é a que vale)."""
    return {mid: chaves for mid, chaves in (await _chaves_dos_medium(db, tenant_id)).items() if len(chaves) > 1}
