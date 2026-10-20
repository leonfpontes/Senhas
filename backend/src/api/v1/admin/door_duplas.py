"""Duplas da noite na Porta — o porteiro define quem trabalha na gira e o cambone de cada médium.

Rotas (grupo `PORTA`; sem gate de plano — a Porta é de todos os planos):
- ``GET /api/v1/admin/giras/{gira_id}/door/duplas`` — duplas salvas + o que a gaveta precisa para
  montá-las: pessoas ativas (id, nome, atendimento, situação na Área, escalado como Cambone),
  sugestões pelo histórico e as duplas da última gira (`PORTA:view`)
- ``PUT /api/v1/admin/giras/{gira_id}/door/duplas`` — substitui as duplas da gira (`PORTA:edit`)

Todo `medium_id`/`cambone_id` do corpo é conferido entre os médiuns ativos do terreiro antes de
gravar (`services/duplas_gira.validar_duplas`). Regras em `services/duplas_gira.py`.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user, require_group_permission
from src.core.database import get_db
from src.core.errors import ConflictError, InsufficientPermissionsError, NotFoundError
from src.models import GiraDupla, Medium, PermissionFeature, User
from src.services import duplas_gira as svc

router = APIRouter(prefix="/api/v1/admin", tags=["door-duplas"])


class DuplaOut(BaseModel):
    medium_id: uuid.UUID
    medium_nome: str
    cambone_id: Optional[uuid.UUID] = None
    cambone_nome: Optional[str] = None


class PessoaOut(BaseModel):
    """Só o que a Porta precisa — sem contato nem justificativa de ausência."""
    id: uuid.UUID
    nome: str
    is_atendimento: bool
    situacao: Optional[str] = None  # "vou" | "nao_vou" | "presente" (Área do Médium), ou nada
    escalado_cambone: bool = False


class SugestaoOut(BaseModel):
    medium_id: uuid.UUID
    cambone_id: uuid.UUID
    juntos: int
    giras_do_medium: int


class ParOut(BaseModel):
    medium_id: uuid.UUID
    cambone_id: Optional[uuid.UUID] = None


class AnteriorOut(BaseModel):
    gira_nome: str
    data_inicio: datetime
    duplas: List[ParOut]


class DuplasPainelOut(BaseModel):
    duplas: List[DuplaOut]
    pessoas: List[PessoaOut]
    tem_confirmacoes: bool  # a gira tem respostas da Área (vou/não vou/presente)
    sugestoes: List[SugestaoOut]
    anterior: Optional[AnteriorOut] = None


class DuplaIn(BaseModel):
    medium_id: uuid.UUID
    cambone_id: Optional[uuid.UUID] = None


class DuplasIn(BaseModel):
    duplas: List[DuplaIn] = Field(default_factory=list, max_length=svc.MAX_DUPLAS)


def _duplas_out(duplas: List[GiraDupla], pessoas: dict[uuid.UUID, Medium]) -> List[DuplaOut]:
    """Duplas cujo médium saiu do cadastro (inativo) não aparecem; cambone inativo vira vazio."""
    out: List[DuplaOut] = []
    for d in duplas:
        medium = pessoas.get(d.medium_id)
        if medium is None:
            continue
        cambone = pessoas.get(d.cambone_id) if d.cambone_id else None
        out.append(
            DuplaOut(
                medium_id=medium.id,
                medium_nome=medium.nome,
                cambone_id=cambone.id if cambone else None,
                cambone_nome=cambone.nome if cambone else None,
            )
        )
    return out


async def _gira(db: AsyncSession, user: User, gira_id: uuid.UUID):
    if not user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin ou operador necessário")
    gira = await svc.gira_do_tenant(db, user.tenant_id, gira_id)
    if gira is None:
        raise NotFoundError("Gira")
    return gira


@router.get(
    "/giras/{gira_id}/door/duplas",
    response_model=DuplasPainelOut,
    dependencies=[Depends(require_group_permission(PermissionFeature.PORTA, "view"))],
)
async def get_duplas(
    gira_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DuplasPainelOut:
    tenant_id = current_user.tenant_id
    gira = await _gira(db, current_user, gira_id)
    lista = await svc.pessoas_ativas(db, tenant_id)
    pessoas = {m.id: m for m in lista}
    situacoes, cambones = await svc.situacoes_da_area(db, tenant_id, gira.id)
    sugestoes = svc.sugerir_cambones(await svc.historico_de_atendimentos(db, tenant_id, gira), lista)
    gira_anterior, anteriores = await svc.duplas_anteriores(db, tenant_id, gira)

    return DuplasPainelOut(
        duplas=_duplas_out(await svc.duplas_da_gira(db, tenant_id, gira.id), pessoas),
        pessoas=[
            PessoaOut(
                id=m.id,
                nome=m.nome,
                is_atendimento=m.is_atendimento,
                situacao=situacoes.get(m.id),
                escalado_cambone=m.id in cambones,
            )
            for m in lista
        ],
        tem_confirmacoes=bool(situacoes),
        sugestoes=[SugestaoOut(**s.__dict__) for s in sugestoes],
        anterior=AnteriorOut(
            gira_nome=gira_anterior.nome,
            data_inicio=gira_anterior.data_inicio,
            duplas=[
                ParOut(medium_id=d.medium_id, cambone_id=d.cambone_id if d.cambone_id in pessoas else None)
                for d in anteriores
                if d.medium_id in pessoas
            ],
        )
        if gira_anterior is not None
        else None,
    )


@router.put(
    "/giras/{gira_id}/door/duplas",
    response_model=List[DuplaOut],
    dependencies=[Depends(require_group_permission(PermissionFeature.PORTA, "edit"))],
)
async def put_duplas(
    body: DuplasIn,
    gira_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[DuplaOut]:
    tenant_id = current_user.tenant_id
    gira = await _gira(db, current_user, gira_id)
    pedidos = [svc.PedidoDupla(medium_id=d.medium_id, cambone_id=d.cambone_id) for d in body.duplas]
    try:
        novas = await svc.salvar_duplas(db, tenant_id, gira, pedidos)
        await db.commit()
    except IntegrityError:
        # Dois porteiros salvando ao mesmo tempo: o índice único segura; o segundo recarrega.
        await db.rollback()
        raise ConflictError("As duplas mudaram enquanto você editava. Abra de novo e confira.")
    pessoas = {m.id: m for m in await svc.pessoas_ativas(db, tenant_id)}
    return _duplas_out(novas, pessoas)
