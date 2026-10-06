"""Tests for the public resend-ticket-email endpoint.

Covers backend/src/api/v1/public/resend_email.py, a public (unauthenticated)
endpoint that re-sends the ORIGINAL e-mail of the consulente's active tickets
(emitida → e-mail de emissão; fila → e-mail da fila / da promoção).
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from src.models.tickets import TicketStatus
from tests.conftest import TENANT_ID, TICKET_ID


@pytest.fixture(autouse=True)
def _bypass_rate_limit():
    """Disable slowapi enforcement — the endpoint is @limiter.limit-decorated."""
    import src.api.v1.public.resend_email as resend_module
    original = resend_module.limiter.enabled
    resend_module.limiter.enabled = False
    yield
    resend_module.limiter.enabled = original


def _tenant():
    tenant = MagicMock()
    tenant.id = TENANT_ID
    tenant.slug = "terreiro-test"
    tenant.name = "Terreiro Test"
    return tenant


def _ticket(status=TicketStatus.EMITTED, promoted_at=None):
    consulente = MagicMock()
    consulente.nome = "João da Silva"
    consulente.email = "joao@example.com"
    ticket = MagicMock()
    ticket.id = TICKET_ID
    ticket.tenant_id = TENANT_ID
    ticket.gira_id = uuid4()
    ticket.numero = 7
    ticket.is_sponsor = False
    ticket.status = status
    ticket.promoted_at = promoted_at
    ticket.consulente = consulente
    return ticket


def _db_returning(*results):
    db = AsyncMock()
    mocks = []
    for value in results:
        r = MagicMock()
        r.scalar_one_or_none.return_value = value
        mocks.append(r)
    db.execute = AsyncMock(side_effect=mocks)
    return db


class TestResendTicketEmail:
    async def test_filtra_status_ativos_e_a_gira_informada(self):
        from src.api.v1.public.resend_email import (
            RESENDABLE_STATUSES,
            ResendTicketEmailRequest,
            resend_ticket_email,
        )
        from src.repositories.ticket_repo import TicketRepository

        gira_id = uuid4()
        ticket = _ticket()
        db = _db_returning(_tenant())
        list_mock = AsyncMock(return_value=[ticket])
        with patch.object(TicketRepository, "list_by_consulente_email", list_mock), patch(
            "src.api.v1.public.resend_email.waitlist_service.send_confirmed_ticket_email", new_callable=AsyncMock
        ) as send_confirmed:
            response = await resend_ticket_email(
                request=MagicMock(),
                tenant_slug="terreiro-test",
                payload=ResendTicketEmailRequest(email="Joao@Example.com", gira_id=gira_id),
                session=db,
            )

        kwargs = list_mock.call_args.kwargs
        assert kwargs["statuses"] == RESENDABLE_STATUSES
        assert TicketStatus.CANCELLED not in kwargs["statuses"]
        assert kwargs["gira_id"] == gira_id
        assert kwargs["gira_from"] is None
        assert kwargs["email"] == "joao@example.com"
        # Senha emitida → o MESMO e-mail da emissão (número formatado com P,
        # horário e acompanhantes saem de send_confirmed_ticket_email).
        send_confirmed.assert_awaited_once_with(db, ticket)
        assert response.tickets_count == 1
        assert response.email_sent is True

    async def test_sem_gira_id_limita_a_giras_de_hoje_em_diante(self):
        from src.api.v1.public.resend_email import ResendTicketEmailRequest, resend_ticket_email
        from src.repositories.ticket_repo import TicketRepository

        db = _db_returning(_tenant())
        list_mock = AsyncMock(return_value=[_ticket()])
        with patch.object(TicketRepository, "list_by_consulente_email", list_mock), patch(
            "src.api.v1.public.resend_email.waitlist_service.send_confirmed_ticket_email", new_callable=AsyncMock
        ):
            await resend_ticket_email(
                request=MagicMock(),
                tenant_slug="terreiro-test",
                payload=ResendTicketEmailRequest(email="joao@example.com"),
                session=db,
            )
        assert isinstance(list_mock.call_args.kwargs["gira_from"], datetime)

    async def test_fila_sem_promocao_reenvia_email_da_fila(self):
        from src.api.v1.public.resend_email import ResendTicketEmailRequest, resend_ticket_email
        from src.repositories.ticket_repo import TicketRepository

        ticket = _ticket(status=TicketStatus.WAITLISTED)
        gira = MagicMock()
        gira.id = ticket.gira_id
        gira.nome = "Gira de Oxalá"
        gira.data_inicio = datetime.now(timezone.utc) + timedelta(days=1)
        tenant_config = MagicMock()
        tenant_config.primary_color = "#2E7D32"
        tenant_config.secondary_color = "#1B5E20"
        tenant_config.logo_data = None
        tenant_config.logo_url = None
        db = _db_returning(_tenant(), gira, tenant_config)
        with patch.object(TicketRepository, "list_by_consulente_email", AsyncMock(return_value=[ticket])), patch(
            "src.api.v1.public.resend_email.waitlist_service.compute_queue_position",
            AsyncMock(return_value=3),
        ), patch("src.api.v1.public.resend_email.email_queue") as mock_queue:
            await resend_ticket_email(
                request=MagicMock(),
                tenant_slug="terreiro-test",
                payload=ResendTicketEmailRequest(email="joao@example.com", gira_id=gira.id),
                session=db,
            )
        item = mock_queue.enqueue.call_args[0][0]
        assert item.message.to_email == "joao@example.com"
        assert "fila de espera" in item.message.subject
        assert "Gira de Oxalá" in item.message.html_body
        assert "REENVIADO" not in item.message.subject

    async def test_fila_promovida_reenvia_email_da_promocao(self):
        from src.api.v1.public.resend_email import ResendTicketEmailRequest, resend_ticket_email
        from src.repositories.ticket_repo import TicketRepository

        ticket = _ticket(status=TicketStatus.WAITLISTED, promoted_at=datetime.now(timezone.utc))
        gira = MagicMock()
        db = _db_returning(_tenant(), gira)
        with patch.object(TicketRepository, "list_by_consulente_email", AsyncMock(return_value=[ticket])), patch(
            "src.api.v1.admin.tickets_list._send_waitlist_promotion_email", new_callable=AsyncMock
        ) as send_promo:
            await resend_ticket_email(
                request=MagicMock(),
                tenant_slug="terreiro-test",
                payload=ResendTicketEmailRequest(email="joao@example.com"),
                session=db,
            )
        send_promo.assert_awaited_once_with(db, TENANT_ID, ticket, gira)

    async def test_sem_senha_ativa_404(self):
        from src.api.v1.public.resend_email import ResendTicketEmailRequest, resend_ticket_email
        from src.repositories.ticket_repo import TicketRepository

        db = _db_returning(_tenant())
        with patch.object(TicketRepository, "list_by_consulente_email", AsyncMock(return_value=[])):
            with pytest.raises(HTTPException) as exc:
                await resend_ticket_email(
                    request=MagicMock(),
                    tenant_slug="terreiro-test",
                    payload=ResendTicketEmailRequest(email="joao@example.com", gira_id=uuid4()),
                    session=db,
                )
        assert exc.value.status_code == 404
        assert "nesta gira" in exc.value.detail

    def test_request_nao_tem_mais_phone(self):
        from src.api.v1.public.resend_email import ResendTicketEmailRequest

        assert "phone" not in ResendTicketEmailRequest.model_fields
        # Cliente antigo que ainda mande `phone` não quebra (campo extra ignorado).
        assert ResendTicketEmailRequest(email="a@b.com", phone="1199").email == "a@b.com"
