"""Atividades da casa — painel (AM-08).

Todas as rotas exigem o plano/chave do piloto `area_medium` e o plano com `atividades_corrente`
(Basic); grupo de permissão `ESCALAS` ("Atividades e escalas", §6.7 do plano). Atividade interna
nunca conta no limite de giras/mês e nunca vai ao site, à agenda pública ou ao sitemap (D-03).

Calendário da casa:
- ``GET    /api/v1/admin/atividades/calendario``             — giras + atividades no período, formato
  unificado (`view`)

Tipos de atividade (o tipo "Gira" é de sistema: renomeia, não arquiva):
- ``GET    /api/v1/admin/atividades/tipos``                  — lista (`view`)
- ``POST   /api/v1/admin/atividades/tipos``                  — cria (`insert`)
- ``PUT    /api/v1/admin/atividades/tipos/{id}``             — edita opções e grupos elegíveis (`edit`)
- ``POST   /api/v1/admin/atividades/tipos/{id}/desarquivar`` — volta (`edit`)
- ``DELETE /api/v1/admin/atividades/tipos/{id}``             — arquiva (`delete`)

Funções da corrente (Cambone, Porteiro, Ogã/Atabaque...):
- ``GET    /api/v1/admin/atividades/funcoes``                — lista (`view`)
- ``POST   /api/v1/admin/atividades/funcoes``                — cria (`insert`)
- ``PUT    /api/v1/admin/atividades/funcoes/{id}``           — edita (`edit`)
- ``POST   /api/v1/admin/atividades/funcoes/{id}/desarquivar`` — volta (`edit`)
- ``DELETE /api/v1/admin/atividades/funcoes/{id}``           — arquiva (`delete`)

Âncora da gira (para a escala e a presença, AM-17/AM-18):
- ``POST   /api/v1/admin/atividades/da-gira/{gira_id}``      — cria ou devolve (`insert`)

Atividades internas:
- ``GET    /api/v1/admin/atividades``                        — lista no período (`view`)
- ``GET    /api/v1/admin/atividades/{id}``                   — detalhe (`view`)
- ``POST   /api/v1/admin/atividades``                        — cria (`insert`)
- ``PUT    /api/v1/admin/atividades/{id}``                   — edita (`edit`)
- ``POST   /api/v1/admin/atividades/{id}/cancelar``          — cancela com motivo (`edit`)
- ``POST   /api/v1/admin/atividades/{id}/reativar``          — desfaz o cancelamento (`edit`)
- ``DELETE /api/v1/admin/atividades/{id}``                   — exclui (soft delete, `delete`)

Todo `tipo_id`/`grupo_id`/`gira_id` e id de caminho é conferido no terreiro antes de gravar
(checagem 4 do auditor de tenant).

Presença (AM-17/AM-28): o tipo ganha `presenca_modo` (null = padrão da casa; `confianca` · `app` ·
`qr`) — `checkin_pelo_medium` segue em sincronia (modo app/qr). Cancelar a atividade dispensa a
escala; desfazer o cancelamento devolve quem o cancelamento dispensou. Confirmações, convocação,
chamada e QR ficam em `atividades_presenca.py`.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user, require_group_permission, require_plan_feature
from src.core.database import get_db
from src.core.errors import ConflictError, NotFoundError, ValidationError
from src.core.tz import APP_TZ, local_day_bounds_utc, today_local, utc_now
from src.models import Atividade, AtividadeTipo, AtividadeTipoGrupo, FuncaoCorrente, Gira, PermissionFeature, User
from src.models.atividades import (
    CHECKIN_ANTES_PADRAO,
    CHECKIN_DEPOIS_PADRAO,
    MOTIVO_MAX,
    NATUREZA_ATIVIDADE,
    NATUREZA_GIRA,
    NOME_MAX,
    TITULO_MAX,
)
from src.services.atividades import (
    MSG_NOME_FUNCAO,
    atividade_da_gira,
    ensure_default_atividade_tipos,
    fim_padrao,
    grupos_dos_tipos,
    hora_de_texto,
    limpar_descricao_funcao,
    limpar_local,
    limpar_motivo,
    limpar_nome,
    limpar_texto,
    limpar_titulo_atividade,
    tipo_resumo,
    validar_convocacao,
    validar_cor_tipo,
    validar_duracao,
    validar_elegiveis,
    validar_icone,
    validar_minutos_checkin,
    validar_modo_escala,
    validar_tipo_ativo_do_tenant,
    validar_visibilidade,
)
from src.services.audit_service import AuditService
from src.services.corrente_grupos import validar_grupos_ativos_do_tenant
from src.services.medium_agenda import PeriodoInvalido, periodo_da_agenda
from src.services.presenca import (
    MODO_APP,
    MODO_QR,
    config_presenca,
    desfazer_dispensa_do_cancelamento,
    dispensar_por_cancelamento,
    modo_efetivo,
    validar_modo,
)

router = APIRouter(
    prefix="/api/v1/admin/atividades",
    tags=["admin-atividades"],
    dependencies=[
        Depends(require_plan_feature("area_medium")),
        Depends(require_plan_feature("atividades_corrente")),
    ],
)

MSG_TIPO_REPETIDO = "Já existe um tipo de atividade com esse nome."
MSG_FUNCAO_REPETIDA = "Já existe uma função com esse nome."
MSG_GRUPOS_ELEGIVEIS = "Escolha pelo menos um grupo da corrente."
MSG_GIRA_NAO_ARQUIVA = "O tipo Gira é da casa: dá para renomear, mas não para arquivar."
MSG_CANCELADA = "Esta atividade foi cancelada. Desfaça o cancelamento para editar."
TEXTO_MAX = 5000


# ── Schemas ─────────────────────────────────────────────────────────────────


class GrupoResumo(BaseModel):
    id: uuid.UUID
    nome: str
    cor: str


class TipoBase(BaseModel):
    icone: Optional[str] = None
    cor: Optional[str] = None
    controla_presenca: Optional[bool] = None
    pede_confirmacao: Optional[bool] = None
    exige_justificativa: Optional[bool] = None
    checkin_pelo_medium: Optional[bool] = None
    checkin_antes_min: Optional[int] = None
    checkin_depois_min: Optional[int] = None
    # AM-28: null = padrão da casa.
    presenca_modo: Optional[str] = None
    elegiveis: Optional[str] = None
    grupo_ids: Optional[list[uuid.UUID]] = Field(None, max_length=100)
    convocacao_padrao: Optional[str] = None
    modo_escala: Optional[str] = None
    hora_padrao: Optional[str] = Field(None, max_length=8)
    duracao_min: Optional[int] = None
    visibilidade_padrao: Optional[str] = None


class TipoCreate(TipoBase):
    nome: str = Field(..., max_length=NOME_MAX * 2)


class TipoUpdate(TipoBase):
    """Campo ausente não muda. `cor: null` volta para a cor do terreiro."""

    nome: Optional[str] = Field(None, max_length=NOME_MAX * 2)


class TipoResponse(BaseModel):
    id: uuid.UUID
    nome: str
    natureza: str
    icone: str
    cor: Optional[str] = None
    controla_presenca: bool
    pede_confirmacao: bool
    exige_justificativa: bool
    checkin_pelo_medium: bool
    checkin_antes_min: int
    checkin_depois_min: int
    # AM-28: modo do tipo (null = padrão da casa) e o que vale de fato.
    presenca_modo: Optional[str] = None
    presenca_modo_efetivo: str = "confianca"
    elegiveis: str
    grupos: list[GrupoResumo]
    convocacao_padrao: str
    modo_escala: str
    hora_padrao: Optional[str] = None
    duracao_min: Optional[int] = None
    visibilidade_padrao: str
    is_sistema: bool
    # Só o tipo Gira corresponde ao que vai ao site (a gira de verdade); não é editável.
    visivel_no_site: bool
    ordem: int
    arquivado_em: Optional[datetime] = None


class FuncaoCreate(BaseModel):
    nome: str = Field(..., max_length=NOME_MAX * 2)
    descricao: Optional[str] = Field(None, max_length=600)


class FuncaoUpdate(BaseModel):
    nome: Optional[str] = Field(None, max_length=NOME_MAX * 2)
    descricao: Optional[str] = Field(None, max_length=600)


class FuncaoResponse(BaseModel):
    id: uuid.UUID
    nome: str
    descricao: Optional[str] = None
    ordem: int
    arquivado_em: Optional[datetime] = None


class TipoMini(BaseModel):
    id: Optional[uuid.UUID] = None
    nome: str
    icone: str
    cor: Optional[str] = None


class AtividadeCreate(BaseModel):
    tipo_id: uuid.UUID
    titulo: Optional[str] = Field(None, max_length=TITULO_MAX * 2)
    inicio: datetime
    fim: Optional[datetime] = None
    local: Optional[str] = Field(None, max_length=400)
    descricao: Optional[str] = Field(None, max_length=TEXTO_MAX * 2)
    orientacoes: Optional[str] = Field(None, max_length=TEXTO_MAX * 2)
    visibilidade: Optional[str] = None


class AtividadeUpdate(BaseModel):
    tipo_id: Optional[uuid.UUID] = None
    titulo: Optional[str] = Field(None, max_length=TITULO_MAX * 2)
    inicio: Optional[datetime] = None
    fim: Optional[datetime] = None
    local: Optional[str] = Field(None, max_length=400)
    descricao: Optional[str] = Field(None, max_length=TEXTO_MAX * 2)
    orientacoes: Optional[str] = Field(None, max_length=TEXTO_MAX * 2)
    visibilidade: Optional[str] = None


class CancelarBody(BaseModel):
    motivo: str = Field(..., max_length=MOTIVO_MAX * 2)


class AtividadeResponse(BaseModel):
    id: uuid.UUID
    tipo: TipoMini
    gira_id: Optional[uuid.UUID] = None
    titulo: str
    inicio: datetime
    fim: Optional[datetime] = None
    local: Optional[str] = None
    descricao: Optional[str] = None
    orientacoes: Optional[str] = None
    visibilidade: str
    origem: str
    cancelada_em: Optional[datetime] = None
    cancelamento_motivo: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CalendarioItem(BaseModel):
    origem: str  # "gira" | "atividade"
    id: uuid.UUID
    tipo: TipoMini
    titulo: str
    inicio: datetime
    fim: Optional[datetime] = None
    local: Optional[str] = None
    visibilidade: Optional[str] = None
    cancelada: bool = False


class CalendarioResponse(BaseModel):
    inicio: date
    fim: date
    itens: list[CalendarioItem]


# ── Ajudantes ───────────────────────────────────────────────────────────────


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """Horário sem fuso vale como Brasília (o painel manda em UTC; isto é só rede de segurança)."""
    if dt is None:
        return None
    return dt.replace(tzinfo=APP_TZ) if dt.tzinfo is None else dt


def _hora_texto(tipo: AtividadeTipo) -> Optional[str]:
    return tipo.hora_padrao.strftime("%H:%M") if tipo.hora_padrao else None


def _tipo_resposta(tipo: AtividadeTipo, grupos: list, modo_casa: Optional[str] = None) -> TipoResponse:
    return TipoResponse(
        id=tipo.id,
        nome=tipo.nome,
        natureza=tipo.natureza,
        icone=tipo.icone,
        cor=tipo.cor,
        controla_presenca=tipo.controla_presenca,
        pede_confirmacao=tipo.pede_confirmacao,
        exige_justificativa=tipo.exige_justificativa,
        checkin_pelo_medium=tipo.checkin_pelo_medium,
        checkin_antes_min=tipo.checkin_antes_min,
        checkin_depois_min=tipo.checkin_depois_min,
        presenca_modo=tipo.presenca_modo,
        presenca_modo_efetivo=modo_efetivo(tipo.presenca_modo, modo_casa),
        elegiveis=tipo.elegiveis,
        grupos=[GrupoResumo(id=g.id, nome=g.nome, cor=g.cor) for g in grupos],
        convocacao_padrao=tipo.convocacao_padrao,
        modo_escala=tipo.modo_escala,
        hora_padrao=_hora_texto(tipo),
        duracao_min=tipo.duracao_min,
        visibilidade_padrao=tipo.visibilidade_padrao,
        is_sistema=tipo.is_sistema,
        visivel_no_site=tipo.natureza == NATUREZA_GIRA,
        ordem=tipo.ordem,
        arquivado_em=tipo.arquivado_em,
    )


def _tipo_mini(tipo: Optional[AtividadeTipo]) -> TipoMini:
    resumo = tipo_resumo(tipo)
    return TipoMini(id=tipo.id if tipo else None, **resumo)


def _snapshot_tipo(t: AtividadeTipo) -> dict:
    return {
        "nome": t.nome,
        "icone": t.icone,
        "cor": t.cor,
        "elegiveis": t.elegiveis,
        "convocacao_padrao": t.convocacao_padrao,
        "modo_escala": t.modo_escala,
        "visibilidade_padrao": t.visibilidade_padrao,
        "presenca_modo": t.presenca_modo,
    }


def _snapshot_atividade(a: Atividade) -> dict:
    return {
        "titulo": a.titulo,
        "inicio": a.inicio.isoformat() if a.inicio else None,
        "fim": a.fim.isoformat() if a.fim else None,
        "local": a.local,
        "visibilidade": a.visibilidade,
        "tipo_id": str(a.tipo_id),
    }


def _periodo(inicio: Optional[str], fim: Optional[str]) -> tuple[date, date]:
    def _dia(valor: Optional[str], campo: str) -> Optional[date]:
        if valor is None or not valor.strip():
            return None
        try:
            return date.fromisoformat(valor.strip()[:10])
        except ValueError:
            raise HTTPException(status_code=400, detail=f"{campo} deve estar no formato AAAA-MM-DD")

    try:
        return periodo_da_agenda(today_local(), _dia(inicio, "inicio"), _dia(fim, "fim"))
    except PeriodoInvalido as exc:
        raise HTTPException(status_code=400, detail=str(exc))


async def _commit_ou_conflito(db: AsyncSession, indice: str, mensagem: str) -> None:
    """O índice único parcial segura a corrida entre dois cadastros com o mesmo nome."""
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if indice in str(exc.orig):
            raise ConflictError(mensagem) from exc
        raise


# ── Tipos: consultas ────────────────────────────────────────────────────────


async def _tipo_do_tenant(
    db: AsyncSession, tenant_id: uuid.UUID, tipo_id: uuid.UUID, *, incluir_arquivado: bool = False
) -> AtividadeTipo:
    stmt = select(AtividadeTipo).where(AtividadeTipo.id == tipo_id, AtividadeTipo.tenant_id == tenant_id)
    if not incluir_arquivado:
        stmt = stmt.where(AtividadeTipo.arquivado_em.is_(None))
    tipo = (await db.execute(stmt)).scalar_one_or_none()
    if tipo is None:
        raise NotFoundError("Tipo de atividade")
    return tipo


async def _nome_tipo_livre(
    db: AsyncSession, tenant_id: uuid.UUID, nome: str, ignorar: Optional[uuid.UUID] = None
) -> None:
    stmt = select(AtividadeTipo.id).where(
        AtividadeTipo.tenant_id == tenant_id,
        AtividadeTipo.arquivado_em.is_(None),
        func.lower(AtividadeTipo.nome) == nome.lower(),
    )
    if ignorar is not None:
        stmt = stmt.where(AtividadeTipo.id != ignorar)
    if (await db.execute(stmt.limit(1))).scalar_one_or_none() is not None:
        raise ConflictError(MSG_TIPO_REPETIDO)


async def _resposta_tipo(db: AsyncSession, tenant_id: uuid.UUID, tipo: AtividadeTipo) -> TipoResponse:
    grupos = await grupos_dos_tipos(db, tenant_id, [tipo.id])
    modo_casa, _ = await config_presenca(db, tenant_id)
    return _tipo_resposta(tipo, grupos.get(tipo.id, []), modo_casa)


async def _validar_grupos_elegiveis_do_tenant(
    db: AsyncSession, tenant_id: uuid.UUID, tipo: AtividadeTipo, grupo_ids: Optional[list[uuid.UUID]]
) -> Optional[list[str]]:
    """Prepara a troca dos grupos elegíveis do tipo (sem gravar os novos vínculos).

    - `elegiveis` diferente de `grupos`: apaga os vínculos e devolve [] (nada a gravar);
    - `grupo_ids` None: mantém os de antes (precisa haver pelo menos um ativo) e devolve None;
    - senão confere que todos são grupos ATIVOS do terreiro (pelo menos um; senão 422), apaga
      os vínculos antigos e devolve os nomes — quem chamou grava os novos com os mesmos ids.
    """
    if tipo.elegiveis != "grupos":
        await db.execute(
            delete(AtividadeTipoGrupo).where(
                AtividadeTipoGrupo.tenant_id == tenant_id, AtividadeTipoGrupo.tipo_id == tipo.id
            )
        )
        return []
    if grupo_ids is None:
        atuais = (await grupos_dos_tipos(db, tenant_id, [tipo.id])).get(tipo.id, [])
        if not atuais:
            raise ValidationError(MSG_GRUPOS_ELEGIVEIS)
        return None
    grupos = await validar_grupos_ativos_do_tenant(db, tenant_id, grupo_ids)
    if not grupos:
        raise ValidationError(MSG_GRUPOS_ELEGIVEIS)
    await db.execute(
        delete(AtividadeTipoGrupo).where(AtividadeTipoGrupo.tenant_id == tenant_id, AtividadeTipoGrupo.tipo_id == tipo.id)
    )
    return [g.nome for g in grupos]


def _aplicar_opcoes(tipo: AtividadeTipo, body: TipoBase, enviados: set[str]) -> None:
    """Copia para o tipo as opções enviadas (validadas). Nada aqui toca natureza/sistema."""
    if "icone" in enviados and body.icone is not None:
        tipo.icone = validar_icone(body.icone)
    if "cor" in enviados:
        tipo.cor = validar_cor_tipo(body.cor)
    for campo in ("controla_presenca", "pede_confirmacao", "exige_justificativa"):
        if campo in enviados and getattr(body, campo) is not None:
            setattr(tipo, campo, bool(getattr(body, campo)))
    # Modo de presença (AM-28). `checkin_pelo_medium` (AM-08) segue em sincronia; quem ainda
    # manda só ele: ligar = "Cheguei" pelo app, desligar = confiança.
    if "presenca_modo" in enviados:
        tipo.presenca_modo = validar_modo(body.presenca_modo, permite_nulo=True)
        tipo.checkin_pelo_medium = tipo.presenca_modo in (MODO_APP, MODO_QR)
    elif "checkin_pelo_medium" in enviados and body.checkin_pelo_medium is not None:
        ligado = bool(body.checkin_pelo_medium)
        if ligado and tipo.presenca_modo not in (MODO_APP, MODO_QR):
            tipo.presenca_modo = MODO_APP
        elif not ligado and tipo.presenca_modo in (MODO_APP, MODO_QR):
            tipo.presenca_modo = "confianca"
        tipo.checkin_pelo_medium = ligado
    if "checkin_antes_min" in enviados and body.checkin_antes_min is not None:
        tipo.checkin_antes_min = validar_minutos_checkin(body.checkin_antes_min)
    if "checkin_depois_min" in enviados and body.checkin_depois_min is not None:
        tipo.checkin_depois_min = validar_minutos_checkin(body.checkin_depois_min)
    if "elegiveis" in enviados and body.elegiveis is not None:
        tipo.elegiveis = validar_elegiveis(body.elegiveis)
    if "convocacao_padrao" in enviados and body.convocacao_padrao is not None:
        tipo.convocacao_padrao = validar_convocacao(body.convocacao_padrao)
    if "modo_escala" in enviados and body.modo_escala is not None:
        tipo.modo_escala = validar_modo_escala(body.modo_escala)
    if "hora_padrao" in enviados:
        tipo.hora_padrao = hora_de_texto(body.hora_padrao)
    if "duracao_min" in enviados:
        tipo.duracao_min = validar_duracao(body.duracao_min)
    if "visibilidade_padrao" in enviados and body.visibilidade_padrao is not None:
        tipo.visibilidade_padrao = validar_visibilidade(body.visibilidade_padrao)


# ── Funções: consultas ──────────────────────────────────────────────────────


async def _funcao_do_tenant(
    db: AsyncSession, tenant_id: uuid.UUID, funcao_id: uuid.UUID, *, incluir_arquivada: bool = False
) -> FuncaoCorrente:
    stmt = select(FuncaoCorrente).where(FuncaoCorrente.id == funcao_id, FuncaoCorrente.tenant_id == tenant_id)
    if not incluir_arquivada:
        stmt = stmt.where(FuncaoCorrente.arquivado_em.is_(None))
    funcao = (await db.execute(stmt)).scalar_one_or_none()
    if funcao is None:
        raise NotFoundError("Função")
    return funcao


async def _nome_funcao_livre(
    db: AsyncSession, tenant_id: uuid.UUID, nome: str, ignorar: Optional[uuid.UUID] = None
) -> None:
    stmt = select(FuncaoCorrente.id).where(
        FuncaoCorrente.tenant_id == tenant_id,
        FuncaoCorrente.arquivado_em.is_(None),
        func.lower(FuncaoCorrente.nome) == nome.lower(),
    )
    if ignorar is not None:
        stmt = stmt.where(FuncaoCorrente.id != ignorar)
    if (await db.execute(stmt.limit(1))).scalar_one_or_none() is not None:
        raise ConflictError(MSG_FUNCAO_REPETIDA)


def _funcao_resposta(f: FuncaoCorrente) -> FuncaoResponse:
    return FuncaoResponse(id=f.id, nome=f.nome, descricao=f.descricao, ordem=f.ordem, arquivado_em=f.arquivado_em)


# ── Atividades: consultas ───────────────────────────────────────────────────


async def _atividade_do_tenant(db: AsyncSession, tenant_id: uuid.UUID, atividade_id: uuid.UUID) -> Atividade:
    """Atividade INTERNA do terreiro, não excluída (âncora de gira se edita pela gira)."""
    atividade = (
        await db.execute(
            select(Atividade).where(
                Atividade.id == atividade_id,
                Atividade.tenant_id == tenant_id,
                Atividade.deleted_at.is_(None),
                Atividade.gira_id.is_(None),
            )
        )
    ).scalar_one_or_none()
    if atividade is None:
        raise NotFoundError("Atividade")
    return atividade


async def _tipos_por_id(db: AsyncSession, tenant_id: uuid.UUID, ids: set[uuid.UUID]) -> dict[uuid.UUID, AtividadeTipo]:
    if not ids:
        return {}
    rows = await db.execute(
        select(AtividadeTipo).where(AtividadeTipo.tenant_id == tenant_id, AtividadeTipo.id.in_(ids))
    )
    return {t.id: t for t in rows.scalars().all()}


def _atividade_resposta(a: Atividade, tipo: Optional[AtividadeTipo], gira: Optional[Gira] = None) -> AtividadeResponse:
    return AtividadeResponse(
        id=a.id,
        tipo=_tipo_mini(tipo),
        gira_id=a.gira_id,
        titulo=(gira.nome if gira is not None else a.titulo) or "",
        inicio=gira.data_inicio if gira is not None else a.inicio,
        fim=gira.data_fim if gira is not None else a.fim,
        local=(gira.local if gira is not None else a.local) or None,
        descricao=a.descricao,
        orientacoes=a.orientacoes,
        visibilidade=a.visibilidade,
        origem=a.origem,
        cancelada_em=a.cancelada_em,
        cancelamento_motivo=a.cancelamento_motivo,
        created_at=a.created_at,
        updated_at=a.updated_at,
    )


async def _resposta_atividade(db: AsyncSession, tenant_id: uuid.UUID, a: Atividade) -> AtividadeResponse:
    tipos = await _tipos_por_id(db, tenant_id, {a.tipo_id})
    return _atividade_resposta(a, tipos.get(a.tipo_id))


# ── Rotas: calendário ───────────────────────────────────────────────────────


@router.get("/calendario", response_model=CalendarioResponse, dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "view"))])
async def calendario_da_casa(
    inicio: Optional[str] = Query(None, description="Primeiro dia (AAAA-MM-DD, Brasília)"),
    fim: Optional[str] = Query(None, description="Último dia (AAAA-MM-DD, Brasília)"),
    tipo_id: Optional[uuid.UUID] = Query(None, description="Só um tipo (o tipo Gira traz só as giras)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CalendarioResponse:
    """Giras ativas e atividades internas (canceladas também, marcadas) no período."""
    tenant_id = current_user.tenant_id
    ini, fim_ = _periodo(inicio, fim)
    de, ate = local_day_bounds_utc(ini, fim_)

    tipos = {
        t.id: t
        for t in (
            await db.execute(select(AtividadeTipo).where(AtividadeTipo.tenant_id == tenant_id))
        ).scalars().all()
    }
    tipo_gira = next((t for t in tipos.values() if t.natureza == NATUREZA_GIRA), None)
    filtro = tipos.get(tipo_id) if tipo_id is not None else None
    if tipo_id is not None and filtro is None:
        raise NotFoundError("Tipo de atividade")

    itens: list[CalendarioItem] = []
    if filtro is None or filtro.natureza == NATUREZA_GIRA:
        giras = (
            await db.execute(
                select(Gira)
                .where(
                    Gira.tenant_id == tenant_id,
                    Gira.deleted_at.is_(None),
                    Gira.is_active.is_(True),
                    Gira.data_inicio >= de,
                    Gira.data_inicio < ate,
                )
                .order_by(Gira.data_inicio)
            )
        ).scalars().all()
        itens += [
            CalendarioItem(
                origem="gira",
                id=g.id,
                tipo=_tipo_mini(tipo_gira),
                titulo=g.nome,
                inicio=g.data_inicio,
                fim=g.data_fim,
                local=g.local or None,
            )
            for g in giras
        ]
    if filtro is None or filtro.natureza == NATUREZA_ATIVIDADE:
        stmt = select(Atividade).where(
            Atividade.tenant_id == tenant_id,
            Atividade.deleted_at.is_(None),
            Atividade.gira_id.is_(None),
            Atividade.inicio >= de,
            Atividade.inicio < ate,
        )
        if filtro is not None:
            stmt = stmt.where(Atividade.tipo_id == filtro.id)
        atividades = (await db.execute(stmt.order_by(Atividade.inicio))).scalars().all()
        itens += [
            CalendarioItem(
                origem="atividade",
                id=a.id,
                tipo=_tipo_mini(tipos.get(a.tipo_id)),
                titulo=a.titulo or "",
                inicio=a.inicio,
                fim=a.fim,
                local=a.local,
                visibilidade=a.visibilidade,
                cancelada=a.cancelada_em is not None,
            )
            for a in atividades
        ]
    itens.sort(key=lambda i: (i.inicio, i.titulo.lower()))
    return CalendarioResponse(inicio=ini, fim=fim_, itens=itens)


# ── Rotas: tipos ────────────────────────────────────────────────────────────


@router.get("/tipos", response_model=list[TipoResponse], dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "view"))])
async def listar_tipos(
    incluir_arquivados: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TipoResponse]:
    """Tipos na ordem da casa (Gira primeiro). Terreiro sem tipos ganha os sugeridos."""
    tenant_id = current_user.tenant_id
    if await ensure_default_atividade_tipos(db, tenant_id):
        await db.commit()
    stmt = select(AtividadeTipo).where(AtividadeTipo.tenant_id == tenant_id)
    if not incluir_arquivados:
        stmt = stmt.where(AtividadeTipo.arquivado_em.is_(None))
    tipos = (
        await db.execute(
            stmt.order_by(
                AtividadeTipo.arquivado_em.is_not(None), AtividadeTipo.ordem, func.lower(AtividadeTipo.nome)
            )
        )
    ).scalars().all()
    grupos = await grupos_dos_tipos(db, tenant_id, [t.id for t in tipos])
    modo_casa, _ = await config_presenca(db, tenant_id)
    return [_tipo_resposta(t, grupos.get(t.id, []), modo_casa) for t in tipos]


@router.post("/tipos", response_model=TipoResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "insert"))])
async def criar_tipo(
    body: TipoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TipoResponse:
    tenant_id = current_user.tenant_id
    nome = limpar_nome(body.nome)
    await _nome_tipo_livre(db, tenant_id, nome)
    proxima_ordem = (
        await db.execute(select(func.max(AtividadeTipo.ordem)).where(AtividadeTipo.tenant_id == tenant_id))
    ).scalar()
    tipo = AtividadeTipo(
        tenant_id=tenant_id,
        nome=nome,
        natureza=NATUREZA_ATIVIDADE,
        icone="estrela",
        cor=None,
        controla_presenca=True,
        pede_confirmacao=True,
        exige_justificativa=False,
        checkin_pelo_medium=False,
        checkin_antes_min=CHECKIN_ANTES_PADRAO,
        checkin_depois_min=CHECKIN_DEPOIS_PADRAO,
        elegiveis="todos",
        convocacao_padrao="todos_elegiveis",
        modo_escala="nenhuma",
        visibilidade_padrao="corrente",
        is_sistema=False,
        ordem=(proxima_ordem or 0) + 1,
    )
    _aplicar_opcoes(tipo, body, body.model_fields_set)
    db.add(tipo)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(MSG_TIPO_REPETIDO) from exc
    grupos = await _validar_grupos_elegiveis_do_tenant(db, tenant_id, tipo, body.grupo_ids or [])
    if grupos:
        # grupo_ids já conferidos no terreiro (_validar_grupos_elegiveis_do_tenant acima).
        for grupo_id in set(body.grupo_ids or []):
            db.add(AtividadeTipoGrupo(tenant_id=tenant_id, tipo_id=tipo.id, grupo_id=grupo_id))
    await AuditService(db).log_create(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="atividade_tipo",
        resource_id=tipo.id,
        details={**_snapshot_tipo(tipo), "grupos": grupos},
    )
    await _commit_ou_conflito(db, "uq_atividade_tipos_tenant_nome_ativo", MSG_TIPO_REPETIDO)
    await db.refresh(tipo)
    return await _resposta_tipo(db, tenant_id, tipo)


@router.put("/tipos/{tipo_id}", response_model=TipoResponse, dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "edit"))])
async def editar_tipo(
    body: TipoUpdate,
    tipo_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TipoResponse:
    tenant_id = current_user.tenant_id
    tipo = await _tipo_do_tenant(db, tenant_id, tipo_id)
    antes = _snapshot_tipo(tipo)
    enviados = body.model_fields_set
    if "nome" in enviados and body.nome is not None:
        nome = limpar_nome(body.nome)
        if nome.lower() != tipo.nome.lower():
            await _nome_tipo_livre(db, tenant_id, nome, ignorar=tipo.id)
        tipo.nome = nome
    _aplicar_opcoes(tipo, body, enviados)
    depois = _snapshot_tipo(tipo)
    if "elegiveis" in enviados or "grupo_ids" in enviados:
        grupos = await _validar_grupos_elegiveis_do_tenant(db, tenant_id, tipo, body.grupo_ids)
        if grupos:
            # grupo_ids já conferidos no terreiro (_validar_grupos_elegiveis_do_tenant acima).
            for grupo_id in set(body.grupo_ids or []):
                db.add(AtividadeTipoGrupo(tenant_id=tenant_id, tipo_id=tipo.id, grupo_id=grupo_id))
        if grupos is not None:
            depois["grupos"] = grupos
    tipo.updated_at = utc_now()
    await db.flush()
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="atividade_tipo",
        resource_id=tipo.id,
        previous_state=antes,
        new_state=depois,
    )
    await _commit_ou_conflito(db, "uq_atividade_tipos_tenant_nome_ativo", MSG_TIPO_REPETIDO)
    await db.refresh(tipo)
    return await _resposta_tipo(db, tenant_id, tipo)


@router.post("/tipos/{tipo_id}/desarquivar", response_model=TipoResponse, dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "edit"))])
async def desarquivar_tipo(
    tipo_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TipoResponse:
    tenant_id = current_user.tenant_id
    tipo = await _tipo_do_tenant(db, tenant_id, tipo_id, incluir_arquivado=True)
    if tipo.arquivado_em is not None:
        await _nome_tipo_livre(db, tenant_id, tipo.nome, ignorar=tipo.id)
        tipo.arquivado_em = None
        await AuditService(db).log_update(
            tenant_id=tenant_id,
            user_id=current_user.id,
            resource_type="atividade_tipo",
            resource_id=tipo.id,
            previous_state={"arquivado": True},
            new_state={"arquivado": False},
        )
        await _commit_ou_conflito(db, "uq_atividade_tipos_tenant_nome_ativo", MSG_TIPO_REPETIDO)
        await db.refresh(tipo)
    return await _resposta_tipo(db, tenant_id, tipo)


@router.delete("/tipos/{tipo_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "delete"))])
async def arquivar_tipo(
    tipo_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Arquiva: o tipo sai das opções de nova atividade; as atividades dele ficam."""
    tipo = await _tipo_do_tenant(db, current_user.tenant_id, tipo_id)
    if tipo.natureza == NATUREZA_GIRA:
        raise ValidationError(MSG_GIRA_NAO_ARQUIVA)
    tipo.arquivado_em = utc_now()
    await AuditService(db).log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="atividade_tipo",
        resource_id=tipo.id,
        previous_state=_snapshot_tipo(tipo),
    )
    await db.commit()
    return None


# ── Rotas: funções ──────────────────────────────────────────────────────────


@router.get("/funcoes", response_model=list[FuncaoResponse], dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "view"))])
async def listar_funcoes(
    incluir_arquivadas: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[FuncaoResponse]:
    tenant_id = current_user.tenant_id
    stmt = select(FuncaoCorrente).where(FuncaoCorrente.tenant_id == tenant_id)
    if not incluir_arquivadas:
        stmt = stmt.where(FuncaoCorrente.arquivado_em.is_(None))
    funcoes = (
        await db.execute(
            stmt.order_by(
                FuncaoCorrente.arquivado_em.is_not(None), FuncaoCorrente.ordem, func.lower(FuncaoCorrente.nome)
            )
        )
    ).scalars().all()
    return [_funcao_resposta(f) for f in funcoes]


@router.post("/funcoes", response_model=FuncaoResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "insert"))])
async def criar_funcao(
    body: FuncaoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FuncaoResponse:
    tenant_id = current_user.tenant_id
    nome = limpar_nome(body.nome, MSG_NOME_FUNCAO)
    descricao = limpar_descricao_funcao(body.descricao)
    await _nome_funcao_livre(db, tenant_id, nome)
    proxima_ordem = (
        await db.execute(select(func.max(FuncaoCorrente.ordem)).where(FuncaoCorrente.tenant_id == tenant_id))
    ).scalar()
    funcao = FuncaoCorrente(tenant_id=tenant_id, nome=nome, descricao=descricao, ordem=(proxima_ordem or 0) + 1)
    db.add(funcao)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(MSG_FUNCAO_REPETIDA) from exc
    await AuditService(db).log_create(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="funcao_corrente",
        resource_id=funcao.id,
        details={"nome": nome},
    )
    await _commit_ou_conflito(db, "uq_funcoes_corrente_tenant_nome_ativo", MSG_FUNCAO_REPETIDA)
    await db.refresh(funcao)
    return _funcao_resposta(funcao)


@router.put("/funcoes/{funcao_id}", response_model=FuncaoResponse, dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "edit"))])
async def editar_funcao(
    body: FuncaoUpdate,
    funcao_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FuncaoResponse:
    tenant_id = current_user.tenant_id
    funcao = await _funcao_do_tenant(db, tenant_id, funcao_id)
    antes = {"nome": funcao.nome, "descricao": funcao.descricao}
    enviados = body.model_fields_set
    if "nome" in enviados and body.nome is not None:
        nome = limpar_nome(body.nome, MSG_NOME_FUNCAO)
        if nome.lower() != funcao.nome.lower():
            await _nome_funcao_livre(db, tenant_id, nome, ignorar=funcao.id)
        funcao.nome = nome
    if "descricao" in enviados:
        funcao.descricao = limpar_descricao_funcao(body.descricao)
    funcao.updated_at = utc_now()
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="funcao_corrente",
        resource_id=funcao.id,
        previous_state=antes,
        new_state={"nome": funcao.nome, "descricao": funcao.descricao},
    )
    await _commit_ou_conflito(db, "uq_funcoes_corrente_tenant_nome_ativo", MSG_FUNCAO_REPETIDA)
    await db.refresh(funcao)
    return _funcao_resposta(funcao)


@router.post("/funcoes/{funcao_id}/desarquivar", response_model=FuncaoResponse, dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "edit"))])
async def desarquivar_funcao(
    funcao_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FuncaoResponse:
    tenant_id = current_user.tenant_id
    funcao = await _funcao_do_tenant(db, tenant_id, funcao_id, incluir_arquivada=True)
    if funcao.arquivado_em is not None:
        await _nome_funcao_livre(db, tenant_id, funcao.nome, ignorar=funcao.id)
        funcao.arquivado_em = None
        await AuditService(db).log_update(
            tenant_id=tenant_id,
            user_id=current_user.id,
            resource_type="funcao_corrente",
            resource_id=funcao.id,
            previous_state={"arquivado": True},
            new_state={"arquivado": False},
        )
        await _commit_ou_conflito(db, "uq_funcoes_corrente_tenant_nome_ativo", MSG_FUNCAO_REPETIDA)
        await db.refresh(funcao)
    return _funcao_resposta(funcao)


@router.delete("/funcoes/{funcao_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "delete"))])
async def arquivar_funcao(
    funcao_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    funcao = await _funcao_do_tenant(db, current_user.tenant_id, funcao_id)
    funcao.arquivado_em = utc_now()
    await AuditService(db).log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="funcao_corrente",
        resource_id=funcao.id,
        previous_state={"nome": funcao.nome},
    )
    await db.commit()
    return None


# ── Rotas: âncora da gira ───────────────────────────────────────────────────


@router.post("/da-gira/{gira_id}", response_model=AtividadeResponse, dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "insert"))])
async def ancora_da_gira(
    gira_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AtividadeResponse:
    """A atividade-âncora da gira (cria na primeira vez). Nome, data e local vêm da gira."""
    tenant_id = current_user.tenant_id
    gira = (
        await db.execute(
            select(Gira).where(Gira.id == gira_id, Gira.tenant_id == tenant_id, Gira.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if gira is None:
        raise NotFoundError("Gira")
    ancora = await atividade_da_gira(db, tenant_id, gira.id)
    await db.commit()
    tipos = await _tipos_por_id(db, tenant_id, {ancora.tipo_id})
    return _atividade_resposta(ancora, tipos.get(ancora.tipo_id), gira)


# ── Rotas: atividades internas ──────────────────────────────────────────────


@router.get("", response_model=list[AtividadeResponse], dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "view"))])
async def listar_atividades(
    inicio: Optional[str] = Query(None, description="Primeiro dia (AAAA-MM-DD, Brasília)"),
    fim: Optional[str] = Query(None, description="Último dia (AAAA-MM-DD, Brasília)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AtividadeResponse]:
    tenant_id = current_user.tenant_id
    ini, fim_ = _periodo(inicio, fim)
    de, ate = local_day_bounds_utc(ini, fim_)
    atividades = (
        await db.execute(
            select(Atividade)
            .where(
                Atividade.tenant_id == tenant_id,
                Atividade.deleted_at.is_(None),
                Atividade.gira_id.is_(None),
                Atividade.inicio >= de,
                Atividade.inicio < ate,
            )
            .order_by(Atividade.inicio)
        )
    ).scalars().all()
    tipos = await _tipos_por_id(db, tenant_id, {a.tipo_id for a in atividades})
    return [_atividade_resposta(a, tipos.get(a.tipo_id)) for a in atividades]


@router.get("/{atividade_id}", response_model=AtividadeResponse, dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "view"))])
async def obter_atividade(
    atividade_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AtividadeResponse:
    atividade = await _atividade_do_tenant(db, current_user.tenant_id, atividade_id)
    return await _resposta_atividade(db, current_user.tenant_id, atividade)


@router.post("", response_model=AtividadeResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "insert"))])
async def criar_atividade(
    body: AtividadeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AtividadeResponse:
    """Atividade interna. Nunca consome o limite de giras/mês do plano (D-03)."""
    tenant_id = current_user.tenant_id
    tipo = await validar_tipo_ativo_do_tenant(db, tenant_id, body.tipo_id)
    titulo = limpar_titulo_atividade(body.titulo) if (body.titulo or "").strip() else tipo.nome
    inicio = _aware(body.inicio)
    atividade = Atividade(
        tenant_id=tenant_id,
        tipo_id=body.tipo_id,  # conferido no terreiro (validar_tipo_ativo_do_tenant acima)
        titulo=titulo,
        inicio=inicio,
        fim=fim_padrao(inicio, _aware(body.fim), tipo.duracao_min),
        local=limpar_local(body.local),
        descricao=limpar_texto(body.descricao, TEXTO_MAX, "A descrição"),
        orientacoes=limpar_texto(body.orientacoes, TEXTO_MAX, "As orientações"),
        visibilidade=validar_visibilidade(body.visibilidade or tipo.visibilidade_padrao),
        origem="manual",
        created_by=current_user.id,
    )
    db.add(atividade)
    await db.flush()
    await AuditService(db).log_create(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="atividade",
        resource_id=atividade.id,
        details=_snapshot_atividade(atividade),
    )
    await db.commit()
    await db.refresh(atividade)
    return _atividade_resposta(atividade, tipo)


@router.put("/{atividade_id}", response_model=AtividadeResponse, dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "edit"))])
async def editar_atividade(
    body: AtividadeUpdate,
    atividade_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AtividadeResponse:
    tenant_id = current_user.tenant_id
    atividade = await _atividade_do_tenant(db, tenant_id, atividade_id)
    if atividade.cancelada_em is not None:
        raise ConflictError(MSG_CANCELADA)
    antes = _snapshot_atividade(atividade)
    enviados = body.model_fields_set
    tipo = (await _tipos_por_id(db, tenant_id, {atividade.tipo_id})).get(atividade.tipo_id)
    if "tipo_id" in enviados and body.tipo_id is not None and body.tipo_id != atividade.tipo_id:
        tipo = await validar_tipo_ativo_do_tenant(db, tenant_id, body.tipo_id)
        atividade.tipo_id = body.tipo_id
    if "titulo" in enviados and body.titulo is not None:
        atividade.titulo = limpar_titulo_atividade(body.titulo)
    if "inicio" in enviados and body.inicio is not None:
        atividade.inicio = _aware(body.inicio)
    if "fim" in enviados:
        atividade.fim = _aware(body.fim)
    if atividade.fim is not None and atividade.fim <= atividade.inicio:
        raise ValidationError("O fim precisa ser depois do início.")
    if "local" in enviados:
        atividade.local = limpar_local(body.local)
    if "descricao" in enviados:
        atividade.descricao = limpar_texto(body.descricao, TEXTO_MAX, "A descrição")
    if "orientacoes" in enviados:
        atividade.orientacoes = limpar_texto(body.orientacoes, TEXTO_MAX, "As orientações")
    if "visibilidade" in enviados and body.visibilidade is not None:
        atividade.visibilidade = validar_visibilidade(body.visibilidade)
    atividade.updated_at = utc_now()
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="atividade",
        resource_id=atividade.id,
        previous_state=antes,
        new_state=_snapshot_atividade(atividade),
    )
    await db.commit()
    await db.refresh(atividade)
    return _atividade_resposta(atividade, tipo)


@router.post("/{atividade_id}/cancelar", response_model=AtividadeResponse, dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "edit"))])
async def cancelar_atividade(
    body: CancelarBody,
    atividade_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AtividadeResponse:
    """Cancela com motivo (a corrente vê o motivo na Agenda). A atividade fica no histórico."""
    tenant_id = current_user.tenant_id
    atividade = await _atividade_do_tenant(db, tenant_id, atividade_id)
    motivo = limpar_motivo(body.motivo)
    atividade.cancelada_em = atividade.cancelada_em or utc_now()
    atividade.cancelamento_motivo = motivo
    # AM-17: a escala fica dispensada; o e-mail a quem estava nela sai pelo agendador (AM-15).
    await dispensar_por_cancelamento(db, tenant_id, atividade.id, atividade.cancelada_em)
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="atividade",
        resource_id=atividade.id,
        previous_state={"cancelada": False},
        new_state={"cancelada": True, "motivo": motivo},
    )
    await db.commit()
    await db.refresh(atividade)
    return await _resposta_atividade(db, tenant_id, atividade)


@router.post("/{atividade_id}/reativar", response_model=AtividadeResponse, dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "edit"))])
async def reativar_atividade(
    atividade_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AtividadeResponse:
    tenant_id = current_user.tenant_id
    atividade = await _atividade_do_tenant(db, tenant_id, atividade_id)
    if atividade.cancelada_em is not None:
        await desfazer_dispensa_do_cancelamento(db, tenant_id, atividade.id, atividade.cancelada_em)
        atividade.cancelada_em = None
        atividade.cancelamento_motivo = None
        await AuditService(db).log_update(
            tenant_id=tenant_id,
            user_id=current_user.id,
            resource_type="atividade",
            resource_id=atividade.id,
            previous_state={"cancelada": True},
            new_state={"cancelada": False},
        )
        await db.commit()
        await db.refresh(atividade)
    return await _resposta_atividade(db, tenant_id, atividade)


@router.delete("/{atividade_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "delete"))])
async def excluir_atividade(
    atividade_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    atividade = await _atividade_do_tenant(db, current_user.tenant_id, atividade_id)
    atividade.deleted_at = utc_now()
    await AuditService(db).log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="atividade",
        resource_id=atividade.id,
        previous_state=_snapshot_atividade(atividade),
    )
    await db.commit()
    return None
