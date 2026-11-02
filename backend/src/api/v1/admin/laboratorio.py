"""Laboratório das betas (jornadas v2).

    GET /api/v1/admin/config/laboratorio   — CONFIGURACOES:view
    PUT /api/v1/admin/config/laboratorio   — CONFIGURACOES:edit

Só existe para terreiro marcado como beta tester pela plataforma (`tenants.beta_tester`); sem isso,
403 ("O laboratório não está liberado para esta casa"). A casa liga ou desliga cada beta do
catálogo (`services/laboratorio.CATALOGO`); a escolha fica em `feature_flags`. Desligar não apaga o
que foi registrado com a beta. Cada mudança vai para a auditoria (config_type = "laboratorio").
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user, require_group_permission
from src.core.database import get_db
from src.models import PermissionFeature, User
from src.repositories.feature_flags_repo import FeatureFlagsRepository
from src.services.audit_service import AuditService
from src.services.laboratorio import CATALOGO, CHAVES, betas_ligadas, eh_beta_tester

router = APIRouter(prefix="/api/v1/admin", tags=["admin-laboratorio"])


class BetaOut(BaseModel):
    chave: str
    nome: str
    descricao: str
    grupo: str
    nota: str
    ligada: bool


class LaboratorioOut(BaseModel):
    beta_tester: bool
    betas: list[BetaOut]


class LaboratorioIn(BaseModel):
    chave: str
    ligada: bool


async def _exigir_beta_tester(db: AsyncSession, user: User) -> None:
    if not await eh_beta_tester(db, user.tenant_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="O laboratório não está liberado para esta casa.")


async def _resposta(db: AsyncSession, user: User) -> LaboratorioOut:
    ligadas = await betas_ligadas(db, user.tenant_id)
    return LaboratorioOut(
        beta_tester=True,
        betas=[BetaOut(chave=b.chave, nome=b.nome, descricao=b.descricao, grupo=b.grupo, nota=b.nota, ligada=b.chave in ligadas)
               for b in CATALOGO],
    )


@router.get(
    "/config/laboratorio",
    response_model=LaboratorioOut,
    dependencies=[Depends(require_group_permission(PermissionFeature.CONFIGURACOES, "view"))],
)
async def get_laboratorio(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> LaboratorioOut:
    await _exigir_beta_tester(db, current_user)
    return await _resposta(db, current_user)


@router.put(
    "/config/laboratorio",
    response_model=LaboratorioOut,
    dependencies=[Depends(require_group_permission(PermissionFeature.CONFIGURACOES, "edit"))],
)
async def set_beta(body: LaboratorioIn, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> LaboratorioOut:
    await _exigir_beta_tester(db, current_user)
    if body.chave not in CHAVES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Beta desconhecida.")
    antes = body.chave in await betas_ligadas(db, current_user.tenant_id)
    await FeatureFlagsRepository(db).create_or_update(tenant_id=current_user.tenant_id, feature=body.chave, enabled=body.ligada)
    await AuditService(db).log_config_change(
        tenant_id=current_user.tenant_id, user_id=current_user.id, config_type="laboratorio",
        previous_values={body.chave: antes}, new_values={body.chave: body.ligada},
    )
    await db.commit()
    return await _resposta(db, current_user)
