"""TenantService - Tenant creation, management, and lifecycle (T101)."""
import logging
import uuid
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

logger = logging.getLogger(__name__)


class TenantService:
    """Service for tenant-level platform operations.
    
    Handles:
    - Creating new tenants with initial admin
    - Suspending/activating tenants
    - Branding updates
    - API key generation
    - Tenant deletion
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
        data_retention_days: int = 12,
    ) -> dict:
        """Create new tenant with initial admin user.
        
        Args:
            slug: Unique tenant slug
            name: Tenant name
            email_admin: Admin email
            plan: Subscription plan
            is_trial: Whether to start as trial
            data_retention_days: Data retention period
            
        Returns:
            Dict with tenant info, admin user, and API key
            
        Raises:
            InvalidInputError: If slug already exists
        """
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
        
        # Generate API key for tenant
        api_key = self._generate_api_key()
        
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
            "api_key": api_key,
            "temp_password": password,  # Should be sent securely
        }
    
    async def get_tenant(self, tenant_id: UUID) -> Optional[dict]:
        """Get tenant info.
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            Tenant dict or None
        """
        stmt = "SELECT * FROM tenants WHERE id = :id AND deleted_at IS NULL"
        tenant = await self.tenant_repo.get_by_id(tenant_id, None)
        
        if not tenant:
            return None
        
        return {
            "id": str(tenant.id),
            "slug": tenant.slug,
            "name": tenant.name,
            "description": tenant.description,
            "is_active": tenant.is_active,
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
        allowed_fields = {"name", "description", "is_active"}
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
            "created_at": tenant.created_at.isoformat(),
            "updated_at": tenant.updated_at.isoformat(),
        }
    
    async def suspend_tenant(self, tenant_id: UUID) -> Optional[dict]:
        """Suspend tenant (disable access).
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            Updated tenant dict or None
        """
        return await self.update_tenant(tenant_id, is_active=False)
    
    async def reactivate_tenant(self, tenant_id: UUID) -> Optional[dict]:
        """Reactivate tenant.
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            Updated tenant dict or None
        """
        return await self.update_tenant(tenant_id, is_active=True)
    
    async def delete_tenant(self, tenant_id: UUID) -> bool:
        """Soft delete tenant.
        
        Args:
            tenant_id: Tenant ID
            
        Returns:
            True if deleted, False if not found
        """
        result = await self.tenant_repo.soft_delete(tenant_id)
        return result is not None

    async def hard_delete_tenant(self, tenant_id: UUID, confirm_slug: str, actor_id: UUID) -> dict:
        """Permanently delete a tenant and all its data (LGPD Art. 18 VI).

        Guards:
        - Tenant must exist and not be soft-deleted.
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
        tenant = await self.tenant_repo.get_by_id_with_subscription(tenant_id)
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
            "plan": tenant.subscription.plan.value if tenant.subscription else None,
            "stripe_customer_id": tenant.subscription.stripe_customer_id if tenant.subscription else None,
            "stripe_subscription_id": tenant.subscription.stripe_subscription_id if tenant.subscription else None,
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

        # Hard delete — cascade handles all children
        await self.tenant_repo.hard_delete(tenant_id)

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
    
    def _generate_api_key(self) -> str:
        """Generate unique API key for tenant.
        
        Returns:
            Base62-encoded API key
        """
        import base64
        raw_key = secrets.token_bytes(32)
        return base64.b64encode(raw_key).decode("utf-8").rstrip("=")
