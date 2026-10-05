"""FastAPI dependency injection utilities (T022)."""
from fastapi import Request, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import timezone
import uuid

from ..core.database import get_db
from ..core.errors import (
    UnauthorizedError,
    InsufficientPermissionsError,
    MultiTenantViolationError,
    NotFoundError,
    GroupPermissionDeniedError,
)
from ..models import User, UserRole, PermissionFeature, PlanType
from ..middleware.tenant_context import get_tenant_id
from ..repositories.subscription_repo import PLAN_LIMITS, SubscriptionRepository
from ..services.permission_service import PermissionService
from ..services.plan_features import (
    BLOCK_INACTIVE,
    BLOCK_MESSAGES,
    BLOCK_SUSPENDED,
    BLOCK_TRIAL_ENDED,
    PLAN_FEATURE_NAMES,
    _get_plan_features,
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

    if not user or not user.is_active:
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

PLAN_FEATURE_DENIED_MESSAGES: dict[str, str] = {
    "email_transacional": "Rastreio de e-mail disponível apenas nos planos Pro e Premium.",
    "estoque_controle": "Controle de Estoque disponível a partir do plano Pro.",
    "site_builder": "Site Builder está disponível apenas nos planos Pro e Premium.",
    "contas_financeiras": "Contas a Pagar/Receber está disponível nos planos Pro e Premium.",
    "mensalidade_mediun": "Controle de Mensalidade de Médiuns está disponível a partir do plano Pro.",
    "mensalidade_associado": "Controle de Mensalidade de Associados está disponível nos planos Pro e Premium.",
    "mediuns": "Funcionalidade de médiuns não disponível no plano atual.",
    "fila_espera": "Fila de espera disponível apenas nos planos Pro e Premium",
    "agendamento_por_horario": "Agendamento por horário disponível apenas nos planos Pro e Premium",
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

_LIMIT_BLOCK_ACTIONS = {
    "max_users": "adicionar usuários",
    "max_giras_per_month": "criar novas giras",
    "max_mediuns": "adicionar médiuns",
}


def effective_limit(sub, field: str) -> int:
    """Limite numérico vigente respeitando o status da assinatura.

    - SUSPENDED → 402 (criação bloqueada, como sempre foi).
    - CANCELLED/EXPIRED de plano pago ou trial local vencido → limites do FREE
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
    if reason in (BLOCK_INACTIVE, BLOCK_TRIAL_ENDED):
        return PLAN_LIMITS[PlanType.FREE][field]
    return getattr(sub, field)

