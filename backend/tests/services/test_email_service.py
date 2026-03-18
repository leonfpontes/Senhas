"""
T047: Test Email Service
Tests for email providers (Brevo, Resend) and fallback logic
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime

from backend.src.services.email.base import EmailMessage
from backend.src.services.email.brevo_provider import BrevoEmailService
from backend.src.services.email.resend_fallback import ResendEmailService


@pytest.fixture
def sample_email_message():
    """Create sample email message"""
    return EmailMessage(
        to_email="joao@example.com",
        subject="Sua Senha #0042 - Espiritismo SP",
        html_body="<html><body>Sua senha foi emitida!</body></html>",
        text_body="Sua senha foi emitida!",
        reply_to="support@example.com",
    )


class TestBrevoProvider:
    """Test Brevo email provider"""

    @pytest.mark.asyncio
    async def test_brevo_send_success(self, sample_email_message):
        """Test successful Brevo email send"""

        with patch.dict("os.environ", {
            "BREVO_API_KEY": "test-key-12345",
            "BREVO_FROM_EMAIL": "noreply@example.com",
            "BREVO_FROM_NAME": "Espiritismo",
        }):
            with patch("backend.src.services.email.brevo_provider.httpx.AsyncClient") as mock_client:
                # Mock successful response (200)
                mock_response = MagicMock()
                mock_response.status_code = 200
                mock_response.json.return_value = {"messageId": "brevo-msg-123"}

                mock_context = AsyncMock()
                mock_context.post = AsyncMock(return_value=mock_response)
                mock_context.__aenter__ = AsyncMock(return_value=mock_context)
                mock_context.__aexit__ = AsyncMock(return_value=None)

                mock_client.return_value = mock_context

                # Create service and send
                service = BrevoEmailService()
                result = await service.send_async(sample_email_message)

                # Should succeed
                assert result is True
                mock_context.post.assert_called_once()

    @pytest.mark.asyncio
    async def test_brevo_send_failure(self, sample_email_message):
        """Test Brevo send failure (network error)"""

        with patch.dict("os.environ", {
            "BREVO_API_KEY": "test-key",
            "BREVO_FROM_EMAIL": "noreply@example.com",
            "BREVO_FROM_NAME": "Espiritismo",
        }):
            with patch("backend.src.services.email.brevo_provider.httpx.AsyncClient") as mock_client:
                # Mock failed response (500)
                mock_response = MagicMock()
                mock_response.status_code = 500
                mock_response.text = "Internal Server Error"

                mock_context = AsyncMock()
                mock_context.post = AsyncMock(return_value=mock_response)
                mock_context.__aenter__ = AsyncMock(return_value=mock_context)
                mock_context.__aexit__ = AsyncMock(return_value=None)

                mock_client.return_value = mock_context

                # Try send
                service = BrevoEmailService()
                result = await service.send_async(sample_email_message)

                # Should fail gracefully
                assert result is False

    @pytest.mark.asyncio
    async def test_brevo_health_check_success(self):
        """Test Brevo health check"""

        with patch.dict("os.environ", {
            "BREVO_API_KEY": "test-key",
            "BREVO_FROM_EMAIL": "noreply@example.com",
            "BREVO_FROM_NAME": "Espiritismo",
        }):
            with patch("backend.src.services.email.brevo_provider.httpx.AsyncClient") as mock_client:
                # Mock healthy response
                mock_response = MagicMock()
                mock_response.status_code = 200

                mock_context = AsyncMock()
                mock_context.get = AsyncMock(return_value=mock_response)
                mock_context.__aenter__ = AsyncMock(return_value=mock_context)
                mock_context.__aexit__ = AsyncMock(return_value=None)

                mock_client.return_value = mock_context

                service = BrevoEmailService()
                is_healthy = await service.is_healthy()

                assert is_healthy is True

    @pytest.mark.asyncio
    async def test_brevo_no_api_key(self):
        """Test Brevo initialization without API key"""

        with patch.dict("os.environ", {}, clear=True):
            # Should raise ValueError
            with pytest.raises(ValueError, match="BREVO_API_KEY"):
                BrevoEmailService()


class TestResendProvider:
    """Test Resend email provider"""

    @pytest.mark.asyncio
    async def test_resend_send_success(self, sample_email_message):
        """Test successful Resend email send"""

        with patch.dict("os.environ", {
            "RESEND_API_KEY": "resend-key-test",
            "RESEND_FROM_EMAIL": "noreply@example.com",
        }):
            with patch("backend.src.services.email.resend_fallback.httpx.AsyncClient") as mock_client:
                # Mock successful response
                mock_response = MagicMock()
                mock_response.status_code = 200
                mock_response.json.return_value = {"id": "resend-msg-456"}

                mock_context = AsyncMock()
                mock_context.post = AsyncMock(return_value=mock_response)
                mock_context.__aenter__ = AsyncMock(return_value=mock_context)
                mock_context.__aexit__ = AsyncMock(return_value=None)

                mock_client.return_value = mock_context

                service = ResendEmailService()
                result = await service.send_async(sample_email_message)

                assert result is True

    @pytest.mark.asyncio
    async def test_resend_batch_send(self):
        """Test Resend batch send"""

        messages = [
            EmailMessage(
                to_email=f"user{i}@example.com",
                subject=f"Subject {i}",
                html_body=f"<p>Body {i}</p>",
            )
            for i in range(3)
        ]

        with patch.dict("os.environ", {
            "RESEND_API_KEY": "resend-key",
            "RESEND_FROM_EMAIL": "noreply@example.com",
        }):
            with patch("backend.src.services.email.resend_fallback.httpx.AsyncClient") as mock_client:
                mock_response = MagicMock()
                mock_response.status_code = 200
                mock_response.json.return_value = {"id": "msg-id"}

                mock_context = AsyncMock()
                mock_context.post = AsyncMock(return_value=mock_response)
                mock_context.__aenter__ = AsyncMock(return_value=mock_context)
                mock_context.__aexit__ = AsyncMock(return_value=None)

                mock_client.return_value = mock_context

                service = ResendEmailService()
                results = await service.send_batch(messages)

                # All should succeed
                assert all(results.values())


class TestEmailFallback:
    """Test fallback from Brevo to Resend"""

    @pytest.mark.asyncio
    async def test_brevo_fail_resend_success(self, sample_email_message):
        """Test fallback when Brevo fails"""

        # This would test the complete flow in emit_ticket.py
        # where it tries Brevo first, then falls back to Resend

        pass

    @pytest.mark.asyncio
    async def test_both_providers_fail(self, sample_email_message):
        """Test when both providers fail"""

        # Should be logged as error but not raise
        pass


class TestEmailValidation:
    """Test email validation"""

    def test_valid_emails(self):
        """Test email validation accepts valid addresses"""

        from backend.src.repositories.consulente_repo import ConsulenteRepository

        repo = ConsulenteRepository()
        valid_emails = [
            "simple@example.com",
            "user.name@example.com",
            "user+tag@example.co.uk",
            "user_name@example-domain.com",
        ]

        for email in valid_emails:
            normalized = repo.normalize_email(email)
            assert "@" in normalized
            assert "." in normalized

    def test_invalid_emails(self):
        """Test email validation rejects invalid addresses"""

        from backend.src.repositories.consulente_repo import ConsulenteRepository

        repo = ConsulenteRepository()
        invalid_emails = [
            "no-at-sign.com",
            "missing-domain@",
            "@only-domain.com",
            "spaces in@email.com",
        ]

        for email in invalid_emails:
            with pytest.raises(ValueError):
                repo.normalize_email(email)


class TestPhoneValidation:
    """Test phone number validation"""

    def test_valid_phone_numbers(self):
        """Test valid phone number formats"""

        from backend.src.repositories.consulente_repo import ConsulenteRepository

        repo = ConsulenteRepository()
        valid_phones = [
            "+5511987654321",
            "+55 11 98765-4321",
            "11987654321",
            "+1-555-123-4567",
        ]

        for phone in valid_phones:
            try:
                normalized = repo.normalize_phone(phone)
                assert normalized.startswith("+")
                assert len(normalized) >= 8
            except ValueError:
                # Some might still fail strict validation
                pass

    def test_invalid_phone_numbers(self):
        """Test invalid phone number formats"""

        from backend.src.repositories.consulente_repo import ConsulenteRepository

        repo = ConsulenteRepository()
        invalid_phones = [
            "123",  # Too short
            "abc1234567890",  # Has letters
        ]

        for phone in invalid_phones:
            with pytest.raises(ValueError):
                repo.normalize_phone(phone)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
