"""Admin API routes package."""
from fastapi import APIRouter

from .giras_crud import router as giras_router
from .tickets_list import router as tickets_router
from .tickets_bulk import router as bulk_router
from .email_resend import router as email_router
from .config import router as config_router
from .audit_trail import router as audit_router
from .analytics import router as analytics_router
from .users import router as users_router
from .exports import router as exports_router
from .validate_bulk import router as validate_router
from .health import router as health_router
from .door_control import router as door_control_router
from .door_ws import router as door_ws_router

# Combine all admin routers
admin_router = APIRouter()
admin_router.include_router(giras_router)
admin_router.include_router(tickets_router)
admin_router.include_router(bulk_router)
admin_router.include_router(email_router)
admin_router.include_router(config_router)
admin_router.include_router(audit_router)
admin_router.include_router(analytics_router)
admin_router.include_router(users_router)
admin_router.include_router(exports_router)
admin_router.include_router(validate_router)
admin_router.include_router(health_router)
admin_router.include_router(door_control_router)
admin_router.include_router(door_ws_router)

__all__ = ["admin_router"]
