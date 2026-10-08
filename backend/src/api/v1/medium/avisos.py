"""Avisos da casa na Área do Médium (AM-09). Na tela é "Avisos" (D-16).

    GET  /api/v1/medium/avisos            — os avisos que o médium pode ler, fixados primeiro
    GET  /api/v1/medium/avisos/{id}       — um aviso
    POST /api/v1/medium/avisos/{id}/lido  — marca como lido (recusado sob impersonação, D-06)

Tudo é "meu" (§6.6): o terreiro vem de `ctx.tenant_id` e o médium de `ctx.medium`; as leituras
são sempre filtradas por `ctx.medium.id`. Um aviso só aparece quando é do terreiro, não foi
arquivado, já foi publicado (`publicar_em`), ainda não saiu do ar (`expira_em`) e é para o
público do médium (`services/comunicados.publicos_do_medium`, ou — público `grupos`, AM-23 — o
médium está num dos grupos ativos do aviso). Fora disso, 404 — o médium não fica sabendo que
existe aviso agendado ou para outro público.

Módulo "avisos" desligado pela casa (AM-10, `tenant_configs.area_medium_avisos`) → 403 neutro.
Nada aqui expõe quem mais leu (D-07) nem quem escreveu.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel
from sqlalchemy import and_, exists, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import MediumContext, require_medium, require_not_impersonated
from src.core.database import get_db
from src.core.errors import ForbiddenError, NotFoundError
from src.core.tz import utc_now
from src.models import (
    Comunicado,
    ComunicadoGrupo,
    ComunicadoLeitura,
    ComunicadoPublico,
    CorrenteGrupo,
    CorrenteGrupoMembro,
)
from src.services.comunicados import publicos_do_medium, resumo
from src.services.medium_area import get_area_medium_config

AVISOS_DESLIGADOS = "Os avisos não estão disponíveis na Área agora."


async def require_modulo_avisos(
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> MediumContext:
    """A casa deixou o módulo "avisos" ligado (AM-10); senão 403 neutro."""
    if not (await get_area_medium_config(db, ctx.tenant_id)).avisos:
        raise ForbiddenError(AVISOS_DESLIGADOS, details={"error_code": "MEDIUM_MODULO_DESLIGADO"})
    return ctx


router = APIRouter(prefix="/avisos", dependencies=[Depends(require_modulo_avisos)])


class AvisoItem(BaseModel):
    id: uuid.UUID
    titulo: str
    resumo: str
    fixado: bool
    publicado_em: datetime
    lido: bool


class AvisosResponse(BaseModel):
    itens: list[AvisoItem]
    nao_lidos: int


class AvisoDetalhe(BaseModel):
    id: uuid.UUID
    titulo: str
    corpo: str
    fixado: bool
    publicado_em: datetime
    lido: bool
    lido_em: Optional[datetime] = None


class LidoResponse(BaseModel):
    lido: bool
    lido_em: datetime


def _no_publico_do_medium(ctx: MediumContext):
    """Condição "o aviso é para mim": público fixo do médium ou um dos grupos ativos dele."""
    nos_meus_grupos = exists(
        select(ComunicadoGrupo.comunicado_id)
        .join(CorrenteGrupoMembro, CorrenteGrupoMembro.grupo_id == ComunicadoGrupo.grupo_id)
        .join(CorrenteGrupo, CorrenteGrupo.id == ComunicadoGrupo.grupo_id)
        .where(
            ComunicadoGrupo.comunicado_id == Comunicado.id,
            ComunicadoGrupo.tenant_id == ctx.tenant_id,
            CorrenteGrupoMembro.tenant_id == ctx.tenant_id,
            CorrenteGrupoMembro.medium_id == ctx.medium.id,
            CorrenteGrupo.tenant_id == ctx.tenant_id,
            CorrenteGrupo.arquivado_em.is_(None),
        )
    )
    return or_(
        Comunicado.publico.in_(publicos_do_medium(ctx.medium.is_atendimento)),
        and_(Comunicado.publico == ComunicadoPublico.GRUPOS.value, nos_meus_grupos),
    )


async def avisos_do_medium(
    db: AsyncSession, ctx: MediumContext, agora: Optional[datetime] = None
) -> list[tuple[Comunicado, Optional[datetime]]]:
    """Avisos que o médium pode ler agora, fixados primeiro e mais novos antes, com `lido_em`."""
    agora = agora or utc_now()
    comunicados = (
        await db.execute(
            select(Comunicado)
            .where(
                Comunicado.tenant_id == ctx.tenant_id,
                Comunicado.deleted_at.is_(None),
                Comunicado.publicar_em <= agora,
                or_(Comunicado.expira_em.is_(None), Comunicado.expira_em > agora),
                _no_publico_do_medium(ctx),
            )
            .order_by(Comunicado.fixado.desc(), Comunicado.publicar_em.desc())
            .limit(200)
        )
    ).scalars().all()
    if not comunicados:
        return []
    lidos = dict(
        (
            await db.execute(
                select(ComunicadoLeitura.comunicado_id, ComunicadoLeitura.lido_em).where(
                    ComunicadoLeitura.tenant_id == ctx.tenant_id,
                    ComunicadoLeitura.medium_id == ctx.medium.id,
                    ComunicadoLeitura.comunicado_id.in_([c.id for c in comunicados]),
                )
            )
        ).all()
    )
    return [(c, lidos.get(c.id)) for c in comunicados]


async def _aviso_visivel(db: AsyncSession, ctx: MediumContext, aviso_id: uuid.UUID) -> Comunicado:
    agora = utc_now()
    comunicado = (
        await db.execute(
            select(Comunicado).where(
                Comunicado.id == aviso_id,
                Comunicado.tenant_id == ctx.tenant_id,
                Comunicado.deleted_at.is_(None),
                Comunicado.publicar_em <= agora,
                or_(Comunicado.expira_em.is_(None), Comunicado.expira_em > agora),
                _no_publico_do_medium(ctx),
            )
        )
    ).scalar_one_or_none()
    if comunicado is None:
        raise NotFoundError("Aviso")
    return comunicado


async def _minha_leitura(db: AsyncSession, ctx: MediumContext, aviso_id: uuid.UUID) -> Optional[datetime]:
    return (
        await db.execute(
            select(ComunicadoLeitura.lido_em).where(
                ComunicadoLeitura.tenant_id == ctx.tenant_id,
                ComunicadoLeitura.medium_id == ctx.medium.id,
                ComunicadoLeitura.comunicado_id == aviso_id,
            )
        )
    ).scalar_one_or_none()


@router.get("", response_model=AvisosResponse)
async def listar_avisos(
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> AvisosResponse:
    avisos = await avisos_do_medium(db, ctx)
    itens = [
        AvisoItem(
            id=c.id,
            titulo=c.titulo,
            resumo=resumo(c.corpo),
            fixado=c.fixado,
            publicado_em=c.publicar_em,
            lido=lido_em is not None,
        )
        for c, lido_em in avisos
    ]
    return AvisosResponse(itens=itens, nao_lidos=sum(1 for i in itens if not i.lido))


@router.get("/{aviso_id}", response_model=AvisoDetalhe)
async def obter_aviso(
    aviso_id: uuid.UUID = Path(...),
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> AvisoDetalhe:
    comunicado = await _aviso_visivel(db, ctx, aviso_id)
    lido_em = await _minha_leitura(db, ctx, comunicado.id)
    return AvisoDetalhe(
        id=comunicado.id,
        titulo=comunicado.titulo,
        corpo=comunicado.corpo,
        fixado=comunicado.fixado,
        publicado_em=comunicado.publicar_em,
        lido=lido_em is not None,
        lido_em=lido_em,
    )


@router.post("/{aviso_id}/lido", response_model=LidoResponse, dependencies=[Depends(require_not_impersonated)])
async def marcar_lido(
    aviso_id: uuid.UUID = Path(...),
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> LidoResponse:
    """Idempotente: ler de novo mantém a data da primeira leitura."""
    comunicado = await _aviso_visivel(db, ctx, aviso_id)
    await db.execute(
        pg_insert(ComunicadoLeitura)
        .values(id=uuid.uuid4(), tenant_id=ctx.tenant_id, comunicado_id=comunicado.id, medium_id=ctx.medium.id)
        .on_conflict_do_nothing(constraint="uq_comunicado_leituras_comunicado_medium")
    )
    await db.commit()
    lido_em = await _minha_leitura(db, ctx, comunicado.id)
    return LidoResponse(lido=True, lido_em=lido_em)
