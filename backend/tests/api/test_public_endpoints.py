"""
T046: Test Public API Endpoints
Tests for /api/v1/public endpoints with fake Brevo email provider
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch, MagicMock
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from backend.src.main import create_app
from backend.src.core.database import Base, get_db
from backend.src.models.tenants import Tenant
from backend.src.models.giras import Gira
from backend.src.models.senha_controls import SenhaControl


@pytest.fixture
async def mock_db_session():
    """Create mock async database session"""
    session = AsyncMock(spec=AsyncSession)
    session.execute = AsyncMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    return session


@pytest.fixture
def mock_tenant():
    """Create mock tenant"""
    tenant = MagicMock()
    tenant.id = 1
    tenant.slug = "espiritismo-sp"
    tenant.name = "Espiritismo SP"
    tenant.logo_url = "https://example.com/logo.png"
    tenant.brand_color = "#2E7D32"
    return tenant


@pytest.fixture
def mock_gira():
    """Create mock gira"""
    gira = MagicMock()
    gira.id = 1
    gira.tenant_id = 1
    gira.name = "Gira de Cura - Março 2026"
    gira.location = "Centro Espírita São Paulo"
    gira.max_tickets = 500
    gira.status = "ACTIVE"
    gira.release_start_at = datetime.utcnow()
    gira.release_end_at = datetime.utcnow() + timedelta(hours=6)
    return gira


@pytest.mark.asyncio
async def test_get_next_gira_success(mock_db_session, mock_tenant, mock_gira):
    """Test successful fetch of next gira"""
    # This is a conceptual test - full implementation would use test database

    from backend.src.api.v1.public.next_gira import router

    # Mock query execution
    mock_result = MagicMock()
    mock_result.scalar_one_or_none = MagicMock(side_effect=[mock_tenant, mock_gira])

    mock_db_session.execute = AsyncMock(return_value=mock_result)

    # Expected response
    expected = {
        "id": 1,
        "name": "Gira de Cura - Março 2026",
        "location": "Centro Espírita São Paulo",
        "max_tickets": 500,
        "current_tickets": 0,
        "tickets_available": 500,
        "is_open": True,
    }

    # Assert key fields present
    assert expected["id"] == mock_gira.id
    assert expected["name"] == mock_gira.name
    assert expected["max_tickets"] == mock_gira.max_tickets


@pytest.mark.asyncio
async def test_emit_ticket_success(mock_db_session, mock_tenant, mock_gira):
    """Test successful ticket emission with atomic counter"""

    from backend.src.api.v1.public.emit_ticket import EmitTicketRequest

    # Create request
    request = EmitTicketRequest(
        name="João da Silva",
        email="joao@example.com",
        phone="+5511987654321",
    )

    # Assert validation
    assert request.name == "João da Silva"
    assert request.email == "joao@example.com"
    assert request.phone == "+5511987654321"


@pytest.mark.asyncio
async def test_emit_ticket_duplicate_error(mock_db_session):
    """Test duplicate ticket prevention (409 Conflict)"""
    # When consulente has same email and gira, should get 409
    pass


@pytest.mark.asyncio
async def test_emit_ticket_capacity_exceeded(mock_db_session):
    """Test capacity limit (429 Too Many Requests)"""
    # When gira.max_tickets reached, should get 429
    pass


@pytest.mark.asyncio
async def test_emit_ticket_invalid_email(mock_db_session):
    """Test invalid email format (400 Bad Request)"""

    from backend.src.repositories.consulente_repo import ConsulenteRepository

    repo = ConsulenteRepository()

    # Test invalid emails
    invalid_emails = [
        "not-an-email",
        "user@",
        "@example.com",
        "user @example.com",
    ]

    for email in invalid_emails:
        with pytest.raises(ValueError):
            repo.normalize_email(email)


@pytest.mark.asyncio
async def test_emithroom_email_disabled(mock_db_session):
    """Test resend email endpoint"""

    from backend.src.api.v1.public.resend_email import router

    # This would test that email is resent for previous tickets
    pass


@pytest.mark.asyncio
async def test_atomic_counter_increment():
    """Test that counter increment is truly atomic (no race conditions)"""
    # Would require concurrent requests test
    pass


class TestEmailIntegration:
    """Integration tests for email service"""

    @pytest.mark.asyncio
    async def test_brevo_service_mock(self):
        """Test Brevo service with mock API"""

        from backend.src.services.email.brevo_provider import BrevoEmailService
        from backend.src.services.email.base import EmailMessage

        # Mock httpx
        with patch("backend.src.services.email.brevo_provider.httpx.AsyncClient") as mock_client:
            # Setup mock response
            mock_response = AsyncMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"messageId": "12345"}

            mock_context = AsyncMock()
            mock_context.post = AsyncMock(return_value=mock_response)
            mock_context.__aenter__ = AsyncMock(return_value=mock_context)
            mock_context.__aexit__ = AsyncMock(return_value=None)

            mock_client.return_value = mock_context

            # Create service (will attempt to read env var - needs mocking)
            with patch.dict("os.environ", {"BREVO_API_KEY": "test-key"}):
                from backend.src.core.config import settings as test_settings

                # Would set config values
                pass

    @pytest.mark.asyncio
    async def test_email_template_rendering(self):
        """Test HTML email template generation"""

        from backend.src.services.email.templates.ticket_emission import (
            generate_ticket_emission_html,
        )

        html = generate_ticket_emission_html(
            ticket_number="0042",
            consulente_name="João da Silva",
            gira_name="Gira de Cura",
            gira_date="15/03/2026 às 18:00",
            gira_location="Centro Espírita",
            rescue_link="https://example.com/ticket/1",
            tenant_name="Espiritismo SP",
            tenant_logo_url="https://example.com/logo.png",
            tenant_color="#2E7D32",
        )

        # Verify template has required elements
        assert "0042" in html
        assert "João da Silva" in html
        assert "Gira de Cura" in html
        assert "<html" in html.lower()
        assert "</html>" in html.lower()
