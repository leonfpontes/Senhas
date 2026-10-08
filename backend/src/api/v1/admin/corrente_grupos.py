"""Grupos da corrente — painel (AM-23).

Rotas (todas com o plano/chave do piloto `area_medium`; grupo de permissão `MEDIUNS`, §6.7 do
plano: compor grupo é mexer no cadastro da corrente):
- ``GET    /api/v1/admin/corrente-grupos``                       — lista com membros (`view`)
- ``GET    /api/v1/admin/corrente-grupos/opcoes``                — id/nome/cor/contagem, sem nomes
  de médiuns, para escolher o público de um aviso (`MEDIUNS` OU `COMUNICADOS` `view`)
- ``GET    /api/v1/admin/corrente-grupos/{id}``                  — detalhe (`view`)
- ``POST   /api/v1/admin/corrente-grupos``                       — cria, já com membros (`insert`)
- ``PUT    /api/v1/admin/corrente-grupos/{id}``                  — edita; `medium_ids` troca os membros (`edit`)
- ``POST   /api/v1/admin/corrente-grupos/{id}/membros``          — põe médiuns (`edit`)
- ``DELETE /api/v1/admin/corrente-grupos/{id}/membros/{medium}`` — tira um médium (`edit`)
- ``POST   /api/v1/admin/corrente-grupos/{id}/desarquivar``      — volta o grupo (`edit`)
- ``DELETE /api/v1/admin/corrente-grupos/{id}``                  — arquiva (`delete`)
- ``PUT    /api/v1/admin/corrente-grupos/mediuns/{medium}``      — grupos de um médium (campo
  "Grupos" no cadastro do médium, `edit`)

Todo `grupo_id`/`medium_id` vindo da requisição é conferido no terreiro antes de gravar
(checagem 4 do auditor de tenant). Só médium ativo entra; inativar/excluir o médium tira ele dos
grupos (`admin/mediuns.py`). Grupo arquivado sai das telas e do público dos avisos; os membros
ficam gravados e voltam com ele.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import (
    get_current_user,
    require_any_group_permission,
    require_group_permission,
    require_plan_feature,
)
from src.core.database import get_db
from src.core.errors import ConflictError, NotFoundError, ValidationError
from src.core.tz import utc_now
from src.models import CorrenteGrupo, CorrenteGrupoMembro, Medium, PermissionFeature, User
from src.models.corrente_grupos import COR_PADRAO, DESCRICAO_MAX, NOME_MAX
from src.services.audit_service import AuditService
from src.services.corrente_grupos import (
    MSG_MEDIUNS,
    limpar_descricao,
    limpar_nome,
    validar_cor,
    validar_grupos_ativos_do_tenant,
    validar_mediuns_ativos_do_tenant,
)

router = APIRouter(
    prefix="/api/v1/admin/corrente-grupos",
    tags=["admin-corrente-grupos"],
    dependencies=[Depends(require_plan_feature("area_medium"))],
)

MSG_NOME_REPETIDO = "Já existe um grupo com esse nome."
MAX_MEMBROS_POR_PEDIDO = 500


class GrupoCreate(BaseModel):
    nome: str = Field(..., max_length=NOME_MAX * 2)
    cor: str = COR_PADRAO
    descricao: Optional[str] = Field(None, max_length=DESCRICAO_MAX * 2)
    medium_ids: list[uuid.UUID] = Field(default_factory=list, max_length=MAX_MEMBROS_POR_PEDIDO)


class GrupoUpdate(BaseModel):
    """Campo ausente não muda. `medium_ids` enviado troca o conjunto de membros."""

    nome: Optional[str] = Field(None, max_length=NOME_MAX * 2)
    cor: Optional[str] = None
    descricao: Optional[str] = Field(None, max_length=DESCRICAO_MAX * 2)
    medium_ids: Optional[list[uuid.UUID]] = Field(None, max_length=MAX_MEMBROS_POR_PEDIDO)


class MembrosBody(BaseModel):
    medium_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=MAX_MEMBROS_POR_PEDIDO)


class GruposDoMediumBody(BaseModel):
    grupo_ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)


class Membro(BaseModel):
    medium_id: uuid.UUID
    nome: str
    desde: datetime


class GrupoResponse(BaseModel):
    id: uuid.UUID
    nome: str
    cor: str
    descricao: Optional[str] = None
    arquivado_em: Optional[datetime] = None
    total_membros: int
    membros: list[Membro]
    created_at: datetime
    updated_at: datetime


class GrupoOpcao(BaseModel):
    id: uuid.UUID
    nome: str
    cor: str
    total_membros: int


# ── Consultas ───────────────────────────────────────────────────────────────


async def _grupo_do_tenant(
    db: AsyncSession, tenant_id: uuid.UUID, grupo_id: uuid.UUID, *, incluir_arquivado: bool = False
) -> CorrenteGrupo:
    stmt = select(CorrenteGrupo).where(CorrenteGrupo.id == grupo_id, CorrenteGrupo.tenant_id == tenant_id)
    if not incluir_arquivado:
        stmt = stmt.where(CorrenteGrupo.arquivado_em.is_(None))
    grupo = (await db.execute(stmt)).scalar_one_or_none()
    if grupo is None:
        raise NotFoundError("Grupo")
    return grupo


async def _membros(db: AsyncSession, tenant_id: uuid.UUID, grupo_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[Membro]]:
    """{grupo_id: membros ativos por nome}."""
    if not grupo_ids:
        return {}
    rows = await db.execute(
        select(CorrenteGrupoMembro.grupo_id, Medium.id, Medium.nome, CorrenteGrupoMembro.desde)
        .join(Medium, Medium.id == CorrenteGrupoMembro.medium_id)
        .where(
            CorrenteGrupoMembro.tenant_id == tenant_id,
            CorrenteGrupoMembro.grupo_id.in_(grupo_ids),
            Medium.tenant_id == tenant_id,
            Medium.deleted_at.is_(None),
            Medium.is_active.is_(True),
        )
        .order_by(Medium.nome)
    )
    out: dict[uuid.UUID, list[Membro]] = {}
    for grupo_id, medium_id, nome, desde in rows.all():
        out.setdefault(grupo_id, []).append(Membro(medium_id=medium_id, nome=nome, desde=desde))
    return out


def _resposta(grupo: CorrenteGrupo, membros: list[Membro]) -> GrupoResponse:
    return GrupoResponse(
        id=grupo.id,
        nome=grupo.nome,
        cor=grupo.cor,
        descricao=grupo.descricao,
        arquivado_em=grupo.arquivado_em,
        total_membros=len(membros),
        membros=membros,
        created_at=grupo.created_at,
        updated_at=grupo.updated_at,
    )


async def _resposta_unica(db: AsyncSession, tenant_id: uuid.UUID, grupo: CorrenteGrupo) -> GrupoResponse:
    return _resposta(grupo, (await _membros(db, tenant_id, [grupo.id])).get(grupo.id, []))


async def _nome_livre(db: AsyncSession, tenant_id: uuid.UUID, nome: str, ignorar: Optional[uuid.UUID] = None) -> None:
    """Nome único entre os grupos não arquivados do terreiro, sem diferenciar maiúsculas."""
    stmt = select(CorrenteGrupo.id).where(
        CorrenteGrupo.tenant_id == tenant_id,
        CorrenteGrupo.arquivado_em.is_(None),
        func.lower(CorrenteGrupo.nome) == nome.lower(),
    )
    if ignorar is not None:
        stmt = stmt.where(CorrenteGrupo.id != ignorar)
    if (await db.execute(stmt.limit(1))).scalar_one_or_none() is not None:
        raise ConflictError(MSG_NOME_REPETIDO)


async def _ids_dos_membros(db: AsyncSession, tenant_id: uuid.UUID, grupo_id: uuid.UUID) -> set[uuid.UUID]:
    rows = await db.execute(
        select(CorrenteGrupoMembro.medium_id).where(
            CorrenteGrupoMembro.tenant_id == tenant_id, CorrenteGrupoMembro.grupo_id == grupo_id
        )
    )
    return set(rows.scalars().all())


def _snapshot(g: CorrenteGrupo) -> dict:
    return {"nome": g.nome, "cor": g.cor, "descricao": g.descricao}


async def _commit_ou_conflito(db: AsyncSession) -> None:
    """O índice único parcial segura a corrida entre dois cadastros com o mesmo nome."""
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if "uq_corrente_grupos_tenant_nome_ativo" in str(exc.orig):
            raise ConflictError(MSG_NOME_REPETIDO) from exc
        raise


# ── Rotas ───────────────────────────────────────────────────────────────────


@router.get("", response_model=list[GrupoResponse], dependencies=[Depends(require_group_permission(PermissionFeature.MEDIUNS, "view"))])
async def listar_grupos(
    incluir_arquivados: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GrupoResponse]:
    """Grupos por nome (arquivados por último, só quando pedidos)."""
    tenant_id = current_user.tenant_id
    stmt = select(CorrenteGrupo).where(CorrenteGrupo.tenant_id == tenant_id)
    if not incluir_arquivados:
        stmt = stmt.where(CorrenteGrupo.arquivado_em.is_(None))
    grupos = (
        await db.execute(stmt.order_by(CorrenteGrupo.arquivado_em.is_not(None), func.lower(CorrenteGrupo.nome)))
    ).scalars().all()
    membros = await _membros(db, tenant_id, [g.id for g in grupos])
    return [_resposta(g, membros.get(g.id, [])) for g in grupos]


@router.get(
    "/opcoes",
    response_model=list[GrupoOpcao],
    dependencies=[
        Depends(require_any_group_permission(PermissionFeature.MEDIUNS, PermissionFeature.COMUNICADOS, action="view"))
    ],
)
async def opcoes_de_grupos(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GrupoOpcao]:
    """Grupos ativos para escolher o público de um aviso — sem os nomes dos médiuns."""
    tenant_id = current_user.tenant_id
    grupos = (
        await db.execute(
            select(CorrenteGrupo)
            .where(CorrenteGrupo.tenant_id == tenant_id, CorrenteGrupo.arquivado_em.is_(None))
            .order_by(func.lower(CorrenteGrupo.nome))
        )
    ).scalars().all()
    membros = await _membros(db, tenant_id, [g.id for g in grupos])
    return [GrupoOpcao(id=g.id, nome=g.nome, cor=g.cor, total_membros=len(membros.get(g.id, []))) for g in grupos]


@router.get("/{grupo_id}", response_model=GrupoResponse, dependencies=[Depends(require_group_permission(PermissionFeature.MEDIUNS, "view"))])
async def obter_grupo(
    grupo_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GrupoResponse:
    grupo = await _grupo_do_tenant(db, current_user.tenant_id, grupo_id, incluir_arquivado=True)
    return await _resposta_unica(db, current_user.tenant_id, grupo)


@router.post("", response_model=GrupoResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_group_permission(PermissionFeature.MEDIUNS, "insert"))])
async def criar_grupo(
    body: GrupoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GrupoResponse:
    tenant_id = current_user.tenant_id
    nome = limpar_nome(body.nome)
    cor = validar_cor(body.cor)
    descricao = limpar_descricao(body.descricao)
    medium_ids = await validar_mediuns_ativos_do_tenant(db, tenant_id, body.medium_ids)
    await _nome_livre(db, tenant_id, nome)

    grupo = CorrenteGrupo(tenant_id=tenant_id, nome=nome, cor=cor, descricao=descricao)
    db.add(grupo)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(MSG_NOME_REPETIDO) from exc
    # medium_ids já conferidos no terreiro (validar_mediuns_ativos_do_tenant acima).
    for medium_id in set(body.medium_ids):
        db.add(CorrenteGrupoMembro(tenant_id=tenant_id, grupo_id=grupo.id, medium_id=medium_id))
    await AuditService(db).log_create(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="corrente_grupo",
        resource_id=grupo.id,
        details={**_snapshot(grupo), "membros": len(medium_ids)},
    )
    await _commit_ou_conflito(db)
    await db.refresh(grupo)
    return await _resposta_unica(db, tenant_id, grupo)


@router.put("/mediuns/{medium_id}", response_model=list[GrupoOpcao], dependencies=[Depends(require_group_permission(PermissionFeature.MEDIUNS, "edit"))])
async def definir_grupos_do_medium(
    body: GruposDoMediumBody,
    medium_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GrupoOpcao]:
    """Campo "Grupos" do cadastro do médium: troca os grupos (ativos) em que ele está."""
    tenant_id = current_user.tenant_id
    medium_ativo = (
        await db.execute(
            select(Medium.is_active).where(
                Medium.id == medium_id, Medium.tenant_id == tenant_id, Medium.deleted_at.is_(None)
            )
        )
    ).scalar_one_or_none()
    if medium_ativo is None:
        raise NotFoundError("Médium")
    grupos = await validar_grupos_ativos_do_tenant(db, tenant_id, body.grupo_ids)
    if grupos and not medium_ativo:
        raise ValidationError(MSG_MEDIUNS)
    grupo_ids = [g.id for g in grupos]

    # Só mexe nos grupos ativos: o vínculo com um grupo arquivado fica para quando ele voltar.
    ativos = select(CorrenteGrupo.id).where(CorrenteGrupo.tenant_id == tenant_id, CorrenteGrupo.arquivado_em.is_(None))
    remover = delete(CorrenteGrupoMembro).where(
        CorrenteGrupoMembro.tenant_id == tenant_id,
        CorrenteGrupoMembro.medium_id == medium_id,
        CorrenteGrupoMembro.grupo_id.in_(ativos),
    )
    if grupo_ids:
        remover = remover.where(CorrenteGrupoMembro.grupo_id.notin_(grupo_ids))
    await db.execute(remover)
    ja_esta = set(
        (
            await db.execute(
                select(CorrenteGrupoMembro.grupo_id).where(
                    CorrenteGrupoMembro.tenant_id == tenant_id, CorrenteGrupoMembro.medium_id == medium_id
                )
            )
        ).scalars().all()
    )
    for grupo_id in set(body.grupo_ids):
        if grupo_id not in ja_esta:
            db.add(CorrenteGrupoMembro(tenant_id=tenant_id, grupo_id=grupo_id, medium_id=medium_id))
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="Medium",
        resource_id=medium_id,
        new_state={"grupos": [g.nome for g in grupos]},
    )
    await db.commit()
    membros = await _membros(db, tenant_id, grupo_ids)
    return [GrupoOpcao(id=g.id, nome=g.nome, cor=g.cor, total_membros=len(membros.get(g.id, []))) for g in grupos]


@router.put("/{grupo_id}", response_model=GrupoResponse, dependencies=[Depends(require_group_permission(PermissionFeature.MEDIUNS, "edit"))])
async def editar_grupo(
    body: GrupoUpdate,
    grupo_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GrupoResponse:
    tenant_id = current_user.tenant_id
    grupo = await _grupo_do_tenant(db, tenant_id, grupo_id)
    antes = _snapshot(grupo)
    enviados = body.model_fields_set

    if "nome" in enviados and body.nome is not None:
        nome = limpar_nome(body.nome)
        if nome.lower() != grupo.nome.lower():
            await _nome_livre(db, tenant_id, nome, ignorar=grupo.id)
        grupo.nome = nome
    if "cor" in enviados and body.cor is not None:
        grupo.cor = validar_cor(body.cor)
    if "descricao" in enviados:
        grupo.descricao = limpar_descricao(body.descricao)
    novos_membros = None
    if "medium_ids" in enviados and body.medium_ids is not None:
        novos_membros = await validar_mediuns_ativos_do_tenant(db, tenant_id, body.medium_ids)
        sair = delete(CorrenteGrupoMembro).where(
            CorrenteGrupoMembro.tenant_id == tenant_id, CorrenteGrupoMembro.grupo_id == grupo.id
        )
        if novos_membros:
            sair = sair.where(CorrenteGrupoMembro.medium_id.notin_(novos_membros))
        await db.execute(sair)
        ja_estao = await _ids_dos_membros(db, tenant_id, grupo.id)
        for medium_id in set(body.medium_ids):
            if medium_id not in ja_estao:
                db.add(CorrenteGrupoMembro(tenant_id=tenant_id, grupo_id=grupo.id, medium_id=medium_id))

    grupo.updated_at = utc_now()
    await db.flush()
    depois = _snapshot(grupo)
    if novos_membros is not None:
        depois["membros"] = len(novos_membros)
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="corrente_grupo",
        resource_id=grupo.id,
        previous_state=antes,
        new_state=depois,
    )
    await _commit_ou_conflito(db)
    await db.refresh(grupo)
    return await _resposta_unica(db, tenant_id, grupo)


@router.post("/{grupo_id}/membros", response_model=GrupoResponse, dependencies=[Depends(require_group_permission(PermissionFeature.MEDIUNS, "edit"))])
async def adicionar_membros(
    body: MembrosBody,
    grupo_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GrupoResponse:
    tenant_id = current_user.tenant_id
    grupo = await _grupo_do_tenant(db, tenant_id, grupo_id)
    medium_ids = await validar_mediuns_ativos_do_tenant(db, tenant_id, body.medium_ids)
    ja_estao = await _ids_dos_membros(db, tenant_id, grupo.id)
    for medium_id in set(body.medium_ids):
        if medium_id not in ja_estao:
            db.add(CorrenteGrupoMembro(tenant_id=tenant_id, grupo_id=grupo.id, medium_id=medium_id))
    grupo.updated_at = utc_now()
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="corrente_grupo",
        resource_id=grupo.id,
        new_state={"membros_adicionados": len(medium_ids)},
    )
    await db.commit()
    await db.refresh(grupo)
    return await _resposta_unica(db, tenant_id, grupo)


@router.delete("/{grupo_id}/membros/{medium_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_group_permission(PermissionFeature.MEDIUNS, "edit"))])
async def remover_membro(
    grupo_id: uuid.UUID = Path(...),
    medium_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    tenant_id = current_user.tenant_id
    grupo = await _grupo_do_tenant(db, tenant_id, grupo_id)
    result = await db.execute(
        delete(CorrenteGrupoMembro).where(
            CorrenteGrupoMembro.tenant_id == tenant_id,
            CorrenteGrupoMembro.grupo_id == grupo.id,
            CorrenteGrupoMembro.medium_id == medium_id,
        )
    )
    if not result.rowcount:
        raise NotFoundError("Médium no grupo")
    grupo.updated_at = utc_now()
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="corrente_grupo",
        resource_id=grupo.id,
        new_state={"membro_removido": str(medium_id)},
    )
    await db.commit()
    return None


@router.post("/{grupo_id}/desarquivar", response_model=GrupoResponse, dependencies=[Depends(require_group_permission(PermissionFeature.MEDIUNS, "edit"))])
async def desarquivar_grupo(
    grupo_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GrupoResponse:
    tenant_id = current_user.tenant_id
    grupo = await _grupo_do_tenant(db, tenant_id, grupo_id, incluir_arquivado=True)
    if grupo.arquivado_em is not None:
        await _nome_livre(db, tenant_id, grupo.nome, ignorar=grupo.id)
        grupo.arquivado_em = None
        await AuditService(db).log_update(
            tenant_id=tenant_id,
            user_id=current_user.id,
            resource_type="corrente_grupo",
            resource_id=grupo.id,
            previous_state={"arquivado": True},
            new_state={"arquivado": False},
        )
        await _commit_ou_conflito(db)
        await db.refresh(grupo)
    return await _resposta_unica(db, tenant_id, grupo)


@router.delete("/{grupo_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_group_permission(PermissionFeature.MEDIUNS, "delete"))])
async def arquivar_grupo(
    grupo_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Arquiva: some das telas e do público dos avisos; os membros ficam gravados."""
    grupo = await _grupo_do_tenant(db, current_user.tenant_id, grupo_id)
    grupo.arquivado_em = utc_now()
    await AuditService(db).log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="corrente_grupo",
        resource_id=grupo.id,
        previous_state=_snapshot(grupo),
    )
    await db.commit()
    return None
