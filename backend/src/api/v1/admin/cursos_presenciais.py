"""Admin API – Gerenciamento de cursos presenciais e participantes.

Este módulo expõe endpoints para criação, listagem, consulta, atualização e
exclusão de cursos presenciais, além de rotas para gerenciar os participantes
de cada curso. O acesso é restrito a usuários com assinatura nos planos PRO ou
PREMIUM e a assinatura deve estar ativa.
"""

from fastapi import APIRouter, HTTPException, Depends, status, Path, Query, File, Form, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, field_validator
from typing import List, Optional
from uuid import UUID
from datetime import datetime, date, timedelta
from decimal import Decimal

from src.core.database import get_db
from src.api.dependencies import get_current_user
from src.models import User, CursoPresencial, CursoParticipante
from src.models.subscriptions import PlanType, SubscriptionStatus
from src.models.mensalidades import MensalidadeStatus
from src.repositories.curso_presencial_repo import (
    CursoPresencialRepository,
    CursoParticipanteRepository,
    CursoParticipantePagamentoRepository,
)
from src.repositories.subscription_repo import SubscriptionRepository
from src.services.audit_service import AuditService
from src.core.errors import NotFoundError, InsufficientPermissionsError

router = APIRouter(
    prefix="/api/v1/admin/cursos-presenciais",
    tags=["admin-cursos-presenciais"],
)

# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class CursoPresencialCreate(BaseModel):
    """Payload para criar um curso presencial."""
    titulo: str
    ementa: Optional[str] = None
    data_inicio: datetime
    data_fim: Optional[datetime] = None
    max_participantes: Optional[int] = None
    valor_mensalidade_padrao: Optional[Decimal] = None
    local: Optional[str] = None
    observacoes: Optional[str] = None
    is_active: bool = True
    gerar_mensalidade: bool = False
    tipo_formulario: str = "simples"
    chave_pix: Optional[str] = None

class CursoPresencialUpdate(BaseModel):
    """Payload para atualização parcial de um curso presencial."""
    titulo: Optional[str] = None
    ementa: Optional[str] = None
    data_inicio: Optional[datetime] = None
    data_fim: Optional[datetime] = None
    max_participantes: Optional[int] = None
    valor_mensalidade_padrao: Optional[Decimal] = None
    local: Optional[str] = None
    observacoes: Optional[str] = None
    is_active: Optional[bool] = None
    gerar_mensalidade: Optional[bool] = None
    tipo_formulario: Optional[str] = None
    chave_pix: Optional[str] = None

class CursoPresencialResponse(BaseModel):
    """Resposta retornada ao consultar/editar um curso presencial."""
    id: UUID
    tenant_id: UUID
    titulo: str
    ementa: Optional[str] = None
    data_inicio: datetime
    data_fim: Optional[datetime] = None
    max_participantes: Optional[int] = None
    valor_mensalidade_padrao: Optional[Decimal] = None
    local: Optional[str] = None
    observacoes: Optional[str] = None
    is_active: bool
    gerar_mensalidade: bool = False
    tipo_formulario: str = "simples"
    chave_pix: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @field_validator("gerar_mensalidade", mode="before")
    @classmethod
    def validate_gerar_mensalidade(cls, v):
        return v if v is not None else False

    @field_validator("tipo_formulario", mode="before")
    @classmethod
    def validate_tipo_formulario(cls, v):
        return v if v is not None else "simples"

    class Config:
        from_attributes = True

class ParticipanteCreate(BaseModel):
    """Payload para cadastrar um participante em um curso."""
    nome: str
    data_nascimento: Optional[date] = None
    celular: Optional[str] = None
    email: Optional[str] = None
    valor_mensalidade: Optional[Decimal] = None
    observacoes: Optional[str] = None
    genero: Optional[str] = None
    emergencia_contato: Optional[str] = None
    emergencia_fone: Optional[str] = None
    cep: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    estado: Optional[str] = None
    tem_plano_saude: Optional[bool] = None
    plano_saude_nome: Optional[str] = None
    toma_medicamento: Optional[bool] = None
    medicamentos_nome: Optional[str] = None
    tem_doenca_tratamento: Optional[bool] = None
    doenca_tratamento_nome: Optional[str] = None
    tem_diabetes: Optional[bool] = None
    outras_doencas: Optional[str] = None
    cpf: Optional[str] = None
    rg: Optional[str] = None
    estado_civil: Optional[str] = None
    profissao: Optional[str] = None
    experiencia_umbanda: Optional[str] = None
    contato_contexto_espiritual: Optional[str] = None
    motivo_busca_desenvolvimento: Optional[str] = None
    interesse_aprendizado: Optional[str] = None
    ja_conhece_terreiro: Optional[bool] = None
    como_conheceu_terreiro: Optional[str] = None
    tratamento_psiquiatrico: Optional[bool] = None
    tratamento_psiquiatrico_detalhes: Optional[str] = None
    restricoes_saude: Optional[str] = None
    aceita_uso_dados: bool = False
    aceita_uso_imagem: bool = False

class ParticipanteUpdate(BaseModel):
    """Payload para atualizar informações de um participante."""
    nome: Optional[str] = None
    data_nascimento: Optional[date] = None
    celular: Optional[str] = None
    email: Optional[str] = None
    valor_mensalidade: Optional[Decimal] = None
    pago: Optional[bool] = None
    valor_pago: Optional[Decimal] = None
    data_pagamento: Optional[datetime] = None
    observacoes: Optional[str] = None
    genero: Optional[str] = None
    emergencia_contato: Optional[str] = None
    emergencia_fone: Optional[str] = None
    cep: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    estado: Optional[str] = None
    tem_plano_saude: Optional[bool] = None
    plano_saude_nome: Optional[str] = None
    toma_medicamento: Optional[bool] = None
    medicamentos_nome: Optional[str] = None
    tem_doenca_tratamento: Optional[bool] = None
    doenca_tratamento_nome: Optional[str] = None
    tem_diabetes: Optional[bool] = None
    outras_doencas: Optional[str] = None
    cpf: Optional[str] = None
    rg: Optional[str] = None
    estado_civil: Optional[str] = None
    profissao: Optional[str] = None
    experiencia_umbanda: Optional[str] = None
    contato_contexto_espiritual: Optional[str] = None
    motivo_busca_desenvolvimento: Optional[str] = None
    interesse_aprendizado: Optional[str] = None
    ja_conhece_terreiro: Optional[bool] = None
    como_conheceu_terreiro: Optional[str] = None
    tratamento_psiquiatrico: Optional[bool] = None
    tratamento_psiquiatrico_detalhes: Optional[str] = None
    restricoes_saude: Optional[str] = None
    aceita_uso_dados: Optional[bool] = None
    aceita_uso_imagem: Optional[bool] = None

class ParticipanteResponse(BaseModel):
    """Resposta retornada ao consultar/editar um participante."""
    id: UUID
    curso_id: UUID
    tenant_id: UUID
    nome: str
    data_nascimento: Optional[date] = None
    celular: Optional[str] = None
    email: Optional[str] = None
    valor_mensalidade: Optional[Decimal] = None
    pago: bool
    valor_pago: Optional[Decimal] = None
    data_pagamento: Optional[datetime] = None
    observacoes: Optional[str] = None
    genero: Optional[str] = None
    emergencia_contato: Optional[str] = None
    emergencia_fone: Optional[str] = None
    cep: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cidade: Optional[str] = None
    estado: Optional[str] = None
    tem_plano_saude: Optional[bool] = None
    plano_saude_nome: Optional[str] = None
    toma_medicamento: Optional[bool] = None
    medicamentos_nome: Optional[str] = None
    tem_doenca_tratamento: Optional[bool] = None
    doenca_tratamento_nome: Optional[str] = None
    tem_diabetes: Optional[bool] = None
    outras_doencas: Optional[str] = None
    aceita_uso_dados_saude: bool = False
    cpf: Optional[str] = None
    rg: Optional[str] = None
    estado_civil: Optional[str] = None
    profissao: Optional[str] = None
    experiencia_umbanda: Optional[str] = None
    contato_contexto_espiritual: Optional[str] = None
    motivo_busca_desenvolvimento: Optional[str] = None
    interesse_aprendizado: Optional[str] = None
    ja_conhece_terreiro: Optional[bool] = None
    como_conheceu_terreiro: Optional[str] = None
    tratamento_psiquiatrico: Optional[bool] = None
    tratamento_psiquiatrico_detalhes: Optional[str] = None
    restricoes_saude: Optional[str] = None
    aceita_uso_dados: bool = False
    aceita_uso_imagem: bool = False
    comprovante_inscricao_filename: Optional[str] = None
    comprovante_inscricao_mime: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @field_validator("aceita_uso_dados_saude", mode="before")
    @classmethod
    def validate_aceita_uso_dados_saude(cls, v):
        return v if v is not None else False

    @field_validator("aceita_uso_dados", mode="before")
    @classmethod
    def validate_aceita_uso_dados(cls, v):
        return v if v is not None else False

    @field_validator("aceita_uso_imagem", mode="before")
    @classmethod
    def validate_aceita_uso_imagem(cls, v):
        return v if v is not None else False

    class Config:
        from_attributes = True

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _require_active_pro_or_premium_subscription(
    user: User, db: AsyncSession
) -> None:
    """Garante que o tenant do usuário tem assinatura ativa PRO ou PREMIUM."""
    sub_repo = SubscriptionRepository(db)
    sub = await sub_repo.get_by_tenant(user.tenant_id)
    if sub is None or sub.status != SubscriptionStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Assinatura suspensa ou inexistente.",
        )
    if sub.plan not in (PlanType.PRO, PlanType.PREMIUM):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Plano atual não permite cursos presenciais.",
        )

# ---------------------------------------------------------------------------
# Endpoint definitions
# ---------------------------------------------------------------------------

@router.post("", response_model=CursoPresencialResponse, status_code=status.HTTP_201_CREATED)
async def create_curso_presencial(
    curso_in: CursoPresencialCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CursoPresencialResponse:
    """Cria um novo curso presencial. Apenas administradores do tenant podem criar."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Requer cargo de administrador.")
    await _require_active_pro_or_premium_subscription(current_user, db)

    repo = CursoPresencialRepository(db)
    curso = await repo.create(
        tenant_id=current_user.tenant_id,
        **curso_in.model_dump(),
    )

    # Audit log
    audit = AuditService(db)
    await audit.log_create(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="CursoPresencial",
        resource_id=curso.id,
        details={"titulo": curso_in.titulo},
    )

    await db.commit()
    return CursoPresencialResponse.from_orm(curso)

@router.get("", response_model=List[CursoPresencialResponse])
async def list_cursos_presenciais(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    is_active: Optional[bool] = Query(None, description="Filtrar por status ativo"),
    date_from: Optional[str] = Query(None, description="Filtrar cursos a partir desta data (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Filtrar cursos até esta data (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[CursoPresencialResponse]:
    """Lista cursos presenciais do tenant com filtros opcionais. Disponível para operadores e administradores."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Requer cargo de operador ou administrador.")
    await _require_active_pro_or_premium_subscription(current_user, db)

    stmt = (
        select(CursoPresencial)
        .where(
            (CursoPresencial.tenant_id == current_user.tenant_id)
            & (CursoPresencial.deleted_at.is_(None))
        )
    )
    if is_active is not None:
        stmt = stmt.where(CursoPresencial.is_active == is_active)
    if date_from:
        stmt = stmt.where(CursoPresencial.data_inicio >= datetime.fromisoformat(date_from))
    if date_to:
        dt_end = datetime.fromisoformat(date_to) + timedelta(days=1)
        stmt = stmt.where(CursoPresencial.data_inicio < dt_end)

    stmt = stmt.order_by(CursoPresencial.data_inicio.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    cursos = result.scalars().all()

    return [CursoPresencialResponse.from_orm(c) for c in cursos]

@router.get("/{curso_id}", response_model=CursoPresencialResponse)
async def get_curso_presencial(
    curso_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CursoPresencialResponse:
    """Obtém um curso presencial específico. Disponível para operadores e administradores."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Requer cargo de operador ou administrador.")
    await _require_active_pro_or_premium_subscription(current_user, db)

    repo = CursoPresencialRepository(db)
    curso = await repo.get_by_id(curso_id, current_user.tenant_id)
    if not curso:
        raise NotFoundError("CursoPresencial")
    return CursoPresencialResponse.from_orm(curso)

@router.put("/{curso_id}", response_model=CursoPresencialResponse)
async def update_curso_presencial(
    curso_id: UUID = Path(...),
    curso_update: CursoPresencialUpdate = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CursoPresencialResponse:
    """Atualiza parcialmente um curso presencial. Apenas administradores do tenant podem atualizar."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Requer cargo de administrador.")
    await _require_active_pro_or_premium_subscription(current_user, db)

    repo = CursoPresencialRepository(db)
    existing_curso = await repo.get_by_id(curso_id, current_user.tenant_id)
    if not existing_curso:
        raise NotFoundError("CursoPresencial")

    previous_state = CursoPresencialResponse.from_orm(existing_curso).model_dump(mode="json")
    updated_curso = await repo.update(
        curso_id,
        current_user.tenant_id,
        **curso_update.model_dump(exclude_unset=True),
    )

    audit = AuditService(db)
    await audit.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="CursoPresencial",
        resource_id=curso_id,
        previous_state=previous_state,
        new_state=CursoPresencialResponse.from_orm(updated_curso).model_dump(mode="json"),
    )

    await db.commit()
    return CursoPresencialResponse.from_orm(updated_curso)

@router.delete("/{curso_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_curso_presencial(
    curso_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Exclui (soft delete) um curso presencial. Apenas administradores do tenant podem excluir."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Requer cargo de administrador.")
    await _require_active_pro_or_premium_subscription(current_user, db)

    repo = CursoPresencialRepository(db)
    existing_curso = await repo.get_by_id(curso_id, current_user.tenant_id)
    if not existing_curso:
        raise NotFoundError("CursoPresencial")

    previous_state = CursoPresencialResponse.from_orm(existing_curso).model_dump(mode="json")
    deleted = await repo.delete(curso_id, current_user.tenant_id, soft=True)
    if not deleted:
        raise NotFoundError("CursoPresencial")

    audit = AuditService(db)
    await audit.log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="CursoPresencial",
        resource_id=curso_id,
        previous_state=previous_state,
    )

    await db.commit()
    return None

# ---------------------------------------------------------------------------
# Participant endpoints
# ---------------------------------------------------------------------------

@router.post("/{curso_id}/participantes", response_model=ParticipanteResponse, status_code=status.HTTP_201_CREATED)
async def create_participante(
    participante_in: ParticipanteCreate,
    curso_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ParticipanteResponse:
    """Adiciona um participante a um curso presencial. Apenas administradores do tenant podem adicionar."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Requer cargo de administrador.")
    await _require_active_pro_or_premium_subscription(current_user, db)

    curso_repo = CursoPresencialRepository(db)
    curso = await curso_repo.get_by_id(curso_id, current_user.tenant_id)
    if not curso:
        raise NotFoundError("CursoPresencial")

    # Verifica limite de participantes
    total_participantes = await curso_repo.get_participant_count(curso_id, current_user.tenant_id)
    if curso.max_participantes is not None and total_participantes >= curso.max_participantes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Limite de participantes atingido para este curso.",
        )

    # Define valor da mensalidade (padrão do curso se não especificado)
    valor_mensalidade = participante_in.valor_mensalidade
    if valor_mensalidade is None:
        valor_mensalidade = curso.valor_mensalidade_padrao

    data = participante_in.model_dump()
    if data.get("valor_mensalidade") is None:
        data["valor_mensalidade"] = curso.valor_mensalidade_padrao
    data["pago"] = False
    data["valor_pago"] = None
    data["data_pagamento"] = None
    data["aceita_uso_dados_saude"] = True if (
        participante_in.tem_plano_saude or 
        participante_in.toma_medicamento or 
        participante_in.tem_doenca_tratamento or 
        participante_in.tem_diabetes
    ) else False

    participante_repo = CursoParticipanteRepository(db)
    participante = await participante_repo.create(
        tenant_id=current_user.tenant_id,
        curso_id=curso_id,
        **data,
    )

    audit = AuditService(db)
    await audit.log_create(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="CursoParticipante",
        resource_id=participante.id,
        details={"nome": participante_in.nome, "curso_id": str(curso_id)},
    )

    await db.commit()
    return ParticipanteResponse.from_orm(participante)

@router.get("/{curso_id}/participantes", response_model=List[ParticipanteResponse])
async def list_participantes(
    curso_id: UUID = Path(...),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[ParticipanteResponse]:
    """Lista participantes de um curso presencial. Disponível para operadores e administradores."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Requer cargo de operador ou administrador.")
    await _require_active_pro_or_premium_subscription(current_user, db)

    # Garante que o curso existe e pertence ao tenant
    curso_repo = CursoPresencialRepository(db)
    curso = await curso_repo.get_by_id(curso_id, current_user.tenant_id)
    if not curso:
        raise NotFoundError("CursoPresencial")

    participante_repo = CursoParticipanteRepository(db)
    participantes = await participante_repo.list_by_curso(
        curso_id=curso_id,
        tenant_id=current_user.tenant_id,
        skip=skip,
        limit=limit,
    )
    return [ParticipanteResponse.from_orm(p) for p in participantes]

@router.put("/{curso_id}/participantes/{participante_id}", response_model=ParticipanteResponse)
async def update_participante(
    participante_id: UUID = Path(...),
    curso_id: UUID = Path(...),
    participante_update: ParticipanteUpdate = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ParticipanteResponse:
    """Atualiza informações de um participante. Apenas administradores do tenant podem atualizar."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Requer cargo de administrador.")
    await _require_active_pro_or_premium_subscription(current_user, db)

    curso_repo = CursoPresencialRepository(db)
    curso = await curso_repo.get_by_id(curso_id, current_user.tenant_id)
    if not curso:
        raise NotFoundError("CursoPresencial")

    participante_repo = CursoParticipanteRepository(db)
    participante = await participante_repo.get_by_id(participante_id, current_user.tenant_id)
    if not participante or participante.curso_id != curso_id:
        raise NotFoundError("CursoParticipante")

    prev_state = ParticipanteResponse.from_orm(participante).model_dump(mode="json")

    data = participante_update.model_dump(exclude_unset=True)
    # Se o pago foi alterado para True ou o valor_pago foi informado, marca como pago e registra data_pagamento
    if data.get("pago") is True:
        if "data_pagamento" not in data and not participante.data_pagamento:
            data["data_pagamento"] = datetime.utcnow()
        if data.get("valor_pago") is None and participante.valor_pago is None:
            data["valor_pago"] = data.get("valor_mensalidade", participante.valor_mensalidade)
    elif data.get("pago") is False:
        data["data_pagamento"] = None
        data["valor_pago"] = None

    updated = await participante_repo.update(
        participante_id, current_user.tenant_id, **data
    )

    audit = AuditService(db)
    await audit.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="CursoParticipante",
        resource_id=participante_id,
        previous_state=prev_state,
        new_state=ParticipanteResponse.from_orm(updated).model_dump(mode="json"),
    )

    await db.commit()
    return ParticipanteResponse.from_orm(updated)

@router.delete("/{curso_id}/participantes/{participante_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_participante(
    curso_id: UUID = Path(...),
    participante_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Exclui (soft delete) um participante de um curso presencial. Apenas administradores do tenant podem excluir."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Requer cargo de administrador.")
    await _require_active_pro_or_premium_subscription(current_user, db)

    # Garante que o curso existe e pertence ao tenant
    curso_repo = CursoPresencialRepository(db)
    curso = await curso_repo.get_by_id(curso_id, current_user.tenant_id)
    if not curso:
        raise NotFoundError("CursoPresencial")

    participante_repo = CursoParticipanteRepository(db)
    participante = await participante_repo.get_by_id(participante_id, current_user.tenant_id)
    if not participante or participante.curso_id != curso_id:
        raise NotFoundError("CursoParticipante")

    previous_state = {
        "nome": participante.nome,
        "curso_id": str(participante.curso_id),
    }

    deleted = await participante_repo.delete(participante_id, current_user.tenant_id, soft=True)
    if not deleted:
        raise NotFoundError("CursoParticipante")

    audit = AuditService(db)
    await audit.log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="CursoParticipante",
        resource_id=participante_id,
        previous_state=previous_state,
    )

    await db.commit()
    return None


# ---------------------------------------------------------------------------
# Cursos Presenciais Monthly Billing endpoints
# ---------------------------------------------------------------------------

MAX_COMPROVANTE_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_COMPROVANTE_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}


def _parse_mes(mes: str) -> date:
    """Parse YYYY-MM string to first-day-of-month date. Raises 422 on bad format."""
    try:
        parts = mes.split("-")
        if len(parts) != 2:
            raise ValueError
        return date(int(parts[0]), int(parts[1]), 1)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Formato de mês inválido '{mes}'. Use YYYY-MM.",
        )


class CursoMensalidadeItemResponse(BaseModel):
    participante_id: UUID
    participante_nome: str
    email: Optional[str] = None
    celular: Optional[str] = None
    data_nascimento: Optional[date] = None
    valor_mensalidade: Optional[Decimal] = None
    pagamento_id: Optional[UUID] = None
    status: Optional[str] = None
    data_pagamento: Optional[datetime] = None
    valor_vigente: Optional[Decimal] = None
    valor_pago: Optional[Decimal] = None
    comprovante_filename: Optional[str] = None
    observacao: Optional[str] = None


class CursoResumoResponse(BaseModel):
    historico: List[dict]
    projecao: List[dict]
    config: dict


@router.get("/{curso_id}/financeiro/mensalidades", response_model=List[CursoMensalidadeItemResponse])
async def list_curso_mensalidades(
    curso_id: UUID = Path(...),
    mes: str = Query(..., description="Mês no formato YYYY-MM"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista todos os participantes ativos com seus status de pagamento para o mês."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Requer cargo de operador ou administrador.")
    await _require_active_pro_or_premium_subscription(current_user, db)

    # Verifica se o curso existe e pertence ao tenant
    curso_repo = CursoPresencialRepository(db)
    curso = await curso_repo.get_by_id(curso_id, current_user.tenant_id)
    if not curso:
        raise NotFoundError("CursoPresencial")

    if not curso.gerar_mensalidade:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este curso não está configurado para gerar mensalidades.",
        )

    mes_date = _parse_mes(mes)
    repo = CursoParticipantePagamentoRepository(db)
    rows = await repo.list_mes(current_user.tenant_id, curso_id, mes_date)

    result = []
    for r in rows:
        raw_status = r.get("status")
        effective_status: str
        if raw_status is not None:
            effective_status = raw_status if isinstance(raw_status, str) else raw_status.value
        else:
            effective_status = MensalidadeStatus.PENDENTE.value

        result.append(
            CursoMensalidadeItemResponse(
                participante_id=r["participante_id"],
                participante_nome=r["participante_nome"],
                email=r.get("email"),
                celular=r.get("celular"),
                data_nascimento=r.get("data_nascimento"),
                valor_mensalidade=r.get("valor_mensalidade"),
                pagamento_id=r.get("pagamento_id"),
                status=effective_status,
                data_pagamento=r.get("data_pagamento"),
                valor_vigente=r.get("valor_vigente"),
                valor_pago=r.get("valor_pago"),
                comprovante_filename=r.get("comprovante_filename"),
                observacao=r.get("observacao"),
            )
        )
    return result


@router.post("/{curso_id}/financeiro/mensalidades/{participante_id}/{mes}")
async def registrar_curso_pagamento(
    curso_id: UUID = Path(...),
    participante_id: UUID = Path(...),
    mes: str = Path(...),
    pagamento_status: str = Form(..., alias="status"),
    valor_pago: Optional[Decimal] = Form(None),
    data_pagamento: Optional[str] = Form(None),
    observacao: Optional[str] = Form(None),
    comprovante: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Registra ou atualiza o pagamento de mensalidade de um participante (ADMIN only)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Requer cargo de administrador.")
    await _require_active_pro_or_premium_subscription(current_user, db)

    # Verifica curso
    curso_repo = CursoPresencialRepository(db)
    curso = await curso_repo.get_by_id(curso_id, current_user.tenant_id)
    if not curso:
        raise NotFoundError("CursoPresencial")

    if not curso.gerar_mensalidade:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este curso não está configurado para gerar mensalidades.",
        )

    # Verifica participante
    part_repo = CursoParticipanteRepository(db)
    part = await part_repo.get_by_id(participante_id, current_user.tenant_id)
    if not part or part.curso_id != curso_id:
        raise NotFoundError("CursoParticipante")

    mes_date = _parse_mes(mes)

    try:
        parsed_status = MensalidadeStatus(pagamento_status.upper())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Status inválido: '{pagamento_status}'. Use PAGO, PENDENTE ou ISENTO.",
        )

    parsed_data_pag: Optional[datetime] = None
    if data_pagamento:
        try:
            parsed_data_pag = datetime.fromisoformat(data_pagamento)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Formato de data_pagamento inválido. Use ISO 8601.",
            )

    # Determina valor_vigente a partir da mensalidade do participante
    valor_vigente = part.valor_mensalidade

    # Processa upload de comprovante
    comp_data: Optional[bytes] = None
    comp_filename: Optional[str] = None
    comp_mime: Optional[str] = None
    if comprovante and comprovante.filename:
        content_type = comprovante.content_type or ""
        if content_type not in ALLOWED_COMPROVANTE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Tipo de arquivo não permitido: {content_type}. Use JPEG, PNG, WebP ou PDF.",
            )
        comp_data = await comprovante.read()
        if len(comp_data) > MAX_COMPROVANTE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Comprovante muito grande (máx. {MAX_COMPROVANTE_BYTES // (1024*1024)}MB).",
            )
        comp_filename = comprovante.filename
        comp_mime = content_type

    repo = CursoParticipantePagamentoRepository(db)
    pag = await repo.registrar_pagamento(
        tenant_id=current_user.tenant_id,
        participante_id=participante_id,
        mes_referencia=mes_date,
        status=parsed_status,
        registrado_por=current_user.id,
        valor_vigente=valor_vigente,
        valor_pago=valor_pago,
        data_pagamento=parsed_data_pag,
        observacao=observacao,
        comprovante_data=comp_data,
        comprovante_filename=comp_filename,
        comprovante_mime=comp_mime,
    )

    audit = AuditService(db)
    await audit.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="CursoParticipantePagamento",
        resource_id=pag.id,
        new_state={"participante_id": str(participante_id), "mes": mes, "status": parsed_status.value},
    )
    await db.commit()
    return {"id": str(pag.id), "status": pag.status.value}


@router.get("/{curso_id}/financeiro/mensalidades/{participante_id}/{mes}/comprovante")
async def download_curso_comprovante(
    curso_id: UUID = Path(...),
    participante_id: UUID = Path(...),
    mes: str = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download do comprovante binário para o pagamento de um mês específico."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Requer cargo de operador ou administrador.")
    await _require_active_pro_or_premium_subscription(current_user, db)

    # Verifica curso
    curso_repo = CursoPresencialRepository(db)
    curso = await curso_repo.get_by_id(curso_id, current_user.tenant_id)
    if not curso or not curso.gerar_mensalidade:
        raise NotFoundError("CursoPresencial")

    mes_date = _parse_mes(mes)
    repo = CursoParticipantePagamentoRepository(db)
    pag = await repo.get_pagamento(current_user.tenant_id, participante_id, mes_date)
    if not pag or not pag.comprovante_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comprovante não encontrado.")

    return Response(
        content=pag.comprovante_data,
        media_type=pag.comprovante_mime or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{pag.comprovante_filename or "comprovante"}"'
        },
    )


@router.delete("/{curso_id}/financeiro/mensalidades/{pagamento_id}/comprovante", status_code=status.HTTP_204_NO_CONTENT)
async def delete_curso_comprovante(
    curso_id: UUID = Path(...),
    pagamento_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove o comprovante do pagamento preservando o histórico de pagamento (ADMIN only)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Requer cargo de administrador.")
    await _require_active_pro_or_premium_subscription(current_user, db)

    # Verifica curso
    curso_repo = CursoPresencialRepository(db)
    curso = await curso_repo.get_by_id(curso_id, current_user.tenant_id)
    if not curso or not curso.gerar_mensalidade:
        raise NotFoundError("CursoPresencial")

    repo = CursoParticipantePagamentoRepository(db)
    pag = await repo.delete_comprovante(current_user.tenant_id, pagamento_id)
    if not pag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pagamento não encontrado.")

    audit = AuditService(db)
    await audit.log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="CursoParticipantePagamentoComprovante",
        resource_id=pagamento_id,
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{curso_id}/financeiro/resumo", response_model=CursoResumoResponse)
async def get_curso_resumo(
    curso_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retorna dados do gráfico (histórico + projeção) do curso específico."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Requer cargo de operador ou administrador.")
    await _require_active_pro_or_premium_subscription(current_user, db)

    # Verifica curso
    curso_repo = CursoPresencialRepository(db)
    curso = await curso_repo.get_by_id(curso_id, current_user.tenant_id)
    if not curso or not curso.gerar_mensalidade:
        raise NotFoundError("CursoPresencial")

    repo = CursoParticipantePagamentoRepository(db)
    resumo = await repo.get_resumo(current_user.tenant_id, curso_id)
    return CursoResumoResponse(**resumo)


@router.get("/{curso_id}/participantes/{participante_id}/comprovante")
async def download_inscricao_comprovante(
    curso_id: UUID = Path(...),
    participante_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download do comprovante binário para a inscrição (matrícula) do participante."""
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Requer cargo de operador ou administrador.")
    await _require_active_pro_or_premium_subscription(current_user, db)

    # Verifica curso
    curso_repo = CursoPresencialRepository(db)
    curso = await curso_repo.get_by_id(curso_id, current_user.tenant_id)
    if not curso:
        raise NotFoundError("CursoPresencial")

    repo = CursoParticipanteRepository(db)
    part = await repo.get_comprovante_inscricao(current_user.tenant_id, participante_id)
    if not part or not part.comprovante_inscricao_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comprovante de inscrição não encontrado.")

    return Response(
        content=part.comprovante_inscricao_data,
        media_type=part.comprovante_inscricao_mime or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{part.comprovante_inscricao_filename or "comprovante"}"'
        },
    )


@router.delete("/{curso_id}/participantes/{participante_id}/comprovante", status_code=status.HTTP_204_NO_CONTENT)
async def delete_inscricao_comprovante(
    curso_id: UUID = Path(...),
    participante_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove o comprovante da matrícula do participante (ADMIN only)."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Requer cargo de administrador.")
    await _require_active_pro_or_premium_subscription(current_user, db)

    # Verifica curso
    curso_repo = CursoPresencialRepository(db)
    curso = await curso_repo.get_by_id(curso_id, current_user.tenant_id)
    if not curso:
        raise NotFoundError("CursoPresencial")

    repo = CursoParticipanteRepository(db)
    part = await repo.delete_comprovante_inscricao(current_user.tenant_id, participante_id)
    if not part:
         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participante não encontrado.")

    audit = AuditService(db)
    await audit.log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="CursoParticipanteInscricaoComprovante",
        resource_id=participante_id,
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{curso_id}/participantes/{participante_id}/comprovante")
async def upload_inscricao_comprovante(
    curso_id: UUID = Path(...),
    participante_id: UUID = Path(...),
    comprovante: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Registra ou atualiza o comprovante de inscrição do participante."""
    if not current_user.is_admin:
        raise InsufficientPermissionsError("Requer cargo de administrador.")
    await _require_active_pro_or_premium_subscription(current_user, db)

    curso_repo = CursoPresencialRepository(db)
    curso = await curso_repo.get_by_id(curso_id, current_user.tenant_id)
    if not curso:
        raise NotFoundError("CursoPresencial")

    repo = CursoParticipanteRepository(db)
    part = await repo.get_by_id(participante_id, current_user.tenant_id)
    if not part or part.curso_id != curso_id:
        raise NotFoundError("CursoParticipante")

    content_type = comprovante.content_type or ""
    if content_type not in ALLOWED_COMPROVANTE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Tipo de arquivo não permitido: {content_type}. Use JPEG, PNG, WebP ou PDF.",
        )
    comp_data = await comprovante.read()
    if len(comp_data) > MAX_COMPROVANTE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Comprovante muito grande (máx. {MAX_COMPROVANTE_BYTES // (1024*1024)}MB).",
        )

    part.comprovante_inscricao_data = comp_data
    part.comprovante_inscricao_filename = comprovante.filename
    part.comprovante_inscricao_mime = content_type

    audit = AuditService(db)
    await audit.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="CursoParticipanteInscricaoComprovante",
        resource_id=participante_id,
        new_state={"filename": comprovante.filename},
    )
    await db.commit()
    return {"message": "Comprovante de inscrição salvo com sucesso."}
