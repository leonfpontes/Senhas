"""Escala de faxina — planejador do mês por grupos da corrente (AM-25, §8.7 do plano).

Vale para tipo de atividade com modo de escala "grupos por dia" (ex.: Faxina, Cozinha). Grupo de
permissão `ESCALAS`; plano `escalas` (Pro) e a chave do piloto `area_medium` no router.

- ``GET  /api/v1/admin/escala-planos/{tipo_id}/{AAAA-MM}``                  — rascunho do mês, grupos
  (fichas), pendências da publicação e quantos dias tem o mês anterior (`view`)
- ``PUT  /api/v1/admin/escala-planos/{tipo_id}/{AAAA-MM}``                  — salva o rascunho (`edit`)
- ``POST /api/v1/admin/escala-planos/{tipo_id}/{AAAA-MM}/copiar-mes-anterior`` — pela ordem do dia da
  semana (`edit`)
- ``POST /api/v1/admin/escala-planos/{tipo_id}/{AAAA-MM}/girar-grupos``     — rodízio (`edit`)
- ``POST /api/v1/admin/escala-planos/{tipo_id}/{AAAA-MM}/distribuir``       — dias da semana × grupos
  em ciclo (`edit`)
- ``POST /api/v1/admin/escala-planos/{tipo_id}/{AAAA-MM}/publicar``         — cria/atualiza as
  atividades e convoca os grupos (`insert` E `edit`)
- ``POST /api/v1/admin/escala-planos/{tipo_id}/{AAAA-MM}/atualizar-convocacoes`` — só as faxinas
  futuras, depois de mudar quem está nos grupos (`insert` E `edit`)

O rascunho não aparece para o médium: só a publicação cria atividades (`origem = 'plano_escala'`,
"Faxina · G2") e participações (`origem = 'grupo'`, membros ATIVOS do grupo que o tipo alcança).
Republicar aplica o diff (`services/escala_planos.diff_publicacao`): dia removido → atividade
cancelada e escala dispensada; grupo trocado num dia → os do grupo antigo dispensados e os do novo
convocados na MESMA atividade; o que não mudou mantém respostas e presenças; o passado não muda.
Publicar e salvar travam o plano (`SELECT ... FOR UPDATE`): duas publicações ao mesmo tempo não
duplicam nada, e publicar de novo sem mudança não faz nada (idempotente).

Todo `tipo_id` (caminho) e `grupo_id` (corpo) é conferido no terreiro antes de gravar (checagem 4
do auditor de tenant). Os avisos aos médiuns são do AM-15 (`escala_publicada`, depois do commit).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, time
from typing import Optional

from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user, require_group_permission, require_plan_feature
from src.core.database import get_db
from src.core.errors import ConflictError, NotFoundError, ValidationError
from src.core.tz import today_local, utc_now
from src.models import (
    Atividade,
    AtividadeTipo,
    CorrenteGrupo,
    CorrenteGrupoMembro,
    EscalaPlano,
    EscalaPlanoDia,
    Medium,
    PermissionFeature,
    User,
)
from src.models.atividades import NATUREZA_ATIVIDADE
from src.services.atividades import hora_de_texto
from src.services.audit_service import AuditService
from src.services.corrente_grupos import sem_repetidos, validar_grupos_ativos_do_tenant
from src.services.escala_planos import (
    HORA_PADRAO,
    MOTIVO_DIA_REMOVIDO,
    MSG_TIPO,
    DiaPlano,
    Publicado,
    ResultadoPublicacao,
    copiar_por_dia_da_semana,
    diff_publicacao,
    distribuir_em_ciclo,
    escala_publicada,
    girar_grupos,
    hora_fim_padrao,
    hora_texto,
    horario_local,
    inicio_fim,
    mes_anterior,
    mes_de_texto,
    mes_texto,
    no_mes,
    ordem_natural,
    titulo_da_atividade,
)
from src.services.presenca import (
    dispensar_por_cancelamento,
    elegiveis_entre,
    grupos_elegiveis_do_tipo,
    membros_ativos_dos_grupos,
    participacoes_da_atividade,
    upsert_participacao,
)

router = APIRouter(
    prefix="/api/v1/admin/escala-planos",
    tags=["admin-escala-planos"],
    dependencies=[
        Depends(require_plan_feature("area_medium")),
        Depends(require_plan_feature("escalas")),
    ],
)

MAX_DIAS = 31 * 12  # 31 dias × até 12 grupos no mesmo dia
MSG_GRUPOS = "Escolha grupos ativos da casa."
MSG_SEM_PLANO = "Ainda não há escala neste mês."
CAMINHO = "/{tipo_id}/{mes}"


# ── Schemas ─────────────────────────────────────────────────────────────────


class DiaIn(BaseModel):
    data: date
    grupo_id: uuid.UUID
    hora_inicio: Optional[str] = Field(None, max_length=8)
    hora_fim: Optional[str] = Field(None, max_length=8)


class RascunhoBody(BaseModel):
    dias: list[DiaIn] = Field(default_factory=list, max_length=MAX_DIAS)


class GirarBody(BaseModel):
    # Ordem do rodízio (G1, G2, G3). Vazio = as fichas do planejador, na ordem da tela.
    grupo_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)


class DistribuirBody(BaseModel):
    # 0 = domingo ... 6 = sábado.
    dias_semana: list[int] = Field(..., min_length=1, max_length=7)
    grupo_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=50)
    hora_inicio: Optional[str] = Field(None, max_length=8)
    hora_fim: Optional[str] = Field(None, max_length=8)


class TipoPlano(BaseModel):
    id: uuid.UUID
    nome: str
    icone: str
    cor: Optional[str] = None


class GrupoPlano(BaseModel):
    id: uuid.UUID
    nome: str
    cor: str
    total_membros: int
    arquivado: bool = False


class DiaOut(BaseModel):
    data: date
    grupo_id: uuid.UUID
    hora_inicio: str
    hora_fim: Optional[str] = None
    publicado: bool


class Pendencias(BaseModel):
    criar: int = 0
    cancelar: int = 0
    trocar: int = 0
    reagendar: int = 0
    ignorados_passado: int = 0
    tem_mudancas: bool = False


class PlanoResponse(BaseModel):
    tipo: TipoPlano
    mes: str
    hoje: date
    existe: bool
    status: Optional[str] = None
    publicado_em: Optional[datetime] = None
    publicado_por: Optional[str] = None
    hora_inicio_padrao: str
    hora_fim_padrao: Optional[str] = None
    grupos: list[GrupoPlano]
    dias: list[DiaOut]
    pendencias: Pendencias
    mes_anterior_dias: int
    proximas_publicadas: int


class OperacaoResponse(PlanoResponse):
    # Copiar: dias do mês anterior que não couberam (5ª ocorrência) ou de grupo arquivado.
    descartados: int = 0


class ResultadoOut(BaseModel):
    criadas: int = 0
    canceladas: int = 0
    trocadas: int = 0
    reagendadas: int = 0
    atividades: int = 0
    convocados: int = 0
    dispensados: int = 0
    ignorados_passado: int = 0
    fora_da_elegibilidade: int = 0


class PublicarResponse(PlanoResponse):
    resultado: ResultadoOut


# ── Helpers ─────────────────────────────────────────────────────────────────


async def _tipo_do_planejador(db: AsyncSession, tenant_id: uuid.UUID, tipo_id: uuid.UUID) -> AtividadeTipo:
    """Tipo do terreiro (senão 404), ativo e com modo "grupos por dia" (senão 422)."""
    tipo = (
        await db.execute(
            select(AtividadeTipo).where(AtividadeTipo.id == tipo_id, AtividadeTipo.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if tipo is None:
        raise NotFoundError("Tipo de atividade")
    if tipo.arquivado_em is not None or tipo.natureza != NATUREZA_ATIVIDADE or tipo.modo_escala != "grupos_por_dia":
        raise ValidationError(MSG_TIPO)
    return tipo


def _horarios_padrao(tipo: AtividadeTipo) -> tuple[time, Optional[time]]:
    inicio = tipo.hora_padrao or HORA_PADRAO
    return inicio, hora_fim_padrao(inicio, tipo.duracao_min)


def _horario(tipo: AtividadeTipo, hora_inicio: Optional[str], hora_fim: Optional[str]) -> tuple[time, Optional[time]]:
    """Horário do dia: o informado ou o padrão do tipo (fim = início + duração quando não vem)."""
    padrao_ini, padrao_fim = _horarios_padrao(tipo)
    inicio = hora_de_texto(hora_inicio) or padrao_ini
    fim = hora_de_texto(hora_fim)
    if fim is None:
        fim = padrao_fim if hora_de_texto(hora_inicio) is None else hora_fim_padrao(inicio, tipo.duracao_min)
    if fim is not None and fim <= inicio:
        raise ValidationError("O fim precisa ser depois do início.")
    return inicio, fim


async def _plano(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    tipo_id: uuid.UUID,
    mes: date,
    *,
    travar: bool = False,
    criar: bool = False,
) -> Optional[EscalaPlano]:
    """O plano do mês (criado em rascunho com `criar`); `travar` = `SELECT ... FOR UPDATE`."""
    if criar:
        agora = utc_now()
        await db.execute(
            pg_insert(EscalaPlano)
            .values(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                tipo_id=tipo_id,
                mes=mes,
                status="rascunho",
                created_at=agora,
                updated_at=agora,
            )
            .on_conflict_do_nothing(constraint="uq_escala_planos_tenant_tipo_mes")
        )
    stmt = select(EscalaPlano).where(
        EscalaPlano.tenant_id == tenant_id, EscalaPlano.tipo_id == tipo_id, EscalaPlano.mes == mes
    )
    if travar:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    return (await db.execute(stmt)).scalar_one_or_none()


async def _linhas(
    db: AsyncSession, tenant_id: uuid.UUID, plano_id: Optional[uuid.UUID], *, travar: bool = False
) -> list[EscalaPlanoDia]:
    if plano_id is None:
        return []
    stmt = select(EscalaPlanoDia).where(EscalaPlanoDia.tenant_id == tenant_id, EscalaPlanoDia.plano_id == plano_id)
    if travar:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    return list((await db.execute(stmt.order_by(EscalaPlanoDia.data))).scalars().all())


async def _grupos_do_planejador(
    db: AsyncSession, tenant_id: uuid.UUID, tipo: AtividadeTipo, linhas: list[EscalaPlanoDia]
) -> list[GrupoPlano]:
    """As fichas: os grupos que o tipo chama (`elegiveis = 'grupos'`) ou todos os ativos da casa,
    mais os que já estão no plano (mesmo arquivados), em ordem natural (G2 antes de G10)."""
    base: set[uuid.UUID] = set()
    if tipo.elegiveis == "grupos":
        base = await grupos_elegiveis_do_tipo(db, tenant_id, tipo.id)
    filtro = CorrenteGrupo.arquivado_em.is_(None) if not base else CorrenteGrupo.id.in_(base)
    no_plano = {linha.grupo_id for linha in linhas}
    stmt = select(CorrenteGrupo).where(CorrenteGrupo.tenant_id == tenant_id)
    stmt = stmt.where(filtro | CorrenteGrupo.id.in_(no_plano)) if no_plano else stmt.where(filtro)
    grupos = list((await db.execute(stmt)).scalars().all())
    ids = [g.id for g in grupos]
    totais: dict[uuid.UUID, int] = {}
    if ids:
        totais = {
            gid: n
            for gid, n in (
                await db.execute(
                    select(CorrenteGrupoMembro.grupo_id, func.count())
                    .join(Medium, Medium.id == CorrenteGrupoMembro.medium_id)
                    .where(
                        CorrenteGrupoMembro.tenant_id == tenant_id,
                        CorrenteGrupoMembro.grupo_id.in_(ids),
                        Medium.tenant_id == tenant_id,
                        Medium.deleted_at.is_(None),
                        Medium.is_active.is_(True),
                    )
                    .group_by(CorrenteGrupoMembro.grupo_id)
                )
            ).all()
        }
    grupos.sort(key=lambda g: (g.arquivado_em is not None, ordem_natural(g.nome), str(g.id)))
    return [
        GrupoPlano(
            id=g.id, nome=g.nome, cor=g.cor, total_membros=int(totais.get(g.id, 0)), arquivado=g.arquivado_em is not None
        )
        for g in grupos
    ]


async def _validar_grupos_do_plano(
    db: AsyncSession, tenant_id: uuid.UUID, grupo_ids: list[uuid.UUID], ja_no_plano: set[uuid.UUID]
) -> None:
    """Grupos do terreiro e ativos — o arquivado só vale se já estava no plano (senão 422)."""
    ids = sem_repetidos(grupo_ids)
    if not ids:
        return
    achados = (
        await db.execute(
            select(CorrenteGrupo.id, CorrenteGrupo.arquivado_em).where(
                CorrenteGrupo.tenant_id == tenant_id, CorrenteGrupo.id.in_(ids)
            )
        )
    ).all()
    validos = {gid for gid, arquivado in achados if arquivado is None or gid in ja_no_plano}
    if len(validos) != len(ids):
        raise ValidationError(MSG_GRUPOS)


def _rascunho(linhas: list[EscalaPlanoDia]) -> list[DiaPlano]:
    return [DiaPlano(l.data, l.grupo_id, l.hora_inicio, l.hora_fim) for l in linhas if not l.removido]


def _salvar_rascunho(
    db: AsyncSession, tenant_id: uuid.UUID, plano: EscalaPlano, linhas: list[EscalaPlanoDia], novos: list[DiaPlano]
) -> list:
    """Troca o rascunho por `novos` (sem commit). Dia já publicado que saiu fica marcado como
    `removido` até a próxima publicação; o resto sai de vez. Devolve as linhas a apagar."""
    agora = utc_now()
    existentes = {(l.data, l.grupo_id): l for l in linhas}
    desejados = {d.chave: d for d in novos}
    apagar = []
    for chave, linha in existentes.items():
        d = desejados.get(chave)
        if d is not None:
            linha.hora_inicio, linha.hora_fim, linha.removido = d.hora_inicio, d.hora_fim, False
            linha.updated_at = agora
        elif linha.atividade_id is not None:
            linha.removido = True
            linha.updated_at = agora
        else:
            apagar.append(linha)
    for chave, d in desejados.items():
        if chave not in existentes:
            db.add(
                EscalaPlanoDia(
                    tenant_id=tenant_id,
                    plano_id=plano.id,
                    data=d.data,
                    grupo_id=d.grupo_id,  # conferido no terreiro por quem chama
                    hora_inicio=d.hora_inicio,
                    hora_fim=d.hora_fim,
                    created_at=agora,
                    updated_at=agora,
                )
            )
    plano.updated_at = agora
    return apagar


async def _apagar(db: AsyncSession, linhas: list) -> None:
    for linha in linhas:
        await db.delete(linha)


async def _atividades_das_linhas(
    db: AsyncSession, tenant_id: uuid.UUID, linhas: list[EscalaPlanoDia], *, travar: bool = False
) -> dict[uuid.UUID, Atividade]:
    ids = [l.atividade_id for l in linhas if l.atividade_id is not None]
    if not ids:
        return {}
    stmt = select(Atividade).where(Atividade.tenant_id == tenant_id, Atividade.id.in_(ids))
    if travar:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    return {a.id: a for a in (await db.execute(stmt)).scalars().all()}


def _publicados(linhas: list[EscalaPlanoDia], atividades: dict[uuid.UUID, Atividade]) -> list[Publicado]:
    out = []
    for l in linhas:
        a = atividades.get(l.atividade_id) if l.atividade_id is not None else None
        if a is None or a.deleted_at is not None or a.inicio is None:
            continue
        hi, hf = horario_local(a.inicio, a.fim)
        out.append(
            Publicado(
                data=l.data,
                grupo_id=l.grupo_id,
                atividade_id=a.id,
                hora_inicio=hi,
                hora_fim=hf,
                cancelada=a.cancelada_em is not None,
                encerrada=a.chamada_encerrada_em is not None,
            )
        )
    return out


async def _resposta(
    db: AsyncSession, tenant_id: uuid.UUID, tipo: AtividadeTipo, mes: date, *, cls=PlanoResponse, **extra
):
    plano = await _plano(db, tenant_id, tipo.id, mes)
    linhas = await _linhas(db, tenant_id, plano.id if plano else None)
    atividades = await _atividades_das_linhas(db, tenant_id, linhas)
    grupos = await _grupos_do_planejador(db, tenant_id, tipo, linhas)
    hoje = today_local()
    diff = diff_publicacao(_publicados(linhas, atividades), _rascunho(linhas), hoje=hoje, ordem=[g.id for g in grupos])
    anterior = await _plano(db, tenant_id, tipo.id, mes_anterior(mes))
    mes_anterior_dias = sum(1 for l in await _linhas(db, tenant_id, anterior.id if anterior else None) if not l.removido)
    agora = utc_now()
    vivas = {
        aid
        for aid, a in atividades.items()
        if a.deleted_at is None and a.cancelada_em is None and a.inicio is not None and a.inicio > agora
    }
    publicado_por = None
    if plano is not None and plano.publicado_por is not None:
        publicado_por = (
            await db.execute(
                select(User.full_name, User.username).where(User.id == plano.publicado_por, User.tenant_id == tenant_id)
            )
        ).first()
        publicado_por = (publicado_por[0] or publicado_por[1]) if publicado_por else None
    padrao_ini, padrao_fim = _horarios_padrao(tipo)
    return cls(
        tipo=TipoPlano(id=tipo.id, nome=tipo.nome, icone=tipo.icone, cor=tipo.cor),
        mes=mes_texto(mes),
        hoje=hoje,
        existe=plano is not None,
        status=plano.status if plano else None,
        publicado_em=plano.publicado_em if plano else None,
        publicado_por=publicado_por,
        hora_inicio_padrao=hora_texto(padrao_ini),
        hora_fim_padrao=hora_texto(padrao_fim),
        grupos=grupos,
        dias=[
            DiaOut(
                data=l.data,
                grupo_id=l.grupo_id,
                hora_inicio=hora_texto(l.hora_inicio),
                hora_fim=hora_texto(l.hora_fim),
                publicado=l.atividade_id is not None
                and l.atividade_id in atividades
                and atividades[l.atividade_id].deleted_at is None,
            )
            for l in linhas
            if not l.removido
        ],
        pendencias=Pendencias(
            criar=len(diff.criar),
            cancelar=len(diff.cancelar),
            trocar=len(diff.trocar),
            reagendar=len(diff.reagendar),
            ignorados_passado=diff.ignorados_passado,
            tem_mudancas=diff.tem_mudancas,
        ),
        mes_anterior_dias=mes_anterior_dias,
        proximas_publicadas=sum(1 for l in linhas if l.atividade_id in vivas),
        **extra,
    )


async def _auditar(db: AsyncSession, user: User, plano: EscalaPlano, acao: str, **dados) -> None:
    await AuditService(db).log_update(
        tenant_id=user.tenant_id,
        user_id=user.id,
        resource_type="escala_plano",
        resource_id=plano.id,
        previous_state={},
        new_state={"acao": acao, "tipo_id": str(plano.tipo_id), "mes": mes_texto(plano.mes), **dados},
    )


class _Membros:
    """Membros ATIVOS de cada grupo que o tipo alcança (com cache por grupo)."""

    def __init__(self, db: AsyncSession, tenant_id: uuid.UUID, tipo: AtividadeTipo, resultado: ResultadoPublicacao):
        self.db, self.tenant_id, self.tipo, self.resultado = db, tenant_id, tipo, resultado
        self._cache: dict[uuid.UUID, list[uuid.UUID]] = {}

    async def de(self, grupo_id: uuid.UUID) -> list[uuid.UUID]:
        if grupo_id not in self._cache:
            membros = [m for m, _ in await membros_ativos_dos_grupos(self.db, self.tenant_id, [grupo_id])]
            elegiveis = await elegiveis_entre(self.db, self.tenant_id, self.tipo, membros)
            self.resultado.fora_da_elegibilidade += len(membros) - len(elegiveis)
            self._cache[grupo_id] = [m.id for m in membros if m.id in elegiveis]
        return self._cache[grupo_id]


async def _convocar_grupo(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    atividade_id: uuid.UUID,
    grupo_id: uuid.UUID,
    membros: list[uuid.UUID],
    resultado: ResultadoPublicacao,
    *,
    grupo_anterior: Optional[uuid.UUID] = None,
    devolver_dispensados: bool = True,
) -> None:
    """Põe os membros do grupo na escala da atividade (origem "grupo") e, na troca de grupo, tira
    os do grupo anterior que não estão no novo. Quem já estava fica com a resposta e a presença.

    `devolver_dispensados`: na publicação, o grupo do dia volta inteiro (quem foi dispensado
    volta); no "Atualizar convocações", quem a casa tirou da escala continua fora."""
    agora = utc_now()
    linhas = {p.medium_id: p for p in await participacoes_da_atividade(db, tenant_id, atividade_id, travar=True)}
    novos = set(membros)
    for p in linhas.values():
        saiu = p.origem == "grupo" and p.grupo_id in {grupo_anterior, grupo_id} and p.medium_id not in novos
        if saiu and p.dispensado_em is None:
            p.dispensado_em = agora
            p.updated_at = agora
            resultado.dispensados.append((atividade_id, p.medium_id))
    for medium_id in membros:  # membros ativos do grupo (membros_ativos_dos_grupos, escopado no terreiro)
        antes = linhas.get(medium_id)
        if antes is not None and antes.dispensado_em is not None and not devolver_dispensados:
            continue
        entrou = antes is None or not antes.convocado or antes.dispensado_em is not None
        p = await upsert_participacao(
            db, tenant_id, atividade_id, medium_id, origem="grupo", convocado=True, grupo_id=grupo_id
        )
        p.convocado = True
        p.dispensado_em = None
        if p.origem == "grupo":
            p.grupo_id = grupo_id
        p.updated_at = agora
        if entrou:
            resultado.convocados.append((atividade_id, medium_id))


async def _cancelar_atividade(
    db: AsyncSession, tenant_id: uuid.UUID, atividade: Atividade, resultado: ResultadoPublicacao
) -> None:
    if atividade.cancelada_em is not None:
        return
    agora = utc_now()
    fora = [
        p.medium_id
        for p in await participacoes_da_atividade(db, tenant_id, atividade.id)
        if p.dispensado_em is None
    ]
    atividade.cancelada_em = agora
    atividade.cancelamento_motivo = MOTIVO_DIA_REMOVIDO
    atividade.updated_at = agora
    await dispensar_por_cancelamento(db, tenant_id, atividade.id, agora)
    resultado.canceladas += 1
    resultado.atividades_canceladas.append(atividade.id)
    resultado.dispensados.extend((atividade.id, m) for m in fora)


# ── Rotas ───────────────────────────────────────────────────────────────────


@router.get(
    CAMINHO,
    response_model=PlanoResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "view"))],
)
async def ver_plano(
    tipo_id: uuid.UUID = Path(...),
    mes: str = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlanoResponse:
    """O rascunho do mês (vazio, `existe = false`, quando ainda não há plano)."""
    tipo = await _tipo_do_planejador(db, current_user.tenant_id, tipo_id)
    return await _resposta(db, current_user.tenant_id, tipo, mes_de_texto(mes))


@router.put(
    CAMINHO,
    response_model=PlanoResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "edit"))],
)
async def salvar_rascunho(
    body: RascunhoBody,
    tipo_id: uuid.UUID = Path(...),
    mes: str = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlanoResponse:
    """Salva o rascunho inteiro (os dias e grupos da tela). O médium não vê nada até publicar."""
    tenant_id = current_user.tenant_id
    tipo = await _tipo_do_planejador(db, tenant_id, tipo_id)
    mes_d = mes_de_texto(mes)
    plano = await _plano(db, tenant_id, tipo.id, mes_d, travar=True, criar=True)
    linhas = await _linhas(db, tenant_id, plano.id, travar=True)
    await _validar_grupos_do_plano(
        db, tenant_id, [d.grupo_id for d in body.dias], {l.grupo_id for l in linhas}
    )
    novos: list[DiaPlano] = []
    for d in body.dias:
        if not no_mes(d.data, mes_d):
            raise ValidationError("Escolha só dias do mês da escala.")
        inicio, fim = _horario(tipo, d.hora_inicio, d.hora_fim)
        novos.append(DiaPlano(d.data, d.grupo_id, inicio, fim))
    await _apagar(db, _salvar_rascunho(db, tenant_id, plano, linhas, novos))
    await _auditar(db, current_user, plano, "salvou o rascunho", dias=len({d.chave for d in novos}))
    await db.commit()
    return await _resposta(db, tenant_id, tipo, mes_d)


@router.post(
    CAMINHO + "/copiar-mes-anterior",
    response_model=OperacaoResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "edit"))],
)
async def copiar_mes_anterior(
    tipo_id: uuid.UUID = Path(...),
    mes: str = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OperacaoResponse:
    """Copia o mês anterior pela ordem do dia da semana (substitui o rascunho deste mês)."""
    tenant_id = current_user.tenant_id
    tipo = await _tipo_do_planejador(db, tenant_id, tipo_id)
    mes_d = mes_de_texto(mes)
    anterior = await _plano(db, tenant_id, tipo.id, mes_anterior(mes_d))
    origem = _rascunho(await _linhas(db, tenant_id, anterior.id if anterior else None))
    if not origem:
        raise ConflictError("O mês anterior não tem escala para copiar.")
    ativos = set(
        (
            await db.execute(
                select(CorrenteGrupo.id).where(
                    CorrenteGrupo.tenant_id == tenant_id,
                    CorrenteGrupo.id.in_({d.grupo_id for d in origem}),
                    CorrenteGrupo.arquivado_em.is_(None),
                )
            )
        ).scalars().all()
    )
    de_grupo_ativo = [d for d in origem if d.grupo_id in ativos]
    novos, descartados = copiar_por_dia_da_semana(de_grupo_ativo, mes_d)
    plano = await _plano(db, tenant_id, tipo.id, mes_d, travar=True, criar=True)
    linhas = await _linhas(db, tenant_id, plano.id, travar=True)
    await _apagar(db, _salvar_rascunho(db, tenant_id, plano, linhas, novos))
    await _auditar(db, current_user, plano, "copiou o mês anterior", dias=len(novos))
    await db.commit()
    return await _resposta(
        db, tenant_id, tipo, mes_d, cls=OperacaoResponse, descartados=descartados + len(origem) - len(de_grupo_ativo)
    )


@router.post(
    CAMINHO + "/girar-grupos",
    response_model=OperacaoResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "edit"))],
)
async def girar(
    body: GirarBody,
    tipo_id: uuid.UUID = Path(...),
    mes: str = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OperacaoResponse:
    """Rodízio dos grupos no rascunho: G2 pega os dias do G1, G3 os do G2 e G1 os do último."""
    tenant_id = current_user.tenant_id
    tipo = await _tipo_do_planejador(db, tenant_id, tipo_id)
    mes_d = mes_de_texto(mes)
    grupos = await validar_grupos_ativos_do_tenant(db, tenant_id, body.grupo_ids)
    plano = await _plano(db, tenant_id, tipo.id, mes_d, travar=True)
    if plano is None:
        raise ConflictError(MSG_SEM_PLANO)
    linhas = await _linhas(db, tenant_id, plano.id, travar=True)
    ordem = [g.id for g in grupos] or [
        g.id for g in await _grupos_do_planejador(db, tenant_id, tipo, linhas) if not g.arquivado
    ]
    novos = girar_grupos(_rascunho(linhas), ordem)
    await _apagar(db, _salvar_rascunho(db, tenant_id, plano, linhas, novos))
    await _auditar(db, current_user, plano, "girou os grupos", grupos=[str(g) for g in ordem])
    await db.commit()
    return await _resposta(db, tenant_id, tipo, mes_d, cls=OperacaoResponse)


@router.post(
    CAMINHO + "/distribuir",
    response_model=OperacaoResponse,
    dependencies=[Depends(require_group_permission(PermissionFeature.ESCALAS, "edit"))],
)
async def distribuir(
    body: DistribuirBody,
    tipo_id: uuid.UUID = Path(...),
    mes: str = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OperacaoResponse:
    """Preenche o mês: os dias da semana escolhidos recebem os grupos em ciclo (substitui o rascunho)."""
    tenant_id = current_user.tenant_id
    tipo = await _tipo_do_planejador(db, tenant_id, tipo_id)
    mes_d = mes_de_texto(mes)
    grupos = await validar_grupos_ativos_do_tenant(db, tenant_id, body.grupo_ids)
    inicio, fim = _horario(tipo, body.hora_inicio, body.hora_fim)
    novos = distribuir_em_ciclo(mes_d, body.dias_semana, [g.id for g in grupos], inicio, fim)
    plano = await _plano(db, tenant_id, tipo.id, mes_d, travar=True, criar=True)
    linhas = await _linhas(db, tenant_id, plano.id, travar=True)
    await _apagar(db, _salvar_rascunho(db, tenant_id, plano, linhas, novos))
    await _auditar(
        db, current_user, plano, "distribuiu os grupos", dias=len(novos), grupos=[str(g.id) for g in grupos]
    )
    await db.commit()
    return await _resposta(db, tenant_id, tipo, mes_d, cls=OperacaoResponse)


@router.post(
    CAMINHO + "/publicar",
    response_model=PublicarResponse,
    dependencies=[
        Depends(require_group_permission(PermissionFeature.ESCALAS, "insert")),
        Depends(require_group_permission(PermissionFeature.ESCALAS, "edit")),
    ],
)
async def publicar(
    tipo_id: uuid.UUID = Path(...),
    mes: str = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PublicarResponse:
    """Publica (ou republica) o rascunho: uma atividade por dia e grupo, com a escala do grupo."""
    tenant_id = current_user.tenant_id
    tipo = await _tipo_do_planejador(db, tenant_id, tipo_id)
    mes_d = mes_de_texto(mes)
    plano = await _plano(db, tenant_id, tipo.id, mes_d, travar=True)
    if plano is None:
        raise ConflictError(MSG_SEM_PLANO)
    linhas = await _linhas(db, tenant_id, plano.id, travar=True)
    if plano.status != "publicado" and not _rascunho(linhas):
        raise ConflictError("Escolha pelo menos um dia antes de publicar.")
    atividades = await _atividades_das_linhas(db, tenant_id, linhas, travar=True)
    agora = utc_now()
    resultado = ResultadoPublicacao(motivo="publicacao")

    # Atividade excluída à mão na Agenda: o dia volta a ser "não publicado".
    vivas: list[EscalaPlanoDia] = []
    for linha in linhas:
        a = atividades.get(linha.atividade_id) if linha.atividade_id is not None else None
        if linha.atividade_id is not None and (a is None or a.deleted_at is not None):
            linha.atividade_id = None
            if linha.removido:
                await db.delete(linha)
                continue
        vivas.append(linha)

    grupos = await _grupos_do_planejador(db, tenant_id, tipo, vivas)
    nomes = {g.id: g.nome for g in grupos}
    diff = diff_publicacao(_publicados(vivas, atividades), _rascunho(vivas), hoje=today_local(), ordem=[g.id for g in grupos])
    resultado.ignorados_passado = diff.ignorados_passado
    por_chave = {(l.data, l.grupo_id): l for l in vivas}
    membros = _Membros(db, tenant_id, tipo, resultado)
    apagadas: set[uuid.UUID] = set()

    for d in diff.criar:
        linha = por_chave[d.chave]
        inicio, fim = inicio_fim(d.data, d.hora_inicio, d.hora_fim)
        atividade = Atividade(
            tenant_id=tenant_id,
            tipo_id=tipo.id,  # conferido no terreiro (_tipo_do_planejador acima)
            titulo=titulo_da_atividade(tipo.nome, nomes.get(d.grupo_id, "Grupo")),
            inicio=inicio,
            fim=fim,
            visibilidade=tipo.visibilidade_padrao,
            origem="plano_escala",
            escala_plano_dia_id=linha.id,
            created_by=current_user.id,
        )
        db.add(atividade)
        await db.flush()
        linha.atividade_id = atividade.id
        atividades[atividade.id] = atividade
        await _convocar_grupo(db, tenant_id, atividade.id, d.grupo_id, await membros.de(d.grupo_id), resultado)
        resultado.criadas += 1

    for troca in diff.trocar:
        atividade = atividades[troca.anterior.atividade_id]
        velha = por_chave[troca.anterior.chave]
        nova = por_chave[troca.novo.chave]
        atividade.titulo = titulo_da_atividade(tipo.nome, nomes.get(troca.novo.grupo_id, "Grupo"))
        atividade.inicio, atividade.fim = inicio_fim(troca.novo.data, troca.novo.hora_inicio, troca.novo.hora_fim)
        atividade.escala_plano_dia_id = nova.id
        atividade.updated_at = agora
        nova.atividade_id = atividade.id
        velha.atividade_id = None
        await db.delete(velha)
        apagadas.add(velha.id)
        await _convocar_grupo(
            db,
            tenant_id,
            atividade.id,
            troca.novo.grupo_id,
            await membros.de(troca.novo.grupo_id),
            resultado,
            grupo_anterior=troca.anterior.grupo_id,
        )
        resultado.trocadas += 1

    for anterior, novo in diff.reagendar:
        atividade = atividades[anterior.atividade_id]
        atividade.inicio, atividade.fim = inicio_fim(novo.data, novo.hora_inicio, novo.hora_fim)
        atividade.updated_at = agora
        resultado.reagendadas += 1
        resultado.atividades_reagendadas.append(atividade.id)

    for publicado in diff.cancelar:
        atividade = atividades[publicado.atividade_id]
        linha = por_chave[publicado.chave]
        await _cancelar_atividade(db, tenant_id, atividade, resultado)
        atividade.escala_plano_dia_id = None
        linha.atividade_id = None
        await db.delete(linha)
        apagadas.add(linha.id)

    # Depois de publicar, o rascunho é igual ao publicado: dias do passado (ou com a chamada
    # encerrada) voltam ao que foi publicado e dia novo no passado não vale.
    for linha in vivas:
        if linha.id in apagadas:
            continue
        atividade = atividades.get(linha.atividade_id) if linha.atividade_id is not None else None
        if atividade is None:
            await db.delete(linha)
            continue
        linha.removido = False
        linha.hora_inicio, linha.hora_fim = horario_local(atividade.inicio, atividade.fim)
        linha.updated_at = agora

    plano.status = "publicado"
    plano.publicado_em = agora
    plano.publicado_por = current_user.id
    plano.updated_at = agora
    await _auditar(
        db,
        current_user,
        plano,
        "publicou",
        criadas=resultado.criadas,
        canceladas=resultado.canceladas,
        trocadas=resultado.trocadas,
        reagendadas=resultado.reagendadas,
        convocados=len(resultado.convocados),
        dispensados=len(resultado.dispensados),
    )
    await db.commit()
    await escala_publicada(db, tenant_id, plano.id, resultado)
    base = await _resposta(db, tenant_id, tipo, mes_d)
    return PublicarResponse(**base.model_dump(), resultado=_resultado_out(resultado))


@router.post(
    CAMINHO + "/atualizar-convocacoes",
    response_model=PublicarResponse,
    dependencies=[
        Depends(require_group_permission(PermissionFeature.ESCALAS, "insert")),
        Depends(require_group_permission(PermissionFeature.ESCALAS, "edit")),
    ],
)
async def atualizar_convocacoes(
    tipo_id: uuid.UUID = Path(...),
    mes: str = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PublicarResponse:
    """Mudou quem está nos grupos depois de publicar: confere SÓ as faxinas que ainda não
    começaram — quem entrou no grupo vai para a escala, quem saiu é dispensado. O passado não muda.
    Quem a casa tirou da escala à mão continua fora."""
    tenant_id = current_user.tenant_id
    tipo = await _tipo_do_planejador(db, tenant_id, tipo_id)
    mes_d = mes_de_texto(mes)
    plano = await _plano(db, tenant_id, tipo.id, mes_d, travar=True)
    if plano is None or plano.status != "publicado":
        raise ConflictError("Publique a escala antes de atualizar as convocações.")
    linhas = await _linhas(db, tenant_id, plano.id, travar=True)
    atividades = await _atividades_das_linhas(db, tenant_id, linhas, travar=True)
    agora = utc_now()
    resultado = ResultadoPublicacao(motivo="atualizacao")
    membros = _Membros(db, tenant_id, tipo, resultado)
    for linha in linhas:
        atividade = atividades.get(linha.atividade_id) if linha.atividade_id is not None else None
        if (
            atividade is None
            or atividade.deleted_at is not None
            or atividade.cancelada_em is not None
            or atividade.chamada_encerrada_em is not None
            or atividade.inicio is None
            or atividade.inicio <= agora
        ):
            continue
        await _convocar_grupo(
            db,
            tenant_id,
            atividade.id,
            linha.grupo_id,
            await membros.de(linha.grupo_id),
            resultado,
            devolver_dispensados=False,
        )
        resultado.atividades += 1
    await _auditar(
        db,
        current_user,
        plano,
        "atualizou as convocações",
        atividades=resultado.atividades,
        convocados=len(resultado.convocados),
        dispensados=len(resultado.dispensados),
    )
    await db.commit()
    await escala_publicada(db, tenant_id, plano.id, resultado)
    base = await _resposta(db, tenant_id, tipo, mes_d)
    return PublicarResponse(**base.model_dump(), resultado=_resultado_out(resultado))


def _resultado_out(r: ResultadoPublicacao) -> ResultadoOut:
    return ResultadoOut(
        criadas=r.criadas,
        canceladas=r.canceladas,
        trocadas=r.trocadas,
        reagendadas=r.reagendadas,
        atividades=r.atividades,
        convocados=len(r.convocados),
        dispensados=len(r.dispensados),
        ignorados_passado=r.ignorados_passado,
        fora_da_elegibilidade=r.fora_da_elegibilidade,
    )
