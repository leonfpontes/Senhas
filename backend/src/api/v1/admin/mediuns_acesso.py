"""Acesso do médium à Área do Médium — convite e revogação (AM-03).

Rotas (todas com MEDIUNS:edit + plano/chave `area_medium`, §6.7 do plano):
- ``POST /api/v1/admin/mediuns/{id}/convite``: convida (ou reenvia, revogando o anterior).
  Exige e-mail válido no cadastro; devolve o link, o texto pronto para o WhatsApp e o
  ``wa.me`` com o telefone do médium, e enfileira o e-mail discreto.
- ``POST /api/v1/admin/mediuns/convite/lote``: convida todos os médiuns ativos com e-mail,
  sem acesso e sem convite em aberto (só por e-mail).
- ``DELETE /api/v1/admin/mediuns/{id}/acesso``: cancela o convite em aberto ou tira o acesso
  (desfaz o vínculo; conta `medium` pura é desativada na hora).

O admin nunca liga uma conta a um médium: o vínculo nasce no aceite
(``api/v1/public/convite.py``), com prova de posse do e-mail.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user, require_group_permission, require_plan_feature
from src.core.database import get_db
from src.core.errors import NotFoundError
from src.models import Medium, PermissionFeature, User
from src.services.audit_service import AuditService
from src.services.medium_convite import (
    convites_em_aberto,
    criar_convite,
    enfileirar_email_convite,
    link_do_convite,
    marca_do_terreiro,
    mascarar_email,
    mensagem_whatsapp,
    normalizar_email,
    primeiro_nome,
    status_acesso,
    tirar_acesso,
    whatsapp_url,
)

router = APIRouter(prefix="/api/v1/admin/mediuns", tags=["admin-mediuns"])
logger = logging.getLogger(__name__)

_GATE_AREA = Depends(require_plan_feature("area_medium"))


class AcessoAreaResponse(BaseModel):
    """Situação do médium na Área do Médium (coluna "Acesso à Área" da tela Médiuns)."""

    status: Literal["sem_acesso", "convite_enviado", "ativo"]
    desde: Optional[datetime] = None
    convite_enviado_em: Optional[datetime] = None
    convite_expira_em: Optional[datetime] = None


class ConviteResponse(BaseModel):
    link: str
    mensagem_whatsapp: str
    whatsapp_url: str
    email_mascarado: str
    expira_em: datetime
    acesso_area: AcessoAreaResponse


class ConviteLoteResponse(BaseModel):
    convidados: int
    sem_email: int
    ja_convidados: int


async def _medium_do_tenant(db: AsyncSession, tenant_id: UUID, medium_id: UUID) -> Medium:
    medium = (
        await db.execute(
            select(Medium).where(
                Medium.id == medium_id,
                Medium.tenant_id == tenant_id,
                Medium.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if medium is None:
        raise NotFoundError("Médium não encontrado")
    return medium


@router.post("/convite/lote", response_model=ConviteLoteResponse, dependencies=[_GATE_AREA, Depends(require_group_permission(PermissionFeature.MEDIUNS, "edit"))])
async def convidar_em_lote(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConviteLoteResponse:
    """Convida por e-mail todos os médiuns ativos com e-mail, sem acesso e sem convite em aberto."""
    tenant_id = current_user.tenant_id
    candidatos = (
        await db.execute(
            select(Medium).where(
                Medium.tenant_id == tenant_id,
                Medium.deleted_at.is_(None),
                Medium.is_active.is_(True),
                Medium.user_id.is_(None),
            ).order_by(Medium.nome)
        )
    ).scalars().all()
    abertos = await convites_em_aberto(db, tenant_id, [m.id for m in candidatos])

    enviar: list[tuple[Medium, str, str]] = []
    sem_email = ja_convidados = 0
    for medium in candidatos:
        email = normalizar_email(medium.email)
        if email is None:
            sem_email += 1
            continue
        if medium.id in abertos:
            ja_convidados += 1
            continue
        _, token = await criar_convite(db, tenant_id, medium, email, current_user.id)
        enviar.append((medium, email, token))

    if enviar:
        await AuditService(db).log_create(
            tenant_id=tenant_id,
            user_id=current_user.id,
            resource_type="MediumConvite",
            resource_id=None,
            details={"lote": True, "convidados": len(enviar)},
        )
    await db.commit()

    # E-mails só depois do commit: o link precisa valer quando chegar.
    if enviar:
        tenant, config = await marca_do_terreiro(db, tenant_id)
        for medium, email, token in enviar:
            enfileirar_email_convite(tenant, config, medium, email, link_do_convite(token))

    return ConviteLoteResponse(convidados=len(enviar), sem_email=sem_email, ja_convidados=ja_convidados)


@router.post("/{medium_id}/convite", response_model=ConviteResponse, dependencies=[_GATE_AREA, Depends(require_group_permission(PermissionFeature.MEDIUNS, "edit"))])
async def convidar_medium(
    medium_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConviteResponse:
    """Convida (ou reenvia o convite, cancelando o link anterior)."""
    tenant_id = current_user.tenant_id
    medium = await _medium_do_tenant(db, tenant_id, medium_id)
    if not medium.is_active:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Médium inativo não recebe convite.")
    if medium.user_id is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este médium já tem acesso à Área do Médium.")
    email = normalizar_email(medium.email)
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Cadastre um e-mail válido no médium para convidar. É com ele que a pessoa vai entrar.",
        )

    try:
        convite, token = await criar_convite(db, tenant_id, medium, email, current_user.id)
        await AuditService(db).log_create(
            tenant_id=tenant_id,
            user_id=current_user.id,
            resource_type="MediumConvite",
            resource_id=convite.id,
            details={"medium_id": str(medium.id)},
        )
        await db.commit()
    except IntegrityError:
        # Dois convites ao mesmo tempo para o mesmo médium (índice de um convite em aberto).
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Outro convite acabou de ser enviado. Atualize a tela.")

    tenant, config = await marca_do_terreiro(db, tenant_id)
    link = link_do_convite(token)
    enfileirar_email_convite(tenant, config, medium, email, link)
    texto = mensagem_whatsapp(primeiro_nome(medium.nome), tenant.name, link)
    return ConviteResponse(
        link=link,
        mensagem_whatsapp=texto,
        whatsapp_url=whatsapp_url(medium.telefone, texto),
        email_mascarado=mascarar_email(email),
        expira_em=convite.expira_em,
        acesso_area=AcessoAreaResponse(**status_acesso(medium, convite)),
    )


@router.delete("/{medium_id}/acesso", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_GATE_AREA, Depends(require_group_permission(PermissionFeature.MEDIUNS, "edit"))])
async def revogar_acesso(
    medium_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Cancela o convite em aberto e/ou tira o acesso à Área (vale na hora). O cadastro continua."""
    tenant_id = current_user.tenant_id
    medium = await _medium_do_tenant(db, tenant_id, medium_id)
    tinha_vinculo = medium.user_id is not None
    user = await tirar_acesso(db, tenant_id, medium)
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="Medium",
        resource_id=medium.id,
        previous_state={"acesso_area": "ativo" if tinha_vinculo else "convite_ou_sem_acesso"},
        new_state={"acesso_area": "sem_acesso", "conta_desativada": bool(user is not None and not user.is_active)},
    )
    await db.commit()
