"""
T034: Brevo Email Provider - Primary email delivery service
Implements EmailService interface using Brevo (formerly Sendinblue) API v3
"""

import httpx
import logging
from typing import Optional
from src.services.email.base import EmailService, EmailMessage
from src.core.config import settings

logger = logging.getLogger(__name__)


class BrevoEmailService(EmailService):
    """Brevo (Sendinblue) email provider
    
    Features:
    - Brevo SMTP API v3  
    - Supports HTML/text multipart
    - Inline CSS rendering (Gmail, Outlook compatible)
    - Rate limiting: 300 req/min per account
    - Reliable delivery tracking
    
    Configuration via settings:
    - BREVO_API_KEY: Required for API authentication
    - BREVO_FROM_EMAIL: Verified sender email
    - BREVO_FROM_NAME: Sender display name
    """

    def __init__(self):
        """Initialize Brevo service

        Raises:
            ValueError: If BREVO_API_KEY not set in environment
        """
        self.api_key = settings.BREVO_API_KEY
        self.from_email = settings.BREVO_FROM_EMAIL
        self.from_name = settings.BREVO_FROM_NAME

        if not self.api_key:
            raise ValueError("BREVO_API_KEY environment variable is required")

        self.base_url = "https://api.brevo.com/v3"
        self.timeout = httpx.Timeout(10.0)

    async def is_healthy(self) -> bool:
        """Verify Brevo API connectivity and credentials

        Makes a test call to Brevo API to ensure:
        - API key is valid
        - Network connectivity exists
        - Account is in good standing

        Returns:
            True if service is operational, False otherwise
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/account",
                    headers=self._get_headers(),
                    timeout=self.timeout,
                )
                is_healthy = 200 <= response.status_code < 300
                if not is_healthy:
                    logger.warning(f"Brevo health check failed: {response.status_code}")
                return is_healthy
        except Exception as e:
            logger.error(f"Brevo health check exception: {e}")
            return False

    async def send_async(self, message: EmailMessage) -> bool:
        """Send email via Brevo API

        Args:
            message: EmailMessage with recipient, subject, HTML/text body

        Returns:
            True if accepted by Brevo, False if failed

        Raises:
            ValueError: If email configuration invalid
        """
        try:
            payload = {
                "to": [{"email": message.to_email}],
                "from": {"email": self.from_email, "name": self.from_name},
                "subject": message.subject,
                "htmlContent": message.html_body,
                "textContent": message.text_body or "See HTML version",
            }

            if message.reply_to:
                payload["replyTo"] = {"email": message.reply_to}

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/smtp/email",
                    json=payload,
                    headers=self._get_headers(),
                    timeout=self.timeout,
                )

                if not (200 <= response.status_code < 300):
                    logger.error(
                        f"Brevo send failed: {response.status_code} - {response.text}"
                    )
                    return False

                logger.info(
                    f"Email sent via Brevo to {message.to_email} "
                    f"(Message-ID: {response.json().get('messageId', 'N/A')})"
                )
                return True

        except Exception as e:
            logger.error(f"Brevo send exception: {e}")
            return False

    async def send_batch(self, messages: list[EmailMessage]) -> dict[str, bool]:
        """Send multiple emails (sequential due to API limits)

        Note: Brevo doesn't have native batch API, so we send sequentially
        with delays to respect rate limits (300 req/min).

        Args:
            messages: List of EmailMessages to send

        Returns:
            Dict mapping to_email -> success boolean
        """
        results = {}
        for message in messages:
            success = await self.send_async(message)
            results[message.to_email] = success

            # Simple rate limiting: small delay between sends
            # Brevo allows 300 req/min = 5 req/sec
            import asyncio

            await asyncio.sleep(0.3)

        return results

    def _get_headers(self) -> dict:
        """Get HTTP headers for Brevo API requests

        Returns:
            Headers dict with API key and content type
        """
        return {
            "api-key": self.api_key,
            "Content-Type": "application/json",
        }
