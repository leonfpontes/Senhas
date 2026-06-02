"""Platform API – Gerenciamento de cursos presenciais e participantes.

Este módulo expõe endpoints para criação, listagem, consulta, atualização e
exclusão de cursos presenciais, além de rotas para gerenciar os participantes
de cada curso. O acesso é restrito a usuários com assinatura nos planos PRO ou
PREMIUM e a assinatura deve estar ativa.
"""

from fastapi import APIRouter, HTTPException, Depends, status, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from datetime import datetime, date, timedelta
from decimal import Decimal

from src.core.database import get_db
from src.api.dependencies import get_current_user
from src.models import User
from src.models.subscriptions import PlanType, SubscriptionStatus
from src.repositories.curso_presencial_repo import (
    CursoPresencialRepository,
    CursoParticipanteRepository,
)
from src.repositories.subscription_repo import SubscriptionRepository
from src.services.audit_service import AuditService
from src.core.errors import NotFoundError

router = APIRouter(
    prefix="/api/v1/platform/cursos-presenciais",
    tags=["platform-cursos-presenciais"],
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
    created_at: datetime
    updated_at: datetime

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

class ParticipanteUpdate(BaseModel):
    """Payload para atualizar informações de um participante."""
    nome: Optional[str] = None
    data_nascimento: Optional[date] = None
    celular: Optional[str] = None
    email: Optional[str] = None
    valor_mensalidade: Optional[Decimal] = None
    pago: Optional[bool] = None
    valor_pago: Optional[Decimal] = None
    observacoes: Optional[str] = None

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
    created_at: datetime
    updated_at: datetime

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
    """Cria um novo curso presencial. Apenas PRO/PREMIUM ativos podem criar."""
    await _require_active_pro_or_premium_subscription(current_user, db)

    repo = CursoPresencialRepository(db)
    curso = await repo.create(
        tenant_id=current_user.tenant_id,
        **curso_in.dict(),
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
    """Lista cursos presenciais do tenant com filtros opcionais."""
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
    """Obtém um curso presencial específico."""
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
    """Atualiza parcialmente um curso presencial."""
    await _require_active_pro_or_premium_subscription(current_user, db)

    repo = CursoPresencialRepository(db)
    existing_curso = await repo.get_by_id(curso_id, current_user.tenant_id)
    if not existing_curso:
        raise NotFoundError("CursoPresencial")

    previous_state = CursoPresencialResponse.from_orm(existing_curso).model_dump(mode="json")
    updated_curso = await repo.update(
        curso_id,
        current_user.tenant_id,
        **curso_update.dict(exclude_unset=True),
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
    """Exclui (soft delete) um curso presencial."""
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
    """Adiciona um participante a um curso presencial."""
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
    valor_mensalidade = participante_in.valor_mensalidade or curso.valor_mensalidade_padrao

    participante_repo = CursoParticipanteRepository(db)
    participante = await participante_repo.create(
        tenant_id=current_user.tenant_id,
        curso_id=curso_id,
        nome=participante_in.nome,
        data_nascimento=participante_in.data_nascimento,
        celular=participante_in.celular,
        email=participante_in.email,
        valor_mensalidade=valor_mensalidade,
        observacoes=participante_in.observacoes,
        pago=False,
        valor_pago=None,
        data_pagamento=None,
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
    """Lista participantes de um curso presencial."""
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
    """Atualiza informações de um participante (inclui marcação de pagamento)."""
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

    data = participante_update.dict(exclude_unset=True)
    # Se o valor_pago foi informado, marca como pago e registra data_pagamento
    if "valor_pago" in data and data["valor_pago"] is not None:
        data["pago"] = True
        data["data_pagamento"] = datetime.utcnow()

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