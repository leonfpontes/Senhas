# Email service module
from src.services.email.base import EmailService, EmailMessage
from src.services.email.brevo_provider import BrevoEmailService
from src.services.email.resend_fallback import ResendEmailService

__all__ = [
    "EmailService",
    "EmailMessage",
    "BrevoEmailService",
    "ResendEmailService",
]
