"""Admin Financeiro — Mensalidades (Premium feature).

Routes:
  GET  /api/v1/admin/financeiro/config         — Get tenant mensalidade config
  PUT  /api/v1/admin/financeiro/config         — Update config (ADMIN only)
  GET  /api/v1/admin/financeiro/mensalidades   — List month (ADMIN + OPERATOR)
  POST /api/v1/admin/financeiro/mensalidades/{mediun_id}/{mes}  — Register payment (ADMIN)
  GET  /api/v1/admin/financeiro/mensalidades/{mediun_id}/{mes}/comprovante  — Download
  DELETE /api/v1/admin/financeiro/mensalidades/{pagamento_id}/comprovante   — Remove (ADMIN)
  GET  /api/v1/admin/financeiro/resumo         — Chart data (ADMIN + OPERATOR)
  POST /api/v1/admin/financeiro/relatorio/enviar  — Send email to admins (ADMIN)
  GET  /api/v1/admin/financeiro/relatorio/download  — Return HTML (ADMIN)
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Path, Query, UploadFile, status
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user
from src.core.database import get_db
from src.core.errors import InsufficientPermissionsError, NotFoundError
from src.models import User
from src.models.mensalidades import MensalidadeStatus
from src.repositories.mensalidade_repo import MensalidadeRepository
from src.repositories.associado_mensalidade_repo import AssociadoMensalidadeRepository
from src.repositories.subscription_repo import SubscriptionRepository
from src.repositories.config_repo import TenantConfigRepository
from src.models.subscriptions import PlanType
from src.services.audit_service import AuditService

router = APIRouter(prefix="/api/v1/admin/financeiro", tags=["admin-financeiro"])
logger = logging.getLogger(__name__)

# ── Upload constraints ────────────────────────────────────────────────────────
MAX_COMPROVANTE_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_COMPROVANTE_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}

# ── Plan tier required ───────────────────────────────────────────────────────
_PREMIUM_TIERS = {PlanType.PREMIUM}
_PRO_OR_PREMIUM_TIERS = {PlanType.PRO, PlanType.PREMIUM}


# ── Helpers ───────────────────────────────────────────────────────────────────

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


async def _require_premium(
    current_user: User,
    db: AsyncSession,
) -> None:
    """Raise 403 if the tenant is not on Premium plan."""
    sub_repo = SubscriptionRepository(db)
    sub = await sub_repo.get_by_tenant(current_user.tenant_id)
    plan = sub.plan if sub else PlanType.FREE
    if plan not in _PREMIUM_TIERS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Controle de Mensalidade de Médiuns está disponível apenas no plano Premium.",
        )


async def _require_pro_or_premium(
    current_user: User,
    db: AsyncSession,
) -> None:
    """Raise 403 if the tenant is not on PRO or Premium plan."""
    sub_repo = SubscriptionRepository(db)
    sub = await sub_repo.get_by_tenant(current_user.tenant_id)
    plan = sub.plan if sub else PlanType.FREE
    if plan not in _PRO_OR_PREMIUM_TIERS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Controle de Mensalidade de Associados está disponível nos planos Pro e Premium.",
        )


async def _require_assoc_mensalidade_enabled(
    current_user: User,
    db: AsyncSession,
) -> None:
    """Raise 403 if the tenant has not enabled mensalidade_associado toggle."""
    config_repo = TenantConfigRepository(db)
    tc = await config_repo.get_by_tenant(current_user.tenant_id)
    if not tc or not tc.enable_mensalidade_associado:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Mensalidade de Associados não está habilitada. Ative em Configurações → Mensalidade de Associados.",
        )


def _require_admin(current_user: User) -> None:
    """Raise 403 if the user is not an admin."""
    from src.models import UserRole
    if current_user.role != UserRole.ADMIN and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta operação requer perfil ADMIN.",
        )


# ── Schemas ───────────────────────────────────────────────────────────────────

class ConfigResponse(BaseModel):
    tenant_id: UUID
    valor_mensal: float
    dia_vencimento: int
    ativo: bool
    email_relatorio_ativo: bool = False
    valor_mensal_associado: float = 0.0
    dia_vencimento_associado: int = 10
    relatorio_hora_envio: Optional[str] = None  # "HH:MM" string

    class Config:
        from_attributes = True


class ConfigUpdate(BaseModel):
    valor_mensal: Optional[float] = Field(None, ge=0)
    dia_vencimento: Optional[int] = Field(None, ge=1, le=28)
    email_relatorio_ativo: Optional[bool] = None
    valor_mensal_associado: Optional[float] = Field(None, ge=0)
    dia_vencimento_associado: Optional[int] = Field(None, ge=1, le=28)
    relatorio_hora_envio: Optional[str] = None  # "HH:MM" or null


class MensalidadeItemResponse(BaseModel):
    mediun_id: UUID
    mediun_nome: str
    mensalidade_isento: bool
    pagamento_id: Optional[UUID] = None
    status: Optional[str] = None
    data_pagamento: Optional[datetime] = None
    valor_vigente: Optional[float] = None
    valor_pago: Optional[float] = None
    comprovante_filename: Optional[str] = None
    observacao: Optional[str] = None


class AssociadoMensalidadeItemResponse(BaseModel):
    associado_id: UUID
    associado_nome: str
    mensalidade_isento: bool
    pagamento_id: Optional[UUID] = None
    status: Optional[str] = None
    data_pagamento: Optional[datetime] = None
    valor_vigente: Optional[float] = None
    valor_pago: Optional[float] = None
    comprovante_filename: Optional[str] = None
    observacao: Optional[str] = None


class ResumoResponse(BaseModel):
    historico: List[Dict[str, Any]]
    projecao: List[Dict[str, Any]]
    config: Dict[str, Any]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/config", response_model=Optional[ConfigResponse])
async def get_config(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the tenant's mensalidade configuration.
    
    Accessible to PRO+ (for associados fields) and Premium (for mediuns fields).
    """
    sub_repo = SubscriptionRepository(db)
    sub = await sub_repo.get_by_tenant(current_user.tenant_id)
    plan = sub.plan if sub else PlanType.FREE
    if plan not in _PRO_OR_PREMIUM_TIERS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Configuração de Mensalidade requer plano Pro ou Premium.",
        )
    repo = MensalidadeRepository(db)
    config = await repo.get_config(current_user.tenant_id)
    if not config:
        return None
    hora_str = config.relatorio_hora_envio.strftime("%H:%M") if config.relatorio_hora_envio else None
    return ConfigResponse(
        tenant_id=config.tenant_id,
        valor_mensal=float(config.valor_mensal),
        dia_vencimento=config.dia_vencimento,
        ativo=config.ativo,
        email_relatorio_ativo=config.email_relatorio_ativo,
        valor_mensal_associado=float(config.valor_mensal_associado),
        dia_vencimento_associado=config.dia_vencimento_associado,
        relatorio_hora_envio=hora_str,
    )


@router.put("/config", response_model=ConfigResponse)
async def update_config(
    body: ConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create or update mensalidade config (ADMIN only). PRO+ for associados fields, Premium for mediuns fields."""
    sub_repo = SubscriptionRepository(db)
    sub = await sub_repo.get_by_tenant(current_user.tenant_id)
    plan = sub.plan if sub else PlanType.FREE
    if plan not in _PRO_OR_PREMIUM_TIERS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Configuração de Mensalidade requer plano Pro ou Premium.",
        )
    _require_admin(current_user)

    repo = MensalidadeRepository(db)
    audit = AuditService(db)

    existing = await repo.get_config(current_user.tenant_id)
    import datetime as _dt
    hora_obj = None
    if body.relatorio_hora_envio:
        try:
            hora_obj = _dt.time.fromisoformat(body.relatorio_hora_envio)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Formato de hora inválido. Use HH:MM.",
            )

    if existing:
        if body.valor_mensal is not None and plan in _PREMIUM_TIERS:
            existing.valor_mensal = Decimal(str(body.valor_mensal))
        if body.dia_vencimento is not None and plan in _PREMIUM_TIERS:
            existing.dia_vencimento = body.dia_vencimento
        if body.email_relatorio_ativo is not None:
            existing.email_relatorio_ativo = body.email_relatorio_ativo
        if body.valor_mensal_associado is not None:
            existing.valor_mensal_associado = Decimal(str(body.valor_mensal_associado))
        if body.dia_vencimento_associado is not None:
            existing.dia_vencimento_associado = body.dia_vencimento_associado
        if body.relatorio_hora_envio is not None or body.relatorio_hora_envio == "":
            existing.relatorio_hora_envio = hora_obj
        from datetime import timezone as _tz
        existing.updated_at = _dt.datetime.now(_tz.utc)
        await db.flush()
        await db.refresh(existing)
        config = existing
    else:
        from src.models.mensalidades import MensalidadeConfig as MC
        config = MC(
            id=uuid.uuid4(),
            tenant_id=current_user.tenant_id,
            valor_mensal=Decimal(str(body.valor_mensal or 0)),
            dia_vencimento=body.dia_vencimento or 10,
            email_relatorio_ativo=body.email_relatorio_ativo or False,
            valor_mensal_associado=Decimal(str(body.valor_mensal_associado or 0)),
            dia_vencimento_associado=body.dia_vencimento_associado or 10,
            relatorio_hora_envio=hora_obj,
        )
        db.add(config)
        await db.flush()
        await db.refresh(config)

    await audit.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="mensalidade_config",
        resource_id=config.id,
        new_state=body.model_dump(exclude_none=True),
    )
    await db.commit()
    hora_str = config.relatorio_hora_envio.strftime("%H:%M") if config.relatorio_hora_envio else None
    return ConfigResponse(
        tenant_id=config.tenant_id,
        valor_mensal=float(config.valor_mensal),
        dia_vencimento=config.dia_vencimento,
        ativo=config.ativo,
        email_relatorio_ativo=config.email_relatorio_ativo,
        valor_mensal_associado=float(config.valor_mensal_associado),
        dia_vencimento_associado=config.dia_vencimento_associado,
        relatorio_hora_envio=hora_str,
    )


@router.get("/mensalidades", response_model=List[MensalidadeItemResponse])
async def list_mensalidades(
    mes: str = Query(..., description="Mês no formato YYYY-MM"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all active médiuns with their payment status for the specified month."""
    await _require_premium(current_user, db)
    mes_date = _parse_mes(mes)
    repo = MensalidadeRepository(db)
    rows = await repo.list_mes(current_user.tenant_id, mes_date)

    result = []
    for r in rows:
        raw_status = r.get("status")
        effective_status: Optional[str]
        if r.get("mensalidade_isento") and raw_status is None:
            effective_status = MensalidadeStatus.ISENTO.value
        elif raw_status is not None:
            effective_status = raw_status if isinstance(raw_status, str) else raw_status.value
        else:
            effective_status = MensalidadeStatus.PENDENTE.value

        pag_id = r.get("pagamento_id")
        result.append(
            MensalidadeItemResponse(
                mediun_id=r["mediun_id"],
                mediun_nome=r["mediun_nome"],
                mensalidade_isento=r["mensalidade_isento"],
                pagamento_id=pag_id if pag_id else None,
                status=effective_status,
                data_pagamento=r.get("data_pagamento"),
                valor_vigente=float(r["valor_vigente"]) if r.get("valor_vigente") is not None else None,
                valor_pago=float(r["valor_pago"]) if r.get("valor_pago") is not None else None,
                comprovante_filename=r.get("comprovante_filename"),
                observacao=r.get("observacao"),
            )
        )
    return result


@router.post(
    "/mensalidades/{mediun_id}/{mes}",
    status_code=status.HTTP_200_OK,
)
async def registrar_pagamento(
    mediun_id: UUID = Path(...),
    mes: str = Path(...),
    pagamento_status: str = Form(..., alias="status"),
    valor_pago: Optional[float] = Form(None),
    data_pagamento: Optional[str] = Form(None),
    observacao: Optional[str] = Form(None),
    comprovante: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Register or update mensalidade for a médium in a given month (ADMIN only)."""
    await _require_premium(current_user, db)
    _require_admin(current_user)
    mes_date = _parse_mes(mes)

    try:
        parsed_status = MensalidadeStatus(pagamento_status.upper())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Status inválido: '{pagamento_status}'. Use PAGO, PENDENTE ou ISENTO.",
        )

    # Validate mediun belongs to tenant
    from sqlalchemy import select, and_
    from src.models.mediuns import Medium as MediumModel
    stmt = select(MediumModel).where(
        and_(
            MediumModel.id == mediun_id,
            MediumModel.tenant_id == current_user.tenant_id,
            MediumModel.deleted_at.is_(None),
        )
    )
    mediun_result = await db.execute(stmt)
    mediun = mediun_result.scalar_one_or_none()
    if not mediun:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Médium não encontrado.")

    # Parse data_pagamento
    parsed_data_pag: Optional[datetime] = None
    if data_pagamento:
        try:
            parsed_data_pag = datetime.fromisoformat(data_pagamento)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Formato de data_pagamento inválido. Use ISO 8601.",
            )

    # Fetch config to capture valor_vigente
    repo = MensalidadeRepository(db)
    config = await repo.get_config(current_user.tenant_id)
    valor_vigente: Optional[Decimal] = config.valor_mensal if config else None

    # Handle comprovante upload
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

    audit = AuditService(db)
    pag = await repo.registrar_pagamento(
        tenant_id=current_user.tenant_id,
        mediun_id=mediun_id,
        mes_referencia=mes_date,
        status=parsed_status,
        registrado_por=current_user.id,
        valor_vigente=valor_vigente,
        valor_pago=Decimal(str(valor_pago)) if valor_pago is not None else None,
        data_pagamento=parsed_data_pag,
        observacao=observacao,
        comprovante_data=comp_data,
        comprovante_filename=comp_filename,
        comprovante_mime=comp_mime,
    )
    await audit.log_update(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="mensalidade",
        resource_id=pag.id,
        new_state={"mediun_id": str(mediun_id), "mes": mes, "status": parsed_status.value},
    )
    await db.commit()
    return {"id": str(pag.id), "status": pag.status.value}


@router.get("/mensalidades/{mediun_id}/{mes}/comprovante")
async def download_comprovante(
    mediun_id: UUID = Path(...),
    mes: str = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download comprovante binary for a specific payment."""
    await _require_premium(current_user, db)
    mes_date = _parse_mes(mes)
    repo = MensalidadeRepository(db)
    pag = await repo.get_pagamento(current_user.tenant_id, mediun_id, mes_date)
    if not pag or not pag.comprovante_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comprovante não encontrado.")
    return Response(
        content=pag.comprovante_data,
        media_type=pag.comprovante_mime or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{pag.comprovante_filename or "comprovante"}"'
        },
    )


@router.delete(
    "/mensalidades/{pagamento_id}/comprovante",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_comprovante(
    pagamento_id: UUID = Path(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove comprovante binary from a payment record (ADMIN only)."""
    await _require_premium(current_user, db)
    _require_admin(current_user)
    repo = MensalidadeRepository(db)
    audit = AuditService(db)
    pag = await repo.delete_comprovante(current_user.tenant_id, pagamento_id)
    if not pag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pagamento não encontrado.")
    await audit.log_delete(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="mensalidade_comprovante",
        resource_id=pagamento_id,
    )
    await db.commit()


@router.get("/resumo", response_model=ResumoResponse)
async def get_resumo(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return 6-month historical + 3-month projection data for charts."""
    await _require_premium(current_user, db)
    repo = MensalidadeRepository(db)
    resumo = await repo.get_resumo(current_user.tenant_id)
    return ResumoResponse(**resumo)


@router.post("/relatorio/enviar", status_code=status.HTTP_202_ACCEPTED)
async def enviar_relatorio(
    mes: str = Query(..., description="Mês no formato YYYY-MM"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send monthly mensalidade report email to all ADMIN users of the tenant (ADMIN only)."""
    await _require_pro_or_premium(current_user, db)
    _require_admin(current_user)
    mes_date = _parse_mes(mes)

    repo = MensalidadeRepository(db)

    # Guard: only send if admin explicitly enabled the email feature
    cfg = await repo.get_config(current_user.tenant_id)
    if not cfg or not cfg.email_relatorio_ativo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Envio de relatório por e-mail está desativado. Ative em Financeiro → Configuração.",
        )

    from sqlalchemy import select, and_
    from src.models.tenants import Tenant
    from src.models.users import User as UserModel, UserRole
    from src.models.tenant_config import TenantConfig

    tenant_stmt = select(Tenant).where(Tenant.id == current_user.tenant_id)
    tenant_result = await db.execute(tenant_stmt)
    tenant = tenant_result.scalar_one_or_none()
    tenant_name = tenant.name if tenant else "Terreiro"

    config_stmt = select(TenantConfig).where(TenantConfig.tenant_id == current_user.tenant_id)
    config_result = await db.execute(config_stmt)
    tc = config_result.scalar_one_or_none()
    primary_color = tc.primary_color if tc and tc.primary_color else "#7C3AED"
    assoc_enabled = tc.enable_mensalidade_associado if tc else False

    admins_stmt = select(UserModel).where(
        and_(
            UserModel.tenant_id == current_user.tenant_id,
            UserModel.role == UserRole.ADMIN,
            UserModel.deleted_at.is_(None),
        )
    )
    admins_result = await db.execute(admins_stmt)
    admins = admins_result.scalars().all()

    # Determine tier and build appropriate report(s)
    sub_repo = SubscriptionRepository(db)
    sub = await sub_repo.get_by_tenant(current_user.tenant_id)
    plan = sub.plan if sub else PlanType.FREE
    tier = _PLAN_TIER.get(plan, 0)

    from src.services.email.email_queue import email_queue, EmailQueueItem
    from src.services.email.base import EmailMessage

    # Scenario detection:
    # PRO (tier==2) without assoc_enabled → mediuns only (should not occur for PRO — mediuns are PREMIUM)
    # PRO + assoc_enabled → associados only
    # PREMIUM + no assoc_enabled → mediuns only
    # PREMIUM + assoc_enabled → dual report

    html_parts: dict[str, str] = {}

    if tier >= 3:  # PREMIUM
        from src.services.email.templates.mensalidade_report import render_mensalidade_report
        rows_m = await repo.list_mes(current_user.tenant_id, mes_date)
        inadimplentes_m = [
            r for r in rows_m
            if not r.get("mensalidade_isento")
            and (r.get("status") is None or r.get("status") in (
                MensalidadeStatus.PENDENTE, MensalidadeStatus.PENDENTE.value
            ))
        ]
        config_info = {"valor_mensal": float(cfg.valor_mensal) if cfg else 0.0}

        if assoc_enabled:
            from src.services.email.templates.mensalidade_report import render_mensalidade_report_duplo
            assoc_repo = AssociadoMensalidadeRepository(db)
            rows_a = await assoc_repo.list_mes(current_user.tenant_id, mes_date)
            inadimplentes_a = [
                r for r in rows_a
                if not r.get("mensalidade_isento")
                and (r.get("status") is None or r.get("status") in (
                    MensalidadeStatus.PENDENTE, MensalidadeStatus.PENDENTE.value
                ))
            ]
            config_info["valor_mensal_associado"] = float(cfg.valor_mensal_associado) if cfg and cfg.valor_mensal_associado else 0.0
            html_parts["dual"] = render_mensalidade_report_duplo(
                inadimplentes_mediuns=inadimplentes_m,
                inadimplentes_associados=inadimplentes_a,
                config_resumo=config_info,
                tenant_name=tenant_name,
                primary_color=primary_color,
                mes_referencia=mes,
            )
        else:
            html_parts["mediuns"] = render_mensalidade_report(
                inadimplentes=inadimplentes_m,
                config_resumo=config_info,
                tenant_name=tenant_name,
                primary_color=primary_color,
                mes_referencia=mes,
            )
    elif tier == 2 and assoc_enabled:  # PRO + associados enabled
        from src.services.email.templates.mensalidade_report import render_mensalidade_report_associados
        assoc_repo = AssociadoMensalidadeRepository(db)
        rows_a = await assoc_repo.list_mes(current_user.tenant_id, mes_date)
        inadimplentes_a = [
            r for r in rows_a
            if not r.get("mensalidade_isento")
            and (r.get("status") is None or r.get("status") in (
                MensalidadeStatus.PENDENTE, MensalidadeStatus.PENDENTE.value
            ))
        ]
        config_info_a = {"valor_mensal_associado": float(cfg.valor_mensal_associado) if cfg and cfg.valor_mensal_associado else 0.0}
        html_parts["associados"] = render_mensalidade_report_associados(
            inadimplentes=inadimplentes_a,
            config_resumo=config_info_a,
            tenant_name=tenant_name,
            primary_color=primary_color,
            mes_referencia=mes,
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nenhum relatório disponível para o plano atual ou configuração ativa.",
        )

    sent = 0
    subject_suffix = "Médiuns e Associados" if "dual" in html_parts else ("Associados" if "associados" in html_parts else "Médiuns")
    html_body = next(iter(html_parts.values()))
    for admin in admins:
        if admin.email:
            msg = EmailMessage(
                to_email=admin.email,
                subject=f"Relatório de Mensalidades ({subject_suffix}) — {mes} — {tenant_name}",
                html_body=html_body,
            )
            email_queue.enqueue(EmailQueueItem(message=msg))
            sent += 1

    audit = AuditService(db)
    await audit.log_create(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        resource_type="mensalidade_relatorio",
        resource_id=current_user.tenant_id,
        details={"mes": mes, "enviado_para": sent},
    )
    return {"mensagem": f"Relatório enviado para {sent} administrador(es).", "mes": mes}


@router.get("/relatorio/download", response_class=HTMLResponse)
async def download_relatorio(
    mes: str = Query(..., description="Mês no formato YYYY-MM"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the mensalidade report as inline HTML for download/preview (ADMIN only)."""
    await _require_pro_or_premium(current_user, db)
    _require_admin(current_user)
    mes_date = _parse_mes(mes)

    from sqlalchemy import select
    from src.models.tenants import Tenant
    from src.models.tenant_config import TenantConfig

    tenant_stmt = select(Tenant).where(Tenant.id == current_user.tenant_id)
    tenant_result = await db.execute(tenant_stmt)
    tenant = tenant_result.scalar_one_or_none()
    tenant_name = tenant.name if tenant else "Terreiro"

    config_stmt = select(TenantConfig).where(TenantConfig.tenant_id == current_user.tenant_id)
    config_result = await db.execute(config_stmt)
    tc = config_result.scalar_one_or_none()
    primary_color = tc.primary_color if tc and tc.primary_color else "#7C3AED"
    assoc_enabled = tc.enable_mensalidade_associado if tc else False

    sub_repo_2 = SubscriptionRepository(db)
    sub_2 = await sub_repo_2.get_by_tenant(current_user.tenant_id)
    plan_2 = sub_2.plan if sub_2 else PlanType.FREE
    tier = _PLAN_TIER.get(plan_2, 0)

    repo = MensalidadeRepository(db)
    cfg = await repo.get_config(current_user.tenant_id)

    html: str
    if tier >= 3:  # PREMIUM
        from src.services.email.templates.mensalidade_report import render_mensalidade_report
        rows_m = await repo.list_mes(current_user.tenant_id, mes_date)
        inadimplentes_m = [
            r for r in rows_m
            if not r.get("mensalidade_isento")
            and (r.get("status") is None or r.get("status") in (
                MensalidadeStatus.PENDENTE, MensalidadeStatus.PENDENTE.value
            ))
        ]
        config_info = {"valor_mensal": float(cfg.valor_mensal) if cfg else 0.0}

        if assoc_enabled:
            from src.services.email.templates.mensalidade_report import render_mensalidade_report_duplo
            assoc_repo = AssociadoMensalidadeRepository(db)
            rows_a = await assoc_repo.list_mes(current_user.tenant_id, mes_date)
            inadimplentes_a = [
                r for r in rows_a
                if not r.get("mensalidade_isento")
                and (r.get("status") is None or r.get("status") in (
                    MensalidadeStatus.PENDENTE, MensalidadeStatus.PENDENTE.value
                ))
            ]
            config_info["valor_mensal_associado"] = float(cfg.valor_mensal_associado) if cfg and cfg.valor_mensal_associado else 0.0
            html = render_mensalidade_report_duplo(
                inadimplentes_mediuns=inadimplentes_m,
                inadimplentes_associados=inadimplentes_a,
                config_resumo=config_info,
                tenant_name=tenant_name,
                primary_color=primary_color,
                mes_referencia=mes,
            )
        else:
            html = render_mensalidade_report(
                inadimplentes=inadimplentes_m,
                config_resumo=config_info,
                tenant_name=tenant_name,
                primary_color=primary_color,
                mes_referencia=mes,
            )
    elif tier == 2 and assoc_enabled:  # PRO + associados enabled
        from src.services.email.templates.mensalidade_report import render_mensalidade_report_associados
        assoc_repo = AssociadoMensalidadeRepository(db)
        rows_a = await assoc_repo.list_mes(current_user.tenant_id, mes_date)
        inadimplentes_a = [
            r for r in rows_a
            if not r.get("mensalidade_isento")
            and (r.get("status") is None or r.get("status") in (
                MensalidadeStatus.PENDENTE, MensalidadeStatus.PENDENTE.value
            ))
        ]
        config_info_a = {"valor_mensal_associado": float(cfg.valor_mensal_associado) if cfg and cfg.valor_mensal_associado else 0.0}
        html = render_mensalidade_report_associados(
            inadimplentes=inadimplentes_a,
            config_resumo=config_info_a,
            tenant_name=tenant_name,
            primary_color=primary_color,
            mes_referencia=mes,
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nenhum relatório disponível para o plano atual ou configuração ativa.",
        )
    return HTMLResponse(
        content=html,
        headers={
            "Content-Disposition": f'attachment; filename="relatorio-mensalidades-{mes}.html"'
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# Associados mensalidade endpoints (PRO+)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/associados", response_model=List[AssociadoMensalidadeItemResponse])
async def list_associados_mensalidades(
    mes: str = Query(..., description="Mês no formato YYYY-MM"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all active associados with their payment status for the given month (PRO+)."""
    await _require_pro_or_premium(current_user, db)
    await _require_assoc_mensalidade_enabled(current_user, db)
    mes_date = _parse_mes(mes)
    repo = AssociadoMensalidadeRepository(db)
    rows = await repo.list_mes(current_user.tenant_id, mes_date)
    return [
        AssociadoMensalidadeItemResponse(
            associado_id=r["associado_id"],
            associado_nome=r["associado_nome"],
            mensalidade_isento=bool(r["mensalidade_isento"]),
            pagamento_id=r.get("pagamento_id"),
            status=r["status"].value if hasattr(r.get("status"), "value") else r.get("status"),
            data_pagamento=r.get("data_pagamento"),
            valor_vigente=float(r["valor_vigente"]) if r.get("valor_vigente") is not None else None,
            valor_pago=float(r["valor_pago"]) if r.get("valor_pago") is not None else None,
            comprovante_filename=r.get("comprovante_filename"),
            observacao=r.get("observacao"),
        )
        for r in rows
    ]


class RegistrarAssociadoPagamentoRequest(BaseModel):
    status: str
    valor_vigente: Optional[float] = None
    valor_pago: Optional[float] = None
    data_pagamento: Optional[datetime] = None
    observacao: Optional[str] = None


@router.post("/associados/{associado_id}/{mes}", response_model=AssociadoMensalidadeItemResponse)
async def registrar_associado_pagamento(
    associado_id: UUID,
    mes: str,
    body: RegistrarAssociadoPagamentoRequest,
    comprovante: Optional[UploadFile] = File(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Register or update a payment for an associado for the given month (PRO+, OPERATOR+)."""
    await _require_pro_or_premium(current_user, db)
    await _require_assoc_mensalidade_enabled(current_user, db)
    mes_date = _parse_mes(mes)

    # Verify associado belongs to current tenant (return 404 to not leak existence)
    from sqlalchemy import select as sa_select
    from src.models.associados import Associado
    assoc_stmt = sa_select(Associado).where(
        Associado.id == associado_id,
        Associado.tenant_id == current_user.tenant_id,
        Associado.deleted_at.is_(None),
    )
    assoc_result = await db.execute(assoc_stmt)
    assoc = assoc_result.scalar_one_or_none()
    if not assoc:
        raise HTTPException(status_code=404, detail="Associado não encontrado.")

    comprovante_data: Optional[bytes] = None
    comprovante_filename: Optional[str] = None
    comprovante_mime: Optional[str] = None
    if comprovante and comprovante.filename:
        ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
        if comprovante.content_type not in ALLOWED_MIMES:
            raise HTTPException(status_code=400, detail="Tipo de arquivo não permitido. Use JPEG, PNG, WebP ou PDF.")
        raw = await comprovante.read()
        if len(raw) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Comprovante muito grande. Limite: 5 MB.")
        comprovante_data = raw
        comprovante_filename = comprovante.filename
        comprovante_mime = comprovante.content_type

    try:
        status_enum = MensalidadeStatus(body.status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Status inválido: {body.status}")

    from decimal import Decimal
    repo = AssociadoMensalidadeRepository(db)
    pag = await repo.registrar_pagamento(
        tenant_id=current_user.tenant_id,
        associado_id=associado_id,
        mes_referencia=mes_date,
        status=status_enum,
        registrado_por=current_user.id,
        valor_vigente=Decimal(str(body.valor_vigente)) if body.valor_vigente is not None else None,
        valor_pago=Decimal(str(body.valor_pago)) if body.valor_pago is not None else None,
        data_pagamento=body.data_pagamento,
        observacao=body.observacao,
        comprovante_data=comprovante_data,
        comprovante_filename=comprovante_filename,
        comprovante_mime=comprovante_mime,
    )
    await db.commit()

    return AssociadoMensalidadeItemResponse(
        associado_id=assoc.id,
        associado_nome=assoc.nome,
        mensalidade_isento=assoc.mensalidade_isento,
        pagamento_id=pag.id,
        status=pag.status.value if pag.status else None,
        data_pagamento=pag.data_pagamento,
        valor_vigente=float(pag.valor_vigente) if pag.valor_vigente is not None else None,
        valor_pago=float(pag.valor_pago) if pag.valor_pago is not None else None,
        comprovante_filename=pag.comprovante_filename,
        observacao=pag.observacao,
    )


@router.get("/associados/{associado_id}/{mes}/comprovante")
async def get_associado_comprovante(
    associado_id: UUID,
    mes: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the comprovante file for an associado payment (PRO+)."""
    await _require_pro_or_premium(current_user, db)
    await _require_assoc_mensalidade_enabled(current_user, db)
    mes_date = _parse_mes(mes)
    repo = AssociadoMensalidadeRepository(db)
    pag = await repo.get_pagamento(current_user.tenant_id, associado_id, mes_date)
    if not pag or not pag.comprovante_data:
        raise HTTPException(status_code=404, detail="Comprovante não encontrado.")
    from fastapi.responses import Response
    return Response(
        content=pag.comprovante_data,
        media_type=pag.comprovante_mime or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{pag.comprovante_filename or "comprovante"}"'},
    )


@router.delete("/associados/{pagamento_id}/comprovante", status_code=status.HTTP_200_OK)
async def delete_associado_comprovante(
    pagamento_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete the comprovante from an associado payment record (PRO+, ADMIN)."""
    await _require_pro_or_premium(current_user, db)
    await _require_assoc_mensalidade_enabled(current_user, db)
    _require_admin(current_user)
    repo = AssociadoMensalidadeRepository(db)
    pag = await repo.delete_comprovante(current_user.tenant_id, pagamento_id)
    if not pag:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado.")
    await db.commit()
    return {"mensagem": "Comprovante removido com sucesso."}


@router.get("/associados/resumo", response_model=ResumoResponse)
async def get_associados_resumo(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return 6-month histórico + 3-month projection for associados mensalidade (PRO+)."""
    await _require_pro_or_premium(current_user, db)
    await _require_assoc_mensalidade_enabled(current_user, db)
    repo = AssociadoMensalidadeRepository(db)
    data = await repo.get_resumo(current_user.tenant_id)
    cfg = await repo.get_config(current_user.tenant_id)
    return ResumoResponse(
        historico=data.get("historico", []),
        projecao=data.get("projecao", []),
        config={
            "valor_mensal": float(cfg.valor_mensal_associado) if cfg and cfg.valor_mensal_associado else 0.0,
            "dia_vencimento": cfg.dia_vencimento_associado if cfg else 10,
        },
    )
