"""
T033: EmailService - Base interface for email delivery
Defines contract for sending async emails (Brevo primary, Resend fallback)
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class EmailMessage:
    """Email message to send
    
    Attributes:
        to_email: Recipient email address
        subject: Email subject line
        html_body: HTML email body (supports inline CSS)
        text_body: Plain text fallback
        reply_to: Reply-to address (optional)
    """

    to_email: str
    subject: str
    html_body: str
    text_body: Optional[str] = None
    reply_to: Optional[str] = None


class EmailService(ABC):
    """Abstract email service interface
    
    Implementations should handle:
    - Async sending (non-blocking)
    - Provider-specific config (API keys, domains)
    - Error handling and retries
    - HTML/text multipart encoding
    """

    @abstractmethod
    async def send_async(self, message: EmailMessage) -> bool:
        """Send email asynchronously

        Args:
            message: EmailMessage with recipient, subject, body

        Returns:
            True if sent successfully, False if failed

        Raises:
            Exception: On critical errors (config missing, invalid email)
        """
        pass

    @abstractmethod
    async def send_batch(self, messages: list[EmailMessage]) -> dict[str, bool]:
        """Send multiple emails efficiently

        Args:
            messages: List of EmailMessages to send

        Returns:
            Dict mapping to_email -> success boolean

        Raises:
            Exception: On critical errors
        """
        pass

    @abstractmethod
    async def is_healthy(self) -> bool:
        """Check if email service is configured and available

        Returns:
            True if service is ready to send, False otherwise
        """
        pass
