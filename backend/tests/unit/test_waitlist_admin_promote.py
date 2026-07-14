"""Unit tests for the manual waitlist promotion endpoint's require_confirmation
branch — the operator's ability to release a senha immediately, bypassing the
consulente confirmation step entirely."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.core.errors import InsufficientPermissionsError, NotFoundError
from src.models.tickets import TicketStatus


def _admin_user(tenant_id):
    user = MagicMock()
    user.id = uuid4()
    user.tenant_id = tenant_id
    user.is_admin = True
    user.is_operator_or_admin = True
    return user


def _mock_result_scalar(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _make_gira(tenant_id):
    gira = MagicMock()
    gira.id = uuid4()
    gira.tenant_id = tenant_id
    gira.nome = "Gira de Teste"
    gira.waitlist_confirmation_hours = None
    return gira


def _make_ticket(tenant_id, gira_id, numero=5):
    from src.models.tickets import Ticket
    t = Ticket()
    t.id = uuid4()
    t.tenant_id = tenant_id
    t.gira_id = gira_id
    t.consulente_id = uuid4()
    t.numero = numero
    t.status = TicketStatus.WAITLISTED
    t.is_sponsor = False
    t.priority_category = None
    t.promoted_at = None
    t.confirmation_expires_at = None
    t.created_at = datetime.now(timezone.utc)
    t.consulente = MagicMock(nome="Fulano", email="fulano@example.com")
    return t


class TestPromoteWaitlistTicketConfirmationGate:
    @patch("src.api.v1.admin.tickets_list.AuditService")
    @patch("src.api.v1.admin.tickets_list.waitlist_service")
    @patch("src.api.v1.admin.tickets_list.SenhaControlRepository")
    async def test_require_confirmation_true_sends_promotion_email_keeps_waitlisted(
        self, MockSenhaRepo, mock_waitlist_service, MockAudit,
    ):
        from src.api.v1.admin.tickets_list import promote_waitlist_ticket, WaitlistPromoteRequest

        tenant_id = uuid4()
        gira = _make_gira(tenant_id)
        ticket = _make_ticket(tenant_id, gira.id)

        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[
            _mock_result_scalar(gira),
            _mock_result_scalar(ticket),
        ])
        MockSenhaRepo.return_value.increment_slots_returned = AsyncMock(return_value=1)
        mock_waitlist_service.waitlist_enabled_for_tenant = AsyncMock(return_value=True)
        mock_waitlist_service.promote_ticket = MagicMock()
        mock_waitlist_service.send_confirmed_ticket_email = AsyncMock()
        MockAudit.return_value = AsyncMock()

        with patch("src.api.v1.admin.tickets_list._send_waitlist_promotion_email", new=AsyncMock()) as mock_send_promo:
            result = await promote_waitlist_ticket(
                body=WaitlistPromoteRequest(require_confirmation=True),
                gira_id=gira.id,
                ticket_id=ticket.id,
                current_user=_admin_user(tenant_id),
                db=db,
            )
            mock_send_promo.assert_awaited_once()

        mock_waitlist_service.promote_ticket.assert_called_once_with(ticket, gira)
        mock_waitlist_service.send_confirmed_ticket_email.assert_not_awaited()
        assert ticket.status == TicketStatus.WAITLISTED
        assert result.status == "aguardando_confirmacao"

    @patch("src.api.v1.admin.tickets_list.AuditService")
    @patch("src.api.v1.admin.tickets_list.waitlist_service")
    @patch("src.api.v1.admin.tickets_list.SenhaControlRepository")
    async def test_require_confirmation_false_releases_immediately(
        self, MockSenhaRepo, mock_waitlist_service, MockAudit,
    ):
        from src.api.v1.admin.tickets_list import promote_waitlist_ticket, WaitlistPromoteRequest

        tenant_id = uuid4()
        gira = _make_gira(tenant_id)
        ticket = _make_ticket(tenant_id, gira.id)

        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[
            _mock_result_scalar(gira),
            _mock_result_scalar(ticket),
        ])
        MockSenhaRepo.return_value.increment_slots_returned = AsyncMock(return_value=1)
        mock_waitlist_service.waitlist_enabled_for_tenant = AsyncMock(return_value=True)
        mock_waitlist_service.promote_ticket = MagicMock()
        mock_waitlist_service.send_confirmed_ticket_email = AsyncMock(return_value="0005")
        MockAudit.return_value = AsyncMock()

        with patch("src.api.v1.admin.tickets_list._send_waitlist_promotion_email", new=AsyncMock()) as mock_send_promo:
            result = await promote_waitlist_ticket(
                body=WaitlistPromoteRequest(require_confirmation=False),
                gira_id=gira.id,
                ticket_id=ticket.id,
                current_user=_admin_user(tenant_id),
                db=db,
            )
            mock_send_promo.assert_not_awaited()

        # Bumps the slot exactly once regardless of the confirmation mode —
        # the operator is still manually opening one extra slot out of order.
        MockSenhaRepo.return_value.increment_slots_returned.assert_awaited_once()
        mock_waitlist_service.promote_ticket.assert_not_called()
        mock_waitlist_service.send_confirmed_ticket_email.assert_awaited_once_with(db, ticket)
        assert ticket.status == TicketStatus.EMITTED
        assert ticket.promoted_at is None
        assert result.status == "emitido"

    async def test_non_admin_raises(self):
        from src.api.v1.admin.tickets_list import promote_waitlist_ticket, WaitlistPromoteRequest
        tenant_id = uuid4()
        user = _admin_user(tenant_id)
        user.is_admin = False
        with pytest.raises(InsufficientPermissionsError):
            await promote_waitlist_ticket(
                body=WaitlistPromoteRequest(),
                gira_id=uuid4(),
                ticket_id=uuid4(),
                current_user=user,
                db=AsyncMock(),
            )

    @patch("src.api.v1.admin.tickets_list.waitlist_service")
    async def test_waitlist_disabled_rejects(self, mock_waitlist_service):
        from fastapi import HTTPException
        from src.api.v1.admin.tickets_list import promote_waitlist_ticket, WaitlistPromoteRequest
        mock_waitlist_service.waitlist_enabled_for_tenant = AsyncMock(return_value=False)
        with pytest.raises(HTTPException) as exc_info:
            await promote_waitlist_ticket(
                body=WaitlistPromoteRequest(),
                gira_id=uuid4(),
                ticket_id=uuid4(),
                current_user=_admin_user(uuid4()),
                db=AsyncMock(),
            )
        assert exc_info.value.status_code == 400
