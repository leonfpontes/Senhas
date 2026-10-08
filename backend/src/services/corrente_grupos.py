"""Grupos da corrente (AM-23) — regras e consultas compartilhadas.

Quem usa: `api/v1/admin/corrente_grupos.py` (cadastro), `api/v1/admin/comunicados.py` (público
"grupos" dos avisos) e `api/v1/admin/mediuns.py` (inativar/excluir tira o médium dos grupos).
As consultas do lado do médium ficam em `api/v1/medium/*` (filtradas por `ctx.medium.id`).

Regras:
- nome em texto simples numa linha (mesma limpeza do título dos avisos), 1 a 60 letras;
- cor só da paleta fechada `CORES_GRUPO`;
- só médium ativo e não excluído do terreiro entra num grupo (`validar_mediuns_ativos_do_tenant`);
- grupo arquivado não recebe membro nem aviso e não conta para o público (`validar_grupos_ativos_do_tenant`).
"""
from __future__ import annotations

import uuid
from typing import Iterable, Optional, Sequence

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ValidationError
from ..models.corrente_grupos import CORES_GRUPO, DESCRICAO_MAX, NOME_MAX, CorrenteGrupo, CorrenteGrupoMembro
from ..models.mediuns import Medium
from .comunicados import limpar_corpo, limpar_titulo

MSG_NOME = f"Dê um nome ao grupo (até {NOME_MAX} letras)."
MSG_COR = "Escolha uma das cores da lista."
MSG_MEDIUNS = "Escolha só médiuns ativos da casa."
MSG_GRUPOS = "Escolha grupos ativos da casa."


def limpar_nome(valor: Optional[str]) -> str:
    """Nome numa linha, sem HTML; erro se vazio ou longo demais."""
    nome = limpar_titulo(valor)
    if not nome or len(nome) > NOME_MAX:
        raise ValidationError(MSG_NOME)
    return nome


def limpar_descricao(valor: Optional[str]) -> Optional[str]:
    descricao = limpar_corpo(valor)
    if len(descricao) > DESCRICAO_MAX:
        raise ValidationError(f"A descrição vai até {DESCRICAO_MAX} letras.")
    return descricao or None


def validar_cor(valor: str) -> str:
    if valor not in CORES_GRUPO:
        raise ValidationError(MSG_COR)
    return valor


def sem_repetidos(ids: Iterable[uuid.UUID]) -> list[uuid.UUID]:
    """Mantém a ordem e tira repetidos."""
    vistos: dict[uuid.UUID, None] = {}
    for i in ids:
        vistos.setdefault(i, None)
    return list(vistos)


async def validar_mediuns_ativos_do_tenant(
    db: AsyncSession, tenant_id: uuid.UUID, medium_ids: Sequence[uuid.UUID]
) -> list[uuid.UUID]:
    """Confere que todos os ids são médiuns ativos e não excluídos do terreiro (senão 422)."""
    ids = sem_repetidos(medium_ids)
    if not ids:
        return []
    achados = set(
        (
            await db.execute(
                select(Medium.id).where(
                    Medium.tenant_id == tenant_id,
                    Medium.id.in_(ids),
                    Medium.deleted_at.is_(None),
                    Medium.is_active.is_(True),
                )
            )
        ).scalars().all()
    )
    if len(achados) != len(ids):
        raise ValidationError(MSG_MEDIUNS)
    return ids


async def validar_grupos_ativos_do_tenant(
    db: AsyncSession, tenant_id: uuid.UUID, grupo_ids: Sequence[uuid.UUID]
) -> list[CorrenteGrupo]:
    """Grupos não arquivados do terreiro, na ordem pedida (senão 422)."""
    ids = sem_repetidos(grupo_ids)
    if not ids:
        return []
    grupos = {
        g.id: g
        for g in (
            await db.execute(
                select(CorrenteGrupo).where(
                    CorrenteGrupo.tenant_id == tenant_id,
                    CorrenteGrupo.id.in_(ids),
                    CorrenteGrupo.arquivado_em.is_(None),
                )
            )
        ).scalars().all()
    }
    if len(grupos) != len(ids):
        raise ValidationError(MSG_GRUPOS)
    return [grupos[i] for i in ids]


async def remover_medium_dos_grupos(db: AsyncSession, tenant_id: uuid.UUID, medium_id: uuid.UUID) -> int:
    """Médium inativado ou excluído sai de todos os grupos. Devolve quantos vínculos saíram."""
    result = await db.execute(
        delete(CorrenteGrupoMembro).where(
            CorrenteGrupoMembro.tenant_id == tenant_id,
            CorrenteGrupoMembro.medium_id == medium_id,
        )
    )
    return result.rowcount or 0


async def membros_por_medium(db: AsyncSession, tenant_id: uuid.UUID) -> dict[uuid.UUID, frozenset[uuid.UUID]]:
    """{medium_id: grupos NÃO arquivados em que ele está} — para o público dos avisos."""
    rows = await db.execute(
        select(CorrenteGrupoMembro.medium_id, CorrenteGrupoMembro.grupo_id)
        .join(CorrenteGrupo, CorrenteGrupo.id == CorrenteGrupoMembro.grupo_id)
        .where(
            CorrenteGrupoMembro.tenant_id == tenant_id,
            CorrenteGrupo.tenant_id == tenant_id,
            CorrenteGrupo.arquivado_em.is_(None),
        )
    )
    out: dict[uuid.UUID, set[uuid.UUID]] = {}
    for medium_id, grupo_id in rows.all():
        out.setdefault(medium_id, set()).add(grupo_id)
    return {k: frozenset(v) for k, v in out.items()}
