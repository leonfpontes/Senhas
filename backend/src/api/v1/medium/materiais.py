"""Estudos e documentos da casa na Área do Médium (AM-21). Na tela é "Estudos".

    GET /api/v1/medium/materiais        — materiais liberados para o médium + cursos abertos da casa
    GET /api/v1/medium/materiais/{id}   — um material (texto completo)

Plano `biblioteca_medium` (Pro, D-02) — fora dele, 403 e o menu da Área não mostra a entrada
(`GET /medium/me` → `estudos: false`). Tudo é "meu" (§6.6): o terreiro vem de `ctx.tenant_id`.
Um material só aparece quando é do terreiro, não foi arquivado, está publicado (rascunho não) e é
para o público do médium — as mesmas regras dos avisos (`services/comunicados.publicos_do_medium`
ou, com público `grupos`, o médium está num dos grupos ativos do material). Fora disso, 404.

"Cursos da casa": cursos presenciais ativos que ainda não terminaram, com o link da inscrição
pública (`/public/cursos/{id}/inscricao`), só quando o plano tem o módulo de cursos
(`site_builder`). Nada de dados de participantes — só quantas vagas sobram.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel
from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import MediumContext, require_medium, require_plan_feature
from src.core.database import get_db
from src.core.errors import NotFoundError
from src.core.tz import utc_now
from src.models import (
    ComunicadoPublico,
    CorrenteGrupo,
    CorrenteGrupoMembro,
    CursoParticipante,
    CursoPresencial,
    MaterialCorrente,
    MaterialGrupo,
)
from src.models.materiais import MATERIAIS_MAX
from src.repositories.subscription_repo import SubscriptionRepository
from src.services.comunicados import publicos_do_medium, resumo
from src.services.materiais import fonte_do_link, youtube_id
from src.services.plan_features import get_effective_plan_features

router = APIRouter(prefix="/materiais", dependencies=[Depends(require_plan_feature("biblioteca_medium"))])

CURSOS_MAX = 20


class MaterialItem(BaseModel):
    id: uuid.UUID
    titulo: str
    tipo: str  # link | texto | ponto
    categoria: str
    resumo: str = ""
    url: Optional[str] = None
    fonte: Optional[str] = None  # youtube | drive | link
    youtube_id: Optional[str] = None


class MaterialDetalhe(MaterialItem):
    texto: Optional[str] = None


class CursoAberto(BaseModel):
    id: uuid.UUID
    titulo: str
    resumo: str = ""
    data_inicio: datetime
    data_fim: Optional[datetime] = None
    local: Optional[str] = None
    vagas_restantes: Optional[int] = None
    inscricao_path: str


class MateriaisResponse(BaseModel):
    itens: list[MaterialItem]
    # Categorias na ordem em que aparecem na lista da casa.
    categorias: list[str]
    cursos: list[CursoAberto] = []


def _no_publico_do_medium(ctx: MediumContext):
    """Condição "o material é para mim": público fixo do médium ou um dos grupos ativos dele."""
    nos_meus_grupos = exists(
        select(MaterialGrupo.material_id)
        .join(CorrenteGrupoMembro, CorrenteGrupoMembro.grupo_id == MaterialGrupo.grupo_id)
        .join(CorrenteGrupo, CorrenteGrupo.id == MaterialGrupo.grupo_id)
        .where(
            MaterialGrupo.material_id == MaterialCorrente.id,
            MaterialGrupo.tenant_id == ctx.tenant_id,
            CorrenteGrupoMembro.tenant_id == ctx.tenant_id,
            CorrenteGrupoMembro.medium_id == ctx.medium.id,
            CorrenteGrupo.tenant_id == ctx.tenant_id,
            CorrenteGrupo.arquivado_em.is_(None),
        )
    )
    return or_(
        MaterialCorrente.publico.in_(publicos_do_medium(ctx.medium.is_atendimento)),
        and_(MaterialCorrente.publico == ComunicadoPublico.GRUPOS.value, nos_meus_grupos),
    )


def _item(m: MaterialCorrente) -> dict:
    return {
        "id": m.id,
        "titulo": m.titulo,
        "tipo": m.tipo,
        "categoria": m.categoria,
        "resumo": resumo(m.texto or ""),
        "url": m.url,
        "fonte": fonte_do_link(m.url),
        "youtube_id": youtube_id(m.url),
    }


async def _cursos_abertos(db: AsyncSession, ctx: MediumContext) -> list[CursoAberto]:
    """Cursos ativos da casa que ainda não terminaram (sem data de fim: começa de ontem em diante)."""
    sub = await SubscriptionRepository(db).get_by_tenant(ctx.tenant_id)
    if not get_effective_plan_features(sub).site_builder:
        return []
    agora = utc_now()
    cursos = (
        await db.execute(
            select(CursoPresencial)
            .where(
                CursoPresencial.tenant_id == ctx.tenant_id,
                CursoPresencial.deleted_at.is_(None),
                CursoPresencial.is_active.is_(True),
                or_(
                    CursoPresencial.data_fim >= agora,
                    and_(CursoPresencial.data_fim.is_(None), CursoPresencial.data_inicio >= agora - timedelta(days=1)),
                ),
            )
            .order_by(CursoPresencial.data_inicio)
            .limit(CURSOS_MAX)
        )
    ).scalars().all()
    if not cursos:
        return []
    inscritos = dict(
        (
            await db.execute(
                select(CursoParticipante.curso_id, func.count(CursoParticipante.id))
                .where(
                    CursoParticipante.tenant_id == ctx.tenant_id,
                    CursoParticipante.curso_id.in_([c.id for c in cursos]),
                    CursoParticipante.deleted_at.is_(None),
                )
                .group_by(CursoParticipante.curso_id)
            )
        ).all()
    )
    return [
        CursoAberto(
            id=c.id,
            titulo=c.titulo,
            resumo=resumo(c.ementa or ""),
            data_inicio=c.data_inicio,
            data_fim=c.data_fim,
            local=c.local,
            vagas_restantes=(
                max(0, c.max_participantes - inscritos.get(c.id, 0)) if c.max_participantes is not None else None
            ),
            inscricao_path=f"/public/cursos/{c.id}/inscricao",
        )
        for c in cursos
    ]


@router.get("", response_model=MateriaisResponse)
async def listar_materiais(
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> MateriaisResponse:
    materiais = (
        await db.execute(
            select(MaterialCorrente)
            .where(
                MaterialCorrente.tenant_id == ctx.tenant_id,
                MaterialCorrente.arquivado_em.is_(None),
                MaterialCorrente.publicado.is_(True),
                _no_publico_do_medium(ctx),
            )
            .order_by(MaterialCorrente.ordem, MaterialCorrente.created_at)
            .limit(MATERIAIS_MAX)
        )
    ).scalars().all()
    categorias: dict[str, None] = {}
    for m in materiais:
        categorias.setdefault(m.categoria, None)
    return MateriaisResponse(
        itens=[MaterialItem(**_item(m)) for m in materiais],
        categorias=list(categorias),
        cursos=await _cursos_abertos(db, ctx),
    )


@router.get("/{material_id}", response_model=MaterialDetalhe)
async def obter_material(
    material_id: uuid.UUID = Path(...),
    ctx: MediumContext = Depends(require_medium),
    db: AsyncSession = Depends(get_db),
) -> MaterialDetalhe:
    material = (
        await db.execute(
            select(MaterialCorrente).where(
                MaterialCorrente.id == material_id,
                MaterialCorrente.tenant_id == ctx.tenant_id,
                MaterialCorrente.arquivado_em.is_(None),
                MaterialCorrente.publicado.is_(True),
                _no_publico_do_medium(ctx),
            )
        )
    ).scalar_one_or_none()
    if material is None:
        raise NotFoundError("Material")
    return MaterialDetalhe(**_item(material), texto=material.texto)
