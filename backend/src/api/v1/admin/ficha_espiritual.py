"""Ficha espiritual do médium — painel (F-05).

Dado religioso (LGPD art. 11): grupo de permissão próprio `FICHA_ESPIRITUAL` (separado de
`MEDIUNS`, sem acesso no grupo padrão "Acesso total" — exceção consciente, AGENTS.md §3.3) e plano
`ficha_espiritual` (Pro) no router. Admin e impersonação passam por cima dos grupos
(`PermissionService.check_permission`), como em todo o painel.

Rotas (prefixo `/api/v1/admin/mediuns`):
- ``GET    /ficha-campos``                       campos da ficha (view)
- ``POST   /ficha-campos``                       novo campo (insert)
- ``PUT    /ficha-campos/{campo_id}``            edita / desarquiva (edit)
- ``DELETE /ficha-campos/{campo_id}``            arquiva (delete; valores ficam)
- ``GET    /ficha-campos/modelos``               modelos de Umbanda e Candomblé (view)
- ``POST   /ficha-campos/modelos/{tradicao}``    aplica um modelo (insert)
- ``GET    /ficha-pendencias``                   sugestões dos médiuns e autorizações retiradas (view)
- ``POST   /ficha-sugestoes/{id}/aceitar``       grava o valor sugerido (edit)
- ``POST   /ficha-sugestoes/{id}/recusar``       recusa (edit)
- ``GET    /{medium_id}/ficha``                  ficha de um médium (view)
- ``PUT    /{medium_id}/ficha``                  grava valores (edit; exige consentimento → 409)
- ``DELETE /{medium_id}/ficha``                  apaga valores, marcos e sugestões (delete)
- ``POST   /{medium_id}/ficha/consentimento``    registra a autorização dada pelo médium (edit)
- ``DELETE /{medium_id}/ficha/consentimento``    registra que o médium retirou a autorização (edit)
- ``GET    /{medium_id}/marcos``                 caminhada (view)
- ``POST   /{medium_id}/marcos``                 novo marco (insert; exige consentimento)
- ``PUT    /{medium_id}/marcos/{marco_id}``      edita (edit; exige consentimento)
- ``DELETE /{medium_id}/marcos/{marco_id}``      apaga (delete)

`medium_id`, `campo_id`, `marco_id` e `sugestao_id` são sempre buscados no terreiro de quem chama
(404/422 antes de gravar). A auditoria registra só ids, contagens e a configuração dos campos —
nunca o valor da ficha nem o conteúdo de um marco. Nada daqui entra em `MediumResponse`,
exportação, CSV ou e-mail.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Path, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user, require_group_permission, require_plan_feature
from src.core.database import get_db
from src.core.errors import ConflictError, ValidationError
from src.core.tz import utc_now
from src.models import FichaCampo, FichaSugestao, FichaValor, Medium, MediumMarco, PermissionFeature, User
from src.models.ficha_espiritual import (
    MARCO_OBSERVACAO_MAX,
    MARCO_TITULO_MAX,
    OPCOES_MAX,
    ROTULO_MAX,
    SUGESTAO_ACEITA,
    SUGESTAO_PENDENTE,
    SUGESTAO_RECUSADA,
    VALOR_MAX,
)
from src.services import ficha_espiritual as fe
from src.services.audit_service import AuditService

router = APIRouter(
    prefix="/api/v1/admin/mediuns",
    tags=["admin-ficha-espiritual"],
    dependencies=[Depends(require_plan_feature("ficha_espiritual"))],
)


# ── Schemas ──────────────────────────────────────────────────────────────────

TipoCampo = Literal["texto", "data", "lista", "sim_nao"]
Tradicao = Literal["umbanda", "candomble", "outra"]
TipoMarco = Literal["entrada", "batismo", "obrigacao", "coroacao", "outro"]


class CampoCreate(BaseModel):
    rotulo: str = Field(..., max_length=ROTULO_MAX * 2)
    tipo: TipoCampo = "texto"
    tradicao: Tradicao = "outra"
    opcoes: Optional[list[str]] = Field(None, max_length=OPCOES_MAX * 2)
    visivel_ao_medium: bool = False
    medium_pode_sugerir: bool = False


class CampoUpdate(BaseModel):
    """Campo ausente não muda. `arquivado=false` desarquiva."""

    rotulo: Optional[str] = Field(None, max_length=ROTULO_MAX * 2)
    tipo: Optional[TipoCampo] = None
    tradicao: Optional[Tradicao] = None
    opcoes: Optional[list[str]] = Field(None, max_length=OPCOES_MAX * 2)
    ordem: Optional[int] = Field(None, ge=0, le=10000)
    visivel_ao_medium: Optional[bool] = None
    medium_pode_sugerir: Optional[bool] = None
    arquivado: Optional[bool] = None


class CampoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    chave: str
    rotulo: str
    tipo: str
    tradicao: str
    opcoes: Optional[list[str]] = None
    ordem: int
    visivel_ao_medium: bool
    medium_pode_sugerir: bool
    arquivado_em: Optional[datetime] = None


class ModeloCampo(BaseModel):
    chave: str
    rotulo: str
    tipo: str
    visivel_ao_medium: bool


class ModeloResponse(BaseModel):
    tradicao: str
    nome: str
    campos: list[ModeloCampo]


class ConsentimentoResponse(BaseModel):
    dado: bool
    em: Optional[datetime] = None
    versao: Optional[str] = None
    versao_atual: str
    revogado_em: Optional[datetime] = None


class CampoComValor(CampoResponse):
    valor: Optional[str] = None
    atualizado_em: Optional[datetime] = None


class SugestaoResponse(BaseModel):
    id: uuid.UUID
    medium_id: uuid.UUID
    medium_nome: str
    campo_id: uuid.UUID
    campo_rotulo: str
    valor_sugerido: str
    valor_atual: Optional[str] = None
    criado_em: datetime


class MediumResumo(BaseModel):
    id: uuid.UUID
    nome: str
    is_active: bool


class FichaResponse(BaseModel):
    medium: MediumResumo
    consentimento: ConsentimentoResponse
    # Autorização retirada e ainda há dados guardados: a tela pede para apagar.
    registros_guardados: int = 0
    campos: list[CampoComValor]
    sugestoes: list[SugestaoResponse]


class ValorIn(BaseModel):
    campo_id: uuid.UUID
    valor: Optional[str] = Field(None, max_length=VALOR_MAX * 2)


class FichaUpdate(BaseModel):
    valores: list[ValorIn] = Field(..., max_length=200)


class ConsentimentoIn(BaseModel):
    confirmo: bool
    versao: str = Field(..., max_length=20)


class MarcoCreate(BaseModel):
    tipo: TipoMarco
    titulo: Optional[str] = Field(None, max_length=MARCO_TITULO_MAX * 2)
    data: date
    observacao: Optional[str] = Field(None, max_length=MARCO_OBSERVACAO_MAX * 2)
    visivel_ao_medium: bool = True


class MarcoUpdate(BaseModel):
    tipo: Optional[TipoMarco] = None
    titulo: Optional[str] = Field(None, max_length=MARCO_TITULO_MAX * 2)
    data: Optional[date] = None
    observacao: Optional[str] = Field(None, max_length=MARCO_OBSERVACAO_MAX * 2)
    visivel_ao_medium: Optional[bool] = None


class MarcoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tipo: str
    titulo: str
    data: date
    observacao: Optional[str] = None
    visivel_ao_medium: bool


class MarcosResponse(BaseModel):
    consentimento: ConsentimentoResponse
    marcos: list[MarcoResponse]


class RevogacaoResponse(BaseModel):
    medium_id: uuid.UUID
    medium_nome: str
    revogado_em: datetime
    registros_guardados: int


class PendenciasResponse(BaseModel):
    sugestoes: list[SugestaoResponse]
    revogacoes: list[RevogacaoResponse]


class ApagadosResponse(BaseModel):
    apagados: int


# ── Auxiliares ───────────────────────────────────────────────────────────────


def _campo_resposta(c: FichaCampo) -> CampoResponse:
    return CampoResponse.model_validate(c)


def _ajustar_visibilidade(campo: FichaCampo) -> None:
    """Sugerir só faz sentido em campo que o médium vê."""
    if campo.medium_pode_sugerir and not campo.visivel_ao_medium:
        campo.visivel_ao_medium = True


async def _sugestoes(
    db: AsyncSession, tenant_id: uuid.UUID, medium_id: Optional[uuid.UUID] = None
) -> list[SugestaoResponse]:
    """Sugestões pendentes de médiuns com autorização em vigor (campos ativos)."""
    stmt = (
        select(FichaSugestao, Medium.nome, FichaCampo.rotulo, FichaValor.valor)
        .join(Medium, Medium.id == FichaSugestao.medium_id)
        .join(FichaCampo, FichaCampo.id == FichaSugestao.campo_id)
        .outerjoin(
            FichaValor,
            (FichaValor.campo_id == FichaSugestao.campo_id)
            & (FichaValor.medium_id == FichaSugestao.medium_id)
            & (FichaValor.tenant_id == tenant_id),
        )
        .where(
            FichaSugestao.tenant_id == tenant_id,
            FichaSugestao.status == SUGESTAO_PENDENTE,
            Medium.tenant_id == tenant_id,
            Medium.deleted_at.is_(None),
            Medium.consentimento_dado_religioso_em.is_not(None),
            FichaCampo.tenant_id == tenant_id,
            FichaCampo.arquivado_em.is_(None),
        )
        .order_by(FichaSugestao.created_at)
    )
    if medium_id is not None:
        stmt = stmt.where(FichaSugestao.medium_id == medium_id)
    rows = (await db.execute(stmt)).all()
    return [
        SugestaoResponse(
            id=s.id,
            medium_id=s.medium_id,
            medium_nome=nome,
            campo_id=s.campo_id,
            campo_rotulo=rotulo,
            valor_sugerido=s.valor_sugerido,
            valor_atual=valor,
            criado_em=s.created_at,
        )
        for s, nome, rotulo, valor in rows
    ]


async def _ficha(db: AsyncSession, tenant_id: uuid.UUID, medium: Medium) -> FichaResponse:
    campos = await fe.campos_do_tenant(db, tenant_id)
    consentido = fe.tem_consentimento(medium)
    # Sem autorização em vigor os valores ficam inacessíveis (revogação = parar de tratar).
    valores = await fe.valores_do_medium(db, tenant_id, medium.id) if consentido else {}
    guardados = 0
    if not consentido and medium.consentimento_dado_religioso_revogado_em is not None:
        guardados = await fe.contar_dados(db, tenant_id, medium.id)
    return FichaResponse(
        medium=MediumResumo(id=medium.id, nome=medium.nome, is_active=medium.is_active),
        consentimento=ConsentimentoResponse(**fe.consentimento_payload(medium)),
        registros_guardados=guardados,
        campos=[
            CampoComValor(
                **_campo_resposta(c).model_dump(),
                valor=valores[c.id].valor if c.id in valores else None,
                atualizado_em=valores[c.id].updated_at if c.id in valores else None,
            )
            for c in campos
        ],
        sugestoes=await _sugestoes(db, tenant_id, medium.id) if consentido else [],
    )


async def _commit_campo(db: AsyncSession) -> None:
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError("Já existe um campo com esse nome.") from exc


# ── Campos ───────────────────────────────────────────────────────────────────


@router.get("/ficha-campos", response_model=list[CampoResponse], dependencies=[Depends(require_group_permission(PermissionFeature.FICHA_ESPIRITUAL, "view"))])
async def listar_campos(
    incluir_arquivados: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CampoResponse]:
    campos = await fe.campos_do_tenant(db, current_user.tenant_id, incluir_arquivados=incluir_arquivados)
    return [_campo_resposta(c) for c in campos]


@router.get("/ficha-campos/modelos", response_model=list[ModeloResponse], dependencies=[Depends(require_group_permission(PermissionFeature.FICHA_ESPIRITUAL, "view"))])
async def listar_modelos() -> list[ModeloResponse]:
    return [
        ModeloResponse(
            tradicao=tradicao,
            nome=m["nome"],
            campos=[ModeloCampo(chave=c[0], rotulo=c[1], tipo=c[2], visivel_ao_medium=c[3]) for c in m["campos"]],
        )
        for tradicao, m in fe.MODELOS.items()
    ]


@router.post(
    "/ficha-campos/modelos/{tradicao}",
    response_model=list[CampoResponse],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_group_permission(PermissionFeature.FICHA_ESPIRITUAL, "insert"))],
)
async def aplicar_modelo(
    tradicao: str = Path(..., max_length=20),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CampoResponse]:
    """Cria os campos do modelo que a casa ainda não tem. Devolve só os criados."""
    tenant_id = current_user.tenant_id
    criados = await fe.aplicar_modelo(db, tenant_id, tradicao)
    if criados:
        await AuditService(db).log_create(
            tenant_id=tenant_id,
            user_id=current_user.id,
            resource_type="ficha_campo",
            resource_id=criados[0].id,
            details={"acao": "aplicou o modelo da ficha", "tradicao": tradicao, "campos": len(criados)},
        )
    await _commit_campo(db)
    return [_campo_resposta(c) for c in criados]


@router.post("/ficha-campos", response_model=CampoResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_group_permission(PermissionFeature.FICHA_ESPIRITUAL, "insert"))])
async def criar_campo(
    body: CampoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CampoResponse:
    tenant_id = current_user.tenant_id
    rotulo = fe.limpar_rotulo(body.rotulo)
    tipo = fe.validar_tipo(body.tipo)
    campo = FichaCampo(
        tenant_id=tenant_id,
        chave=await fe.chave_livre(db, tenant_id, fe.chave_de(rotulo)),
        rotulo=rotulo,
        tipo=tipo,
        tradicao=fe.validar_tradicao(body.tradicao),
        opcoes=fe.limpar_opcoes(tipo, body.opcoes),
        ordem=await fe.proxima_ordem(db, tenant_id),
        visivel_ao_medium=body.visivel_ao_medium,
        medium_pode_sugerir=body.medium_pode_sugerir,
    )
    _ajustar_visibilidade(campo)
    db.add(campo)
    await db.flush()
    await AuditService(db).log_create(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="ficha_campo",
        resource_id=campo.id,
        details={"rotulo": campo.rotulo, "tipo": campo.tipo, "tradicao": campo.tradicao},
    )
    await _commit_campo(db)
    await db.refresh(campo)
    return _campo_resposta(campo)


@router.put("/ficha-campos/{campo_id}", response_model=CampoResponse, dependencies=[Depends(require_group_permission(PermissionFeature.FICHA_ESPIRITUAL, "edit"))])
async def editar_campo(
    body: CampoUpdate,
    campo_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CampoResponse:
    tenant_id = current_user.tenant_id
    campo = await fe.campo_do_tenant(db, tenant_id, campo_id, incluir_arquivado=True)
    sent = body.model_fields_set
    if "tipo" in sent and body.tipo is not None and body.tipo != campo.tipo:
        preenchidos = (
            await db.execute(
                select(FichaValor.id).where(FichaValor.tenant_id == tenant_id, FichaValor.campo_id == campo.id).limit(1)
            )
        ).scalar_one_or_none()
        if preenchidos is not None:
            raise ConflictError("Este campo já está preenchido em alguma ficha: o tipo não pode mudar.")
        campo.tipo = fe.validar_tipo(body.tipo)
        if "opcoes" not in sent:
            campo.opcoes = fe.limpar_opcoes(campo.tipo, campo.opcoes)
    if "rotulo" in sent and body.rotulo is not None:
        campo.rotulo = fe.limpar_rotulo(body.rotulo)
    if "tradicao" in sent and body.tradicao is not None:
        campo.tradicao = fe.validar_tradicao(body.tradicao)
    if "opcoes" in sent:
        campo.opcoes = fe.limpar_opcoes(campo.tipo, body.opcoes)
    if "ordem" in sent and body.ordem is not None:
        campo.ordem = body.ordem
    if "visivel_ao_medium" in sent and body.visivel_ao_medium is not None:
        campo.visivel_ao_medium = body.visivel_ao_medium
        if not body.visivel_ao_medium:
            campo.medium_pode_sugerir = False
    if "medium_pode_sugerir" in sent and body.medium_pode_sugerir is not None:
        campo.medium_pode_sugerir = body.medium_pode_sugerir
    _ajustar_visibilidade(campo)
    if "arquivado" in sent and body.arquivado is not None:
        campo.arquivado_em = utc_now() if body.arquivado else None
    campo.updated_at = utc_now()
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="ficha_campo",
        resource_id=campo.id,
        previous_state={},
        new_state={"rotulo": campo.rotulo, "campos": sorted(sent)},
    )
    await _commit_campo(db)
    await db.refresh(campo)
    return _campo_resposta(campo)


@router.delete("/ficha-campos/{campo_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_group_permission(PermissionFeature.FICHA_ESPIRITUAL, "delete"))])
async def arquivar_campo(
    campo_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Arquiva: o campo sai da ficha e da Área; os valores ficam (desarquivar devolve)."""
    tenant_id = current_user.tenant_id
    campo = await fe.campo_do_tenant(db, tenant_id, campo_id)
    campo.arquivado_em = utc_now()
    await AuditService(db).log_delete(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="ficha_campo",
        resource_id=campo.id,
        previous_state={"rotulo": campo.rotulo},
    )
    await db.commit()


# ── Pendências e sugestões ───────────────────────────────────────────────────


@router.get("/ficha-pendencias", response_model=PendenciasResponse, dependencies=[Depends(require_group_permission(PermissionFeature.FICHA_ESPIRITUAL, "view"))])
async def pendencias(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PendenciasResponse:
    tenant_id = current_user.tenant_id
    revogados = (
        await db.execute(
            select(Medium).where(
                Medium.tenant_id == tenant_id,
                Medium.deleted_at.is_(None),
                Medium.consentimento_dado_religioso_em.is_(None),
                Medium.consentimento_dado_religioso_revogado_em.is_not(None),
            ).order_by(Medium.consentimento_dado_religioso_revogado_em)
        )
    ).scalars().all()
    revogacoes = []
    for m in revogados:
        guardados = await fe.contar_dados(db, tenant_id, m.id)
        if guardados:
            revogacoes.append(
                RevogacaoResponse(
                    medium_id=m.id,
                    medium_nome=m.nome,
                    revogado_em=m.consentimento_dado_religioso_revogado_em,
                    registros_guardados=guardados,
                )
            )
    return PendenciasResponse(sugestoes=await _sugestoes(db, tenant_id), revogacoes=revogacoes)


async def _decidir(
    db: AsyncSession, current_user: User, sugestao_id: uuid.UUID, aceitar: bool
) -> SugestaoResponse:
    tenant_id = current_user.tenant_id
    sugestao = await fe.sugestao_pendente_do_tenant(db, tenant_id, sugestao_id)
    medium = await fe.medium_do_tenant(db, tenant_id, sugestao.medium_id)
    fe.exigir_consentimento(medium)
    campo = await fe.campo_do_tenant(db, tenant_id, sugestao.campo_id)
    atual = next((s for s in await _sugestoes(db, tenant_id, medium.id) if s.id == sugestao.id), None)
    if atual is None:
        raise fe.conflito_sugestao()
    if aceitar:
        valor = fe.normalizar_valor(campo, sugestao.valor_sugerido)
        atuais = await fe.valores_do_medium(db, tenant_id, medium.id)
        await fe.gravar_valor(db, tenant_id, medium.id, campo, valor, current_user.id, atuais)
    sugestao.status = SUGESTAO_ACEITA if aceitar else SUGESTAO_RECUSADA
    sugestao.decidido_em = utc_now()
    sugestao.decidido_por = current_user.id
    sugestao.updated_at = utc_now()
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="ficha_sugestao",
        resource_id=sugestao.id,
        previous_state={"status": SUGESTAO_PENDENTE},
        new_state={"status": sugestao.status, "medium_id": str(medium.id), "campo_id": str(campo.id)},
    )
    await db.commit()
    return atual


@router.post("/ficha-sugestoes/{sugestao_id}/aceitar", response_model=SugestaoResponse, dependencies=[Depends(require_group_permission(PermissionFeature.FICHA_ESPIRITUAL, "edit"))])
async def aceitar_sugestao(
    sugestao_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SugestaoResponse:
    return await _decidir(db, current_user, sugestao_id, aceitar=True)


@router.post("/ficha-sugestoes/{sugestao_id}/recusar", response_model=SugestaoResponse, dependencies=[Depends(require_group_permission(PermissionFeature.FICHA_ESPIRITUAL, "edit"))])
async def recusar_sugestao(
    sugestao_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SugestaoResponse:
    return await _decidir(db, current_user, sugestao_id, aceitar=False)


# ── Ficha de um médium ───────────────────────────────────────────────────────


@router.get("/{medium_id}/ficha", response_model=FichaResponse, dependencies=[Depends(require_group_permission(PermissionFeature.FICHA_ESPIRITUAL, "view"))])
async def obter_ficha(
    medium_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FichaResponse:
    medium = await fe.medium_do_tenant(db, current_user.tenant_id, medium_id)
    return await _ficha(db, current_user.tenant_id, medium)


@router.put("/{medium_id}/ficha", response_model=FichaResponse, dependencies=[Depends(require_group_permission(PermissionFeature.FICHA_ESPIRITUAL, "edit"))])
async def gravar_ficha(
    body: FichaUpdate,
    medium_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FichaResponse:
    tenant_id = current_user.tenant_id
    medium = await fe.medium_do_tenant(db, tenant_id, medium_id)
    fe.exigir_consentimento(medium)
    campos = await fe.validar_campos_ativos_do_tenant(db, tenant_id, [v.campo_id for v in body.valores])
    novos = {v.campo_id: fe.normalizar_valor(campos[v.campo_id], v.valor) for v in body.valores}
    atuais = await fe.valores_do_medium(db, tenant_id, medium.id)
    mudaram = 0
    for campo_id, valor in novos.items():
        if await fe.gravar_valor(db, tenant_id, medium.id, campos[campo_id], valor, current_user.id, atuais):
            mudaram += 1
    if mudaram:
        # Só a contagem: o valor da ficha nunca vai para a auditoria.
        await AuditService(db).log_update(
            tenant_id=tenant_id,
            user_id=current_user.id,
            resource_type="ficha_espiritual",
            resource_id=medium.id,
            previous_state={},
            new_state={"acao": "atualizou a ficha espiritual", "campos_alterados": mudaram},
        )
    await db.commit()
    return await _ficha(db, tenant_id, medium)


@router.delete("/{medium_id}/ficha", response_model=ApagadosResponse, dependencies=[Depends(require_group_permission(PermissionFeature.FICHA_ESPIRITUAL, "delete"))])
async def apagar_ficha(
    medium_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApagadosResponse:
    """Apaga valores, marcos e sugestões do médium (pedido de eliminação / autorização retirada)."""
    tenant_id = current_user.tenant_id
    medium = await fe.medium_do_tenant(db, tenant_id, medium_id)
    apagados = await fe.apagar_dados_da_ficha(db, tenant_id, medium.id)
    await AuditService(db).log_delete(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="ficha_espiritual",
        resource_id=medium.id,
        previous_state={"acao": "apagou os dados da ficha espiritual", "registros": apagados},
    )
    await db.commit()
    return ApagadosResponse(apagados=apagados)


@router.post("/{medium_id}/ficha/consentimento", response_model=ConsentimentoResponse, dependencies=[Depends(require_group_permission(PermissionFeature.FICHA_ESPIRITUAL, "edit"))])
async def registrar_consentimento(
    body: ConsentimentoIn,
    medium_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConsentimentoResponse:
    """A direção registra que o médium autorizou (caixa marcada com o texto na tela)."""
    if not body.confirmo:
        raise ValidationError("Marque a caixa confirmando que o médium autorizou.")
    fe.conferir_versao(body.versao)
    tenant_id = current_user.tenant_id
    medium = await fe.medium_do_tenant(db, tenant_id, medium_id)
    fe.registrar_consentimento(medium, current_user.id)
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="ficha_consentimento",
        resource_id=medium.id,
        previous_state={},
        new_state={"acao": "registrou a autorização do médium", "versao": fe.CONSENTIMENTO_FICHA_VERSAO, "origem": "painel"},
    )
    await db.commit()
    return ConsentimentoResponse(**fe.consentimento_payload(medium))


@router.delete("/{medium_id}/ficha/consentimento", response_model=ConsentimentoResponse, dependencies=[Depends(require_group_permission(PermissionFeature.FICHA_ESPIRITUAL, "edit"))])
async def registrar_revogacao(
    medium_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConsentimentoResponse:
    """O médium pediu à casa para retirar a autorização: os dados ficam inacessíveis até apagar."""
    tenant_id = current_user.tenant_id
    medium = await fe.medium_do_tenant(db, tenant_id, medium_id)
    if fe.revogar_consentimento(medium):
        await AuditService(db).log_update(
            tenant_id=tenant_id,
            user_id=current_user.id,
            resource_type="ficha_consentimento",
            resource_id=medium.id,
            previous_state={},
            new_state={"acao": "registrou que o médium retirou a autorização", "origem": "painel"},
        )
        await db.commit()
    return ConsentimentoResponse(**fe.consentimento_payload(medium))


# ── Caminhada (marcos) ───────────────────────────────────────────────────────


@router.get("/{medium_id}/marcos", response_model=MarcosResponse, dependencies=[Depends(require_group_permission(PermissionFeature.FICHA_ESPIRITUAL, "view"))])
async def listar_marcos(
    medium_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MarcosResponse:
    tenant_id = current_user.tenant_id
    medium = await fe.medium_do_tenant(db, tenant_id, medium_id)
    marcos = await fe.marcos_do_medium(db, tenant_id, medium.id) if fe.tem_consentimento(medium) else []
    return MarcosResponse(
        consentimento=ConsentimentoResponse(**fe.consentimento_payload(medium)),
        marcos=[MarcoResponse.model_validate(m) for m in marcos],
    )


@router.post(
    "/{medium_id}/marcos", response_model=MarcoResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_group_permission(PermissionFeature.FICHA_ESPIRITUAL, "insert"))]
)
async def criar_marco(
    body: MarcoCreate,
    medium_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MarcoResponse:
    tenant_id = current_user.tenant_id
    medium = await fe.medium_do_tenant(db, tenant_id, medium_id)
    fe.exigir_consentimento(medium)
    tipo, titulo, observacao = fe.limpar_marco(body.tipo, body.titulo, body.observacao)
    marco = MediumMarco(
        tenant_id=tenant_id,
        medium_id=medium.id,
        tipo=tipo,
        titulo=titulo,
        data=body.data,
        observacao=observacao,
        visivel_ao_medium=body.visivel_ao_medium,
        registrado_por=current_user.id,
    )
    db.add(marco)
    await db.flush()
    await AuditService(db).log_create(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="medium_marco",
        resource_id=marco.id,
        details={"medium_id": str(medium.id)},
    )
    await db.commit()
    await db.refresh(marco)
    return MarcoResponse.model_validate(marco)


@router.put("/{medium_id}/marcos/{marco_id}", response_model=MarcoResponse, dependencies=[Depends(require_group_permission(PermissionFeature.FICHA_ESPIRITUAL, "edit"))])
async def editar_marco(
    body: MarcoUpdate,
    medium_id: uuid.UUID = Path(...),
    marco_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MarcoResponse:
    tenant_id = current_user.tenant_id
    medium = await fe.medium_do_tenant(db, tenant_id, medium_id)
    fe.exigir_consentimento(medium)
    marco = await fe.marco_do_medium(db, tenant_id, medium.id, marco_id)
    sent = body.model_fields_set
    tipo = body.tipo if "tipo" in sent and body.tipo is not None else marco.tipo
    titulo = body.titulo if "titulo" in sent and body.titulo is not None else marco.titulo
    observacao = body.observacao if "observacao" in sent else marco.observacao
    marco.tipo, marco.titulo, marco.observacao = fe.limpar_marco(tipo, titulo, observacao)
    if "data" in sent and body.data is not None:
        marco.data = body.data
    if "visivel_ao_medium" in sent and body.visivel_ao_medium is not None:
        marco.visivel_ao_medium = body.visivel_ao_medium
    marco.updated_at = utc_now()
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="medium_marco",
        resource_id=marco.id,
        previous_state={},
        new_state={"medium_id": str(medium.id), "campos": sorted(sent)},
    )
    await db.commit()
    await db.refresh(marco)
    return MarcoResponse.model_validate(marco)


@router.delete("/{medium_id}/marcos/{marco_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_group_permission(PermissionFeature.FICHA_ESPIRITUAL, "delete"))])
async def apagar_marco(
    medium_id: uuid.UUID = Path(...),
    marco_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    tenant_id = current_user.tenant_id
    medium = await fe.medium_do_tenant(db, tenant_id, medium_id)
    marco = await fe.marco_do_medium(db, tenant_id, medium.id, marco_id)
    await db.delete(marco)
    await AuditService(db).log_delete(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="medium_marco",
        resource_id=marco_id,
        previous_state={"medium_id": str(medium.id)},
    )
    await db.commit()
