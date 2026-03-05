# Email service module
from backend.src.services.email.base import EmailService, EmailMessage
from backend.src.services.email.brevo_provider import BrevoEmailService
from backend.src.services.email.resend_fallback import ResendEmailService

__all__ = [
    "EmailService",
    "EmailMessage",
    "BrevoEmailService",
    "ResendEmailService",
]
