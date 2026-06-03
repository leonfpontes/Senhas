"""Public API — Inscrição pública em cursos presenciais.

Endpoints:
    GET  /api/v1/public/cursos/{curso_id}              → dados públicos do curso (sem auth)
    POST /api/v1/public/cursos/{curso_id}/inscricao    → registrar participante (sem auth)
"""

from fastapi import APIRouter, HTTPException, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
import logging

from src.core.database import get_db
from src.core.limiter import limiter
from src.core.config import settings
from src.models import CursoPresencial, CursoParticipante
from src.models.tenants import Tenant
from src.models.tenant_config import TenantConfig
from src.repositories.curso_presencial_repo import (
    CursoPresencialRepository,
    CursoParticipanteRepository,
)

router = APIRouter(prefix="/api/v1/public", tags=["public-cursos"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class CursoPublicoResponse(BaseModel):
    """Dados públicos de um curso (sem info sensível de participantes)."""
    id: UUID
    titulo: str
    ementa: Optional[str] = None
    data_inicio: datetime
    data_fim: Optional[datetime] = None
    local: Optional[str] = None
    max_participantes: Optional[int] = None
    vagas_restantes: Optional[int] = None
    valor_mensalidade_padrao: Optional[Decimal] = None
    gerar_mensalidade: bool
    is_active: bool
    observacoes: Optional[str] = None

    # Branding do tenant
    tenant_nome: str
    tenant_primary_color: str
    tenant_secondary_color: str
    tenant_logo_url: Optional[str] = None
    tenant_endereco: Optional[str] = None


class InscricaoPublicaRequest(BaseModel):
    """Payload para inscrição pública em curso."""
    nome: str = Field(..., min_length=3, max_length=255)
    email: EmailStr
    celular: Optional[str] = Field(None, max_length=20)
    data_nascimento: Optional[date] = None
    observacoes: Optional[str] = Field(None, max_length=1000)
    aceita_uso_dados: bool = Field(..., description="Aceite LGPD: uso de dados pessoais")
    aceita_uso_imagem: bool = Field(..., description="Aceite: uso de imagem e gravações")


class InscricaoPublicaResponse(BaseModel):
    """Resposta após inscrição bem-sucedida."""
    id: UUID
    nome: str
    email: str
    curso_titulo: str
    data_inicio: datetime
    valor_mensalidade: Optional[Decimal] = None
    mensagem: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_curso_e_tenant(
    curso_id: UUID,
    db: AsyncSession,
) -> tuple[CursoPresencial, Tenant, TenantConfig | None]:
    """Busca o curso, tenant e config de branding. Lança 404 se não encontrar."""
    repo = CursoPresencialRepository(db)
    # Busca direta sem filtro de tenant (pois é público, mas com check de curso ativo)
    stmt = select(CursoPresencial).where(
        and_(
            CursoPresencial.id == curso_id,
            CursoPresencial.deleted_at.is_(None),
            CursoPresencial.is_active.is_(True),
        )
    )
    result = await db.execute(stmt)
    curso = result.scalar_one_or_none()
    if not curso:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curso não encontrado ou inativo.")

    tenant_stmt = select(Tenant).where(Tenant.id == curso.tenant_id)
    tenant_result = await db.execute(tenant_stmt)
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recurso não encontrado.")

    config_stmt = select(TenantConfig).where(TenantConfig.tenant_id == curso.tenant_id)
    config_result = await db.execute(config_stmt)
    tenant_config = config_result.scalar_one_or_none()

    return curso, tenant, tenant_config


async def _count_participantes(curso_id: UUID, tenant_id: UUID, db: AsyncSession) -> int:
    stmt = select(func.count(CursoParticipante.id)).where(
        and_(
            CursoParticipante.curso_id == curso_id,
            CursoParticipante.tenant_id == tenant_id,
            CursoParticipante.deleted_at.is_(None),
        )
    )
    result = await db.execute(stmt)
    return result.scalar_one() or 0


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/cursos/{curso_id}", response_model=CursoPublicoResponse)
async def get_curso_publico(
    curso_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> CursoPublicoResponse:
    """Retorna dados públicos de um curso para exibição na página de inscrição."""
    curso, tenant, cfg = await _get_curso_e_tenant(curso_id, db)

    # Contagem de participantes para calcular vagas
    total_inscritos = await _count_participantes(curso_id, curso.tenant_id, db)
    vagas_restantes: Optional[int] = None
    if curso.max_participantes is not None:
        vagas_restantes = max(0, curso.max_participantes - total_inscritos)

    # Branding
    primary_color = cfg.primary_color if cfg else "#4f46e5"
    secondary_color = cfg.secondary_color if cfg else "#818cf8"
    endereco = cfg.endereco if cfg else None

    # Logo URL
    logo_url: Optional[str] = None
    if cfg and cfg.logo_data:
        logo_url = f"{settings.FRONTEND_URL.rstrip('/')}/api/v1/public/tenant/{tenant.id}/logo"
    elif cfg and cfg.logo_url:
        logo_url = cfg.logo_url

    return CursoPublicoResponse(
        id=curso.id,
        titulo=curso.titulo,
        ementa=curso.ementa,
        data_inicio=curso.data_inicio,
        data_fim=curso.data_fim,
        local=curso.local,
        max_participantes=curso.max_participantes,
        vagas_restantes=vagas_restantes,
        valor_mensalidade_padrao=curso.valor_mensalidade_padrao,
        gerar_mensalidade=curso.gerar_mensalidade,
        is_active=curso.is_active,
        observacoes=curso.observacoes,
        tenant_nome=tenant.name,
        tenant_primary_color=primary_color,
        tenant_secondary_color=secondary_color,
        tenant_logo_url=logo_url,
        tenant_endereco=endereco,
    )


@router.post(
    "/cursos/{curso_id}/inscricao",
    response_model=InscricaoPublicaResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("10/minute")
async def inscricao_publica(
    request: Request,
    curso_id: UUID,
    body: InscricaoPublicaRequest,
    db: AsyncSession = Depends(get_db),
) -> InscricaoPublicaResponse:
    """Inscrição pública em um curso presencial — sem autenticação.

    Valida consentimentos LGPD, verifica vagas disponíveis, e impede duplicata
    pelo mesmo e-mail no mesmo curso.
    """
    # === Validar consentimentos obrigatórios ===
    if not body.aceita_uso_dados:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="É obrigatório aceitar o uso dos dados pessoais (LGPD).",
        )
    if not body.aceita_uso_imagem:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="É obrigatório aceitar o uso de imagem e gravações.",
        )

    # === Buscar curso e tenant ===
    curso, tenant, cfg = await _get_curso_e_tenant(curso_id, db)

    # === Verificar vagas ===
    total_inscritos = await _count_participantes(curso_id, curso.tenant_id, db)
    if curso.max_participantes is not None and total_inscritos >= curso.max_participantes:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não há vagas disponíveis para este curso.",
        )

    # === Verificar duplicata por e-mail ===
    dup_stmt = select(CursoParticipante).where(
        and_(
            CursoParticipante.curso_id == curso_id,
            CursoParticipante.tenant_id == curso.tenant_id,
            CursoParticipante.email == body.email.lower().strip(),
            CursoParticipante.deleted_at.is_(None),
        )
    )
    dup_result = await db.execute(dup_stmt)
    if dup_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este e-mail já está inscrito neste curso.",
        )

    # === Criar participante ===
    part_repo = CursoParticipanteRepository(db)
    participante = await part_repo.create(
        tenant_id=curso.tenant_id,
        curso_id=curso_id,
        nome=body.nome.strip(),
        email=body.email.lower().strip(),
        celular=body.celular or None,
        data_nascimento=body.data_nascimento,
        valor_mensalidade=curso.valor_mensalidade_padrao,
        observacoes=body.observacoes or None,
        pago=False,
        valor_pago=None,
        data_pagamento=None,
    )

    await db.commit()

    logger.info(
        f"Inscrição pública: {body.email} → curso '{curso.titulo}' (tenant={tenant.slug})"
    )

    return InscricaoPublicaResponse(
        id=participante.id,
        nome=participante.nome,
        email=participante.email,
        curso_titulo=curso.titulo,
        data_inicio=curso.data_inicio,
        valor_mensalidade=participante.valor_mensalidade,
        mensagem=(
            f"Inscrição realizada com sucesso! Bem-vindo(a) ao curso '{curso.titulo}'. "
            "Em breve você receberá informações por e-mail."
        ),
    )
