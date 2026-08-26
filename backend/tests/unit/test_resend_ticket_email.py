"""Tests for the public resend-ticket-email endpoint.

Covers backend/src/api/v1/public/resend_email.py, a public (unauthenticated)
endpoint that re-sends the ticket emission email for a consulente's tickets.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import TENANT_ID, TICKET_ID


class TestResendTicketEmail:
    async def test_resend_success(self):
        from src.api.v1.public.resend_email import (
            resend_ticket_email,
            ResendTicketEmailRequest,
        )

        tenant = MagicMock()
        tenant.id = TENANT_ID
        tenant.slug = "terreiro-test"
        tenant.name = "Terreiro Test"

        tenant_config = MagicMock()
        tenant_config.endereco = "Rua Teste, 123"
        tenant_config.primary_color = "#2E7D32"
        tenant_config.secondary_color = "#1B5E20"
        tenant_config.logo_data = None
        tenant_config.logo_url = "https://example.com/logo.png"

        gira = MagicMock()
        gira.nome = "Gira de Oxalá"
        gira.data_inicio = datetime.now(timezone.utc) + timedelta(hours=1)
        gira.local = "Terreiro Central"
        gira.recados = None

        consulente = MagicMock()
        consulente.nome = "João da Silva"
        consulente.telefone = "11999998888"

        ticket = MagicMock()
        ticket.id = TICKET_ID
        ticket.numero = 7
        ticket.is_sponsor = False
        ticket.priority_category = None
        ticket.gira = gira
        ticket.consulente = consulente

        db = AsyncMock()
        tenant_result = MagicMock()
        tenant_result.scalar_one_or_none.return_value = tenant
        tenant_config_result = MagicMock()
        tenant_config_result.scalar_one_or_none.return_value = tenant_config
        db.execute = AsyncMock(side_effect=[tenant_result, tenant_config_result])

        request = ResendTicketEmailRequest(email="joao@example.com")

        # Patch only the query method so the endpoint exercises the real
        # TicketRepository(session, Ticket) instantiation.
        from src.repositories.ticket_repo import TicketRepository

        with patch.object(
            TicketRepository,
            "list_by_consulente_email",
            AsyncMock(return_value=[ticket]),
        ), patch(
            "src.api.v1.public.resend_email.email_queue"
        ) as mock_queue:
            response = await resend_ticket_email(
                tenant_slug="terreiro-test",
                request=request,
                session=db,
            )

        assert response.tickets_count == 1
        assert response.email_sent is True
        assert "1 ticket" in response.message

        mock_queue.enqueue.assert_called_once()
        enqueued_item = mock_queue.enqueue.call_args[0][0]
        assert enqueued_item.ticket_id == str(TICKET_ID)
        assert enqueued_item.message.to_email == "joao@example.com"
        assert "0007" in enqueued_item.message.html_body
        assert "João da Silva" in enqueued_item.message.html_body
        assert "Gira de Oxalá" in enqueued_item.message.html_body
