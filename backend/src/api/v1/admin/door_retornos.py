"""Beta "Retorno do consulente na porta" — marcar um retorno como resolvido (e desfazer).

    PATCH  /api/v1/admin/door/retornos/{retorno_id}/resolver   — PORTA:edit
    DELETE /api/v1/admin/door/retornos/{retorno_id}/resolver   — PORTA:edit (desfazer)

O retorno é anotado no "Chamar"/"Editar atendimento" (`door_control.AttendRequest.retorno`) e
aparece na fila das giras seguintes (`QueueItemResponse.retornos`). Resolver tira o ícone da senha;
nada é apagado, e o "Desfazer" do toast volta o retorno a aparecer. Só vale com a beta ligada
(senão 403). Cada mudança vai para a auditoria.
"""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user, require_group_permission
from src.core.database import get_db
from src.core.errors import NotFoundError
from src.core.tz import utc_now
from src.models import Gira, PermissionFeature, User
from src.models.consulente_retornos import ConsulenteRetorno
from src.services.audit_service import AuditService
from src.services.laboratorio import beta_ligada
from src.services.retornos_consulente import CHAVE_BETA

router = APIRouter(prefix="/api/v1/admin", tags=["door-retornos"])


class ResolverIn(BaseModel):
    # A gira em que a porta resolveu (a que está na tela). Opcional.
    gira_id: Optional[UUID] = None


class RetornoEstadoOut(BaseModel):
    id: UUID
    resolvido: bool


async def _retorno(db: AsyncSession, retorno_id: UUID, user: User) -> ConsulenteRetorno:
    if not await beta_ligada(db, user.tenant_id, CHAVE_BETA):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="O retorno do consulente não está ligado nesta casa.")
    retorno = await db.scalar(
        select(ConsulenteRetorno).where(
            ConsulenteRetorno.id == retorno_id,
            ConsulenteRetorno.tenant_id == user.tenant_id,
        )
    )
    if retorno is None:
        raise NotFoundError("Retorno não encontrado")
    return retorno


async def _log(db: AsyncSession, user: User, retorno: ConsulenteRetorno, antes: bool) -> None:
    await AuditService(db).log_config_change(
        tenant_id=user.tenant_id, user_id=user.id, config_type="retorno_consulente",
        previous_values={"retorno_id": str(retorno.id), "resolvido": antes},
        new_values={"retorno_id": str(retorno.id), "resolvido": retorno.resolvido_em is not None},
    )


@router.patch(
    "/door/retornos/{retorno_id}/resolver",
    response_model=RetornoEstadoOut,
    dependencies=[Depends(require_group_permission(PermissionFeature.PORTA, "edit"))],
)
async def resolver_retorno(
    body: Optional[ResolverIn] = None,
    retorno_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RetornoEstadoOut:
    retorno = await _retorno(db, retorno_id, current_user)
    if retorno.resolvido_em is None:
        gira_id = body.gira_id if body else None
        if gira_id is not None:
            gira_ok = await db.scalar(select(Gira.id).where(Gira.id == gira_id, Gira.tenant_id == current_user.tenant_id))
            gira_id = gira_ok
        retorno.resolvido_em = utc_now()
        retorno.resolvido_por_id = current_user.id
        retorno.resolvido_na_gira_id = gira_id
        await _log(db, current_user, retorno, antes=False)
        await db.commit()
    return RetornoEstadoOut(id=retorno.id, resolvido=True)


@router.delete(
    "/door/retornos/{retorno_id}/resolver",
    response_model=RetornoEstadoOut,
    dependencies=[Depends(require_group_permission(PermissionFeature.PORTA, "edit"))],
)
async def reabrir_retorno(
    retorno_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RetornoEstadoOut:
    retorno = await _retorno(db, retorno_id, current_user)
    if retorno.resolvido_em is not None:
        retorno.resolvido_em = None
        retorno.resolvido_por_id = None
        retorno.resolvido_na_gira_id = None
        await _log(db, current_user, retorno, antes=True)
        await db.commit()
    return RetornoEstadoOut(id=retorno.id, resolvido=False)
