"""Rota só de leitura do bot Crescimento: funil de terreiros para o painel semanal e o break-even.

``GET /api/v1/bots/crescimento/resumo`` — protegida por ``GIRAHUB_READ_TOKEN`` no header
``Authorization: Bearer <token>``, comparado em tempo constante. Sem a variável no servidor
(ou com valor curto demais), a rota fica desligada e responde 401 para qualquer chamada. Login
não serve: nem o cookie nem o JWT de SUPER_ADMIN passam aqui (o ``jwt_middleware`` pula
``/api/v1/bots/`` e a única credencial aceita é o token do bot).

Cross-tenant por design (como ``platform/``): lê todos os terreiros, só com ``SELECT``.

Devolve, por terreiro: id, nome, plano, status, data de criação, fim do teste, último acesso
de qualquer usuário e giras no mês corrente (fuso de Brasília). Nos totais: terreiros por plano
e por status, receita mensal recorrente estimada pelos preços vigentes (``PLAN_LIMITS``, espelho
de ``frontend/src/constants/plans.ts``) e os próprios preços.

Fora, de propósito: dado pessoal de médium, consulente ou usuário (nome, e-mail, telefone,
CPF), conteúdo de gira e financeiro dos terreiros. Cidade/UF também fica de fora: o terreiro não
tem esse dado estruturado (só ``tenant_config.endereco``, texto livre).
"""
from __future__ import annotations

import hmac
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.database import get_db
from src.core.limiter import limiter
from src.core.tz import APP_TZ, local_day_bounds_utc
from src.models.audit_logs import AuditLog
from src.models.giras import Gira
from src.models.subscriptions import PlanType, Subscription
from src.models.tenants import Tenant
from src.models.user_sessions import UserSession
from src.repositories.subscription_repo import PLAN_LIMITS
from src.services.billing_metrics import BillingCategory, billing_category

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/bots/crescimento", tags=["bots"])

# Tenant de demonstração (mesmo slug de public/stats.py): o seed dele distorceria o funil.
DEMO_TENANT_SLUG = "terreiro-modelo"
# Token mais curto que isso é tratado como ausente: `openssl rand -hex 32` gera 64 caracteres.
MIN_TOKEN_LEN = 32

STATUS = ("pagante", "teste", "bonificado", "gratuito", "sem_cobranca", "suspenso", "cancelado", "inativo")
_STATUS_POR_CATEGORIA = {
    BillingCategory.PAGANTE: "pagante",
    BillingCategory.EM_TESTE: "teste",
    BillingCategory.BONIFICADO: "bonificado",
    BillingCategory.GRATUITO: "gratuito",
    BillingCategory.SEM_COBRANCA: "sem_cobranca",
    BillingCategory.SUSPENSA: "suspenso",
    BillingCategory.CANCELADA: "cancelado",
}


def _nao_autorizado() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token de leitura inválido ou ausente",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_read_token(authorization: Optional[str] = Header(default=None)) -> None:
    """Aceita só ``Authorization: Bearer <GIRAHUB_READ_TOKEN>``; sem a variável, sempre 401."""
    esperado = settings.GIRAHUB_READ_TOKEN or ""
    if len(esperado) < MIN_TOKEN_LEN:
        if esperado:
            logger.warning("GIRAHUB_READ_TOKEN curto demais: rota do bot Crescimento desligada")
        raise _nao_autorizado()
    esquema, _, recebido = (authorization or "").partition(" ")
    if esquema.lower() != "bearer":
        raise _nao_autorizado()
    if not hmac.compare_digest(recebido.strip().encode(), esperado.encode()):
        raise _nao_autorizado()


class TerreiroResumo(BaseModel):
    id: UUID
    nome: str
    plano: str
    status: str
    criado_em: Optional[datetime]
    fim_do_teste: Optional[datetime]
    ultimo_acesso: Optional[datetime]
    giras_no_mes: int


class Totais(BaseModel):
    terreiros: int
    por_plano: dict[str, int]
    por_status: dict[str, int]
    # status x plano, para o funil (ex.: quantos "teste" estão no Pro)
    por_status_e_plano: dict[str, dict[str, int]]
    mrr_estimado: float
    mrr_potencial_testes: float


class ResumoCrescimento(BaseModel):
    gerado_em: datetime
    mes_referencia: str
    precos_vigentes: dict[str, float]
    totais: Totais
    terreiros: list[TerreiroResumo]


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _status(sub: Optional[Subscription], inativo: bool) -> str:
    if inativo:
        return "inativo"
    if sub is None:
        return "gratuito"
    return _STATUS_POR_CATEGORIA[billing_category(sub, tenant_deleted=False)]


def _mes_local(agora: datetime) -> tuple[date, datetime, datetime]:
    """Primeiro dia do mês corrente em Brasília e o intervalo [início, fim) dele em UTC."""
    primeiro = agora.astimezone(APP_TZ).date().replace(day=1)
    proximo = date(primeiro.year + (primeiro.month == 12), primeiro.month % 12 + 1, 1)
    ini, fim = local_day_bounds_utc(primeiro, proximo - timedelta(days=1))
    return primeiro, ini, fim


async def montar_resumo(db: AsyncSession, agora: Optional[datetime] = None) -> ResumoCrescimento:
    agora = agora or datetime.now(timezone.utc)
    primeiro, ini_mes, fim_mes = _mes_local(agora)

    def corr(stmt):
        return stmt.correlate(Tenant).scalar_subquery()

    giras_mes = corr(
        select(func.count(Gira.id)).where(
            Gira.tenant_id == Tenant.id,
            Gira.deleted_at.is_(None),
            Gira.data_inicio >= ini_mes,
            Gira.data_inicio < fim_mes,
        )
    )
    # Último acesso = sessão mais recente OU última ação registrada no terreiro (a sessão some no
    # logout). Mesma regra de services/activation_service.py: ação da plataforma não conta.
    ultima_sessao = corr(select(func.max(UserSession.last_used_at)).where(UserSession.tenant_id == Tenant.id))
    ultima_acao = corr(
        select(func.max(AuditLog.created_at)).where(
            AuditLog.tenant_id == Tenant.id,
            or_(AuditLog.details.is_(None), ~AuditLog.details.has_key("platform_action")),
        )
    )

    stmt = (
        select(
            Tenant.id,
            Tenant.name,
            Tenant.created_at,
            Tenant.is_active,
            Tenant.self_deactivated_at,
            Subscription,
            giras_mes,
            ultima_sessao,
            ultima_acao,
        )
        .outerjoin(Subscription, Subscription.tenant_id == Tenant.id)
        .where(Tenant.deleted_at.is_(None), Tenant.slug != DEMO_TENANT_SLUG)
        .order_by(Tenant.created_at.asc())
    )
    rows = (await db.execute(stmt)).all()

    precos = {p.value: float(PLAN_LIMITS[p]["price"]) for p in PlanType}
    por_plano = {p.value: 0 for p in PlanType}
    por_status = {s: 0 for s in STATUS}
    por_status_e_plano = {s: {p.value: 0 for p in PlanType} for s in STATUS}
    mrr = 0.0
    mrr_testes = 0.0
    terreiros: list[TerreiroResumo] = []

    for tid, nome, criado_em, is_active, auto_desativado, sub, n_giras, sessao, acao in rows:
        plano = sub.plan.value if sub is not None else PlanType.FREE.value
        st = _status(sub, inativo=(not is_active) or auto_desativado is not None)
        acessos = [d for d in (_aware(sessao), _aware(acao)) if d]
        terreiros.append(
            TerreiroResumo(
                id=tid,
                nome=nome,
                plano=plano,
                status=st,
                criado_em=_aware(criado_em),
                fim_do_teste=_aware(sub.trial_ends_at) if sub is not None and sub.is_trial else None,
                ultimo_acesso=max(acessos, default=None),
                giras_no_mes=int(n_giras or 0),
            )
        )
        por_plano[plano] += 1
        por_status[st] += 1
        por_status_e_plano[st][plano] += 1
        if st == "pagante":
            mrr += precos[plano]
        elif st == "teste":
            mrr_testes += precos[plano]

    return ResumoCrescimento(
        gerado_em=agora,
        mes_referencia=primeiro.strftime("%Y-%m"),
        precos_vigentes=precos,
        totais=Totais(
            terreiros=len(terreiros),
            por_plano=por_plano,
            por_status=por_status,
            por_status_e_plano=por_status_e_plano,
            mrr_estimado=mrr,
            mrr_potencial_testes=mrr_testes,
        ),
        terreiros=terreiros,
    )


@router.get(
    "/resumo",
    response_model=ResumoCrescimento,
    dependencies=[Depends(require_read_token)],
)
@limiter.limit("30/minute")
async def get_resumo(request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> ResumoCrescimento:
    response.headers["Cache-Control"] = "no-store"
    return await montar_resumo(db)
