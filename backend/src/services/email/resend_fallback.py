"""
T035: Resend Email Fallback Provider - Secondary email service
Implements EmailService interface using Resend API for failover scenarios
"""

import httpx
import logging
from backend.src.services.email.base import EmailService, EmailMessage
from backend.src.core.config import settings

logger = logging.getLogger(__name__)


class ResendEmailService(EmailService):
    """Resend email provider - used as fallback if Brevo fails

    Features:
    - Resend official API (https://resend.com)
    - Designed for transactional emails
    - Reliable delivery with 99.9% uptime SLA
    - Rate limiting: 100 requests per second
    - Good integration with modern email clients

    Configuration via settings:
    - RESEND_API_KEY: Required for API authentication
    - RESEND_FROM_EMAIL: Verified sender email
    """

    def __init__(self):
        """Initialize Resend service

        Raises:
            ValueError: If RESEND_API_KEY not set in environment
        """
        self.api_key = settings.RESEND_API_KEY
        self.from_email = settings.RESEND_FROM_EMAIL

        if not self.api_key:
            raise ValueError("RESEND_API_KEY environment variable is required")

        self.base_url = "https://api.resend.com"
        self.timeout = httpx.Timeout(10.0)

    async def is_healthy(self) -> bool:
        """Verify Resend API connectivity and credentials

        Makes a test call to Resend API to verify credentials.

        Returns:
            True if service is operational, False otherwise
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/emails",
                    headers=self._get_headers(),
                    timeout=self.timeout,
                )
                is_healthy = 200 <= response.status_code < 300
                if not is_healthy:
                    logger.warning(f"Resend health check failed: {response.status_code}")
                return is_healthy
        except Exception as e:
            logger.error(f"Resend health check exception: {e}")
            return False

    async def send_async(self, message: EmailMessage) -> bool:
        """Send email via Resend API

        Args:
            message: EmailMessage with recipient, subject, HTML/text body

        Returns:
            True if accepted by Resend, False if failed

        Raises:
            ValueError: If email configuration invalid
        """
        try:
            payload = {
                "from": self.from_email,
                "to": message.to_email,
                "subject": message.subject,
                "html": message.html_body,
                "text": message.text_body or "See HTML version",
            }

            if message.reply_to:
                payload["reply_to"] = message.reply_to

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/emails",
                    json=payload,
                    headers=self._get_headers(),
                    timeout=self.timeout,
                )

                if not (200 <= response.status_code < 300):
                    logger.error(
                        f"Resend send failed: {response.status_code} - {response.text}"
                    )
                    return False

                response_data = response.json()
                logger.info(
                    f"Email sent via Resend to {message.to_email} "
                    f"(Message-ID: {response_data.get('id', 'N/A')})"
                )
                return True

        except Exception as e:
            logger.error(f"Resend send exception: {e}")
            return False

    async def send_batch(self, messages: list[EmailMessage]) -> dict[str, bool]:
        """Send multiple emails efficiently

        Resend supports parallel requests (100 req/sec limit).

        Args:
            messages: List of EmailMessages to send

        Returns:
            Dict mapping to_email -> success boolean
        """
        import asyncio

        tasks = [self.send_async(msg) for msg in messages]
        results_list = await asyncio.gather(*tasks, return_exceptions=True)

        results = {}
        for message, result in zip(messages, results_list):
            if isinstance(result, Exception):
                results[message.to_email] = False
                logger.error(
                    f"Resend batch send exception for {message.to_email}: {result}"
                )
            else:
                results[message.to_email] = bool(result)

        return results

    def _get_headers(self) -> dict:
        """Get HTTP headers for Resend API requests

        Returns:
            Headers dict with API key and content type
        """
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
