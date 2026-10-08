"""Avisos da casa para a corrente — painel (AM-09). Na tela é "Avisos" (D-16).

Rotas (todas com o plano/chave do piloto `area_medium` e o grupo `COMUNICADOS`, §6.7 do plano):
- ``GET    /api/v1/admin/comunicados``                — lista com "lido por N de M" (`view`)
- ``GET    /api/v1/admin/comunicados/{id}``           — detalhe (`view`)
- ``GET    /api/v1/admin/comunicados/{id}/leituras``  — quem leu e quem não leu (D-28, `view`)
- ``POST   /api/v1/admin/comunicados``                — publica agora ou agenda (`insert`)
- ``PUT    /api/v1/admin/comunicados/{id}``           — edita (`edit`)
- ``DELETE /api/v1/admin/comunicados/{id}``           — arquiva (soft delete, `delete`)

"N de M" conta só quem PODE ler: médiuns ativos do público do aviso que já têm acesso à Área
(vínculo `mediuns.user_id` com conta ativa). Público `grupos` (AM-23): `grupo_ids` no corpo
(grupos ativos do terreiro, conferidos antes de gravar em `comunicado_grupos`); o "M" são só os
membros desses grupos (grupo arquivado não conta). O médium nunca vê quem mais leu (D-07); só quem
tem `COMUNICADOS:view` no painel vê os nomes.

"Avisar por e-mail também" (AM-15): `avisar_email` no corpo (quem cria/edita, `insert`/`edit`). O
agendador `services/medium_lembrete_scheduler.py` manda o aviso por e-mail ao público com acesso à
Área quando ele está publicado — uma vez por médium (marca em `medium_lembretes_enviados`), nos 3 dias
seguintes à publicação ou a ligar a opção (`avisar_email_em`). Desligar antes da rodada não manda.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Path, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user, require_group_permission, require_plan_feature
from src.core.database import get_db
from src.core.errors import NotFoundError, ValidationError
from src.core.tz import utc_now
from src.models import (
    Comunicado,
    ComunicadoGrupo,
    ComunicadoLeitura,
    ComunicadoPublico,
    CorrenteGrupo,
    Medium,
    PermissionFeature,
    User,
)
from src.models.comunicados import CORPO_MAX, TITULO_MAX
from src.services.audit_service import AuditService
from src.services.corrente_grupos import validar_grupos_ativos_do_tenant, membros_por_medium
from src.services.comunicados import (
    limpar_corpo,
    limpar_titulo,
    medium_no_publico,
    normalizar_data,
    situacao,
)

router = APIRouter(
    prefix="/api/v1/admin/comunicados",
    tags=["admin-comunicados"],
    dependencies=[Depends(require_plan_feature("area_medium"))],
)

MSG_VAZIO = "Preencha o título e o texto do aviso."
MSG_EXPIRA_ANTES = "A data para sair do ar precisa ser depois da publicação."
MSG_EXPIRA_PASSADO = "A data para sair do ar já passou."
MSG_SEM_GRUPO = "Escolha pelo menos um grupo da corrente."


class ComunicadoCreate(BaseModel):
    titulo: str = Field(..., max_length=TITULO_MAX * 2)
    corpo: str = Field(..., max_length=CORPO_MAX * 2)
    publico: ComunicadoPublico = ComunicadoPublico.TODOS
    # Só com publico = "grupos" (AM-23): grupos ativos do terreiro.
    grupo_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)
    fixado: bool = False
    # None = publicar agora; data futura = agendado. Sem fuso = horário de Brasília.
    publicar_em: Optional[datetime] = None
    expira_em: Optional[datetime] = None
    # AM-15: manda também por e-mail a quem tem acesso à Área (assunto discreto).
    avisar_email: bool = False


class ComunicadoUpdate(BaseModel):
    titulo: Optional[str] = Field(None, max_length=TITULO_MAX * 2)
    corpo: Optional[str] = Field(None, max_length=CORPO_MAX * 2)
    publico: Optional[ComunicadoPublico] = None
    # Enviado = troca os grupos (vale com publico "grupos"). Ausente = não muda.
    grupo_ids: Optional[list[uuid.UUID]] = Field(None, max_length=50)
    fixado: Optional[bool] = None
    # Enviado como null = publicar agora. Ausente = não muda.
    publicar_em: Optional[datetime] = None
    # Enviado como null = nunca sai do ar. Ausente = não muda.
    expira_em: Optional[datetime] = None
    avisar_email: Optional[bool] = None


class LeiturasResumo(BaseModel):
    lidos: int
    total: int


class GrupoDoAviso(BaseModel):
    id: uuid.UUID
    nome: str
    cor: str


class ComunicadoResponse(BaseModel):
    id: uuid.UUID
    titulo: str
    corpo: str
    publico: str
    grupos: list[GrupoDoAviso] = []
    fixado: bool
    publicar_em: datetime
    expira_em: Optional[datetime] = None
    situacao: str  # agendado | publicado | expirado
    avisar_email: bool = False
    created_at: datetime
    updated_at: datetime
    leituras: LeiturasResumo


class Leitor(BaseModel):
    medium_id: uuid.UUID
    nome: str
    lido_em: Optional[datetime] = None


class LeiturasResponse(BaseModel):
    total: int
    lidos: int
    leram: list[Leitor]
    nao_leram: list[Leitor]


# ── Consultas ───────────────────────────────────────────────────────────────


async def _comunicado_do_tenant(db: AsyncSession, tenant_id: uuid.UUID, comunicado_id: uuid.UUID) -> Comunicado:
    comunicado = (
        await db.execute(
            select(Comunicado).where(
                Comunicado.id == comunicado_id,
                Comunicado.tenant_id == tenant_id,
                Comunicado.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if comunicado is None:
        raise NotFoundError("Aviso")
    return comunicado


MediumComAcesso = tuple[uuid.UUID, str, bool, frozenset]


async def _mediuns_com_acesso(db: AsyncSession, tenant_id: uuid.UUID) -> list[MediumComAcesso]:
    """Médiuns ativos do terreiro com acesso à Área (vínculo com conta ativa):
    (id, nome, atendimento, grupos ativos em que está)."""
    rows = await db.execute(
        select(Medium.id, Medium.nome, Medium.is_atendimento)
        .join(User, User.id == Medium.user_id)
        .where(
            Medium.tenant_id == tenant_id,
            Medium.deleted_at.is_(None),
            Medium.is_active.is_(True),
            User.tenant_id == tenant_id,
            User.is_active.is_(True),
            User.deleted_at.is_(None),
        )
        .order_by(Medium.nome)
    )
    grupos = await membros_por_medium(db, tenant_id)
    return [(r[0], r[1], bool(r[2]), grupos.get(r[0], frozenset())) for r in rows.all()]


async def _grupos_dos_avisos(
    db: AsyncSession, tenant_id: uuid.UUID, comunicado_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[CorrenteGrupo]]:
    """{comunicado_id: grupos ATIVOS escolhidos}, por nome."""
    if not comunicado_ids:
        return {}
    rows = await db.execute(
        select(ComunicadoGrupo.comunicado_id, CorrenteGrupo)
        .join(CorrenteGrupo, CorrenteGrupo.id == ComunicadoGrupo.grupo_id)
        .where(
            ComunicadoGrupo.tenant_id == tenant_id,
            ComunicadoGrupo.comunicado_id.in_(comunicado_ids),
            CorrenteGrupo.tenant_id == tenant_id,
            CorrenteGrupo.arquivado_em.is_(None),
        )
        .order_by(CorrenteGrupo.nome)
    )
    out: dict[uuid.UUID, list[CorrenteGrupo]] = {}
    for comunicado_id, grupo in rows.all():
        out.setdefault(comunicado_id, []).append(grupo)
    return out


async def _limpar_grupos(db: AsyncSession, tenant_id: uuid.UUID, comunicado: Comunicado) -> None:
    await db.execute(
        delete(ComunicadoGrupo).where(
            ComunicadoGrupo.tenant_id == tenant_id, ComunicadoGrupo.comunicado_id == comunicado.id
        )
    )


async def _leituras(
    db: AsyncSession, tenant_id: uuid.UUID, comunicado_ids: list[uuid.UUID]
) -> dict[uuid.UUID, dict[uuid.UUID, datetime]]:
    """{comunicado_id: {medium_id: lido_em}}."""
    if not comunicado_ids:
        return {}
    rows = await db.execute(
        select(ComunicadoLeitura.comunicado_id, ComunicadoLeitura.medium_id, ComunicadoLeitura.lido_em).where(
            ComunicadoLeitura.tenant_id == tenant_id,
            ComunicadoLeitura.comunicado_id.in_(comunicado_ids),
        )
    )
    out: dict[uuid.UUID, dict[uuid.UUID, datetime]] = {}
    for comunicado_id, medium_id, lido_em in rows.all():
        out.setdefault(comunicado_id, {})[medium_id] = lido_em
    return out


def _publico_do_aviso(comunicado: Comunicado, mediuns: list[MediumComAcesso], grupos: list[CorrenteGrupo]):
    ids = frozenset(g.id for g in grupos)
    return [m for m in mediuns if medium_no_publico(comunicado.publico, m[2], m[3], ids)]


def _resposta(
    comunicado: Comunicado,
    mediuns: list[MediumComAcesso],
    lidos: dict[uuid.UUID, datetime],
    agora: datetime,
    grupos: list[CorrenteGrupo],
) -> ComunicadoResponse:
    publico = _publico_do_aviso(comunicado, mediuns, grupos)
    return ComunicadoResponse(
        id=comunicado.id,
        titulo=comunicado.titulo,
        corpo=comunicado.corpo,
        publico=comunicado.publico,
        grupos=[GrupoDoAviso(id=g.id, nome=g.nome, cor=g.cor) for g in grupos],
        fixado=comunicado.fixado,
        publicar_em=comunicado.publicar_em,
        expira_em=comunicado.expira_em,
        situacao=situacao(comunicado.publicar_em, comunicado.expira_em, agora),
        avisar_email=bool(comunicado.avisar_email),
        created_at=comunicado.created_at,
        updated_at=comunicado.updated_at,
        leituras=LeiturasResumo(lidos=sum(1 for m in publico if m[0] in lidos), total=len(publico)),
    )


async def _resposta_unica(db: AsyncSession, tenant_id: uuid.UUID, comunicado: Comunicado) -> ComunicadoResponse:
    mediuns = await _mediuns_com_acesso(db, tenant_id)
    lidos = (await _leituras(db, tenant_id, [comunicado.id])).get(comunicado.id, {})
    grupos = (await _grupos_dos_avisos(db, tenant_id, [comunicado.id])).get(comunicado.id, [])
    return _resposta(comunicado, mediuns, lidos, utc_now(), grupos)


def _snapshot(c: Comunicado, grupos: Optional[list[CorrenteGrupo]] = None) -> dict:
    """O que vai para a auditoria (o texto do aviso não: só o título)."""
    return {
        "titulo": c.titulo,
        "publico": c.publico,
        **({"grupos": [g.nome for g in grupos]} if grupos else {}),
        "fixado": c.fixado,
        "publicar_em": c.publicar_em.isoformat() if c.publicar_em else None,
        "expira_em": c.expira_em.isoformat() if c.expira_em else None,
        "avisar_email": bool(c.avisar_email),
    }


def _validar_janela(publicar_em: datetime, expira_em: Optional[datetime], agora: datetime, *, criando: bool) -> None:
    if expira_em is None:
        return
    if expira_em <= publicar_em:
        raise ValidationError(MSG_EXPIRA_ANTES)
    if criando and expira_em <= agora:
        raise ValidationError(MSG_EXPIRA_PASSADO)


# ── Rotas ───────────────────────────────────────────────────────────────────


@router.get("", response_model=list[ComunicadoResponse], dependencies=[Depends(require_group_permission(PermissionFeature.COMUNICADOS, "view"))])
async def listar_comunicados(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ComunicadoResponse]:
    """Avisos do terreiro: fixados primeiro, depois do mais novo para o mais antigo."""
    tenant_id = current_user.tenant_id
    comunicados = (
        await db.execute(
            select(Comunicado)
            .where(Comunicado.tenant_id == tenant_id, Comunicado.deleted_at.is_(None))
            .order_by(Comunicado.fixado.desc(), Comunicado.publicar_em.desc())
            .limit(500)
        )
    ).scalars().all()
    mediuns = await _mediuns_com_acesso(db, tenant_id)
    leituras = await _leituras(db, tenant_id, [c.id for c in comunicados])
    grupos = await _grupos_dos_avisos(db, tenant_id, [c.id for c in comunicados])
    agora = utc_now()
    return [_resposta(c, mediuns, leituras.get(c.id, {}), agora, grupos.get(c.id, [])) for c in comunicados]


@router.get("/{comunicado_id}", response_model=ComunicadoResponse, dependencies=[Depends(require_group_permission(PermissionFeature.COMUNICADOS, "view"))])
async def obter_comunicado(
    comunicado_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ComunicadoResponse:
    comunicado = await _comunicado_do_tenant(db, current_user.tenant_id, comunicado_id)
    return await _resposta_unica(db, current_user.tenant_id, comunicado)


@router.get("/{comunicado_id}/leituras", response_model=LeiturasResponse, dependencies=[Depends(require_group_permission(PermissionFeature.COMUNICADOS, "view"))])
async def leituras_do_comunicado(
    comunicado_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LeiturasResponse:
    """Quem leu e quem não leu, entre os médiuns do público que têm acesso à Área (D-28)."""
    tenant_id = current_user.tenant_id
    comunicado = await _comunicado_do_tenant(db, tenant_id, comunicado_id)
    grupos = (await _grupos_dos_avisos(db, tenant_id, [comunicado.id])).get(comunicado.id, [])
    publico = _publico_do_aviso(comunicado, await _mediuns_com_acesso(db, tenant_id), grupos)
    lidos = (await _leituras(db, tenant_id, [comunicado.id])).get(comunicado.id, {})
    leram = [Leitor(medium_id=m[0], nome=m[1], lido_em=lidos[m[0]]) for m in publico if m[0] in lidos]
    leram.sort(key=lambda leitor: leitor.lido_em, reverse=True)
    nao_leram = [Leitor(medium_id=m[0], nome=m[1]) for m in publico if m[0] not in lidos]
    return LeiturasResponse(total=len(publico), lidos=len(leram), leram=leram, nao_leram=nao_leram)


@router.post("", response_model=ComunicadoResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_group_permission(PermissionFeature.COMUNICADOS, "insert"))])
async def criar_comunicado(
    body: ComunicadoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ComunicadoResponse:
    titulo, corpo = limpar_titulo(body.titulo), limpar_corpo(body.corpo)
    if not titulo or not corpo:
        raise ValidationError(MSG_VAZIO)
    if len(titulo) > TITULO_MAX or len(corpo) > CORPO_MAX:
        raise ValidationError(f"O título vai até {TITULO_MAX} letras e o texto até {CORPO_MAX}.")
    agora = utc_now()
    publicar_em = normalizar_data(body.publicar_em) or agora
    expira_em = normalizar_data(body.expira_em)
    _validar_janela(publicar_em, expira_em, agora, criando=True)
    grupos: list[CorrenteGrupo] = []
    if body.publico == ComunicadoPublico.GRUPOS:
        grupos = await validar_grupos_ativos_do_tenant(db, current_user.tenant_id, body.grupo_ids)
        if not grupos:
            raise ValidationError(MSG_SEM_GRUPO)

    comunicado = Comunicado(
        tenant_id=current_user.tenant_id,
        titulo=titulo,
        corpo=corpo,
        publico=body.publico.value,
        fixado=body.fixado,
        publicar_em=publicar_em,
        expira_em=expira_em,
        criado_por=current_user.id,
        avisar_email=body.avisar_email,
        avisar_email_em=agora if body.avisar_email else None,
    )
    db.add(comunicado)
    await db.flush()
    if grupos:
        # grupo_ids já conferidos no terreiro (validar_grupos_ativos_do_tenant acima).
        for grupo_id in set(body.grupo_ids):
            db.add(ComunicadoGrupo(tenant_id=current_user.tenant_id, comunicado_id=comunicado.id, grupo_id=grupo_id))
    await AuditService(db).log_create(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="comunicado",
        resource_id=comunicado.id,
        details=_snapshot(comunicado, grupos),
    )
    await db.commit()
    await db.refresh(comunicado)
    return await _resposta_unica(db, current_user.tenant_id, comunicado)


@router.put("/{comunicado_id}", response_model=ComunicadoResponse, dependencies=[Depends(require_group_permission(PermissionFeature.COMUNICADOS, "edit"))])
async def editar_comunicado(
    body: ComunicadoUpdate,
    comunicado_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ComunicadoResponse:
    """Atualiza só o que veio no corpo. `publicar_em: null` publica agora; `expira_em: null` tira a validade."""
    tenant_id = current_user.tenant_id
    comunicado = await _comunicado_do_tenant(db, tenant_id, comunicado_id)
    grupos_antes = (await _grupos_dos_avisos(db, tenant_id, [comunicado.id])).get(comunicado.id, [])
    antes = _snapshot(comunicado, grupos_antes)
    enviados = body.model_fields_set
    agora = utc_now()

    if "titulo" in enviados:
        titulo = limpar_titulo(body.titulo)
        if not titulo:
            raise ValidationError(MSG_VAZIO)
        if len(titulo) > TITULO_MAX:
            raise ValidationError(f"O título vai até {TITULO_MAX} letras.")
        comunicado.titulo = titulo
    if "corpo" in enviados:
        corpo = limpar_corpo(body.corpo)
        if not corpo:
            raise ValidationError(MSG_VAZIO)
        if len(corpo) > CORPO_MAX:
            raise ValidationError(f"O texto vai até {CORPO_MAX} letras.")
        comunicado.corpo = corpo
    if "publico" in enviados and body.publico is not None:
        comunicado.publico = body.publico.value
    grupos = grupos_antes
    if comunicado.publico != ComunicadoPublico.GRUPOS.value:
        grupos = []
        await _limpar_grupos(db, tenant_id, comunicado)
    elif "grupo_ids" in enviados and body.grupo_ids is not None:
        grupos = await validar_grupos_ativos_do_tenant(db, tenant_id, body.grupo_ids)
        if not grupos:
            raise ValidationError(MSG_SEM_GRUPO)
        await _limpar_grupos(db, tenant_id, comunicado)
        for grupo_id in set(body.grupo_ids):
            db.add(ComunicadoGrupo(tenant_id=tenant_id, comunicado_id=comunicado.id, grupo_id=grupo_id))
    elif not grupos:
        raise ValidationError(MSG_SEM_GRUPO)
    if "fixado" in enviados and body.fixado is not None:
        comunicado.fixado = body.fixado
    if "publicar_em" in enviados:
        comunicado.publicar_em = normalizar_data(body.publicar_em) or agora
    if "expira_em" in enviados:
        comunicado.expira_em = normalizar_data(body.expira_em)
    if "avisar_email" in enviados and body.avisar_email is not None:
        if body.avisar_email and not comunicado.avisar_email:
            comunicado.avisar_email_em = agora
        comunicado.avisar_email = body.avisar_email
    _validar_janela(
        comunicado.publicar_em,
        comunicado.expira_em,
        agora,
        criando="expira_em" in enviados and comunicado.expira_em is not None,
    )

    await db.flush()
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="comunicado",
        resource_id=comunicado.id,
        previous_state=antes,
        new_state=_snapshot(comunicado, grupos),
    )
    await db.commit()
    await db.refresh(comunicado)
    return await _resposta_unica(db, tenant_id, comunicado)


@router.delete("/{comunicado_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_group_permission(PermissionFeature.COMUNICADOS, "delete"))])
async def arquivar_comunicado(
    comunicado_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Some da Área do Médium e da lista (soft delete; as leituras ficam no banco)."""
    comunicado = await _comunicado_do_tenant(db, current_user.tenant_id, comunicado_id)
    comunicado.soft_delete()
    await db.flush()
    await AuditService(db).log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="comunicado",
        resource_id=comunicado.id,
        previous_state=_snapshot(comunicado),
    )
    await db.commit()
    return None
