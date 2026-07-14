# Public API routes
from src.api.v1.public.next_gira import router as next_gira_router
from src.api.v1.public.emit_ticket import router as emit_ticket_router
from src.api.v1.public.resend_email import router as resend_email_router
from src.api.v1.public.images import router as images_router
from src.api.v1.public.onboarding import router as onboarding_router
from src.api.v1.public.sites import router as public_sites_router
from src.api.v1.public.curso_inscricao import router as curso_inscricao_router
from src.api.v1.public.waitlist_confirm import router as waitlist_confirm_router

__all__ = [
    "next_gira_router",
    "emit_ticket_router",
    "resend_email_router",
    "images_router",
    "onboarding_router",
    "public_sites_router",
    "curso_inscricao_router",
    "waitlist_confirm_router",
]
