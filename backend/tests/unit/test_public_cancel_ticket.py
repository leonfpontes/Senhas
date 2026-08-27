"""Tests for the public self-service ticket cancellation endpoints.

Covers backend/src/api/v1/public/cancel_ticket.py — the "Cancelar minha senha"
flow linked from the ticket emission email:

- GET /tickets/{id}/cancel-info is read-only and reports cancellability;
- POST /tickets/{id}/cancel mirrors the admin delete flow (soft CANCELLED +
  slot release + waitlist cascade), except that a WAITLISTED ticket that was
  never promoted holds no slot and releases nothing.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from src.models.tickets import TicketStatus
from tests.conftest import TENANT_ID, GIRA_ID


@pytest.fixture(autouse=True)
def _bypass_rate_limit():
    """Disable slowapi enforcement — the endpoints are @limiter.limit-decorated."""
    import src.api.v1.public.cancel_ticket as cancel_module
    original = cancel_module.limiter.enabled
    cancel_module.limiter.enabled = False
    yield
    cancel_module.limiter.enabled = original


def _mock_db(*scalar_results):
    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[_mock_result_scalar(v) for v in scalar_results]
    )
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    db.add = MagicMock()
    return db


def _mock_result_scalar(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _mock_gira(starts_in_hours=2.0):
    gira = MagicMock()
    gira.id = GIRA_ID
    gira.tenant_id = TENANT_ID
    gira.nome = "Gira de Caboclos"
    gira.data_inicio = datetime.now(timezone.utc) + timedelta(hours=starts_in_hours)
    gira.recados = None
    return gira


def _mock_tenant():
    tenant = MagicMock()
    tenant.id = TENANT_ID
    tenant.slug = "terreiro-test"
    tenant.name = "Terreiro Test"
    return tenant


def _mock_ticket(status=TicketStatus.EMITTED, promoted_at=None, time_slot_id=None, is_sponsor=False):
    t = MagicMock()
    t.id = uuid4()
    t.tenant_id = TENANT_ID
    t.gira_id = GIRA_ID
    t.numero = 42
    t.status = status
    t.promoted_at = promoted_at
    t.time_slot_id = time_slot_id
    t.is_sponsor = is_sponsor
    t.consulente = MagicMock(nome="Maria Silva", email="maria@example.com")
    return t


def _mock_tenant_config():
    tc = MagicMock()
    tc.primary_color = "#2E7D32"
    tc.secondary_color = "#1B5E20"
    tc.logo_data = None
    tc.logo_url = ""
    return tc


class TestGetCancelInfo:
    async def test_emitted_ticket_is_cancellable(self):
        from src.api.v1.public.cancel_ticket import get_cancel_info

        ticket = _mock_ticket()
        db = _mock_db(ticket, _mock_gira(), _mock_tenant())

        info = await get_cancel_info(MagicMock(), str(ticket.id), db)

        assert info.cancellable is True
        assert info.reason is None
        assert info.ticket_number == "0042"
        assert info.waitlisted is False

    async def test_sponsor_number_formatting(self):
        from src.api.v1.public.cancel_ticket import get_cancel_info

        ticket = _mock_ticket(is_sponsor=True)
        db = _mock_db(ticket, _mock_gira(), _mock_tenant())

        info = await get_cancel_info(MagicMock(), str(ticket.id), db)

        assert info.ticket_number == "P042"

    async def test_already_cancelled_reports_reason(self):
        from src.api.v1.public.cancel_ticket import get_cancel_info

        ticket = _mock_ticket(status=TicketStatus.CANCELLED)
        db = _mock_db(ticket, _mock_gira(), _mock_tenant())

        info = await get_cancel_info(MagicMock(), str(ticket.id), db)

        assert info.cancellable is False
        assert "já foi cancelada" in info.reason

    async def test_gira_already_started_blocks(self):
        from src.api.v1.public.cancel_ticket import get_cancel_info

        ticket = _mock_ticket()
        db = _mock_db(ticket, _mock_gira(starts_in_hours=-1.0), _mock_tenant())

        info = await get_cancel_info(MagicMock(), str(ticket.id), db)

        assert info.cancellable is False
        assert "já começou" in info.reason

    async def test_invalid_uuid_404(self):
        from src.api.v1.public.cancel_ticket import get_cancel_info

        with pytest.raises(HTTPException) as exc:
            await get_cancel_info(MagicMock(), "not-a-uuid", _mock_db())
        assert exc.value.status_code == 404

    async def test_unknown_ticket_404(self):
        from src.api.v1.public.cancel_ticket import get_cancel_info

        db = _mock_db(None)
        with pytest.raises(HTTPException) as exc:
            await get_cancel_info(MagicMock(), str(uuid4()), db)
        assert exc.value.status_code == 404


class TestCancelTicket:
    @patch("src.api.v1.public.cancel_ticket.email_queue")
    @patch("src.api.v1.public.cancel_ticket.AuditService")
    @patch("src.api.v1.public.cancel_ticket.GiraTimeSlotRepository")
    @patch("src.api.v1.public.cancel_ticket.SenhaControlRepository")
    @patch("src.api.v1.public.cancel_ticket.waitlist_service")
    async def test_emitted_ticket_waitlist_disabled_returns_slot(
        self, mock_waitlist, MockSenhaRepo, MockSlotRepo, MockAudit, mock_queue
    ):
        from src.api.v1.public.cancel_ticket import cancel_ticket

        ticket = _mock_ticket()
        db = _mock_db(ticket, _mock_gira(), _mock_tenant(), _mock_tenant_config())
        mock_waitlist.waitlist_enabled_for_tenant = AsyncMock(return_value=False)
        MockSenhaRepo.return_value.increment_slots_returned = AsyncMock()
        MockAudit.return_value.log_delete = AsyncMock()

        result = await cancel_ticket(MagicMock(), str(ticket.id), db)

        assert ticket.status == TicketStatus.CANCELLED
        MockSenhaRepo.return_value.increment_slots_returned.assert_awaited_once()
        MockSlotRepo.return_value.increment_slots_returned.assert_not_called()
        MockAudit.return_value.log_delete.assert_awaited_once()
        db.commit.assert_awaited_once()
        mock_queue.enqueue.assert_called_once()
        assert result.ticket_number == "0042"

    @patch("src.api.v1.public.cancel_ticket.email_queue")
    @patch("src.api.v1.public.cancel_ticket.AuditService")
    @patch("src.api.v1.public.cancel_ticket.GiraTimeSlotRepository")
    @patch("src.api.v1.public.cancel_ticket.SenhaControlRepository")
    @patch("src.api.v1.public.cancel_ticket.waitlist_service")
    async def test_emitted_ticket_releases_time_slot(
        self, mock_waitlist, MockSenhaRepo, MockSlotRepo, MockAudit, mock_queue
    ):
        from src.api.v1.public.cancel_ticket import cancel_ticket

        slot_id = uuid4()
        ticket = _mock_ticket(time_slot_id=slot_id)
        db = _mock_db(ticket, _mock_gira(), _mock_tenant(), _mock_tenant_config())
        mock_waitlist.waitlist_enabled_for_tenant = AsyncMock(return_value=False)
        MockSenhaRepo.return_value.increment_slots_returned = AsyncMock()
        MockSlotRepo.return_value.increment_slots_returned = AsyncMock()
        MockAudit.return_value.log_delete = AsyncMock()

        await cancel_ticket(MagicMock(), str(ticket.id), db)

        MockSlotRepo.return_value.increment_slots_returned.assert_awaited_once_with(
            db, TENANT_ID, slot_id
        )

    @patch("src.api.v1.admin.tickets_list._send_waitlist_promotion_email", new_callable=AsyncMock)
    @patch("src.api.v1.public.cancel_ticket.email_queue")
    @patch("src.api.v1.public.cancel_ticket.AuditService")
    @patch("src.api.v1.public.cancel_ticket.GiraTimeSlotRepository")
    @patch("src.api.v1.public.cancel_ticket.SenhaControlRepository")
    @patch("src.api.v1.public.cancel_ticket.waitlist_service")
    async def test_emitted_ticket_waitlist_enabled_cascades_to_queue(
        self, mock_waitlist, MockSenhaRepo, MockSlotRepo, MockAudit, mock_queue, mock_promo_email
    ):
        from src.api.v1.public.cancel_ticket import cancel_ticket

        ticket = _mock_ticket()
        promoted = _mock_ticket(status=TicketStatus.WAITLISTED)
        db = _mock_db(ticket, _mock_gira(), _mock_tenant(), _mock_tenant_config())
        mock_waitlist.waitlist_enabled_for_tenant = AsyncMock(return_value=True)
        mock_waitlist.reconcile_and_fill = AsyncMock(return_value=([promoted], 0))
        MockSenhaRepo.return_value.increment_slots_returned = AsyncMock()
        MockAudit.return_value.log_delete = AsyncMock()

        await cancel_ticket(MagicMock(), str(ticket.id), db)

        mock_waitlist.reconcile_and_fill.assert_awaited_once()
        assert mock_waitlist.reconcile_and_fill.call_args.kwargs["extra_slots"] == 1
        mock_promo_email.assert_awaited_once()
        # The freed slot went to the queue — nothing returned to the pool
        MockSenhaRepo.return_value.increment_slots_returned.assert_not_called()

    @patch("src.api.v1.public.cancel_ticket.email_queue")
    @patch("src.api.v1.public.cancel_ticket.AuditService")
    @patch("src.api.v1.public.cancel_ticket.GiraTimeSlotRepository")
    @patch("src.api.v1.public.cancel_ticket.SenhaControlRepository")
    @patch("src.api.v1.public.cancel_ticket.waitlist_service")
    async def test_waitlisted_unpromoted_releases_nothing(
        self, mock_waitlist, MockSenhaRepo, MockSlotRepo, MockAudit, mock_queue
    ):
        from src.api.v1.public.cancel_ticket import cancel_ticket

        ticket = _mock_ticket(status=TicketStatus.WAITLISTED, promoted_at=None)
        db = _mock_db(ticket, _mock_gira(), _mock_tenant(), _mock_tenant_config())
        MockAudit.return_value.log_delete = AsyncMock()

        await cancel_ticket(MagicMock(), str(ticket.id), db)

        assert ticket.status == TicketStatus.CANCELLED
        mock_waitlist.waitlist_enabled_for_tenant.assert_not_called()
        MockSenhaRepo.return_value.increment_slots_returned.assert_not_called()
        MockSlotRepo.return_value.increment_slots_returned.assert_not_called()
        db.commit.assert_awaited_once()

    @patch("src.api.v1.public.cancel_ticket.email_queue")
    @patch("src.api.v1.public.cancel_ticket.AuditService")
    @patch("src.api.v1.public.cancel_ticket.GiraTimeSlotRepository")
    @patch("src.api.v1.public.cancel_ticket.SenhaControlRepository")
    @patch("src.api.v1.public.cancel_ticket.waitlist_service")
    async def test_waitlisted_promoted_frees_reserved_slot(
        self, mock_waitlist, MockSenhaRepo, MockSlotRepo, MockAudit, mock_queue
    ):
        from src.api.v1.public.cancel_ticket import cancel_ticket

        ticket = _mock_ticket(
            status=TicketStatus.WAITLISTED,
            promoted_at=datetime.now(timezone.utc),
        )
        db = _mock_db(ticket, _mock_gira(), _mock_tenant(), _mock_tenant_config())
        mock_waitlist.waitlist_enabled_for_tenant = AsyncMock(return_value=True)
        mock_waitlist.reconcile_and_fill = AsyncMock(return_value=([], 1))
        MockSenhaRepo.return_value.increment_slots_returned = AsyncMock()
        MockAudit.return_value.log_delete = AsyncMock()

        await cancel_ticket(MagicMock(), str(ticket.id), db)

        assert mock_waitlist.reconcile_and_fill.call_args.kwargs["extra_slots"] == 1
        # Nobody in the queue could take it — falls back to the public pool
        MockSenhaRepo.return_value.increment_slots_returned.assert_awaited_once()

    async def test_gira_already_started_rejected_with_400(self):
        from src.api.v1.public.cancel_ticket import cancel_ticket

        ticket = _mock_ticket()
        db = _mock_db(ticket, _mock_gira(starts_in_hours=-1.0), _mock_tenant())

        with pytest.raises(HTTPException) as exc:
            await cancel_ticket(MagicMock(), str(ticket.id), db)
        assert exc.value.status_code == 400
        assert ticket.status == TicketStatus.EMITTED
        db.commit.assert_not_awaited()

    async def test_already_cancelled_rejected_with_400(self):
        from src.api.v1.public.cancel_ticket import cancel_ticket

        ticket = _mock_ticket(status=TicketStatus.CANCELLED)
        db = _mock_db(ticket, _mock_gira(), _mock_tenant())

        with pytest.raises(HTTPException) as exc:
            await cancel_ticket(MagicMock(), str(ticket.id), db)
        assert exc.value.status_code == 400

    async def test_called_status_rejected_with_400(self):
        from src.api.v1.public.cancel_ticket import cancel_ticket

        ticket = _mock_ticket(status=TicketStatus.CALLED)
        db = _mock_db(ticket, _mock_gira(), _mock_tenant())

        with pytest.raises(HTTPException) as exc:
            await cancel_ticket(MagicMock(), str(ticket.id), db)
        assert exc.value.status_code == 400

    async def test_invalid_uuid_404(self):
        from src.api.v1.public.cancel_ticket import cancel_ticket

        with pytest.raises(HTTPException) as exc:
            await cancel_ticket(MagicMock(), "not-a-uuid", _mock_db())
        assert exc.value.status_code == 404


class TestRateLimitRegistration:
    def test_limits_registered(self):
        from src.core.limiter import limiter
        import src.api.v1.public.cancel_ticket  # noqa: F401 — decorators register on import

        def limits(path):
            return [str(lim.limit) for lim in limiter._route_limits.get(path, [])]

        assert limits("src.api.v1.public.cancel_ticket.get_cancel_info") == ["60 per 1 minute"]
        assert limits("src.api.v1.public.cancel_ticket.cancel_ticket") == ["10 per 1 minute"]
