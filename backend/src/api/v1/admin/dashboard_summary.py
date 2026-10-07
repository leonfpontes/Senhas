"""Admin Dashboard Summary — aggregated endpoint for the dashboard home."""
import logging
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, computed_field
from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.database import get_db
from src.core.onboarding import read_principal_dor
from src.models import User
from src.models.contas_financeiras import ContaFinanceira
from src.models.estoque import EstoqueGrupo, EstoqueItem, EstoqueMovimentacao
from src.models.giras import Gira
from src.models.mediuns import Medium
from src.models.mensalidades import MensalidadeConfig, MensalidadePagamento, MensalidadeStatus
from src.models.site import SiteStatus, SiteVersion, TenantSite
from src.models.senha_controls import SenhaControl
from src.models.tenant_config import TenantConfig
from src.models.tenants import Tenant
from src.models.tickets import Ticket
from src.models.subscriptions import PlanType
from src.api.dependencies import get_current_user
from src.core.errors import InsufficientPermissionsError
from src.repositories.ticket_analytics_repo import TicketAnalyticsRepository
from src.services.plan_features import get_effective_plan_features
from src.repositories.gira_repo import GiraRepository
from src.repositories.subscription_repo import SubscriptionRepository

router = APIRouter(prefix="/api/v1/admin", tags=["admin-dashboard"])
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------
class UpcomingGiraItem(BaseModel):
    id: str
    nome: str
    data_inicio: str
    max_tickets: Optional[int] = None
    current_count: int = 0
    sponsor_count: int = 0
    is_open: bool = False


class TicketStats(BaseModel):
    total_emitted: int = 0
    total_used: int = 0
    total_cancelled: int = 0
    usage_rate: float = 0.0
    emitted_today: int = 0
    used_today: int = 0
    walk_in_total: int = 0


class DailyDistItem(BaseModel):
    date: str
    total: int = 0
    common: int = 0
    sponsor: int = 0
    walk_in: int = 0


class PeakHourItem(BaseModel):
    hour: int
    count: int = 0


class EstoqueAlertItem(BaseModel):
    item_id: str
    item_nome: str
    grupo_nome: Optional[str] = None
    unidade_medida: str = "UN"
    saldo: int = 0
    estoque_minimo: int = 0
    status: str = "ok"


class EstoqueSummary(BaseModel):
    total_itens: int = 0
    total_grupos: int = 0
    itens_ok: int = 0
    itens_atencao: int = 0
    itens_critico: int = 0


class PlanBadge(BaseModel):
    name: str = "free"
    label: str = "Free"
    status: str = "active"


# Trilhas do checklist de primeiros passos (P-07 + checklist por dor, 2026-10-07): a resposta do
# cadastro "o que você mais precisa resolver" escolhe a trilha; cada passo tem uma condição de
# "feito" calculada de dados reais (ver `_get_onboarding_status`). Sem resposta (tenants antigos)
# ou "Ainda estou conhecendo" → a trilha da primeira gira de sempre. Espelhado no frontend em
# `components/admin/onboardingTrilhas.ts` (textos, links e travas de plano/permissão).
TRILHA_POR_DOR: dict[str, str] = {
    "senhas": "senhas",
    "mediuns": "mediuns",
    "financeiro": "financeiro",
    "divulgacao": "site",
    "estoque": "estoque",
    "outro": "gira",
}
TRILHA_PADRAO = "gira"
TRILHA_PASSOS: dict[str, tuple[str, ...]] = {
    "gira": ("gira", "share", "tickets", "porta"),
    "senhas": ("gira", "senhas", "share", "tickets"),
    "mediuns": ("medium", "mensalidade", "gira"),
    "financeiro": ("mensalidade", "pagamento", "lancamento", "gira"),
    "site": ("site", "publicar", "gira"),
    "estoque": ("grupo", "item", "movimentacao", "gira"),
}


def trilha_da_dor(principal_dor: Optional[str]) -> str:
    return TRILHA_POR_DOR.get(principal_dor or "", TRILHA_PADRAO)


class OnboardingStep(BaseModel):
    key: str
    done: bool = False


class OnboardingStatus(BaseModel):
    """Checklist de primeiros passos do dashboard — derivado só de dados existentes.

    Trilha padrão ("gira"): o ciclo que gera valor (análise de 2026-10-05: 88% das senhas
    vêm do link público e quem usa a Porta é quem paga): criar gira → compartilhar o
    link → receber senhas pelo link → usar a Porta no dia da gira. As outras trilhas
    seguem a dor do cadastro e terminam, quando faz sentido, na primeira gira.
    """
    has_gira: bool = False
    public_tickets: int = 0
    door_used: bool = False
    public_link: Optional[str] = None
    # Resposta do cadastro ("o que você mais precisa resolver"); define a
    # trilha do tour de boas-vindas e do checklist. None para tenants anteriores à pergunta.
    principal_dor: Optional[str] = None
    trilha: str = TRILHA_PADRAO
    steps: List[OnboardingStep] = [OnboardingStep(key=k) for k in TRILHA_PASSOS[TRILHA_PADRAO]]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def completed(self) -> bool:
        """Todos os passos da trilha feitos (na trilha "gira": gira + senha pelo link + Porta)."""
        return bool(self.steps) and all(s.done for s in self.steps)


class DashboardSummaryResponse(BaseModel):
    upcoming_giras: List[UpcomingGiraItem] = []
    ticket_stats: TicketStats = TicketStats()
    daily_distribution: List[DailyDistItem] = []
    peak_hours: List[PeakHourItem] = []
    estoque_alerts: List[EstoqueAlertItem] = []
    estoque_summary: Optional[EstoqueSummary] = None
    plan: PlanBadge = PlanBadge()
    onboarding: OnboardingStatus = OnboardingStatus()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _get_onboarding_status(db: AsyncSession, tenant_id: UUID) -> OnboardingStatus:
    """Estado do checklist em UMA consulta (subqueries escalares, todas
    filtradas por tenant_id e ignorando soft-deleted).

    - public_tickets: senhas emitidas pelo próprio consulente via link público
      (`emitido_por_id IS NULL`); walk-in e emissão pela equipe não contam,
      porque o passo mede se o link chegou aos consulentes.
    - door_used: alguma senha chamada ou com check-in — sinal de uso da Porta.
    - Sinais das outras trilhas (todos `EXISTS`, baratos com os índices por tenant):
      senhas configuradas (gira com `max_tickets` > 0), 1º médium, mensalidade com valor,
      1º pagamento de mensalidade, 1º lançamento manual (fora o espelho das mensalidades,
      `external_ref` "mensalidade:..."), site salvo (alguma versão) ou publicado, e grupo,
      item e movimentação de estoque.
    """
    has_gira = exists().where(Gira.tenant_id == tenant_id, Gira.deleted_at.is_(None))
    public_tickets = (
        select(func.count(Ticket.id))
        .where(
            Ticket.tenant_id == tenant_id,
            Ticket.deleted_at.is_(None),
            Ticket.emitido_por_id.is_(None),
        )
        .scalar_subquery()
    )
    door_used = exists().where(
        Ticket.tenant_id == tenant_id,
        Ticket.deleted_at.is_(None),
        or_(Ticket.checkin_em.is_not(None), Ticket.chamado_em.is_not(None)),
    )
    slug = select(Tenant.slug).where(Tenant.id == tenant_id).scalar_subquery()
    custom_settings = (
        select(TenantConfig.custom_settings)
        .where(TenantConfig.tenant_id == tenant_id, TenantConfig.deleted_at.is_(None))
        .limit(1)
        .scalar_subquery()
    )
    senhas_configuradas = exists().where(
        Gira.tenant_id == tenant_id, Gira.deleted_at.is_(None), Gira.max_tickets > 0
    )
    tem_medium = exists().where(Medium.tenant_id == tenant_id, Medium.deleted_at.is_(None))
    mensalidade_configurada = exists().where(
        MensalidadeConfig.tenant_id == tenant_id,
        MensalidadeConfig.deleted_at.is_(None),
        MensalidadeConfig.ativo.is_(True),
        MensalidadeConfig.valor_mensal > 0,
    )
    mensalidade_paga = exists().where(
        MensalidadePagamento.tenant_id == tenant_id,
        MensalidadePagamento.deleted_at.is_(None),
        MensalidadePagamento.status == MensalidadeStatus.PAGO,
    )
    tem_lancamento = exists().where(
        ContaFinanceira.tenant_id == tenant_id,
        ContaFinanceira.deleted_at.is_(None),
        or_(ContaFinanceira.external_ref.is_(None), ~ContaFinanceira.external_ref.like("mensalidade:%")),
    )
    site_publicado = exists().where(
        TenantSite.tenant_id == tenant_id,
        TenantSite.deleted_at.is_(None),
        TenantSite.status == SiteStatus.PUBLISHED,
    )
    site_salvo = exists().where(SiteVersion.tenant_id == tenant_id)
    tem_grupo = exists().where(EstoqueGrupo.tenant_id == tenant_id, EstoqueGrupo.deleted_at.is_(None))
    tem_item = exists().where(EstoqueItem.tenant_id == tenant_id, EstoqueItem.deleted_at.is_(None))
    tem_movimentacao = exists().where(
        EstoqueMovimentacao.tenant_id == tenant_id, EstoqueMovimentacao.deleted_at.is_(None)
    )

    row = (
        await db.execute(
            select(
                has_gira.label("has_gira"),
                public_tickets.label("public_tickets"),
                door_used.label("door_used"),
                slug.label("slug"),
                custom_settings.label("custom_settings"),
                senhas_configuradas.label("senhas_configuradas"),
                tem_medium.label("tem_medium"),
                mensalidade_configurada.label("mensalidade_configurada"),
                mensalidade_paga.label("mensalidade_paga"),
                tem_lancamento.label("tem_lancamento"),
                site_publicado.label("site_publicado"),
                site_salvo.label("site_salvo"),
                tem_grupo.label("tem_grupo"),
                tem_movimentacao.label("tem_movimentacao"),
                tem_item.label("tem_item"),
            )
        )
    ).one()
    sinal = dict(row._mapping)
    base = settings.FRONTEND_URL.rstrip("/")
    public_count = int(sinal.get("public_tickets") or 0)
    principal_dor = read_principal_dor(sinal.get("custom_settings"))
    trilha = trilha_da_dor(principal_dor)
    feito = {
        "gira": bool(sinal.get("has_gira")),
        "senhas": bool(sinal.get("senhas_configuradas")),
        # O frontend também conta o "já compartilhei" guardado no navegador.
        "share": public_count > 0,
        "tickets": public_count > 0,
        "porta": bool(sinal.get("door_used")),
        "medium": bool(sinal.get("tem_medium")),
        "mensalidade": bool(sinal.get("mensalidade_configurada")),
        "pagamento": bool(sinal.get("mensalidade_paga")),
        "lancamento": bool(sinal.get("tem_lancamento")),
        "site": bool(sinal.get("site_salvo")) or bool(sinal.get("site_publicado")),
        "publicar": bool(sinal.get("site_publicado")),
        "grupo": bool(sinal.get("tem_grupo")),
        "item": bool(sinal.get("tem_item")),
        "movimentacao": bool(sinal.get("tem_movimentacao")),
    }
    return OnboardingStatus(
        has_gira=feito["gira"],
        public_tickets=public_count,
        door_used=feito["porta"],
        # Mesmo link de giras_crud.get_unified_links: resolve a próxima gira a
        # cada visita, então pode ser compartilhado uma vez só.
        public_link=f"{base}/public/{sinal['slug']}/senha" if sinal.get("slug") else None,
        principal_dor=principal_dor,
        trilha=trilha,
        steps=[OnboardingStep(key=k, done=feito[k]) for k in TRILHA_PASSOS[trilha]],
    )


async def _get_upcoming_giras(
    db: AsyncSession, tenant_id: UUID, limit: int = 3
) -> List[UpcomingGiraItem]:
    """Get next upcoming giras with their ticket counts."""
    gira_repo = GiraRepository(db)
    giras = await gira_repo.get_upcoming_giras(tenant_id, limit=limit)

    if not giras:
        return []

    # Fetch current ticket counts: regular (non-sponsor) and sponsor
    gira_ids = [g.id for g in giras]
    stmt = (
        select(SenhaControl.gira_id, SenhaControl.total_emitido, SenhaControl.slots_returned, SenhaControl.is_sponsor)
        .where(
            and_(
                SenhaControl.tenant_id == tenant_id,
                SenhaControl.gira_id.in_(gira_ids),
            )
        )
    )
    rows = (await db.execute(stmt)).all()
    count_map: Dict[UUID, int] = {}
    sponsor_map: Dict[UUID, int] = {}
    for row in rows:
        net_count = max(0, row.total_emitido - row.slots_returned)
        if row.is_sponsor:
            sponsor_map[row.gira_id] = sponsor_map.get(row.gira_id, 0) + net_count
        else:
            count_map[row.gira_id] = count_map.get(row.gira_id, 0) + net_count

    now = datetime.now(timezone.utc)
    result = []
    for g in giras:
        is_open = False
        if g.release_start_at and g.release_end_at:
            is_open = g.release_start_at <= now <= g.release_end_at
        result.append(
            UpcomingGiraItem(
                id=str(g.id),
                nome=g.nome,
                data_inicio=g.data_inicio.isoformat(),
                max_tickets=g.max_tickets,
                current_count=count_map.get(g.id, 0),
                sponsor_count=sponsor_map.get(g.id, 0),
                is_open=is_open,
            )
        )
    return result


async def _get_estoque_data(
    db: AsyncSession, tenant_id: UUID, has_estoque: bool
) -> tuple[List[EstoqueAlertItem], Optional[EstoqueSummary]]:
    """Get stock alerts and summary. Returns empty if feature is not enabled."""
    if not has_estoque:
        return [], None

    # Lazy import to avoid circular deps when estoque module is not used
    from src.repositories.estoque_repo import (
        EstoqueGrupoRepository,
        EstoqueMovimentacaoRepository,
    )

    mov_repo = EstoqueMovimentacaoRepository(db)
    grupo_repo = EstoqueGrupoRepository(db)

    posicao = await mov_repo.get_posicao_estoque(tenant_id)
    grupos = await grupo_repo.list_all(tenant_id)

    alerts: List[EstoqueAlertItem] = []
    ok_count = atencao_count = critico_count = 0

    for row in posicao:
        item = row["item"]
        saldo = row["saldo"]
        minimo = item.estoque_minimo or 0

        if minimo > 0 and saldo <= 0:
            status = "critico"
            critico_count += 1
        elif minimo > 0 and saldo <= minimo:
            status = "atencao"
            atencao_count += 1
        else:
            status = "ok"
            ok_count += 1

        if status in ("critico", "atencao"):
            alerts.append(
                EstoqueAlertItem(
                    item_id=str(item.id),
                    item_nome=item.nome,
                    grupo_nome=item.grupo.nome if item.grupo else None,
                    unidade_medida=item.unidade_medida or "UN",
                    saldo=saldo,
                    estoque_minimo=minimo,
                    status=status,
                )
            )

    summary = EstoqueSummary(
        total_itens=len(posicao),
        total_grupos=len(grupos),
        itens_ok=ok_count,
        itens_atencao=atencao_count,
        itens_critico=critico_count,
    )

    # Sort: critico first, then atencao
    alerts.sort(key=lambda a: (0 if a.status == "critico" else 1, a.item_nome))

    return alerts, summary


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.get("/dashboard-summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardSummaryResponse:
    """Aggregated dashboard data for the admin home page.

    Returns upcoming giras, ticket KPIs, daily distribution (7 days),
    peak hours, stock alerts, and plan badge — all in a single request.
    """
    if not current_user.is_operator_or_admin:
        raise InsufficientPermissionsError("Admin required")

    tenant_id = current_user.tenant_id
    analytics_repo = TicketAnalyticsRepository(db)
    sub_repo = SubscriptionRepository(db)

    step = "get_subscription"
    try:
        # Determine plan info + feature flags
        sub = await sub_repo.get_by_tenant(tenant_id)
        plan_type = sub.plan if sub else PlanType.FREE
        # Catálogo + status da assinatura (P-05): sem alerta de estoque quando o
        # módulo está bloqueado (o endpoint de estoque responderia 402/403).
        has_estoque = get_effective_plan_features(sub).estoque_controle

        plan_badge = PlanBadge(
            name=plan_type.value if hasattr(plan_type, "value") else str(plan_type),
            label={"free": "Free", "basic": "Basic", "pro": "Pro", "premium": "Premium"}.get(
                plan_type.value if hasattr(plan_type, "value") else "free", "Free"
            ),
            status=sub.status.value if sub else "active",
        )

        step = "get_upcoming_giras"
        upcoming_giras = await _get_upcoming_giras(db, tenant_id, limit=3)

        step = "get_total_stats"
        total_stats = await analytics_repo.get_total_stats(tenant_id=tenant_id)

        step = "get_today_stats"
        today_stats = await analytics_repo.get_today_stats(tenant_id=tenant_id)

        step = "get_daily_distribution"
        daily_dist = await analytics_repo.get_daily_distribution(tenant_id=tenant_id, days=7)

        step = "get_category_breakdown"
        category_bkdn = await analytics_repo.get_category_breakdown(tenant_id=tenant_id)

        step = "get_peak_hours"
        peak_hours = await analytics_repo.get_peak_hours(tenant_id=tenant_id, days=7)

        step = "get_estoque_data"
        estoque_result = await _get_estoque_data(db, tenant_id, has_estoque)
        estoque_alerts, estoque_summary = estoque_result

        step = "get_onboarding_status"
        onboarding = await _get_onboarding_status(db, tenant_id)

        ticket_stats = TicketStats(
            total_emitted=total_stats["total_emitted"],
            total_used=total_stats["total_used"],
            total_cancelled=total_stats["total_cancelled"],
            usage_rate=total_stats["usage_rate"],
            emitted_today=today_stats["emitted_today"],
            used_today=today_stats["used_today"],
            walk_in_total=category_bkdn.get("walk_in", 0),
        )

        return DashboardSummaryResponse(
            upcoming_giras=upcoming_giras,
            ticket_stats=ticket_stats,
            daily_distribution=[DailyDistItem(**d) for d in daily_dist],
            peak_hours=[PeakHourItem(**h) for h in peak_hours[:5]],
            estoque_alerts=estoque_alerts,
            estoque_summary=estoque_summary,
            plan=plan_badge,
            onboarding=onboarding,
        )

    except Exception as exc:
        tb = traceback.format_exc()
        logger.error("dashboard-summary FAILED at step=%s | %s\n%s", step, exc, tb)
        raise
