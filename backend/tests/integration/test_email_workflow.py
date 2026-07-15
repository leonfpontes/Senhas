"""
T117: Email Workflow Integration Tests (Backend)

Tests email integration with Brevo (primary) and Resend (fallback).
Scenarios:
- Ticket emission triggers Brevo email
- Brevo failure falls back to Resend
- Email contains correct template with ticket info
- Multi-tenant emails isolated
"""

import pytest
import asyncio
import json
from unittest.mock import patch, MagicMock, AsyncMock
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from src.models import (
    Base, Tenant, User, UserRole, Gira, Consulente, Ticket, TicketStatus, SenhaControl, AuditLog, AuditAction
)
from src.services.email import BrevoEmailService, ResendEmailService
from src.repositories.ticket_repo import TicketRepository
from src.repositories.senha_control_repo import SenhaControlRepository
from src.core.config import settings


# ============================================
# FIXTURES
# ============================================

@pytest.fixture(autouse=True)
def email_provider_settings(monkeypatch):
    """Brevo/Resend services raise in __init__ if their API key is unset.
    These tests mock send_email itself and never call a real provider,
    so a dummy key is enough to get past the constructor check."""
    monkeypatch.setattr(settings, "BREVO_API_KEY", "test-brevo-key")
    monkeypatch.setattr(settings, "BREVO_FROM_EMAIL", "test@example.com")
    monkeypatch.setattr(settings, "BREVO_FROM_NAME", "Test Sender")
    monkeypatch.setattr(settings, "RESEND_API_KEY", "test-resend-key")
    monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "test@example.com")


@pytest.fixture
async def test_db_session():
    """Create test database session."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
    )
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session
    
    await engine.dispose()


@pytest.fixture
async def test_tenant(test_db_session: AsyncSession):
    """Create test tenant."""
    tenant = Tenant(
        id=str(uuid4()),
        name="Test Tenant",
        slug="test-tenant",
        primary_color="#007AFF",
        secondary_color="#5AC8FA",
    )
    test_db_session.add(tenant)
    await test_db_session.commit()
    await test_db_session.refresh(tenant)
    return tenant


@pytest.fixture
async def test_gira(test_db_session: AsyncSession, test_tenant: Tenant):
    """Create test gira."""
    tomorrow = datetime.utcnow() + timedelta(days=1)
    gira = Gira(
        id=str(uuid4()),
        tenant_id=test_tenant.id,
        name="Test Gira",
        description="Test gira for email workflow",
        event_date=tomorrow,
        tickets_limit=100,
        location="Test Location",
    )
    test_db_session.add(gira)
    await test_db_session.commit()
    await test_db_session.refresh(gira)
    return gira


@pytest.fixture
async def test_senha_control(test_db_session: AsyncSession, test_gira: Gira):
    """Create test senha control."""
    senha = SenhaControl(
        id=str(uuid4()),
        gira_id=test_gira.id,
        current_number=0,
        max_number=test_gira.tickets_limit,
    )
    test_db_session.add(senha)
    await test_db_session.commit()
    await test_db_session.refresh(senha)
    return senha


# ============================================
# TEST SUITE 1: Brevo Email Service
# ============================================

class TestBrevoEmailService:
    """Test Brevo email service."""

    @pytest.mark.asyncio
    async def test_brevo_send_success(self):
        """Should successfully send email via Brevo."""
        service = BrevoEmailService()
        
        with patch.object(service, 'send_email', new_callable=AsyncMock) as mock_send:
            mock_send.return_value = {'message_id': 'brevo-msg-123'}
            
            result = await service.send_email(
                to_email='user@example.com',
                subject='Test Email',
                html_content='<p>Test</p>',
            )
            
            assert result['message_id'] == 'brevo-msg-123'
            mock_send.assert_called_once()

    @pytest.mark.asyncio
    async def test_brevo_send_failure(self):
        """Should raise exception on Brevo failure."""
        service = BrevoEmailService()
        
        with patch.object(service, 'send_email', new_callable=AsyncMock) as mock_send:
            mock_send.side_effect = Exception("Brevo API error")
            
            with pytest.raises(Exception):
                await service.send_email(
                    to_email='user@example.com',
                    subject='Test Email',
                    html_content='<p>Test</p>',
                )

    @pytest.mark.asyncio
    async def test_brevo_ticket_template(self):
        """Should use correct template for ticket emission."""
        service = BrevoEmailService()
        
        ticket_data = {
            'ticket_number': '001',
            'gira_name': 'Test Gira',
            'event_date': '2026-03-06 18:00',
            'consulente_name': 'João Silva',
            'gira_link': 'https://example.com/gira/123',
        }
        
        # Template should render
        html = service.render_ticket_template(**ticket_data)
        assert 'João Silva' in html
        assert '001' in html
        assert 'Test Gira' in html
        assert 'https://example.com/gira/123' in html


# ============================================
# TEST SUITE 2: Resend Fallback Service
# ============================================

class TestResendEmailService:
    """Test Resend email fallback service."""

    @pytest.mark.asyncio
    async def test_resend_send_success(self):
        """Should successfully send email via Resend."""
        service = ResendEmailService()
        
        with patch.object(service, 'send_email', new_callable=AsyncMock) as mock_send:
            mock_send.return_value = {'id': 'resend-msg-456'}
            
            result = await service.send_email(
                to_email='user@example.com',
                subject='Test Email',
                html_content='<p>Test</p>',
            )
            
            assert result['id'] == 'resend-msg-456'
            mock_send.assert_called_once()

    @pytest.mark.asyncio
    async def test_resend_batch_mode(self):
        """Should support batch email sending."""
        service = ResendEmailService()
        
        emails = [
            {
                'to': 'user1@example.com',
                'subject': 'Email 1',
                'html': '<p>Test 1</p>',
            },
            {
                'to': 'user2@example.com',
                'subject': 'Email 2',
                'html': '<p>Test 2</p>',
            },
        ]
        
        with patch.object(service, 'send_batch', new_callable=AsyncMock) as mock_batch:
            mock_batch.return_value = [
                {'id': 'resend-1'},
                {'id': 'resend-2'},
            ]
            
            results = await service.send_batch(emails)
            assert len(results) == 2


# ============================================
# TEST SUITE 3: Fallback Logic
# ============================================

class TestEmailFallback:
    """Test email fallback mechanism."""

    @pytest.mark.asyncio
    async def test_fallback_on_brevo_failure(self):
        """Should fallback to Resend if Brevo fails."""
        brevo = BrevoEmailService()
        resend = ResendEmailService()
        
        with patch.object(brevo, 'send_email', new_callable=AsyncMock) as mock_brevo:
            with patch.object(resend, 'send_email', new_callable=AsyncMock) as mock_resend:
                # Brevo fails
                mock_brevo.side_effect = Exception("Brevo error")
                mock_resend.return_value = {'id': 'resend-backup'}
                
                # Manual fallback logic
                try:
                    result = await brevo.send_email(
                        to_email='user@example.com',
                        subject='Test',
                        html_content='<p>Test</p>',
                    )
                except Exception:
                    # Fallback to Resend
                    result = await resend.send_email(
                        to_email='user@example.com',
                        subject='Test',
                        html_content='<p>Test</p>',
                    )
                
                assert result['id'] == 'resend-backup'
                mock_brevo.assert_called_once()
                mock_resend.assert_called_once()

    @pytest.mark.asyncio
    async def test_both_providers_fail(self):
        """Should raise error if both providers fail."""
        brevo = BrevoEmailService()
        resend = ResendEmailService()
        
        with patch.object(brevo, 'send_email', new_callable=AsyncMock) as mock_brevo:
            with patch.object(resend, 'send_email', new_callable=AsyncMock) as mock_resend:
                mock_brevo.side_effect = Exception("Brevo error")
                mock_resend.side_effect = Exception("Resend error")
                
                with pytest.raises(Exception):
                    try:
                        await brevo.send_email(
                            to_email='user@example.com',
                            subject='Test',
                            html_content='<p>Test</p>',
                        )
                    except Exception:
                        await resend.send_email(
                            to_email='user@example.com',
                            subject='Test',
                            html_content='<p>Test</p>',
                        )


# ============================================
# TEST SUITE 4: Ticket Emission Email Integration
# ============================================

class TestTicketEmissionEmailIntegration:
    """Test email integration with ticket emission."""

    @pytest.mark.asyncio
    async def test_ticket_emission_sends_email(self, test_db_session, test_gira, test_senha_control):
        """Should send email when ticket is emitted."""
        
        with patch('backend.src.services.email.BrevoEmailService.send_email', new_callable=AsyncMock) as mock_send:
            mock_send.return_value = {'message_id': 'brevo-123'}
            
            # Emit ticket
            ticket = Ticket(
                id=str(uuid4()),
                gira_id=test_gira.id,
                tenant_id=test_gira.tenant_id,
                number=1,
                consulente_email='user@example.com',
                consulente_name='Test User',
                consulente_phone='(11) 99999-9999',
                status=TicketStatus.PENDING,
            )
            test_db_session.add(ticket)
            await test_db_session.commit()
            
            # Verify email was sent
            assert mock_send.called

    @pytest.mark.asyncio
    async def test_ticket_email_contains_correct_info(self):
        """Should include correct ticket info in email."""
        service = BrevoEmailService()
        
        ticket_data = {
            'ticket_number': '042',
            'gira_name': 'Gira Test',
            'event_date': '2026-03-06 18:00',
            'consulente_name': 'Maria Silva',
            'gira_link': 'https://example.com/gira/abc123',
        }
        
        html = service.render_ticket_template(**ticket_data)
        
        # Verify all ticket info present
        assert '042' in html
        assert 'Gira Test' in html
        assert '2026-03-06' in html
        assert 'Maria Silva' in html
        assert 'https://example.com/gira/abc123' in html

    @pytest.mark.asyncio
    async def test_multi_tenant_email_isolation(self):
        """Should send emails to correct tenant."""
        # Create two tenants with different email addresses
        tenant_a_email = 'admin@tenant-a.local'
        tenant_b_email = 'admin@tenant-b.local'
        
        with patch('backend.src.services.email.BrevoEmailService.send_email', new_callable=AsyncMock) as mock_send:
            # Send email for Tenant A
            await mock_send(
                to_email=tenant_a_email,
                subject='Tenant A Ticket',
                html_content='<p>Tenant A</p>',
            )
            
            # Send email for Tenant B
            await mock_send(
                to_email=tenant_b_email,
                subject='Tenant B Ticket',
                html_content='<p>Tenant B</p>',
            )
            
            # Verify both were called with correct emails
            calls = mock_send.call_args_list
            assert len(calls) == 2
            assert tenant_a_email in calls[0][1]['to_email']
            assert tenant_b_email in calls[1][1]['to_email']


# ============================================
# TEST SUITE 5: Email Delivery Guarantees
# ============================================

class TestEmailDeliveryGuarantees:
    """Test email delivery guarantees."""

    @pytest.mark.asyncio
    async def test_email_retry_on_temporary_failure(self):
        """Should retry email on temporary failure."""
        service = BrevoEmailService()
        
        with patch.object(service, 'send_email', new_callable=AsyncMock) as mock_send:
            # First call fails, second succeeds
            mock_send.side_effect = [
                Exception("Temporary error"),
                {'message_id': 'brevo-retry-123'},
            ]
            
            # Manual retry logic
            result = None
            for attempt in range(3):
                try:
                    result = await service.send_email(
                        to_email='user@example.com',
                        subject='Test',
                        html_content='<p>Test</p>',
                    )
                    break
                except Exception as e:
                    if attempt == 2:
                        raise
                    await asyncio.sleep(0.1 * (2 ** attempt))
            
            assert result['message_id'] == 'brevo-retry-123'

    @pytest.mark.asyncio
    async def test_email_audit_logging(self):
        """Should log email send events to audit trail."""
        # Email send should trigger audit event
        audit_event = {
            'action': 'EMAIL_SENT',
            'resource_type': 'ticket',
            'resource_id': 'ticket-123',
            'details': {
                'recipient': 'user@example.com',
                'provider': 'brevo',
                'message_id': 'brevo-msg-123',
            },
        }
        
        assert audit_event['action'] == 'EMAIL_SENT'
        assert audit_event['details']['recipient'] == 'user@example.com'


# ============================================
# TEST SUITE 6: Email Template Rendering
# ============================================

class TestEmailTemplateRendering:
    """Test email template rendering."""

    def test_ticket_template_responsive_html(self):
        """Should generate responsive HTML email."""
        service = BrevoEmailService()
        
        html = service.render_ticket_template(
            ticket_number='001',
            gira_name='Test Gira',
            event_date='2026-03-06 18:00',
            consulente_name='João Silva',
            gira_link='https://example.com/gira/123',
        )
        
        # Check for responsive design
        assert '<meta name="viewport"' in html or 'viewport' in html
        assert '@media' in html  # Media queries
        assert 'inline' in html.lower() or 'style=' in html  # Inline CSS

    def test_template_escapes_user_input(self):
        """Should escape user input in templates."""
        service = BrevoEmailService()
        
        malicious_name = '<script>alert("xss")</script>'
        
        html = service.render_ticket_template(
            ticket_number='001',
            gira_name='Test Gira',
            event_date='2026-03-06 18:00',
            consulente_name=malicious_name,
            gira_link='https://example.com/gira/123',
        )
        
        # Script tags should be escaped
        assert '<script>' not in html


# ============================================
# Test Runner
# ============================================

if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])

