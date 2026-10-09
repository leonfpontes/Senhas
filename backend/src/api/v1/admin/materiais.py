"""Estudos e documentos da casa — painel (AM-21). Na tela é "Estudos e documentos".

Rotas (todas com `area_medium` — plano + chave do piloto — e `biblioteca_medium` (Pro, D-02);
grupo de permissão `COMUNICADOS`, o mesmo dos avisos):
- ``GET    /api/v1/admin/materiais``         — lista na ordem da casa (`view`)
- ``GET    /api/v1/admin/materiais/{id}``    — detalhe (`view`)
- ``POST   /api/v1/admin/materiais``         — cria (`insert`)
- ``PUT    /api/v1/admin/materiais/ordem``   — reordena: `ids` na ordem nova (`edit`)
- ``PUT    /api/v1/admin/materiais/{id}``    — edita (`edit`)
- ``DELETE /api/v1/admin/materiais/{id}``    — arquiva (`arquivado_em`, `delete`)

Tipos: `link` (Drive, YouTube, site — só http/https, `services/materiais.validar_url`), `texto`
(texto simples, mesma limpeza dos avisos) e `ponto` (letra + link opcional de áudio/vídeo). Sem
upload de arquivo: PDF entra como link do Drive (o banco tem limite de 8 GB). Público como nos
avisos: `todos | atendimento | cambones | grupos` (`grupo_ids` conferidos no terreiro antes de
gravar em `material_grupos`). `publicado = false` é rascunho: não aparece na Área.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Path, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user, require_group_permission, require_plan_feature
from src.core.database import get_db
from src.core.errors import NotFoundError, ValidationError
from src.core.tz import utc_now
from src.models import ComunicadoPublico, CorrenteGrupo, MaterialCorrente, MaterialGrupo, MaterialTipo, PermissionFeature, User
from src.models.materiais import CATEGORIA_MAX, CATEGORIAS_SUGERIDAS, MATERIAIS_MAX, TEXTO_MAX, TITULO_MAX, URL_MAX
from src.services.audit_service import AuditService
from src.services.corrente_grupos import sem_repetidos, validar_grupos_ativos_do_tenant
from src.services.materiais import (
    fonte_do_link,
    limpar_categoria,
    limpar_texto_material,
    limpar_titulo_material,
    validar_conteudo,
    validar_url,
    youtube_id,
)

router = APIRouter(
    prefix="/api/v1/admin/materiais",
    tags=["admin-materiais"],
    dependencies=[Depends(require_plan_feature("area_medium")), Depends(require_plan_feature("biblioteca_medium"))],
)

MSG_SEM_GRUPO = "Escolha pelo menos um grupo da corrente."
MSG_ORDEM = "A lista mudou enquanto você arrumava. Recarregue a página e tente de novo."


class MaterialCreate(BaseModel):
    titulo: str = Field(..., max_length=TITULO_MAX * 2)
    tipo: MaterialTipo
    url: Optional[str] = Field(None, max_length=URL_MAX * 2)
    texto: Optional[str] = Field(None, max_length=TEXTO_MAX * 2)
    categoria: Optional[str] = Field(None, max_length=CATEGORIA_MAX * 2)
    publico: ComunicadoPublico = ComunicadoPublico.TODOS
    grupo_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)
    publicado: bool = True


class MaterialUpdate(BaseModel):
    titulo: Optional[str] = Field(None, max_length=TITULO_MAX * 2)
    tipo: Optional[MaterialTipo] = None
    url: Optional[str] = Field(None, max_length=URL_MAX * 2)
    texto: Optional[str] = Field(None, max_length=TEXTO_MAX * 2)
    categoria: Optional[str] = Field(None, max_length=CATEGORIA_MAX * 2)
    publico: Optional[ComunicadoPublico] = None
    grupo_ids: Optional[list[uuid.UUID]] = Field(None, max_length=50)
    publicado: Optional[bool] = None


class OrdemBody(BaseModel):
    ids: list[uuid.UUID] = Field(..., min_length=1, max_length=MATERIAIS_MAX)


class GrupoDoMaterial(BaseModel):
    id: uuid.UUID
    nome: str
    cor: str


class MaterialResponse(BaseModel):
    id: uuid.UUID
    titulo: str
    tipo: str
    url: Optional[str] = None
    texto: Optional[str] = None
    fonte: Optional[str] = None  # youtube | drive | link
    youtube_id: Optional[str] = None
    categoria: str
    publico: str
    grupos: list[GrupoDoMaterial] = []
    ordem: int
    publicado: bool
    created_at: datetime
    updated_at: datetime


class MateriaisResponse(BaseModel):
    itens: list[MaterialResponse]
    # Sugestões fixas + as que a casa já usa (para o campo de categoria).
    categorias: list[str]
    limite: int = MATERIAIS_MAX


# ── Consultas ───────────────────────────────────────────────────────────────


async def _material_do_tenant(db: AsyncSession, tenant_id: uuid.UUID, material_id: uuid.UUID) -> MaterialCorrente:
    material = (
        await db.execute(
            select(MaterialCorrente).where(
                MaterialCorrente.id == material_id,
                MaterialCorrente.tenant_id == tenant_id,
                MaterialCorrente.arquivado_em.is_(None),
            )
        )
    ).scalar_one_or_none()
    if material is None:
        raise NotFoundError("Material")
    return material


async def _grupos_dos_materiais(
    db: AsyncSession, tenant_id: uuid.UUID, material_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[CorrenteGrupo]]:
    """{material_id: grupos ATIVOS escolhidos}, por nome."""
    if not material_ids:
        return {}
    rows = await db.execute(
        select(MaterialGrupo.material_id, CorrenteGrupo)
        .join(CorrenteGrupo, CorrenteGrupo.id == MaterialGrupo.grupo_id)
        .where(
            MaterialGrupo.tenant_id == tenant_id,
            MaterialGrupo.material_id.in_(material_ids),
            CorrenteGrupo.tenant_id == tenant_id,
            CorrenteGrupo.arquivado_em.is_(None),
        )
        .order_by(CorrenteGrupo.nome)
    )
    out: dict[uuid.UUID, list[CorrenteGrupo]] = {}
    for material_id, grupo in rows.all():
        out.setdefault(material_id, []).append(grupo)
    return out


async def _trocar_grupos(
    db: AsyncSession, tenant_id: uuid.UUID, material: MaterialCorrente, grupo_ids: list[uuid.UUID]
) -> None:
    """Apaga os grupos do material e grava os novos (já conferidos no terreiro)."""
    await db.execute(
        delete(MaterialGrupo).where(MaterialGrupo.tenant_id == tenant_id, MaterialGrupo.material_id == material.id)
    )
    for grupo_id in sem_repetidos(grupo_ids):
        db.add(MaterialGrupo(tenant_id=tenant_id, material_id=material.id, grupo_id=grupo_id))


def _resposta(material: MaterialCorrente, grupos: list[CorrenteGrupo]) -> MaterialResponse:
    return MaterialResponse(
        id=material.id,
        titulo=material.titulo,
        tipo=material.tipo,
        url=material.url,
        texto=material.texto,
        fonte=fonte_do_link(material.url),
        youtube_id=youtube_id(material.url),
        categoria=material.categoria,
        publico=material.publico,
        grupos=[GrupoDoMaterial(id=g.id, nome=g.nome, cor=g.cor) for g in grupos],
        ordem=material.ordem,
        publicado=material.publicado,
        created_at=material.created_at,
        updated_at=material.updated_at,
    )


async def _resposta_unica(db: AsyncSession, tenant_id: uuid.UUID, material: MaterialCorrente) -> MaterialResponse:
    grupos = (await _grupos_dos_materiais(db, tenant_id, [material.id])).get(material.id, [])
    return _resposta(material, grupos)


def _snapshot(m: MaterialCorrente, grupos: Optional[list[CorrenteGrupo]] = None) -> dict:
    """O que vai para a auditoria (o texto não: só título, tipo, link e público)."""
    return {
        "titulo": m.titulo,
        "tipo": m.tipo,
        "url": m.url,
        "categoria": m.categoria,
        "publico": m.publico,
        **({"grupos": [g.nome for g in grupos]} if grupos else {}),
        "publicado": m.publicado,
    }


def _categorias(usadas: list[str]) -> list[str]:
    out: dict[str, None] = {c: None for c in CATEGORIAS_SUGERIDAS}
    for c in usadas:
        if c.casefold() not in {k.casefold() for k in out}:
            out[c] = None
    return list(out)


# ── Rotas ───────────────────────────────────────────────────────────────────


@router.get("", response_model=MateriaisResponse, dependencies=[Depends(require_group_permission(PermissionFeature.COMUNICADOS, "view"))])
async def listar_materiais(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MateriaisResponse:
    """Materiais da casa na ordem que a casa arrumou (rascunhos incluídos)."""
    tenant_id = current_user.tenant_id
    materiais = (
        await db.execute(
            select(MaterialCorrente)
            .where(MaterialCorrente.tenant_id == tenant_id, MaterialCorrente.arquivado_em.is_(None))
            .order_by(MaterialCorrente.ordem, MaterialCorrente.created_at)
            .limit(MATERIAIS_MAX)
        )
    ).scalars().all()
    grupos = await _grupos_dos_materiais(db, tenant_id, [m.id for m in materiais])
    return MateriaisResponse(
        itens=[_resposta(m, grupos.get(m.id, [])) for m in materiais],
        categorias=_categorias([m.categoria for m in materiais]),
    )


@router.get("/{material_id}", response_model=MaterialResponse, dependencies=[Depends(require_group_permission(PermissionFeature.COMUNICADOS, "view"))])
async def obter_material(
    material_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MaterialResponse:
    material = await _material_do_tenant(db, current_user.tenant_id, material_id)
    return await _resposta_unica(db, current_user.tenant_id, material)


@router.post("", response_model=MaterialResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_group_permission(PermissionFeature.COMUNICADOS, "insert"))])
async def criar_material(
    body: MaterialCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MaterialResponse:
    tenant_id = current_user.tenant_id
    titulo = limpar_titulo_material(body.titulo)
    url = validar_url(body.url)
    texto = limpar_texto_material(body.texto)
    validar_conteudo(body.tipo.value, url, texto)
    categoria = limpar_categoria(body.categoria)
    grupos: list[CorrenteGrupo] = []
    if body.publico == ComunicadoPublico.GRUPOS:
        grupos = await validar_grupos_ativos_do_tenant(db, tenant_id, body.grupo_ids)
        if not grupos:
            raise ValidationError(MSG_SEM_GRUPO)

    total, maior_ordem = (
        await db.execute(
            select(func.count(MaterialCorrente.id), func.max(MaterialCorrente.ordem)).where(
                MaterialCorrente.tenant_id == tenant_id, MaterialCorrente.arquivado_em.is_(None)
            )
        )
    ).one()
    if total >= MATERIAIS_MAX:
        raise ValidationError(f"A casa pode ter até {MATERIAIS_MAX} materiais. Exclua os que não usa mais.")

    material = MaterialCorrente(
        tenant_id=tenant_id,
        titulo=titulo,
        tipo=body.tipo.value,
        url=url,
        texto=texto,
        categoria=categoria,
        publico=body.publico.value,
        ordem=(maior_ordem + 1) if maior_ordem is not None else 0,
        publicado=body.publicado,
        created_by=current_user.id,
    )
    db.add(material)
    await db.flush()
    if grupos:
        # grupo_ids já conferidos no terreiro (validar_grupos_ativos_do_tenant acima).
        await _trocar_grupos(db, tenant_id, material, [g.id for g in grupos])
    await AuditService(db).log_create(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="material_corrente",
        resource_id=material.id,
        details=_snapshot(material, grupos),
    )
    await db.commit()
    await db.refresh(material)
    return await _resposta_unica(db, tenant_id, material)


@router.put("/ordem", response_model=MateriaisResponse, dependencies=[Depends(require_group_permission(PermissionFeature.COMUNICADOS, "edit"))])
async def reordenar_materiais(
    body: OrdemBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MateriaisResponse:
    """`ids` = todos os materiais ativos da casa, na ordem nova (a posição vira `ordem`)."""
    tenant_id = current_user.tenant_id
    ids = sem_repetidos(body.ids)
    materiais = {
        m.id: m
        for m in (
            await db.execute(
                select(MaterialCorrente).where(
                    MaterialCorrente.tenant_id == tenant_id, MaterialCorrente.arquivado_em.is_(None)
                )
            )
        ).scalars().all()
    }
    if len(ids) != len(body.ids) or set(ids) != set(materiais):
        raise ValidationError(MSG_ORDEM)
    for posicao, material_id in enumerate(ids):
        materiais[material_id].ordem = posicao
    await db.flush()
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="material_corrente",
        resource_id=ids[0],
        previous_state={},
        new_state={"ordem": [materiais[i].titulo for i in ids]},
    )
    await db.commit()
    return await listar_materiais(current_user=current_user, db=db)


@router.put("/{material_id}", response_model=MaterialResponse, dependencies=[Depends(require_group_permission(PermissionFeature.COMUNICADOS, "edit"))])
async def editar_material(
    body: MaterialUpdate,
    material_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MaterialResponse:
    """Atualiza só o que veio no corpo. `url: null`/`texto: null` limpam o campo."""
    tenant_id = current_user.tenant_id
    material = await _material_do_tenant(db, tenant_id, material_id)
    grupos_antes = (await _grupos_dos_materiais(db, tenant_id, [material.id])).get(material.id, [])
    antes = _snapshot(material, grupos_antes)
    enviados = body.model_fields_set

    if "titulo" in enviados:
        material.titulo = limpar_titulo_material(body.titulo)
    if "tipo" in enviados and body.tipo is not None:
        material.tipo = body.tipo.value
    if "url" in enviados:
        material.url = validar_url(body.url)
    if "texto" in enviados:
        material.texto = limpar_texto_material(body.texto)
    validar_conteudo(material.tipo, material.url, material.texto)
    if "categoria" in enviados:
        material.categoria = limpar_categoria(body.categoria)
    if "publicado" in enviados and body.publicado is not None:
        material.publicado = body.publicado
    if "publico" in enviados and body.publico is not None:
        material.publico = body.publico.value

    grupos = grupos_antes
    if material.publico != ComunicadoPublico.GRUPOS.value:
        grupos = []
        await _trocar_grupos(db, tenant_id, material, [])
    elif "grupo_ids" in enviados and body.grupo_ids is not None:
        grupos = await validar_grupos_ativos_do_tenant(db, tenant_id, body.grupo_ids)
        if not grupos:
            raise ValidationError(MSG_SEM_GRUPO)
        await _trocar_grupos(db, tenant_id, material, [g.id for g in grupos])
    elif not grupos:
        raise ValidationError(MSG_SEM_GRUPO)

    await db.flush()
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="material_corrente",
        resource_id=material.id,
        previous_state=antes,
        new_state=_snapshot(material, grupos),
    )
    await db.commit()
    await db.refresh(material)
    return await _resposta_unica(db, tenant_id, material)


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_group_permission(PermissionFeature.COMUNICADOS, "delete"))])
async def arquivar_material(
    material_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Some da Área do Médium e da lista (arquivado; fica no banco)."""
    material = await _material_do_tenant(db, current_user.tenant_id, material_id)
    material.arquivado_em = utc_now()
    await db.flush()
    await AuditService(db).log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="material_corrente",
        resource_id=material.id,
        previous_state=_snapshot(material),
    )
    await db.commit()
    return None
