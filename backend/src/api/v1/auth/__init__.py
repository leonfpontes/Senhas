"""Auth module endpoints."""
from fastapi import APIRouter

from .login import router as login_router
from .profile import router as profile_router

auth_router = APIRouter()
auth_router.include_router(login_router)
auth_router.include_router(profile_router)

__all__ = ["auth_router"]
