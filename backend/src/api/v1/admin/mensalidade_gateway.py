"""Mensalidade com baixa automática — conta da casa no gateway (F-02/AM-22).

    GET  /api/v1/admin/financeiro/gateway                    FINANCEIRO:view + `mensalidade_mediun`
    POST /api/v1/admin/financeiro/gateway/stripe/conectar    FINANCEIRO:edit + `mensalidade_automatica`
                                                             + senha + sem impersonação
    POST /api/v1/admin/financeiro/gateway/stripe/atualizar   FINANCEIRO:edit + `mensalidade_automatica`
    POST /api/v1/admin/financeiro/gateway/desconectar        FINANCEIRO:edit + `mensalidade_mediun`
                                                             + senha + sem impersonação
    GET  /api/v1/admin/financeiro/mensalidades/cobrancas     FINANCEIRO:view + `mensalidade_mediun`

Onde fica na tela: Financeiro → Configuração → Mensalidade, logo abaixo da chave PIX (AM-10) —
"Receber a mensalidade automaticamente" (`components/financeiro/MensalidadeGatewayCard.tsx`).

Conectar uma conta decide para onde vai o dinheiro dos médiuns — o mesmo risco da troca da chave
PIX. Por isso, no lugar de empilhar `is_admin` sobre o grupo (CLAUDE.md), a proteção específica
é a mesma do AM-10: senha de quem faz (errada → **400** `SENHA_INCORRETA`, nunca 401 — o front
derrubaria a sessão), recusa sob impersonação, 10 tentativas/hora por IP, auditoria e e-mail a
TODOS os administradores ativos ao conectar (ou retomar o cadastro) e ao desconectar.

Stripe (`services/stripe_connect.py`): "conectar" cria a conta conectada Express da casa (ou
reaproveita a que já existe) e devolve o link de uso único do cadastro hospedado pelo Stripe
(Account Links). A volta do cadastro cai em `/admin/financeiro/config?tab=mensalidade&stripe=retorno`
e a tela chama "atualizar" (lê a conta no Stripe); o link vencido cai em `...&stripe=renovar`.
Desconectar não apaga a conta da casa no Stripe (o dinheiro e o painel continuam dela): o GiraHub
só para de criar cobranças lá. Cobrança já criada e paga depois ainda dá baixa (webhook).

Desconectar e ver o status ficam no gate `mensalidade_mediun` (a casa que perdeu o plano Pro
ainda consegue ver e desligar); conectar exige `mensalidade_automatica` (Pro).
"""
from __future__ import annotations

import logging
import uuid
from datetime import date, datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import (
    get_current_user,
    require_group_permission,
    require_not_impersonated,
    require_plan_feature,
)
from src.core.config import settings
from src.core.database import get_db
from src.core.errors import APIException, ConflictError, NotFoundError, ValidationError
from src.core.limiter import limiter
from src.core.tz import utc_now
from src.models import Medium, PermissionFeature, User
from src.models.mensalidade_gateway import MensalidadeCobranca, MensalidadeGateway
from src.models.tenants import Tenant
from src.security.password import verify_password
from src.services import stripe_connect
from src.services import mensalidade_gateway as gateway_service
from src.services.audit_service import AuditService
from src.services.medium_mensalidade import parse_mes

router = APIRouter(prefix="/api/v1/admin/financeiro", tags=["admin-financeiro"])
logger = logging.getLogger(__name__)

_GATE_BASE = Depends(require_plan_feature("mensalidade_mediun"))
_GATE_AUTO = Depends(require_plan_feature("mensalidade_automatica"))

SENHA_INCORRETA = "Senha incorreta. Confirme sua senha para continuar."


class GatewayInfo(BaseModel):
    provedor: Literal["stripe", "mercadopago"]
    provedor_label: str
    # pendente (cadastro no provedor em andamento) | ativo | desconectado
    status: str
    pix_disponivel: bool
    boleto_disponivel: bool
    cadastro_completo: bool
    recebimentos_ativos: bool
    # O "Pagar com PIX" da Área já usa a cobrança automática (gateway ativo + plano + provedor).
    cobrando: bool
    conectado_em: Optional[datetime] = None
    conectado_por_nome: Optional[str] = None
    desconectado_em: Optional[datetime] = None


class GatewayStatusResponse(BaseModel):
    provedores_disponiveis: List[str]
    plano_inclui: bool
    gateway: Optional[GatewayInfo] = None


class SenhaBody(BaseModel):
    senha: str = Field(..., min_length=1, max_length=256)


class ConectarResponse(BaseModel):
    # Link de uso único do cadastro no provedor (None quando a conta já está completa).
    url: Optional[str] = None
    gateway: GatewayInfo


class CobrancaItem(BaseModel):
    id: uuid.UUID
    mediun_id: uuid.UUID
    mediun_nome: str
    mes: str
    valor: float
    provedor: str
    metodo: str
    status: str
    criada_em: datetime
    expira_em: Optional[datetime] = None
    pago_em: Optional[datetime] = None
    valor_pago: Optional[float] = None


async def _info(db: AsyncSession, tenant_id: uuid.UUID, gw: MensalidadeGateway) -> GatewayInfo:
    nome = None
    if gw.conectado_por:
        u = (
            await db.execute(select(User).where(User.tenant_id == tenant_id, User.id == gw.conectado_por))
        ).scalar_one_or_none()
        if u is not None:
            nome = u.full_name or u.username
    cobrando = gateway_service.gateway_pode_cobrar(gw) and await gateway_service.plano_inclui(db, tenant_id)
    return GatewayInfo(
        provedor=gw.provedor,
        provedor_label=gateway_service.PROVEDOR_LABEL.get(gw.provedor, gw.provedor),
        status=gw.status,
        pix_disponivel=gw.pix_disponivel,
        boleto_disponivel=gw.boleto_disponivel,
        cadastro_completo=gw.cadastro_completo,
        recebimentos_ativos=gw.recebimentos_ativos,
        cobrando=cobrando,
        conectado_em=gw.conectado_em,
        conectado_por_nome=nome,
        desconectado_em=gw.desconectado_em,
    )


def _conferir_senha(user: User, senha: str) -> None:
    if not verify_password(senha, user.password_hash):
        raise APIException(SENHA_INCORRETA, status_code=status.HTTP_400_BAD_REQUEST, error_code="SENHA_INCORRETA")


def _urls_stripe() -> tuple[str, str]:
    base = f"{settings.FRONTEND_URL.rstrip('/')}/admin/financeiro/config?tab=mensalidade"
    return f"{base}&stripe=renovar", f"{base}&stripe=retorno"


async def _avisar(db: AsyncSession, tenant_id: uuid.UUID, user: User, provedor: str, acao: str) -> None:
    try:
        await gateway_service.avisar_admins(db, tenant_id, user, provedor, acao)
    except Exception:  # o aviso não desfaz o que já foi gravado e auditado
        logger.exception("Falha ao enfileirar o aviso do gateway da mensalidade (tenant %s)", tenant_id)


@router.get(
    "/gateway",
    response_model=GatewayStatusResponse,
    dependencies=[_GATE_BASE, Depends(require_group_permission(PermissionFeature.FINANCEIRO, "view"))],
)
async def get_gateway_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GatewayStatusResponse:
    gw = await gateway_service.get_gateway(db, current_user.tenant_id)
    return GatewayStatusResponse(
        provedores_disponiveis=gateway_service.provedores_disponiveis(),
        plano_inclui=await gateway_service.plano_inclui(db, current_user.tenant_id),
        gateway=await _info(db, current_user.tenant_id, gw) if gw is not None else None,
    )


@router.post(
    "/gateway/stripe/conectar",
    response_model=ConectarResponse,
    dependencies=[
        _GATE_AUTO,
        Depends(require_group_permission(PermissionFeature.FINANCEIRO, "edit")),
        Depends(require_not_impersonated),
    ],
)
@limiter.limit("10/hour")
async def conectar_stripe(
    request: Request,
    body: SenhaBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConectarResponse:
    """Cria (ou reaproveita) a conta conectada da casa e devolve o link do cadastro no Stripe."""
    _conferir_senha(current_user, body.senha)
    if not stripe_connect.disponivel():
        raise ConflictError("O Stripe não está disponível agora.", details={"error_code": "PROVEDOR_INDISPONIVEL"})

    tenant_id = current_user.tenant_id
    gw = await gateway_service.get_gateway(db, tenant_id, for_update=True)
    if gw is not None and gw.provedor != "stripe" and gw.status != "desconectado":
        raise ConflictError(
            f"A casa já recebe pelo {gateway_service.PROVEDOR_LABEL.get(gw.provedor, gw.provedor)}. "
            "Desconecte essa conta antes de conectar o Stripe.",
            details={"error_code": "OUTRO_PROVEDOR_CONECTADO"},
        )
    antes = {"provedor": gw.provedor, "status": gw.status} if gw is not None else {}
    if gw is None:
        gw = MensalidadeGateway(id=uuid.uuid4(), tenant_id=tenant_id, provedor="stripe", status="pendente")
        db.add(gw)
        await db.flush()

    try:
        if not gw.stripe_account_id:
            tenant_nome = (
                await db.execute(select(Tenant.name).where(Tenant.id == tenant_id))
            ).scalar_one_or_none() or ""
            gw.stripe_account_id = await stripe_connect.criar_conta(
                tenant_id=str(tenant_id), tenant_nome=tenant_nome, email=current_user.email
            )
            estado = stripe_connect.EstadoConta(False, False, False, False)
        else:
            estado = stripe_connect.estado_da_conta(await stripe_connect.buscar_conta(gw.stripe_account_id))
            await stripe_connect.solicitar_capacidades(gw.stripe_account_id)
        gw.provedor = "stripe"
        gw.status = "pendente"
        gw.mp_user_id = None
        gw.mp_access_token_enc = None
        gw.mp_refresh_token_enc = None
        gw.mp_token_expira_em = None
        gateway_service.aplicar_estado_stripe(gw, estado)
        gw.conectado_por = current_user.id
        gw.conectado_em = utc_now()
        gw.desconectado_em = None
        url = None
        if not gw.cadastro_completo:
            refresh_url, return_url = _urls_stripe()
            url = await stripe_connect.link_cadastro(gw.stripe_account_id, refresh_url=refresh_url, return_url=return_url)
    except stripe_connect.StripeConnectErro as exc:
        # A conta criada (se houver) fica gravada para a próxima tentativa reaproveitar.
        await db.commit()
        raise ConflictError(str(exc), details={"error_code": "STRIPE_ERRO"})

    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="mensalidade_gateway",
        resource_id=gw.id,
        previous_state=antes,
        new_state={"provedor": "stripe", "status": gw.status, "acao": "conectar"},
    )
    await db.commit()
    await db.refresh(gw)
    await _avisar(db, tenant_id, current_user, "stripe", "conectado")
    return ConectarResponse(url=url, gateway=await _info(db, tenant_id, gw))


@router.post(
    "/gateway/stripe/atualizar",
    response_model=GatewayInfo,
    dependencies=[_GATE_AUTO, Depends(require_group_permission(PermissionFeature.FINANCEIRO, "edit"))],
)
async def atualizar_stripe(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GatewayInfo:
    """Relê a conta conectada no Stripe (volta do cadastro) e atualiza status e capacidades."""
    tenant_id = current_user.tenant_id
    gw = await gateway_service.get_gateway(db, tenant_id, for_update=True)
    if gw is None or gw.provedor != "stripe" or not gw.stripe_account_id:
        raise NotFoundError("Conta do Stripe")
    if not stripe_connect.disponivel():
        raise ConflictError("O Stripe não está disponível agora.", details={"error_code": "PROVEDOR_INDISPONIVEL"})
    try:
        conta = await stripe_connect.buscar_conta(gw.stripe_account_id)
    except stripe_connect.StripeConnectErro as exc:
        raise ConflictError(str(exc), details={"error_code": "STRIPE_ERRO"})
    gateway_service.aplicar_estado_stripe(gw, stripe_connect.estado_da_conta(conta))
    await db.commit()
    await db.refresh(gw)
    return await _info(db, tenant_id, gw)


@router.post(
    "/gateway/desconectar",
    response_model=GatewayStatusResponse,
    dependencies=[
        _GATE_BASE,
        Depends(require_group_permission(PermissionFeature.FINANCEIRO, "edit")),
        Depends(require_not_impersonated),
    ],
)
@limiter.limit("10/hour")
async def desconectar_gateway(
    request: Request,
    body: SenhaBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GatewayStatusResponse:
    """Para de cobrar pela conta conectada (a Área volta para a chave PIX + comprovante)."""
    _conferir_senha(current_user, body.senha)
    tenant_id = current_user.tenant_id
    gw = await gateway_service.get_gateway(db, tenant_id, for_update=True)
    if gw is None or gw.status == "desconectado":
        raise ConflictError("Nenhuma conta conectada.", details={"error_code": "SEM_GATEWAY"})
    antes = {"provedor": gw.provedor, "status": gw.status}
    gw.status = "desconectado"
    gw.desconectado_em = utc_now()
    # Mercado Pago: os tokens são apagados ao desconectar (Stripe guarda só o id da conta).
    gw.mp_access_token_enc = None
    gw.mp_refresh_token_enc = None
    gw.mp_token_expira_em = None
    gw.updated_at = utc_now()
    await AuditService(db).log_update(
        tenant_id=tenant_id,
        user_id=current_user.id,
        resource_type="mensalidade_gateway",
        resource_id=gw.id,
        previous_state=antes,
        new_state={"provedor": gw.provedor, "status": "desconectado", "acao": "desconectar"},
    )
    provedor = gw.provedor
    await db.commit()
    await db.refresh(gw)
    await _avisar(db, tenant_id, current_user, provedor, "desconectado")
    return GatewayStatusResponse(
        provedores_disponiveis=gateway_service.provedores_disponiveis(),
        plano_inclui=await gateway_service.plano_inclui(db, tenant_id),
        gateway=await _info(db, tenant_id, gw),
    )


@router.get(
    "/mensalidades/cobrancas",
    response_model=List[CobrancaItem],
    dependencies=[_GATE_BASE, Depends(require_group_permission(PermissionFeature.FINANCEIRO, "view"))],
)
async def listar_cobrancas(
    mes: str = Query(..., description="Mês no formato YYYY-MM"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[CobrancaItem]:
    """Cobranças automáticas do mês (PIX/boleto), a mais recente primeiro."""
    try:
        mes_date: date = parse_mes(mes)
    except ValueError:
        raise ValidationError("Mês inválido. Use AAAA-MM.", details={"error_code": "MES_INVALIDO"})
    rows = (
        await db.execute(
            select(MensalidadeCobranca, Medium.nome)
            .join(Medium, Medium.id == MensalidadeCobranca.mediun_id)
            .where(
                MensalidadeCobranca.tenant_id == current_user.tenant_id,
                Medium.tenant_id == current_user.tenant_id,
                MensalidadeCobranca.mes_referencia == mes_date,
            )
            .order_by(MensalidadeCobranca.created_at.desc())
        )
    ).all()
    return [
        CobrancaItem(
            id=c.id,
            mediun_id=c.mediun_id,
            mediun_nome=nome,
            mes=c.mes_referencia.strftime("%Y-%m"),
            valor=float(c.valor),
            provedor=c.provedor,
            metodo=c.metodo,
            status=c.status,
            criada_em=c.created_at,
            expira_em=c.expira_em,
            pago_em=c.pago_em,
            valor_pago=float(c.valor_pago) if c.valor_pago is not None else None,
        )
        for c, nome in rows
    ]
