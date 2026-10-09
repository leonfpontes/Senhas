"""TenantService - Tenant creation, management, and lifecycle (T101)."""
import logging
import secrets
from typing import Optional
from uuid import UUID
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Tenant, User, UserRole, Subscription, PlanType
from ..models.audit_logs import AuditLog, AuditAction
from ..repositories.tenant_repo import TenantRepository
from ..repositories.user_repo import UserRepository
from ..repositories.subscription_repo import SubscriptionRepository
from ..security.password import hash_password
from ..core.errors import NotFoundError, InvalidInputError
from ..core.reserved_slugs import is_reserved_slug

logger = logging.getLogger(__name__)


class TenantService:
    """Service for tenant-level platform operations.
    
    Handles:
    - Creating new tenants with initial admin
    - Reading/updating tenant data
    - Permanent (LGPD) tenant deletion

    Suspensão é na assinatura (SubscriptionService); exclusão lógica pelo próprio
    terreiro fica em api/v1/auth/deactivation.py.
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.tenant_repo = TenantRepository(db)
        self.user_repo = UserRepository(db)
        self.subscription_repo = SubscriptionRepository(db)
    
    async def create_tenant(
        self,
        slug: str,
        name: str,
        email_admin: str,
        plan: PlanType = PlanType.BASIC,
        is_trial: bool = False,
    ) -> dict:
        """Create new tenant with initial admin user.
        
        Args:
            slug: Unique tenant slug
            name: Tenant name
            email_admin: Admin email
            plan: Subscription plan
            is_trial: Whether to start as trial
            
        Returns:
            Dict with tenant info, admin user, subscription and ``temp_password``
            (senha provisória do admin, devolvida uma única vez para o super-admin
            repassar — nunca registrar em log)
            
        Raises:
            InvalidInputError: If slug already exists
        """
        if is_reserved_slug(slug):
            raise InvalidInputError(f"Slug '{slug}' é reservado para páginas do GiraHub")
        # Check slug uniqueness
        existing = await self.tenant_repo.get_by_slug(slug)
        if existing:
            raise InvalidInputError(f"Slug '{slug}' já está em uso")
        
        # Create tenant
        tenant = await self.tenant_repo.create(
            name=name,
            slug=slug,
            description=f"Tenant {name}",
            is_active=True,
        )
        
        # Create admin user for tenant
        password = secrets.token_urlsafe(16)
        password_hash = hash_password(password)
        
        # Need to manually add user with tenant_id
        admin_user = User(
            tenant_id=tenant.id,
            email=email_admin,
            username=email_admin.split("@")[0],
            password_hash=password_hash,
            role=UserRole.ADMIN,
            is_active=True,
        )
        self.db.add(admin_user)
        await self.db.flush()
        await self.db.refresh(admin_user)
        
        # Create subscription
        trial_ends_at = None
        if is_trial:
            trial_ends_at = datetime.now(timezone.utc) + timedelta(days=14)
        
        subscription = await self.subscription_repo.create_for_tenant(
            tenant_id=tenant.id,
            plan=plan,
            is_trial=is_trial,
            trial_ends_at=trial_ends_at,
        )

        # Grupo padrão "Acesso total" (Q-05): operadores criados depois entram nele.
        from src.repositories.permission_group_repo import PermissionGroupRepository

        await PermissionGroupRepository(self.db).ensure_default_group(tenant.id)

        # Tipos de atividade e funções da corrente sugeridos (AM-08): "Gira", "Faxina", "Reunião"...
        from src.services.atividades import ensure_default_atividade_tipos

        await ensure_default_atividade_tipos(self.db, tenant.id)
        
        return {
            "id": str(tenant.id),
            "slug": tenant.slug,
            "name": tenant.name,
            "created_at": tenant.created_at.isoformat(),
            "admin_user": {
                "id": str(admin_user.id),
                "email": admin_user.email,
                "username": admin_user.username,
                "role": admin_user.role.value,
            },
            "subscription": {
                "plan": subscription.plan.value,
                "is_trial": subscription.is_trial,
                "max_users": subscription.max_users,
            },
            "temp_password": password,  # mostrada uma vez no painel; nunca logar
        }
    
    async def get_tenant(self, tenant_id: UUID) -> Optional[dict]:
        """Get tenant info.
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            Tenant dict or None
        """
        tenant = await self.tenant_repo.get_by_id(tenant_id, None)
        
        if not tenant:
            return None
        
        return {
            "id": str(tenant.id),
            "slug": tenant.slug,
            "name": tenant.name,
            "description": tenant.description,
            "is_active": tenant.is_active,
            "area_medium_liberada": bool(tenant.area_medium_liberada),
            "created_at": tenant.created_at.isoformat(),
            "updated_at": tenant.updated_at.isoformat(),
        }
    
    async def update_tenant(
        self,
        tenant_id: UUID,
        **kwargs,
    ) -> Optional[dict]:
        """Update tenant.
        
        Args:
            tenant_id: Tenant ID
            **kwargs: Fields to update
            
        Returns:
            Updated tenant dict or None
        """
        # Only allow certain fields
        allowed_fields = {"name", "description", "is_active", "area_medium_liberada"}
        update_data = {k: v for k, v in kwargs.items() if k in allowed_fields}
        
        if not update_data:
            raise InvalidInputError("Nenhum campo válido para update")
        
        tenant = await self.tenant_repo.update(tenant_id, **update_data)
        
        if not tenant:
            return None
        
        return {
            "id": str(tenant.id),
            "slug": tenant.slug,
            "name": tenant.name,
            "description": tenant.description,
            "is_active": tenant.is_active,
            "area_medium_liberada": bool(tenant.area_medium_liberada),
            "created_at": tenant.created_at.isoformat(),
            "updated_at": tenant.updated_at.isoformat(),
        }
    
    async def hard_delete_tenant(self, tenant_id: UUID, confirm_slug: str, actor_id: UUID) -> dict:
        """Permanently delete a tenant and all its data (LGPD Art. 18 VI).

        Guards:
        - Tenant must exist. Soft-deleted tenants (terreiro que se desativou
          pelo painel — ``self_deactivated_at``) TAMBÉM podem ser excluídos: é
          justamente quem mais pede a exclusão definitiva dos dados (LGPD).
        - confirm_slug must match tenant.slug exactly (prevents accidental deletes).

        Side effects (best-effort, non-blocking):
        - Cancels Stripe subscription immediately if one is active.
        - Writes a global AuditLog (tenant_id=NULL) after deletion.

        Args:
            tenant_id: UUID of the tenant to delete.
            confirm_slug: Must equal tenant.slug — validated before any mutation.
            actor_id: UUID of the SUPER_ADMIN performing the action (for audit).

        Returns:
            Dict snapshot of the deleted tenant for logging/response.

        Raises:
            NotFoundError: Tenant not found.
            InvalidInputError: confirm_slug does not match.
        """
        tenant = await self.tenant_repo.get_by_id_with_subscription(tenant_id, include_deleted=True)
        if not tenant:
            raise NotFoundError("Tenant não encontrado")

        if tenant.slug != confirm_slug:
            raise InvalidInputError(
                f"Slug de confirmação '{confirm_slug}' não corresponde ao slug do tenant '{tenant.slug}'"
            )

        # Capture snapshot before deletion
        snapshot = {
            "id": str(tenant.id),
            "slug": tenant.slug,
            "name": tenant.name,
            "was_soft_deleted": tenant.deleted_at is not None,
            "self_deactivated_at": (
                tenant.self_deactivated_at.isoformat() if tenant.self_deactivated_at else None
            ),
            "plan": tenant.subscription.plan.value if tenant.subscription else None,
            "stripe_customer_id": tenant.subscription.stripe_customer_id if tenant.subscription else None,
            "stripe_subscription_id": tenant.subscription.stripe_subscription_id if tenant.subscription else None,
            # $-04: assinatura por boleto ainda sem a 1ª fatura paga.
            "pending_stripe_subscription_id": (
                tenant.subscription.pending_stripe_subscription_id if tenant.subscription else None
            ),
        }

        # Count users for snapshot
        user_count_result = await self.db.execute(
            select(func.count()).select_from(User).where(
                User.tenant_id == tenant_id,
                User.deleted_at.is_(None),
            )
        )
        snapshot["user_count"] = user_count_result.scalar() or 0

        # Cancel Stripe subscription (best-effort — never block the delete)
        stripe_sub_id = snapshot["stripe_subscription_id"]
        if stripe_sub_id:
            try:
                from ..services.stripe_service import cancel_subscription_immediately
                await cancel_subscription_immediately(stripe_sub_id)
            except Exception as exc:
                logger.warning(
                    "Failed to cancel Stripe subscription %s for tenant %s before deletion: %s",
                    stripe_sub_id,
                    tenant_id,
                    exc,
                )
        pending_sub_id = snapshot["pending_stripe_subscription_id"]
        if isinstance(pending_sub_id, str):
            try:
                from ..services.stripe_service import cancel_pending_invoice_subscription
                await cancel_pending_invoice_subscription(pending_sub_id)
            except Exception as exc:
                logger.warning(
                    "Failed to cancel pending Stripe subscription %s for tenant %s before deletion: %s",
                    pending_sub_id,
                    tenant_id,
                    exc,
                )

        # Hard delete — cascade handles all children
        await self.tenant_repo.hard_delete(tenant_id, include_deleted=True)

        # AuditLog with tenant_id=NULL (tenant no longer exists)
        audit = AuditLog(
            tenant_id=None,
            user_id=actor_id,
            action=AuditAction.TENANT_DELETED,
            resource_type="Tenant",
            resource_id=tenant_id,
            details=snapshot,
        )
        self.db.add(audit)

        return snapshot

