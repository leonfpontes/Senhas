"""Service for evaluating group-based permissions (fine-grained RBAC)."""
from typing import Any, Dict, Optional
from uuid import UUID
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import User, PermissionFeature, PlanType, SubscriptionStatus
from ..repositories.permission_group_repo import PermissionGroupRepository
from ..repositories.subscription_repo import SubscriptionRepository
from src.services.plan_features import _get_plan_features


class PermissionService:
    """Service to check and consolidate group-based permissions for users."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.permission_group_repo = PermissionGroupRepository(db)

    async def is_feature_enabled_for_plan(self, tenant_id: UUID, feature: PermissionFeature) -> bool:
        """Verify if a feature is enabled under the tenant's active subscription tier (T4)."""
        repo = SubscriptionRepository(self.db)
        sub = await repo.get_by_tenant(tenant_id)

        plan = PlanType.FREE
        suspended = False
        if sub:
            plan = sub.plan
            suspended = (sub.status == SubscriptionStatus.SUSPENDED)

        features = _get_plan_features(plan, suspended)

        # Map our fine-grained features to subscription plan features
        mapping = {
            PermissionFeature.MEDIUNS: "mediuns",
            PermissionFeature.ESTOQUE: "estoque_controle",
            PermissionFeature.FINANCEIRO: "mensalidade_mediun",
            PermissionFeature.ASSOCIADOS: "associados",
            PermissionFeature.AUDITORIA: "auditoria",
            PermissionFeature.ANALYTICS: "analytics_basico",
            PermissionFeature.RELATORIO_GIRA: "relatorio_gira",
            PermissionFeature.CURSOS_PRESENCIAIS: "site_builder",  # Cursos uses site builder / pro elements
        }

        flag_attr = mapping.get(feature)
        if not flag_attr:
            return True  # Core features are always enabled on all plans

        return getattr(features, flag_attr, False)

    async def check_permission(
        self,
        user: User,
        feature: PermissionFeature,
        action: str,  # "view", "insert", "edit", "delete"
        token_data: Optional[Any] = None,
    ) -> bool:
        """Check if a user is authorized to perform a specific action on a feature.
        
        Rules:
        - SUPER_ADMIN and ADMIN roles bypass all group permission checks.
        - Impersonation bypasses group checks (T9).
        - Subscription/Plan limitations are enforced first (T4).
        - Operators with NO groups are granted total access (backward compatibility).
        - Operators with groups are restricted according to OR-consolidated group permissions.
        """
        # 1. Role bypass
        if user.is_admin:
            return True

        # 2. Impersonation bypass (T9)
        if token_data and getattr(token_data, "impersonated_by", None):
            return True

        # 3. Plan feature check (T4)
        tenant_id = user.tenant_id
        if not tenant_id:
            return False

        plan_enabled = await self.is_feature_enabled_for_plan(tenant_id, feature)
        if not plan_enabled:
            return False

        # 4. User group permissions
        user_groups = await self.permission_group_repo.get_user_groups(user.id, tenant_id)
        if not user_groups:
            # Backward compatibility: user has no groups, so they retain full operator access
            return True

        # Check consolidated group permissions
        perms = await self.permission_group_repo.get_user_permissions(user.id, tenant_id, feature)
        return perms.get(action, False)

    async def get_user_effective_permissions(self, user_id: UUID, tenant_id: UUID) -> Dict[str, Dict[str, bool]]:
        """Consolidate effective permissions for a user across all features.
        
        Used to feed permissions to the frontend context on mount.
        """
        # Fetch user
        stmt = sa.select(User).where((User.id == user_id) & (User.deleted_at.is_(None)))
        result = await self.db.execute(stmt)
        user = result.scalar_one_or_none()
        
        # Format dictionary with all features
        all_features = [f.value for f in PermissionFeature]
        effective = {}

        if not user:
            for f in all_features:
                effective[f] = {"view": False, "insert": False, "edit": False, "delete": False}
            return effective

        # If admin, grant full access
        if user.is_admin:
            for f in all_features:
                effective[f] = {"view": True, "insert": True, "edit": True, "delete": True}
            return effective

        # If user has no groups, they have full operator access
        user_groups = await self.permission_group_repo.get_user_groups(user.id, tenant_id)
        if not user_groups:
            for f in all_features:
                # Still respect feature flag restrictions even with backward compatibility
                enabled_in_plan = await self.is_feature_enabled_for_plan(tenant_id, PermissionFeature(f))
                effective[f] = {
                    "view": enabled_in_plan,
                    "insert": enabled_in_plan,
                    "edit": enabled_in_plan,
                    "delete": enabled_in_plan,
                }
            return effective

        # Operator with groups: fetch OR-consolidated permissions from DB
        db_perms = await self.permission_group_repo.get_user_all_permissions(user.id, tenant_id)
        
        for f in all_features:
            feature_enum = PermissionFeature(f)
            enabled_in_plan = await self.is_feature_enabled_for_plan(tenant_id, feature_enum)
            
            if not enabled_in_plan:
                effective[f] = {"view": False, "insert": False, "edit": False, "delete": False}
            else:
                # Retrieve from DB consolidated query, default to False
                f_perms = db_perms.get(feature_enum, {"view": False, "insert": False, "edit": False, "delete": False})
                effective[f] = f_perms

        return effective
