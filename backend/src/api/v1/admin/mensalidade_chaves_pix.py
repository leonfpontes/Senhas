"""Chaves PIX por grupo da corrente (migração 100).

    GET    /api/v1/admin/financeiro/config/pix/chaves        — FINANCEIRO:view
    POST   /api/v1/admin/financeiro/config/pix/chaves        — FINANCEIRO:insert + senha
    PUT    /api/v1/admin/financeiro/config/pix/chaves/{id}   — FINANCEIRO:edit + senha
    DELETE /api/v1/admin/financeiro/config/pix/chaves/{id}   — FINANCEIRO:delete

Todas com o plano `mensalidade_mediun`. A casa que recebe em mais de uma conta cadastra aqui a
chave "alternativa", diz em qual conta bancária ela cai e quais grupos da corrente pagam nela.
Quem não está em nenhum desses grupos continua com a chave do terreiro (`mensalidade_pix.py`).
Regra de qual chave vale para cada médium: `services/mensalidade_chaves_pix.py`.

Criar ou trocar uma chave muda para onde vai o dinheiro, então vale a mesma proteção da chave do
terreiro: senha de quem altera (401 sem derrubar a sessão), recusa sob impersonação, 10
tentativas por hora por IP, auditoria com a chave mascarada e e-mail a todos os administradores.
Quem só tem FINANCEIRO:view recebe as chaves mascaradas.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, Path, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import (
    get_current_user,
    require_group_permission,
    require_not_impersonated,
    require_plan_feature,
)
from src.api.v1.admin.mensalidade_pix import (
    INSTRUCOES_MAX,
    VALOR_PREVIA_PADRAO,
    PixTipo,
    avisar_admins,
    pode_editar,
    validar_conta_bancaria,
)
from src.core.database import get_db
from src.core.errors import ConflictError, NotFoundError, UnauthorizedError, ValidationError
from src.core.limiter import limiter
from src.core.tz import APP_TZ, utc_now
from src.models import Medium, PermissionFeature, User
from src.models.contas_financeiras import ContaBancaria
from src.models.corrente_grupos import CorrenteGrupo, CorrenteGrupoMembro
from src.models.mensalidade_chaves_pix import APELIDO_MAX, MensalidadeChavePix, MensalidadeChavePixGrupo
from src.repositories.mensalidade_repo import MensalidadeRepository
from src.security.password import verify_password
from src.services.audit_service import AuditService
from src.services.mensalidade_chaves_pix import conflitos
from src.services.pix_brcode import build_static_brcode
from src.services.pix_chave import (
    CIDADE_MAX,
    NOME_RECEBEDOR_MAX,
    ChavePixInvalida,
    mascarar_chave,
    normalizar_chave,
    texto_ascii,
)

router = APIRouter(prefix="/api/v1/admin/financeiro", tags=["admin-financeiro"])
logger = logging.getLogger(__name__)

_GATE = Depends(require_plan_feature("mensalidade_mediun"))
MAX_GRUPOS = 100


class GrupoDaChave(BaseModel):
    id: uuid.UUID
    nome: str
    cor: str


class ChavePixOut(BaseModel):
    id: uuid.UUID
    apelido: str
    tipo: PixTipo
    chave_mascarada: str
    # Só para FINANCEIRO:edit (null para quem só vê).
    chave: Optional[str] = None
    nome_recebedor: str
    cidade: str
    instrucoes: Optional[str] = None
    alterado_em: Optional[datetime] = None
    conta_bancaria_id: Optional[uuid.UUID] = None
    conta_bancaria_nome: Optional[str] = None
    grupos: List[GrupoDaChave] = []
    # Médiuns dos grupos (distintos) — quem paga nesta chave.
    total_mediuns: int = 0
    brcode_previa: Optional[str] = None


class GrupoOpcao(BaseModel):
    id: uuid.UUID
    nome: str
    cor: str
    # Chave a que o grupo já está ligado (escolher o grupo em outra chave o move).
    chave_id: Optional[uuid.UUID] = None


class ContaBancariaOpcao(BaseModel):
    id: uuid.UUID
    nome: str
    banco: Optional[str] = None


class ConflitoChave(BaseModel):
    """Médium em grupos com chaves diferentes: vale a primeira (`chave_valida`)."""

    medium_id: uuid.UUID
    medium_nome: str
    chave_valida: str
    outras: List[str]


class ChavesPixResponse(BaseModel):
    chaves: List[ChavePixOut]
    grupos: List[GrupoOpcao]
    contas_bancarias: List[ContaBancariaOpcao]
    conflitos: List[ConflitoChave]


class ChavePixBody(BaseModel):
    apelido: str = Field(..., min_length=1, max_length=APELIDO_MAX)
    tipo: PixTipo
    chave: str = Field(..., min_length=1, max_length=120)
    nome_recebedor: str = Field(..., min_length=1, max_length=NOME_RECEBEDOR_MAX)
    cidade: str = Field(..., min_length=1, max_length=CIDADE_MAX)
    instrucoes: Optional[str] = Field(None, max_length=INSTRUCOES_MAX)
    conta_bancaria_id: Optional[uuid.UUID] = None
    grupo_ids: List[uuid.UUID] = Field(default_factory=list, max_length=MAX_GRUPOS)
    # Senha de quem está alterando. Nunca é gravada nem auditada.
    senha: str = Field(..., min_length=1, max_length=256)


# ── helpers ────────────────────────────────────────────────────────────────


def _exigir_senha(body: ChavePixBody, user: User) -> None:
    if not verify_password(body.senha, user.password_hash):
        raise UnauthorizedError(
            "Senha incorreta. Confirme sua senha para alterar a chave PIX.",
            details={"error_code": "INVALID_PASSWORD"},
        )


def _dados_validos(body: ChavePixBody) -> dict:
    try:
        chave = normalizar_chave(body.tipo, body.chave)
    except ChavePixInvalida as exc:
        raise ValidationError(str(exc), details={"field": "chave"})
    apelido = " ".join(body.apelido.split())
    nome = " ".join(body.nome_recebedor.split())
    cidade = " ".join(body.cidade.split())
    if not apelido:
        raise ValidationError("Dê um nome para a chave (ex.: Conta Inter).", details={"field": "apelido"})
    if not texto_ascii(nome):
        raise ValidationError("Informe o nome de quem recebe.", details={"field": "nome_recebedor"})
    if not texto_ascii(cidade):
        raise ValidationError("Informe a cidade de quem recebe.", details={"field": "cidade"})
    return {
        "apelido": apelido,
        "pix_tipo": body.tipo,
        "pix_chave": chave,
        "pix_nome_recebedor": nome,
        "pix_cidade": cidade,
        "pix_instrucoes": (body.instrucoes or "").strip() or None,
        "conta_bancaria_id": body.conta_bancaria_id,
    }


async def _validar_grupos(db: AsyncSession, tenant_id: uuid.UUID, grupo_ids: List[uuid.UUID]) -> list[uuid.UUID]:
    ids = list(dict.fromkeys(grupo_ids))
    if not ids:
        return []
    achados = set(
        (
            await db.execute(
                select(CorrenteGrupo.id).where(
                    CorrenteGrupo.tenant_id == tenant_id,
                    CorrenteGrupo.id.in_(ids),
                    CorrenteGrupo.arquivado_em.is_(None),
                )
            )
        ).scalars().all()
    )
    if len(achados) != len(ids):
        raise ValidationError("Grupo da corrente não encontrado.", details={"field": "grupo_ids"})
    return ids


async def _apelido_livre(
    db: AsyncSession, tenant_id: uuid.UUID, apelido: str, exceto: Optional[uuid.UUID] = None
) -> None:
    stmt = select(MensalidadeChavePix.id).where(
        MensalidadeChavePix.tenant_id == tenant_id,
        func.lower(MensalidadeChavePix.apelido) == apelido.lower(),
    )
    if exceto is not None:
        stmt = stmt.where(MensalidadeChavePix.id != exceto)
    if (await db.execute(stmt)).first() is not None:
        raise ConflictError("Já existe uma chave com esse nome.", details={"field": "apelido"})


async def _buscar(db: AsyncSession, tenant_id: uuid.UUID, chave_id: uuid.UUID) -> MensalidadeChavePix:
    chave = (
        await db.execute(
            select(MensalidadeChavePix).where(
                MensalidadeChavePix.id == chave_id, MensalidadeChavePix.tenant_id == tenant_id
            )
        )
    ).scalar_one_or_none()
    if chave is None:
        raise NotFoundError("Chave PIX")
    return chave


async def _grupos_da_chave(db: AsyncSession, tenant_id: uuid.UUID, chave_id: uuid.UUID) -> list[uuid.UUID]:
    return list(
        (
            await db.execute(
                select(MensalidadeChavePixGrupo.grupo_id).where(
                    MensalidadeChavePixGrupo.tenant_id == tenant_id,
                    MensalidadeChavePixGrupo.chave_id == chave_id,
                )
            )
        ).scalars().all()
    )


async def _ligar_grupos(
    db: AsyncSession, tenant_id: uuid.UUID, chave_id: uuid.UUID, grupo_ids: list[uuid.UUID]
) -> None:
    """Os grupos da chave passam a ser exatamente `grupo_ids` (grupo em outra chave muda para esta)."""
    await db.execute(
        delete(MensalidadeChavePixGrupo).where(
            MensalidadeChavePixGrupo.tenant_id == tenant_id,
            (MensalidadeChavePixGrupo.chave_id == chave_id) | MensalidadeChavePixGrupo.grupo_id.in_(grupo_ids),
        )
    )
    for grupo_id in grupo_ids:
        db.add(MensalidadeChavePixGrupo(grupo_id=grupo_id, chave_id=chave_id, tenant_id=tenant_id))
    await db.flush()


def _auditavel(chave: MensalidadeChavePix, grupo_ids: list[uuid.UUID]) -> dict:
    return {
        "apelido": chave.apelido,
        "tipo": chave.pix_tipo,
        "chave": mascarar_chave(chave.pix_tipo, chave.pix_chave),
        "nome_recebedor": chave.pix_nome_recebedor,
        "cidade": chave.pix_cidade,
        "conta_bancaria_id": str(chave.conta_bancaria_id) if chave.conta_bancaria_id else None,
        "grupo_ids": sorted(str(g) for g in grupo_ids),
    }


def _previa(chave: MensalidadeChavePix, valor: Decimal) -> Optional[str]:
    try:
        return build_static_brcode(
            chave=chave.pix_chave,
            nome_recebedor=chave.pix_nome_recebedor,
            cidade=chave.pix_cidade,
            valor=valor,
        )
    except ValueError:
        logger.warning("Prévia do BR Code falhou para a chave %s", chave.id)
        return None


async def _montar(db: AsyncSession, tenant_id: uuid.UUID, ver_chave: bool) -> ChavesPixResponse:
    chaves = (
        await db.execute(
            select(MensalidadeChavePix)
            .where(MensalidadeChavePix.tenant_id == tenant_id)
            .order_by(MensalidadeChavePix.created_at, MensalidadeChavePix.id)
        )
    ).scalars().all()
    grupos = (
        await db.execute(
            select(CorrenteGrupo, MensalidadeChavePixGrupo.chave_id)
            .outerjoin(
                MensalidadeChavePixGrupo,
                (MensalidadeChavePixGrupo.grupo_id == CorrenteGrupo.id)
                & (MensalidadeChavePixGrupo.tenant_id == tenant_id),
            )
            .where(CorrenteGrupo.tenant_id == tenant_id, CorrenteGrupo.arquivado_em.is_(None))
            .order_by(func.lower(CorrenteGrupo.nome))
        )
    ).all()
    contas = (
        await db.execute(
            select(ContaBancaria)
            .where(
                ContaBancaria.tenant_id == tenant_id,
                ContaBancaria.deleted_at.is_(None),
                ContaBancaria.ativo.is_(True),
            )
            .order_by(ContaBancaria.nome)
        )
    ).scalars().all()
    nomes_contas = dict(
        (
            await db.execute(
                select(ContaBancaria.id, ContaBancaria.nome).where(ContaBancaria.tenant_id == tenant_id)
            )
        ).all()
    )
    totais = dict(
        (
            await db.execute(
                select(MensalidadeChavePixGrupo.chave_id, func.count(func.distinct(CorrenteGrupoMembro.medium_id)))
                .join(CorrenteGrupoMembro, CorrenteGrupoMembro.grupo_id == MensalidadeChavePixGrupo.grupo_id)
                .join(
                    CorrenteGrupo,
                    (CorrenteGrupo.id == MensalidadeChavePixGrupo.grupo_id) & CorrenteGrupo.arquivado_em.is_(None),
                )
                .where(MensalidadeChavePixGrupo.tenant_id == tenant_id, CorrenteGrupoMembro.tenant_id == tenant_id)
                .group_by(MensalidadeChavePixGrupo.chave_id)
            )
        ).all()
    )

    valor_previa = VALOR_PREVIA_PADRAO
    if ver_chave:
        config = await MensalidadeRepository(db).get_config(tenant_id)
        if config is not None and config.valor_mensal and config.valor_mensal > 0:
            valor_previa = config.valor_mensal

    saida: list[ChavePixOut] = []
    for c in chaves:
        saida.append(
            ChavePixOut(
                id=c.id,
                apelido=c.apelido,
                tipo=c.pix_tipo,
                chave_mascarada=mascarar_chave(c.pix_tipo, c.pix_chave),
                chave=c.pix_chave if ver_chave else None,
                nome_recebedor=c.pix_nome_recebedor,
                cidade=c.pix_cidade,
                instrucoes=c.pix_instrucoes,
                alterado_em=c.pix_alterado_em,
                conta_bancaria_id=c.conta_bancaria_id,
                conta_bancaria_nome=nomes_contas.get(c.conta_bancaria_id) if c.conta_bancaria_id else None,
                grupos=[GrupoDaChave(id=g.id, nome=g.nome, cor=g.cor) for g, cid in grupos if cid == c.id],
                total_mediuns=int(totais.get(c.id, 0)),
                brcode_previa=_previa(c, valor_previa) if ver_chave else None,
            )
        )

    em_conflito = await conflitos(db, tenant_id)
    nomes_mediuns: dict[uuid.UUID, str] = {}
    if em_conflito:
        nomes_mediuns = dict(
            (
                await db.execute(
                    select(Medium.id, Medium.nome).where(
                        Medium.tenant_id == tenant_id, Medium.id.in_(list(em_conflito.keys()))
                    )
                )
            ).all()
        )
    lista_conflitos = sorted(
        (
            ConflitoChave(
                medium_id=mid,
                medium_nome=nomes_mediuns.get(mid, ""),
                chave_valida=lista[0].apelido,
                outras=[c.apelido for c in lista[1:]],
            )
            for mid, lista in em_conflito.items()
        ),
        key=lambda c: c.medium_nome.lower(),
    )

    return ChavesPixResponse(
        chaves=saida,
        grupos=[GrupoOpcao(id=g.id, nome=g.nome, cor=g.cor, chave_id=cid) for g, cid in grupos],
        contas_bancarias=[ContaBancariaOpcao(id=c.id, nome=c.nome, banco=c.banco) for c in contas],
        conflitos=lista_conflitos,
    )


async def _avisar(db: AsyncSession, user: User, chave: MensalidadeChavePix, anterior: Optional[str]) -> None:
    try:
        await avisar_admins(
            db,
            user.tenant_id,
            user,
            chave.pix_tipo,
            mascarar_chave(chave.pix_tipo, chave.pix_chave),
            anterior,
            apelido=chave.apelido,
        )
    except Exception:  # o aviso não desfaz a troca já gravada e auditada
        logger.exception("Falha ao enfileirar o aviso da chave PIX de grupo (tenant %s)", user.tenant_id)


# ── rotas ──────────────────────────────────────────────────────────────────


@router.get(
    "/config/pix/chaves",
    response_model=ChavesPixResponse,
    dependencies=[_GATE, Depends(require_group_permission(PermissionFeature.FINANCEIRO, "view"))],
)
async def listar_chaves_pix(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChavesPixResponse:
    return await _montar(db, current_user.tenant_id, await pode_editar(request, current_user, db))


@router.post(
    "/config/pix/chaves",
    response_model=ChavesPixResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        _GATE,
        Depends(require_group_permission(PermissionFeature.FINANCEIRO, "insert")),
        Depends(require_not_impersonated),
    ],
)
@limiter.limit("10/hour")
async def criar_chave_pix(
    request: Request,
    body: ChavePixBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChavesPixResponse:
    """Nova chave para grupos da corrente (exige a senha; avisa todos os admins)."""
    _exigir_senha(body, current_user)
    tenant_id = current_user.tenant_id
    dados = _dados_validos(body)
    await validar_conta_bancaria(db, tenant_id, body.conta_bancaria_id)
    grupo_ids = await _validar_grupos(db, tenant_id, body.grupo_ids)
    await _apelido_livre(db, tenant_id, dados["apelido"])

    chave = MensalidadeChavePix(id=uuid.uuid4(), tenant_id=tenant_id, pix_alterado_em=utc_now(), **dados)
    db.add(chave)
    await db.flush()
    await _ligar_grupos(db, tenant_id, chave.id, grupo_ids)

    await AuditService(db).log_create(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="mensalidade_pix_grupo",
        resource_id=chave.id,
        details=_auditavel(chave, grupo_ids),
    )
    await db.commit()
    await _avisar(db, current_user, chave, None)
    return await _montar(db, tenant_id, True)


@router.put(
    "/config/pix/chaves/{chave_id}",
    response_model=ChavesPixResponse,
    dependencies=[
        _GATE,
        Depends(require_group_permission(PermissionFeature.FINANCEIRO, "edit")),
        Depends(require_not_impersonated),
    ],
)
@limiter.limit("10/hour")
async def atualizar_chave_pix(
    request: Request,
    body: ChavePixBody,
    chave_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChavesPixResponse:
    """Troca a chave, a conta ou os grupos (exige a senha; avisa os admins se a chave mudou)."""
    _exigir_senha(body, current_user)
    tenant_id = current_user.tenant_id
    chave = await _buscar(db, tenant_id, chave_id)
    dados = _dados_validos(body)
    await validar_conta_bancaria(db, tenant_id, body.conta_bancaria_id)
    grupo_ids = await _validar_grupos(db, tenant_id, body.grupo_ids)
    await _apelido_livre(db, tenant_id, dados["apelido"], exceto=chave.id)

    grupos_antes = await _grupos_da_chave(db, tenant_id, chave.id)
    antes = _auditavel(chave, grupos_antes)
    chave_mudou = chave.pix_chave != dados["pix_chave"] or chave.pix_tipo != dados["pix_tipo"]
    # Grupo novo nesta chave = médiuns que passam a pagar nela: também é "chave alterada" para eles.
    grupos_novos = bool(set(grupo_ids) - set(grupos_antes))

    for campo, valor in dados.items():
        setattr(chave, campo, valor)
    if chave_mudou or grupos_novos:
        chave.pix_alterado_em = utc_now()
    chave.updated_at = utc_now()
    await db.flush()
    await _ligar_grupos(db, tenant_id, chave.id, grupo_ids)

    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="mensalidade_pix_grupo",
        resource_id=chave.id,
        previous_state=antes,
        new_state={**_auditavel(chave, grupo_ids), "chave_alterada": chave_mudou},
    )
    await db.commit()
    if chave_mudou:
        await _avisar(db, current_user, chave, antes["chave"])
    return await _montar(db, tenant_id, True)


@router.delete(
    "/config/pix/chaves/{chave_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[
        _GATE,
        Depends(require_group_permission(PermissionFeature.FINANCEIRO, "delete")),
        Depends(require_not_impersonated),
    ],
)
async def excluir_chave_pix(
    chave_id: uuid.UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a chave: os médiuns dos grupos dela voltam para a chave do terreiro."""
    tenant_id = current_user.tenant_id
    chave = await _buscar(db, tenant_id, chave_id)
    antes = _auditavel(chave, await _grupos_da_chave(db, tenant_id, chave.id))
    await db.delete(chave)
    await AuditService(db).log_delete(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="mensalidade_pix_grupo",
        resource_id=chave_id,
        previous_state=antes,
    )
    await db.commit()
