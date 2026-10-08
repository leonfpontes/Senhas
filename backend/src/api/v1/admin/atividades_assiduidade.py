"""Relatório de assiduidade no painel (AM-26) — aba "Relatórios" de Atividades e escalas.

Mesmo prefixo e mesmos gates de plano das atividades (`area_medium` + `atividades_corrente`);
grupo de permissão `ESCALAS` (view). Regras em `services/assiduidade.py`.

- ``GET /api/v1/admin/atividades/assiduidade?inicio&fim&tipo_id&grupo_id&agrupar=medium|grupo``
  — por médium (Basic) ou por grupo da corrente (`agrupar=grupo` exige o plano `escalas`, Pro →
  403): convocações, presenças, ausências com e sem justificativa, "sem chamada", dispensados,
  quem veio sem estar na escala, substituições (AM-27, troca aprovada — não é falta) e o percentual (presentes ÷ convocações com chamada encerrada).
  Só contagens: nada de texto de justificativa (é o que vai para o PDF).
- ``GET /api/v1/admin/atividades/assiduidade/medium/{medium_id}?inicio&fim&tipo_id`` — as
  atividades do médium no período, com a situação e, nas ausências, o motivo (§6.8: só na tela de
  quem tem `ESCALAS:view`; nunca no PDF/CSV/e-mail/auditoria — esta rota não audita nada).

Ids da requisição (`tipo_id`, `grupo_id`, `medium_id`) são conferidos no terreiro antes da consulta
(404). Estas rotas ficam num router registrado ANTES do `atividades.py`: `/assiduidade` não pode
cair no `GET /{atividade_id}`.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import check_plan_feature, get_current_user, require_group_permission, require_plan_feature
from src.core.database import get_db
from src.core.errors import NotFoundError
from src.core.tz import today_local, utc_now
from src.models import AtividadeTipo, CorrenteGrupo, Medium, PermissionFeature, User
from src.services.assiduidade import (
    AGRUPAR_GRUPO,
    Contagem,
    atividades_por_chamada,
    contagens_por_grupo,
    contagens_por_medium,
    detalhe_do_medium,
    filtros,
    grupos_do_relatorio,
    mediuns_por_id,
    periodo_do_relatorio,
)
from src.services.medium_agenda import PeriodoInvalido

router = APIRouter(
    prefix="/api/v1/admin/atividades",
    tags=["admin-atividades-assiduidade"],
    dependencies=[
        Depends(require_plan_feature("area_medium")),
        Depends(require_plan_feature("atividades_corrente")),
    ],
)


# ── Schemas ─────────────────────────────────────────────────────────────────


class TipoMini(BaseModel):
    id: uuid.UUID
    nome: str
    icone: str
    cor: Optional[str] = None


class GrupoMini(BaseModel):
    id: uuid.UUID
    nome: str
    cor: str


class Numeros(BaseModel):
    convocacoes: int
    presencas: int
    ausencias_justificadas: int
    ausencias_sem_justificativa: int
    sem_chamada: int
    dispensados: int
    avulsos: int
    # AM-27: trocou com um colega (troca aprovada) — não é falta e não entra no percentual.
    substituidos: int = 0
    percentual: Optional[int] = None


class LinhaAssiduidade(Numeros):
    id: uuid.UUID
    nome: str
    # Médium: ativo na casa. Grupo: cor e número de membros.
    ativo: Optional[bool] = None
    cor: Optional[str] = None
    membros: Optional[int] = None


class AssiduidadeResponse(BaseModel):
    inicio: date
    fim: date
    agrupar: Literal["medium", "grupo"]
    tipo: Optional[TipoMini] = None
    grupo: Optional[GrupoMini] = None
    atividades_com_chamada: int
    atividades_sem_chamada: int
    totais: Numeros
    linhas: list[LinhaAssiduidade]


class MediumMini(BaseModel):
    id: uuid.UUID
    nome: str
    ativo: bool


class ItemDetalheResponse(BaseModel):
    atividade_id: uuid.UUID
    origem: str
    ref_id: uuid.UUID
    titulo: str
    inicio: datetime
    tipo: TipoMini
    situacao: str
    categoria: str
    conta_no_percentual: bool
    chamada_encerrada: bool
    cancelada: bool
    tem_justificativa: bool
    # Pode ter dado de saúde (§6.8): só nesta tela (ESCALAS:view).
    justificativa: Optional[str] = None
    # Abono (AM-27): null (não avaliada), "aceita" ou "recusada".
    justificativa_avaliacao: Optional[str] = None
    # Origem da convocação ("troca": foi no lugar de um colega).
    medium_origem: Optional[str] = None


class DetalheResponse(BaseModel):
    medium: MediumMini
    inicio: date
    fim: date
    tipo: Optional[TipoMini] = None
    resumo: Numeros
    itens: list[ItemDetalheResponse]


# ── Ajudantes ───────────────────────────────────────────────────────────────


def _periodo(inicio: Optional[date], fim: Optional[date]) -> tuple[date, date]:
    try:
        return periodo_do_relatorio(today_local(), inicio, fim)
    except PeriodoInvalido as exc:
        raise HTTPException(status_code=400, detail=str(exc))


async def _tipo_do_tenant(db: AsyncSession, tenant_id: uuid.UUID, tipo_id: Optional[uuid.UUID]) -> Optional[TipoMini]:
    """Tipo do terreiro (arquivado também: relatório olha o passado); outro terreiro → 404."""
    if tipo_id is None:
        return None
    tipo = (
        await db.execute(
            select(AtividadeTipo).where(AtividadeTipo.id == tipo_id, AtividadeTipo.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if tipo is None:
        raise NotFoundError("Tipo de atividade")
    return TipoMini(id=tipo.id, nome=tipo.nome, icone=tipo.icone, cor=tipo.cor)


async def _grupo_do_tenant(db: AsyncSession, tenant_id: uuid.UUID, grupo_id: Optional[uuid.UUID]) -> Optional[GrupoMini]:
    """Grupo da corrente do terreiro (arquivado também); outro terreiro → 404."""
    if grupo_id is None:
        return None
    grupo = (
        await db.execute(
            select(CorrenteGrupo).where(CorrenteGrupo.id == grupo_id, CorrenteGrupo.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if grupo is None:
        raise NotFoundError("Grupo")
    return GrupoMini(id=grupo.id, nome=grupo.nome, cor=grupo.cor)


async def _medium_do_tenant(db: AsyncSession, tenant_id: uuid.UUID, medium_id: uuid.UUID) -> Medium:
    """Médium do terreiro, não excluído (inativo também: o histórico fica); senão 404."""
    medium = (
        await db.execute(
            select(Medium).where(Medium.id == medium_id, Medium.tenant_id == tenant_id, Medium.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if medium is None:
        raise NotFoundError("Médium")
    return medium


# ── Rotas ───────────────────────────────────────────────────────────────────


@router.get("/assiduidade", response_model=AssiduidadeResponse, dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "view"))])
async def relatorio_de_assiduidade(
    inicio: Optional[date] = Query(None, description="Primeiro dia (AAAA-MM-DD, Brasília); padrão: 1º do mês"),
    fim: Optional[date] = Query(None, description="Último dia (AAAA-MM-DD, Brasília); padrão: fim do mês"),
    tipo_id: Optional[uuid.UUID] = Query(None, description="Só um tipo de atividade"),
    grupo_id: Optional[uuid.UUID] = Query(None, description="Só os membros de um grupo da corrente"),
    agrupar: Literal["medium", "grupo"] = Query("medium"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssiduidadeResponse:
    """Assiduidade por médium ou por grupo no período (só contagens — vai para o PDF)."""
    tenant_id = current_user.tenant_id
    if agrupar == AGRUPAR_GRUPO:
        # Relatório por grupo é do plano Pro (§8.12) — 403 com a mensagem do catálogo.
        await check_plan_feature(current_user, db, "escalas")
    ini, fim_ = _periodo(inicio, fim)
    tipo = await _tipo_do_tenant(db, tenant_id, tipo_id)
    grupo = await _grupo_do_tenant(db, tenant_id, grupo_id)
    grupos = await grupos_do_relatorio(db, tenant_id, grupo.id if grupo else None) if agrupar == AGRUPAR_GRUPO else []
    if agrupar == AGRUPAR_GRUPO:
        grupo_ids: Optional[list[uuid.UUID]] = [g.id for g, _ in grupos]
    else:
        grupo_ids = [grupo.id] if grupo else None
    f = await filtros(db, tenant_id, ini, fim_, utc_now(), tipo_id=tipo.id if tipo else None, grupo_ids=grupo_ids)
    com_chamada, sem_chamada = await atividades_por_chamada(db, f)

    # Total do relatório: por médium, cada um uma vez (no "por grupo", quem está em dois grupos
    # aparece nas duas linhas, mas conta uma vez só no total).
    por_medium = await contagens_por_medium(db, f)
    totais = Contagem()
    linhas: list[LinhaAssiduidade] = []
    if agrupar == AGRUPAR_GRUPO:
        por_grupo = await contagens_por_grupo(db, f)
        for g, membros in grupos:
            c = por_grupo.get(g.id, Contagem())
            linhas.append(LinhaAssiduidade(id=g.id, nome=g.nome, cor=g.cor, membros=membros, **c.como_dict()))
        for c in por_medium.values():
            totais.juntar(c)
    else:
        mediuns = await mediuns_por_id(db, tenant_id, por_medium.keys())
        for medium_id, c in por_medium.items():
            m = mediuns.get(medium_id)
            if m is None or c.vazia:
                continue
            totais.juntar(c)
            linhas.append(LinhaAssiduidade(id=m.id, nome=m.nome, ativo=bool(m.is_active), **c.como_dict()))
        linhas.sort(key=lambda x: x.nome.lower())

    return AssiduidadeResponse(
        inicio=ini,
        fim=fim_,
        agrupar=agrupar,
        tipo=tipo,
        grupo=grupo,
        atividades_com_chamada=com_chamada,
        atividades_sem_chamada=sem_chamada,
        totais=Numeros(**totais.como_dict()),
        linhas=linhas,
    )


@router.get(
    "/assiduidade/medium/{medium_id}",
    response_model=DetalheResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "view"))],
)
async def detalhe_da_assiduidade(
    medium_id: uuid.UUID = Path(...),
    inicio: Optional[date] = Query(None),
    fim: Optional[date] = Query(None),
    tipo_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DetalheResponse:
    """As atividades do médium no período, com a situação e o motivo das ausências (só na tela)."""
    tenant_id = current_user.tenant_id
    ini, fim_ = _periodo(inicio, fim)
    medium = await _medium_do_tenant(db, tenant_id, medium_id)
    tipo = await _tipo_do_tenant(db, tenant_id, tipo_id)
    f = await filtros(db, tenant_id, ini, fim_, utc_now(), tipo_id=tipo.id if tipo else None, medium_id=medium.id)
    resumo, itens = await detalhe_do_medium(db, f)
    return DetalheResponse(
        medium=MediumMini(id=medium.id, nome=medium.nome, ativo=bool(medium.is_active)),
        inicio=ini,
        fim=fim_,
        tipo=tipo,
        resumo=Numeros(**resumo.como_dict()),
        itens=[ItemDetalheResponse(**{**vars(i), "tipo": TipoMini(**i.tipo)}) for i in itens],
    )
