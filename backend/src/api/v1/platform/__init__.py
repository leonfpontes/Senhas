"""Platform API routes package."""
from fastapi import APIRouter

from .tenants import router as tenants_router
from .tenants_search import router as search_router
from .users_global import router as users_router
from .subscriptions import router as subscriptions_router
from .consolidated_audit import router as audit_router
from .billing import router as billing_router
from .feature_flags import router as feature_flags_router
from .impersonate import router as impersonate_router
from .health import router as health_router
from .dashboard import router as dashboard_router
from .system_status import router as system_status_router
from .billing_sync import router as billing_sync_router
from .tenant_observatory import router as observatory_router
from .support_chat import router as support_chat_router

# Combine all platform routers
platform_router = APIRouter()
platform_router.include_router(tenants_router)
platform_router.include_router(search_router)
platform_router.include_router(users_router)
platform_router.include_router(subscriptions_router)
platform_router.include_router(audit_router)
platform_router.include_router(billing_router)
platform_router.include_router(billing_sync_router)
platform_router.include_router(feature_flags_router)
platform_router.include_router(impersonate_router)
platform_router.include_router(health_router)
platform_router.include_router(dashboard_router)
platform_router.include_router(system_status_router)
platform_router.include_router(observatory_router)
platform_router.include_router(support_chat_router)

__all__ = ["platform_router"]
