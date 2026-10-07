"""Service for evaluating group-based permissions (fine-grained RBAC)."""
from typing import Any, Dict, Optional
from uuid import UUID
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import User, PermissionFeature
from ..repositories.permission_group_repo import PermissionGroupRepository
from ..repositories.subscription_repo import SubscriptionRepository
from src.services.plan_features import get_effective_plan_features


# Consulta liberada fora do plano (P-09): quem já cadastrou médiuns continua
# vendo a lista depois do fim do plano/trial. O gate de plano vale só para
# criar/editar/excluir (require_plan_feature("mediuns") nas rotas de escrita).
_VIEW_SEM_GATE_DE_PLANO = frozenset({PermissionFeature.MEDIUNS})


def _plan_gate_applies(feature: PermissionFeature, action: str) -> bool:
    return not (action == "view" and feature in _VIEW_SEM_GATE_DE_PLANO)


class PermissionService:
    """Service to check and consolidate group-based permissions for users."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.permission_group_repo = PermissionGroupRepository(db)

    async def is_feature_enabled_for_plan(self, tenant_id: UUID, feature: PermissionFeature) -> bool:
        """Verify if a feature is enabled under the tenant's active subscription tier (T4).

        Usa a mesma semântica do require_plan_feature (P-05): plano E status da
        assinatura (suspensa, cancelada/expirada em plano pago ou trial local
        vencido desligam as features pagas).
        """
        repo = SubscriptionRepository(self.db)
        sub = await repo.get_by_tenant(tenant_id)
        features = get_effective_plan_features(sub)

        # Map our fine-grained features to subscription plan features.
        # FINANCEIRO (mensalidades) segue mensalidade_mediun (Basic+ desde
        # out/2026); as rotas de associados exigem também mensalidade_associado
        # (Premium) via require_plan_feature no endpoint.
        mapping = {
            PermissionFeature.MEDIUNS: "mediuns",
            PermissionFeature.ESTOQUE: "estoque_controle",
            PermissionFeature.FINANCEIRO: "mensalidade_mediun",
            PermissionFeature.CONTAS_FINANCEIRAS: "contas_financeiras",
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
        - Operators with NO groups have no access (fail-closed, Q-05). Every tenant has a
          default "Acesso total" group that new operators join automatically.
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

        if _plan_gate_applies(feature, action):
            plan_enabled = await self.is_feature_enabled_for_plan(tenant_id, feature)
            if not plan_enabled:
                return False

        # 4. User group permissions
        user_groups = await self.permission_group_repo.get_user_groups(user.id, tenant_id)
        if not user_groups:
            # Fail-closed (Q-05): operador sem grupo não acessa nada.
            return False

        # Check consolidated group permissions
        perms = await self.permission_group_repo.get_user_permissions(user.id, tenant_id, feature)
        return perms.get(action, False)

    async def get_user_effective_permissions(self, user_id: UUID, tenant_id: UUID) -> Dict[str, Dict[str, bool]]:
        """Consolidate effective permissions for a user across all features.
        
        Used to feed permissions to the frontend context on mount.
        """
        # Fetch user
        stmt = sa.select(User).where(
            (User.id == user_id) & (User.tenant_id == tenant_id) & (User.deleted_at.is_(None))
        )
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

        # Fail-closed (Q-05): operador sem grupo não acessa nada.
        user_groups = await self.permission_group_repo.get_user_groups(user.id, tenant_id)
        if not user_groups:
            for f in all_features:
                effective[f] = {"view": False, "insert": False, "edit": False, "delete": False}
            return effective

        # Operator with groups: fetch OR-consolidated permissions from DB
        db_perms = await self.permission_group_repo.get_user_all_permissions(user.id, tenant_id)
        
        for f in all_features:
            feature_enum = PermissionFeature(f)
            enabled_in_plan = await self.is_feature_enabled_for_plan(tenant_id, feature_enum)
            
            if not enabled_in_plan:
                # Fora do plano só sobra a consulta das features em
                # _VIEW_SEM_GATE_DE_PLANO (modo somente leitura, P-09).
                f_perms = db_perms.get(feature_enum, {})
                effective[f] = {
                    "view": bool(f_perms.get("view", False)) and not _plan_gate_applies(feature_enum, "view"),
                    "insert": False,
                    "edit": False,
                    "delete": False,
                }
            else:
                # Retrieve from DB consolidated query, default to False
                f_perms = db_perms.get(feature_enum, {"view": False, "insert": False, "edit": False, "delete": False})
                effective[f] = f_perms

        return effective
