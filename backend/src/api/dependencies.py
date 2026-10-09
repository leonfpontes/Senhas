"""FastAPI dependency injection utilities (T022)."""
from dataclasses import dataclass
from fastapi import Request, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any, Optional
from datetime import timezone
import uuid

from ..core.database import get_db
from ..core.auth_cookies import is_impersonated_request
from ..core.errors import (
    ForbiddenError,
    UnauthorizedError,
    InsufficientPermissionsError,
    MultiTenantViolationError,
    NotFoundError,
    GroupPermissionDeniedError,
)
from ..models import Medium, User, UserRole, PermissionFeature, PlanType
from ..middleware.tenant_context import get_tenant_id
from ..repositories.subscription_repo import PLAN_LIMITS, SubscriptionRepository
from ..services.permission_service import PermissionService
from ..services.medium_area import area_medium_enabled_by_tenant, area_medium_liberada, get_linked_medium
from ..services.plan_features import (
    BLOCK_INACTIVE,
    BLOCK_MESSAGES,
    BLOCK_SUSPENDED,
    BLOCK_TRIAL_ENDED,
    BLOCK_PIX_EXPIRED,
    PLAN_FEATURE_NAMES,
    _get_plan_features,
    feature_min_plan,
    subscription_block_reason,
)
from sqlalchemy import select


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Get current authenticated user from JWT token.
    
    Args:
        request: FastAPI request with JWT token data
        db: Database session
        
    Returns:
        Current User object
        
    Raises:
        UnauthorizedError: If user not found or token invalid
    """
    # Get user_id from JWT token (set by jwt_middleware)
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise UnauthorizedError("Usuário não identificado")

    # Get user from database
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    # Conta excluída (soft delete) não autentica, mesmo com token ainda válido.
    if not user or not user.is_active or user.deleted_at is not None:
        raise UnauthorizedError("Usuário não encontrado ou inativo")

    # Password change / "logout all devices" invalidates every token issued
    # before that moment — even ones that haven't hit their own exp yet. Cheap
    # to check here: `user` is already loaded, no extra query.
    if user.sessions_revoked_at is not None:
        token_data = getattr(request.state, "token", None)
        token_iat = getattr(token_data, "iat", None)
        if token_iat is not None:
            revoked_at = user.sessions_revoked_at
            if token_iat.tzinfo is None:
                token_iat = token_iat.replace(tzinfo=timezone.utc)
            if revoked_at.tzinfo is None:
                revoked_at = revoked_at.replace(tzinfo=timezone.utc)
            if token_iat < revoked_at:
                raise UnauthorizedError("Sessão revogada")

    return user


async def get_tenant_from_request(request: Request) -> uuid.UUID:
    """Get tenant_id from request context (set by tenant_context_middleware).
    
    Args:
        request: FastAPI request
        
    Returns:
        Tenant ID
        
    Raises:
        MultiTenantViolationError: If tenant_id not in context
    """
    return get_tenant_id(request)


_ROLE_HIERARCHY: dict[UserRole, int] = {
    # Fora do back-office (AM-02): `medium` não passa em nenhum require_role.
    UserRole.MEDIUM: -1,
    UserRole.OPERATOR: 0,
    UserRole.ADMIN: 1,
    UserRole.SUPER_ADMIN: 2,
}


async def require_role(
    required_role: UserRole,
) -> callable:
    """Dependency factory for role-based access control (RBAC).

    Uses explicit numeric hierarchy: OPERATOR=0 < ADMIN=1 < SUPER_ADMIN=2.
    A user with a higher or equal level passes; lower levels are denied.

    Usage in endpoint:
        @router.get("/admin-only", dependencies=[Depends(require_role(UserRole.ADMIN))])
    """
    async def check_role(user: User = Depends(get_current_user)):
        user_level = _ROLE_HIERARCHY.get(user.role, -1)
        required_level = _ROLE_HIERARCHY.get(required_role, 99)
        if user_level < required_level:
            raise InsufficientPermissionsError(required_role.value)
        return None

    return check_role


async def validate_tenant_access(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> uuid.UUID:
    """Validate that current user has access to requested tenant.
    
    Args:
        request: FastAPI request
        current_user: Current authenticated user
        
    Returns:
        Tenant ID
        
    Raises:
        MultiTenantViolationError: If user doesn't belong to tenant
    """
    tenant_id = getattr(request.state, "tenant_id", None)
    
    # Super admin can access any tenant
    if current_user.is_super_admin:
        return tenant_id
    
    # Regular user can only access their own tenant
    if current_user.tenant_id != tenant_id:
        raise MultiTenantViolationError()
    
    return tenant_id


def require_group_permission(feature: PermissionFeature, action: str):
    """Dependency factory for group-based permission checking.
    
    Verifies that the user has the required group permissions for the specific action on a feature.
    """
    async def dependency(
        request: Request,
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        token_data = getattr(request.state, "token", None)
        permission_service = PermissionService(db)
        
        has_perm = await permission_service.check_permission(
            user=user,
            feature=feature,
            action=action,
            token_data=token_data,
        )
        if not has_perm:
            raise GroupPermissionDeniedError(feature.value, action)

        return None

    return dependency


def require_any_group_permission(*features: PermissionFeature, action: str):
    """Dependency factory that grants access if the user has the given action
    on ANY of the listed features.

    Used by read endpoints shared across pages backed by different permission
    groups — e.g. Relatório de Gira reads giras/tickets/door-stats, each
    normally gated by its own feature (GIRAS/TICKETS/PORTA) elsewhere. Without
    this, a group granted only RELATORIO_GIRA view can open the report page
    but every underlying fetch 403s, leaving the ticket listing silently empty.
    """
    async def dependency(
        request: Request,
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        token_data = getattr(request.state, "token", None)
        permission_service = PermissionService(db)

        for feature in features:
            has_perm = await permission_service.check_permission(
                user=user,
                feature=feature,
                action=action,
                token_data=token_data,
            )
            if has_perm:
                return None

        raise GroupPermissionDeniedError(features[0].value, action)

    return dependency


# ── Back-office × Área do Médium (AM-02) ────────────────────────────────────


async def require_backoffice(user: User = Depends(get_current_user)) -> None:
    """Recusa o papel `medium` (403) — vai no `admin_router` inteiro.

    Fecha de uma vez todas as rotas `/api/v1/admin/*`, inclusive as que só usam
    `get_current_user` (dashboard, branding, chat de suporte, `/me/permissions`).
    O papel vem do usuário carregado do banco, não do token: rebaixar alguém para
    `medium` vale na próxima requisição. Impersonar um usuário `medium` também
    leva 403 aqui (a impersonação faria bypass dos grupos).
    Sem sessão o `get_current_user` já responde 401.
    """
    if user.role == UserRole.MEDIUM:
        raise ForbiddenError(
            "Sua conta não tem acesso ao painel do terreiro.",
            details={"error_code": "BACKOFFICE_REQUIRED"},
        )
    return None


@dataclass(frozen=True)
class MediumContext:
    """Quem está usando a Área do Médium (`require_medium`).

    `tenant_id` vem do usuário logado e `medium` do vínculo `mediuns.user_id` —
    rotas de `/api/v1/medium/*` NUNCA recebem `medium_id` na URL ou no corpo:
    tudo é "meu" (`ctx.medium.id`, `ctx.tenant_id`).
    """

    user: User
    tenant_id: uuid.UUID
    medium: Medium
    token: Any = None

    @property
    def is_impersonated(self) -> bool:
        return bool(getattr(self.token, "impersonated_by", None)) if self.token else False


AREA_MEDIUM_INDISPONIVEL = "A Área do Médium não está disponível para a sua conta."
AREA_MEDIUM_NAO_LIBERADA = "A Área do Médium ainda não foi liberada para este terreiro."


async def require_medium(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MediumContext:
    """Resolve o médium do usuário logado (docs/plano-area-do-medium.md §6.6).

    1. usuário autenticado (`get_current_user`: 401 sem sessão/inativo);
    2. tenant do próprio usuário (nunca do corpo/URL); sem tenant → 403;
    3. médium com `user_id` = usuário, do mesmo tenant, não excluído e ativo → senão 403;
    4. plano com `area_medium` e status da assinatura em dia (403/402, `check_plan_feature`);
    5. Área ligada na configuração do terreiro (AM-10, `tenant_configs.area_medium_ativa`,
       `medium_area.area_medium_enabled_by_tenant`) → senão 403.
    Vale para qualquer papel: operador/admin vinculado também usa a Área.
    """
    tenant_id = user.tenant_id
    # Conta excluída (soft delete) não usa a Área, mesmo com token ainda válido.
    if tenant_id is None or user.deleted_at is not None:
        raise ForbiddenError(AREA_MEDIUM_INDISPONIVEL, details={"error_code": "MEDIUM_AREA_UNAVAILABLE"})
    medium = await get_linked_medium(db, tenant_id, user.id)
    if medium is None:
        raise ForbiddenError(AREA_MEDIUM_INDISPONIVEL, details={"error_code": "MEDIUM_AREA_UNAVAILABLE"})
    await check_plan_feature(user, db, "area_medium")
    if not await area_medium_enabled_by_tenant(db, tenant_id):
        raise ForbiddenError(AREA_MEDIUM_INDISPONIVEL, details={"error_code": "MEDIUM_AREA_UNAVAILABLE"})
    return MediumContext(user=user, tenant_id=tenant_id, medium=medium, token=getattr(request.state, "token", None))


async def require_not_impersonated(request: Request) -> None:
    """Recusa (403) escrita feita sob impersonação.

    Na Área do Médium o suporte pode VER o que o médium vê, mas não envia
    comprovante, não marca leitura nem edita perfil em nome dele (§6.9, D-06).
    Uso: `@router.post(..., dependencies=[Depends(require_not_impersonated)])`.
    """
    if is_impersonated_request(request):
        raise InsufficientPermissionsError("Operação não permitida durante impersonação.")
    return None


# ── Super admin (rotas /api/v1/platform/*) ──────────────────────────────────


async def require_super_admin(user: User = Depends(get_current_user)) -> User:
    """Exige SUPER_ADMIN de plataforma (sem tenant). Único no código desde o P-05.

    Super admin impersonando (token com tenant_id) NÃO passa: as rotas de
    plataforma são cross-tenant e não devem ser usadas de dentro de um tenant.
    """
    if user.role != UserRole.SUPER_ADMIN or user.tenant_id is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas SUPER_ADMIN pode acessar esta operação",
        )
    return user


# ── Gate de plano (P-05) ────────────────────────────────────────────────────
#
# Semântica única (detalhes em services/plan_features.py):
#   1. o plano contratado inclui a feature, senão 403;
#   2. o status da assinatura permite uso pago (ACTIVE, trial local não vencido,
#      CANCELLED/EXPIRED só no FREE), senão 402.
# A ordem é plano → status: 403 diz "não está no seu plano" (pagar não resolve);
# 402 só aparece quando regularizar a assinatura devolveria o acesso.

# Nome exibido de cada feature nas mensagens de 403. O plano mínimo vem do
# catálogo (`feature_min_plan`), então a mensagem acompanha a matriz de planos
# sem precisar ser reescrita quando uma feature muda de plano.
_PLAN_FEATURE_LABELS: dict[str, str] = {
    "email_transacional": "Rastreio de e-mail",
    "estoque_controle": "Controle de Estoque",
    "site_builder": "Site Builder",
    "contas_financeiras": "Controle financeiro (contas a pagar/receber e fluxo de caixa)",
    "mensalidade_mediun": "Controle de Mensalidade de Médiuns",
    "mensalidade_associado": "Controle de Mensalidade de Associados",
    "associados": "Controle de Associados",
    "fila_espera": "Fila de espera",
    "agendamento_por_horario": "Senhas com horário marcado",
    "area_medium": "Área do Médium",
    "atividades_corrente": "Atividades da casa",
    "escalas": "Escalas da corrente",
    "biblioteca_medium": "Estudos e documentos da casa",
    "ficha_espiritual": "Ficha espiritual dos médiuns",
}


_PLAN_DISPLAY_NAMES = {
    PlanType.FREE: "Gratuito",
    PlanType.BASIC: "Basic",
    PlanType.PRO: "Pro",
    PlanType.PREMIUM: "Premium",
}

def plan_feature_denied_message(feature: str) -> str:
    """Mensagem de 403 "disponível a partir do plano X" derivada do catálogo."""
    if feature == "mediuns":
        return "Funcionalidade de médiuns não disponível no plano atual."
    label = _PLAN_FEATURE_LABELS.get(feature)
    if label is None:
        return "Recurso não disponível no plano atual."
    min_plan = feature_min_plan(feature)
    if min_plan == PlanType.PREMIUM:
        return f"{label} disponível apenas no plano Premium."
    return f"{label} disponível a partir do plano {_PLAN_DISPLAY_NAMES[min_plan]}."


PLAN_FEATURE_DENIED_MESSAGES: dict[str, str] = {
    name: plan_feature_denied_message(name) for name in PLAN_FEATURE_NAMES
}


async def check_plan_feature(user: User, db: AsyncSession, feature: str, detail: Optional[str] = None):
    """Aplica o gate de plano a `user.tenant_id`; devolve a assinatura (ou None).

    Para uso inline quando o gate depende do body (ex.: ligar um toggle em
    config.py). Em endpoint inteiro prefira `Depends(require_plan_feature(...))`.
    """
    if feature not in PLAN_FEATURE_NAMES:
        raise ValueError(f"Feature de plano desconhecida: {feature!r}")
    if user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Superadmin deve impersonar um tenant para acessar este módulo.",
        )
    sub = await SubscriptionRepository(db).get_by_tenant(user.tenant_id)
    plan = sub.plan if sub else PlanType.FREE
    if not getattr(_get_plan_features(plan), feature):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail or PLAN_FEATURE_DENIED_MESSAGES.get(feature, "Recurso não disponível no plano atual."),
        )
    # Área do Médium em piloto: além do plano, a plataforma precisa ter liberado o terreiro.
    if feature == "area_medium" and not await area_medium_liberada(db, user.tenant_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=AREA_MEDIUM_NAO_LIBERADA)
    reason = subscription_block_reason(sub)
    if reason is not None:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=BLOCK_MESSAGES[reason])
    return sub


def require_plan_feature(feature: str, detail: Optional[str] = None):
    """Dependency factory: exige que o plano inclua `feature` E que o status permita uso.

    `feature` é um campo de `PlanFeatures` (services/plan_features.py). Uso:
        router = APIRouter(..., dependencies=[Depends(require_plan_feature("estoque_controle"))])
        @router.get("/x", dependencies=[Depends(require_plan_feature("mensalidade_mediun"))])

    Erros: 400 (super admin sem tenant), 403 (fora do plano), 402 (status bloqueia).
    `detail` sobrescreve a mensagem de 403 quando o texto padrão da feature não serve.
    """
    if feature not in PLAN_FEATURE_NAMES:
        raise ValueError(f"Feature de plano desconhecida: {feature!r}")

    async def dependency(
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        await check_plan_feature(user, db, feature, detail)

    # Introspecção (testes / auditoria): qual feature este Depends protege.
    dependency.plan_feature = feature
    return dependency


# ── Limites numéricos (usuários, giras/mês, médiuns) ────────────────────────

# Usuários não têm mais limite (ilimitados em todos os planos desde out/2026).
_LIMIT_BLOCK_ACTIONS = {
    "max_giras_per_month": "criar novas giras",
    "max_mediuns": "adicionar médiuns",
}


def effective_limit(sub, field: str) -> int:
    """Limite numérico vigente respeitando o status da assinatura.

    - SUSPENDED → 402 (criação bloqueada, como sempre foi).
    - CANCELLED/EXPIRED de plano pago, trial local vencido ou mês PIX vencido → limites do FREE
      (o tenant volta ao gratuito, mesmo antes de o webhook/scheduler gravar isso).
    - Caso contrário → o limite gravado na assinatura (-1 = ilimitado).
    """
    reason = subscription_block_reason(sub)
    if reason == BLOCK_SUSPENDED:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "Assinatura suspensa por falta de pagamento. "
                f"Regularize sua assinatura para {_LIMIT_BLOCK_ACTIONS.get(field, 'continuar')}."
            ),
        )
    if reason in (BLOCK_INACTIVE, BLOCK_TRIAL_ENDED, BLOCK_PIX_EXPIRED):
        return PLAN_LIMITS[PlanType.FREE][field]
    return getattr(sub, field)

