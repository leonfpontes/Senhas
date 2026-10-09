"""Trocas de escala no painel (AM-27) — aba "Trocas" de Atividades e escalas.

Mesmo prefixo das atividades; gates de plano `area_medium` + `atividades_corrente` + `escalas`
(Pro: troca só existe nas escalas — AM-18/AM-25; fora do plano → 403) e grupo de permissão
`ESCALAS`. Regras em `services/trocas_escala.py`.

- ``GET  /api/v1/admin/atividades/trocas?abertas=true&atividade_id=`` — trocas do terreiro (abertas,
  ou as dos últimos 60 dias), com a atividade, a função/grupo, quem pediu, o colega e o que falta
  (`aguardando`: colega · direção) (`ESCALAS:view`).
- ``GET  /api/v1/admin/atividades/trocas/{id}/substitutos``   — quem pode ir no lugar (médiuns ativos
  que o tipo alcança e ainda fora da escala), para o pedido "a direção escolhe" (`ESCALAS:edit`).
- ``POST /api/v1/admin/atividades/trocas/{id}/aprovar``        — aprova (`ESCALAS:edit`): troca já
  aceita pelo colega, ou pedido sem colega com `substituto_id` escolhido pela direção.
- ``POST /api/v1/admin/atividades/trocas/{id}/recusar``        — recusa (`ESCALAS:edit`).
- ``POST /api/v1/admin/atividades/trocas/{id}/cancelar``       — cancela um pedido ainda aberto
  (`ESCALAS:edit`).

`substituto_id` do corpo é conferido no terreiro (médium ativo, elegível e fora da escala) antes de
gravar (`validar_substituto_do_tenant`). A auditoria grava só ids. Estas rotas ficam num router
registrado ANTES do `atividades.py`: `/trocas` não pode cair no `GET /{atividade_id}`.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user, require_group_permission, require_plan_feature
from src.core.database import get_db
from src.core.errors import ConflictError, NotFoundError, ValidationError
from src.core.tz import utc_now
from src.models import PermissionFeature, User
from src.models.atividades import TROCA_ACEITO, TROCA_CANCELADO, TROCA_PEDIDO, TROCA_RECUSADO, ParticipacaoTroca
from src.services.audit_service import AuditService
from src.services.presenca import ctx_da_atividade
from src.services.trocas_escala import (
    AGUARDANDO_DIRECAO,
    FECHADA_DIRECAO,
    TrocaVisao,
    aplicar_troca,
    colegas_elegiveis,
    conferir_vigente,
    exige_aprovacao,
    fechar,
    troca_do_tenant,
    troca_travada,
    trocas_do_terreiro,
    validar_substituto_do_tenant,
    visoes,
)

router = APIRouter(
    prefix="/api/v1/admin/atividades",
    tags=["admin-atividades-trocas"],
    dependencies=[
        Depends(require_plan_feature("area_medium")),
        Depends(require_plan_feature("atividades_corrente")),
        Depends(require_plan_feature("escalas")),
    ],
)

HISTORICO_DIAS = 60


# ── Schemas ─────────────────────────────────────────────────────────────────


class TipoMini(BaseModel):
    nome: str
    icone: str
    cor: Optional[str] = None


class AtividadeDaTroca(BaseModel):
    origem: str
    id: str
    atividade_id: Optional[str] = None
    titulo: str
    inicio: datetime
    tipo: TipoMini
    cancelada: bool


class PessoaMini(BaseModel):
    id: uuid.UUID
    nome: str


class TrocaAdmin(BaseModel):
    id: uuid.UUID
    status: str
    aguardando: Optional[str] = None
    vigente: bool
    atividade: AtividadeDaTroca
    funcao: Optional[str] = None
    grupo: Optional[str] = None
    solicitante: PessoaMini
    substituto: Optional[PessoaMini] = None
    indicado_pela_direcao: bool
    recado: Optional[str] = None
    criada_em: datetime
    respondido_em: Optional[datetime] = None
    fechada_em: Optional[datetime] = None
    fechada_por: Optional[str] = None


class TrocasResponse(BaseModel):
    trocas: list[TrocaAdmin]
    # Quantas esperam a direção agora (selo da aba).
    aguardando_direcao: int
    exige_aprovacao: bool


class AprovarBody(BaseModel):
    substituto_id: Optional[uuid.UUID] = None


# ── Ajudantes ───────────────────────────────────────────────────────────────


def _admin(v: TrocaVisao) -> TrocaAdmin:
    t = v.troca
    return TrocaAdmin(
        id=t.id,
        status=t.status,
        aguardando=v.aguardando,
        vigente=v.vigente,
        atividade=AtividadeDaTroca(**v.atividade_dict()),
        funcao=v.funcao,
        grupo=v.grupo,
        solicitante=PessoaMini(id=t.solicitante_id, nome=v.solicitante_nome),
        substituto=PessoaMini(id=t.substituto_id, nome=v.substituto_nome or "Médium") if t.substituto_id else None,
        indicado_pela_direcao=t.indicado_pela_direcao,
        recado=t.recado,
        criada_em=t.created_at,
        respondido_em=t.respondido_em,
        fechada_em=t.fechada_em,
        fechada_por=t.fechada_por,
    )


async def _uma(db: AsyncSession, tenant_id: uuid.UUID, troca: ParticipacaoTroca) -> TrocaAdmin:
    vs = await visoes(db, tenant_id, [troca])
    if not vs:
        raise NotFoundError("Troca")
    return _admin(vs[0])


async def _travada(db: AsyncSession, tenant_id: uuid.UUID, troca_id: uuid.UUID) -> ParticipacaoTroca:
    troca = await troca_travada(db, tenant_id, troca_id)
    if troca is None:
        raise NotFoundError("Troca")
    return troca


async def _auditar(db: AsyncSession, user: User, troca: ParticipacaoTroca, acao: str) -> None:
    """Só ids (nunca nomes nem o recado)."""
    await AuditService(db).log_update(
        tenant_id=user.tenant_id,
        user_id=user.id,
        resource_type="atividade_troca",
        resource_id=troca.id,
        previous_state={},
        new_state={
            "acao": acao,
            "status": troca.status,
            "atividade_id": str(troca.atividade_id),
            "participacao_id": str(troca.participacao_id),
            "solicitante_id": str(troca.solicitante_id),
            "substituto_id": str(troca.substituto_id) if troca.substituto_id else None,
            "nova_participacao_id": str(troca.nova_participacao_id) if troca.nova_participacao_id else None,
        },
    )


# ── Rotas ───────────────────────────────────────────────────────────────────


@router.get(
    "/trocas",
    response_model=TrocasResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "view"))],
)
async def listar_trocas(
    abertas: bool = Query(True, description="Só as abertas (padrão) ou também as dos últimos 60 dias"),
    atividade_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TrocasResponse:
    tenant_id = current_user.tenant_id
    agora = utc_now()
    trocas = await trocas_do_terreiro(
        db,
        tenant_id,
        abertas=abertas,
        atividade_id=atividade_id,
        desde=None if abertas else agora - timedelta(days=HISTORICO_DIAS),
    )
    lista = await visoes(db, tenant_id, trocas, agora)
    if abertas:
        # Aberta com a atividade já começada (ou a escala desfeita) não pede mais nada: só as vigentes
        # e as que ainda dá para cancelar aparecem.
        lista = [v for v in lista if v.vigente or v.ctx.inicio > agora]
    lista.sort(key=lambda v: (v.aguardando != AGUARDANDO_DIRECAO, v.ctx.inicio))
    return TrocasResponse(
        trocas=[_admin(v) for v in lista],
        aguardando_direcao=sum(1 for v in lista if v.aguardando == AGUARDANDO_DIRECAO),
        exige_aprovacao=await exige_aprovacao(db, tenant_id),
    )


@router.get(
    "/trocas/{troca_id}/substitutos",
    response_model=list[PessoaMini],
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "edit"))],
)
async def substitutos_possiveis(
    troca_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PessoaMini]:
    """Quem pode ir no lugar (para a direção escolher)."""
    tenant_id = current_user.tenant_id
    troca = await troca_do_tenant(db, tenant_id, troca_id)
    if troca is None:
        raise NotFoundError("Troca")
    ctx = await ctx_da_atividade(db, tenant_id, troca.atividade_id)
    colegas = await colegas_elegiveis(db, tenant_id, ctx, troca.solicitante_id)
    return [PessoaMini(id=m.id, nome=m.nome) for m in colegas]


@router.post(
    "/trocas/{troca_id}/aprovar",
    response_model=TrocaAdmin,
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "edit"))],
)
async def aprovar_troca(
    body: AprovarBody,
    troca_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TrocaAdmin:
    """Aprova: o colega aceitou (status `aceito`) ou a direção escolhe quem vai (pedido sem colega)."""
    tenant_id = current_user.tenant_id
    agora = utc_now()
    troca = await _travada(db, tenant_id, troca_id)
    ctx, original = await conferir_vigente(db, tenant_id, troca, agora)
    if troca.status == TROCA_PEDIDO and troca.substituto_id is not None:
        raise ConflictError(
            "O colega ainda não aceitou a troca. Espere a resposta ou cancele o pedido.",
            details={"error_code": "AGUARDANDO_COLEGA"},
        )
    substituto_id = troca.substituto_id
    indicado = False
    if troca.status == TROCA_PEDIDO:
        if body.substituto_id is None:
            raise ValidationError("Escolha quem vai no lugar.")
        substituto_id = body.substituto_id
        indicado = True
    elif body.substituto_id is not None and body.substituto_id != troca.substituto_id:
        raise ValidationError("Esta troca já tem o colega que aceitou ir.")
    assert substituto_id is not None
    # Conferido no terreiro: ativo, elegível e ainda fora da escala (senão 422, nada gravado).
    await validar_substituto_do_tenant(db, tenant_id, ctx, troca.solicitante_id, substituto_id, so_visiveis=False)
    troca.indicado_pela_direcao = indicado
    await aplicar_troca(
        db, tenant_id, troca, original, substituto_id, por=FECHADA_DIRECAO, decidido_por=current_user.id, agora=agora
    )
    await _auditar(db, current_user, troca, "aprovou")
    await db.commit()
    return await _uma(db, tenant_id, troca)


@router.post(
    "/trocas/{troca_id}/recusar",
    response_model=TrocaAdmin,
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "edit"))],
)
async def recusar_troca(
    troca_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TrocaAdmin:
    """Recusa a troca que espera a direção. Quem pediu continua na escala."""
    tenant_id = current_user.tenant_id
    troca = await _travada(db, tenant_id, troca_id)
    if not troca.aberta:
        raise ConflictError("Este pedido de troca já foi resolvido.")
    if not (troca.status == TROCA_ACEITO or troca.substituto_id is None):
        raise ConflictError("O colega ainda não respondeu. Para desfazer o pedido, use Cancelar.")
    fechar(troca, TROCA_RECUSADO, FECHADA_DIRECAO, utc_now(), current_user.id)
    await _auditar(db, current_user, troca, "recusou")
    await db.commit()
    return await _uma(db, tenant_id, troca)


@router.post(
    "/trocas/{troca_id}/cancelar",
    response_model=TrocaAdmin,
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "edit"))],
)
async def cancelar_troca(
    troca_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TrocaAdmin:
    """Cancela um pedido ainda aberto (o colega não precisa mais responder)."""
    tenant_id = current_user.tenant_id
    troca = await _travada(db, tenant_id, troca_id)
    if not troca.aberta:
        raise ConflictError("Este pedido de troca já foi resolvido.")
    fechar(troca, TROCA_CANCELADO, FECHADA_DIRECAO, utc_now(), current_user.id)
    await _auditar(db, current_user, troca, "cancelou")
    await db.commit()
    return await _uma(db, tenant_id, troca)
