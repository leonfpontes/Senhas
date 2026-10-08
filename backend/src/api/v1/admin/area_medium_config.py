"""Configuração da Área do Médium (AM-10).

    GET /api/v1/admin/config/area-medium   — CONFIGURACOES:view + plano `area_medium`
    PUT /api/v1/admin/config/area-medium   — CONFIGURACOES:edit + plano `area_medium`

O terreiro decide se a Área fica ligada, a mensagem de boas-vindas, o WhatsApp da
casa ("Falar com a casa"), quais módulos o médium vê (agenda, avisos,
mensalidade) e — AM-17/AM-28 — a presença: modo padrão da casa (confiança ·
"Cheguei" pelo app · "Cheguei" com QR; cada tipo de atividade pode ajustar) e o
prazo para o médium contar o motivo de uma falta (1 a 30 dias, padrão 7).
AM-15: `lembretes.mensalidade` liga/desliga os lembretes da mensalidade por e-mail (D-29: 3 dias
antes e 3 dias depois do vencimento, sem comprovante) — `tenant_configs.area_medium_lembrete_mensalidade`.
Trocar o modo vale para as próximas chamadas; presença já registrada não muda. O gate `area_medium` já exige a chave do piloto
(`tenants.area_medium_liberada`): sem ela, 403 aqui também.

Os valores ficam em colunas `area_medium_*` de `tenant_configs` (migração 068) e são
lidos pela Área via `services/medium_area` (`area_medium_enabled_by_tenant`,
`area_medium_modulos`).
"""
from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user, require_group_permission, require_plan_feature
from src.core.database import get_db
from src.core.errors import ValidationError
from src.models import PermissionFeature, TenantConfig, User
from src.repositories.config_repo import TenantConfigRepository
from src.repositories.subscription_repo import SubscriptionRepository
from src.services.audit_service import AuditService
from src.services.plan_features import get_effective_plan_features
from src.services.presenca import modo_efetivo, validar_modo, validar_prazo

router = APIRouter(prefix="/api/v1/admin", tags=["admin-area-medium"])

_GATE = Depends(require_plan_feature("area_medium"))
BOAS_VINDAS_MAX = 500


class AreaMediumModulos(BaseModel):
    agenda: bool = True
    avisos: bool = True
    mensalidade: bool = True


class AreaMediumModulosUpdate(BaseModel):
    agenda: Optional[bool] = None
    avisos: Optional[bool] = None
    mensalidade: Optional[bool] = None


class PresencaConfig(BaseModel):
    modo_padrao: str = "confianca"
    prazo_justificativa_dias: int = 7


class PresencaConfigUpdate(BaseModel):
    modo_padrao: Optional[str] = None
    prazo_justificativa_dias: Optional[int] = None


class LembretesConfig(BaseModel):
    # D-29: 3 dias antes e 3 dias depois do vencimento, sem comprovante (padrão ligado).
    mensalidade: bool = True


class LembretesConfigUpdate(BaseModel):
    mensalidade: Optional[bool] = None


class AreaMediumConfigResponse(BaseModel):
    ativa: bool
    boas_vindas: Optional[str] = None
    # Só dígitos, com DDI (5511987654321); a tela mascara.
    whatsapp: Optional[str] = None
    modulos: AreaMediumModulos
    # A mensalidade na Área também depende do plano (`mensalidade_mediun`): a tela avisa.
    mensalidade_no_plano: bool
    presenca: PresencaConfig
    # A presença só vale com o plano `atividades_corrente`: a tela só mostra a seção com ele.
    presenca_no_plano: bool
    lembretes: LembretesConfig = LembretesConfig()


class AreaMediumConfigUpdate(BaseModel):
    ativa: Optional[bool] = None
    boas_vindas: Optional[str] = Field(None, max_length=BOAS_VINDAS_MAX)
    whatsapp: Optional[str] = None
    modulos: Optional[AreaMediumModulosUpdate] = None
    presenca: Optional[PresencaConfigUpdate] = None
    lembretes: Optional[LembretesConfigUpdate] = None


def normalizar_whatsapp(valor: Optional[str]) -> Optional[str]:
    """Telefone brasileiro (celular 9xxxx-xxxx ou fixo 2–5xxx-xxxx, com DDD) → dígitos com DDI 55. Vazio → None."""
    if valor is None:
        return None
    digitos = re.sub(r"\D", "", valor)
    if not digitos:
        return None
    if len(digitos) in (10, 11):
        digitos = "55" + digitos
    if not re.fullmatch(r"55[1-9][1-9](?:9\d{8}|[2-5]\d{7})", digitos):
        raise ValidationError("WhatsApp inválido. Use o número com DDD, ex.: (11) 98765-4321.")
    return digitos


def _snapshot(config: TenantConfig) -> dict:
    return {
        "ativa": config.area_medium_ativa,
        "boas_vindas": config.area_medium_boas_vindas,
        "whatsapp": config.area_medium_whatsapp,
        "modulos": {
            "agenda": config.area_medium_agenda,
            "avisos": config.area_medium_avisos,
            "mensalidade": config.area_medium_mensalidade,
        },
        "presenca": {
            "modo_padrao": modo_efetivo(None, config.presenca_modo_padrao),
            "prazo_justificativa_dias": config.presenca_prazo_justificativa_dias,
        },
        "lembretes": {"mensalidade": bool(config.area_medium_lembrete_mensalidade)},
    }


async def _response(db: AsyncSession, tenant_id, config: TenantConfig) -> AreaMediumConfigResponse:
    features = get_effective_plan_features(await SubscriptionRepository(db).get_by_tenant(tenant_id))
    return AreaMediumConfigResponse(
        **_snapshot(config),
        mensalidade_no_plano=features.mensalidade_mediun,
        presenca_no_plano=features.atividades_corrente,
    )


@router.get(
    "/config/area-medium",
    response_model=AreaMediumConfigResponse,
    dependencies=[_GATE, Depends(require_group_permission(PermissionFeature.CONFIGURACOES, "view"))],
)
async def get_area_medium_config(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AreaMediumConfigResponse:
    config = await TenantConfigRepository(db).get_by_tenant(current_user.tenant_id)
    return await _response(db, current_user.tenant_id, config)


@router.put(
    "/config/area-medium",
    response_model=AreaMediumConfigResponse,
    dependencies=[_GATE, Depends(require_group_permission(PermissionFeature.CONFIGURACOES, "edit"))],
)
async def update_area_medium_config(
    body: AreaMediumConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AreaMediumConfigResponse:
    """Atualiza só os campos enviados (boas-vindas/WhatsApp vazios limpam)."""
    config = await TenantConfigRepository(db).get_by_tenant(current_user.tenant_id)
    antes = _snapshot(config)
    enviados = body.model_fields_set

    if "ativa" in enviados and body.ativa is not None:
        config.area_medium_ativa = body.ativa
    if "boas_vindas" in enviados:
        texto = (body.boas_vindas or "").strip()
        config.area_medium_boas_vindas = texto or None
    if "whatsapp" in enviados:
        config.area_medium_whatsapp = normalizar_whatsapp(body.whatsapp)
    if body.modulos is not None:
        if body.modulos.agenda is not None:
            config.area_medium_agenda = body.modulos.agenda
        if body.modulos.avisos is not None:
            config.area_medium_avisos = body.modulos.avisos
        if body.modulos.mensalidade is not None:
            config.area_medium_mensalidade = body.modulos.mensalidade
    if body.presenca is not None:
        if body.presenca.modo_padrao is not None:
            config.presenca_modo_padrao = validar_modo(body.presenca.modo_padrao)
        if body.presenca.prazo_justificativa_dias is not None:
            config.presenca_prazo_justificativa_dias = validar_prazo(body.presenca.prazo_justificativa_dias)
    if body.lembretes is not None and body.lembretes.mensalidade is not None:
        config.area_medium_lembrete_mensalidade = body.lembretes.mensalidade
    await db.flush()

    await AuditService(db).log_config_change(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        config_type="area_medium",
        previous_values=antes,
        new_values=_snapshot(config),
    )
    await db.commit()
    await db.refresh(config)
    return await _response(db, current_user.tenant_id, config)
